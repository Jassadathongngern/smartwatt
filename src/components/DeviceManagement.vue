<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { rtdb as db } from "../firebase";
import {
  ref as dbRef,
  onValue,
  remove,
  update,
  push,
  off,
  runTransaction,
} from "firebase/database";

// --- State ---
const devices = ref([]);
const buildingConfig = ref({});
const searchQuery = ref("");
const filterStatus = ref("All");
const filterFloor = ref("All");

// --- Modal State ---
const isModalOpen = ref(false);
const isAddModalOpen = ref(false);
const isDeleteModalOpen = ref(false);

const selectedDevice = ref(null);
const deviceToDelete = ref(null);

// State สำหรับแก้ไข
const tempName = ref("");
const tempRate = ref("");
const ratePresets = [1, 5, 10, 15, 30, 60];

// Form for Add Device
const newDeviceForm = ref({
  name: "",
  devEui: "",
  type: "Meter",
  status: "Active",
  sendRate: 5,
  installDate: new Date().toISOString().split("T")[0],
  description: "",
});

// --- Firebase References ---
const devicesRef = dbRef(db, "devices");
const configRef = dbRef(db, "building_configs");

// --- 1. Fetch Data ---
onMounted(() => {
  onValue(devicesRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      devices.value = Object.keys(data)
        .map((key) => ({
          id: key,
          ...data[key],
        }))
        .reverse();
    } else {
      devices.value = [];
    }
  });

  onValue(configRef, (snapshot) => {
    buildingConfig.value = snapshot.val() || {};
  });
});

onUnmounted(() => {
  off(devicesRef);
  off(configRef);
});

// --- Helper: Find Room ---
const getDeviceLocation = (deviceId) => {
  if (!buildingConfig.value) return { room: "Unknown", floor: "-" };

  for (const [floorKey, floorData] of Object.entries(buildingConfig.value)) {
    if (floorData.rooms) {
      for (const [roomName, roomData] of Object.entries(floorData.rooms)) {
        if (roomData.deviceId === deviceId) {
          return {
            room: roomName,
            floor: floorKey.replace("floor_", ""),
          };
        }
      }
    }
  }
  return { room: "Unassigned", floor: "-" };
};

// --- 2. Filter Logic ---
const filteredDevices = computed(() => {
  return devices.value
    .map((dev) => {
      const location = getDeviceLocation(dev.id);
      return { ...dev, roomName: location.room, floorNum: location.floor };
    })
    .filter((dev) => {
      const name = (dev.name || "").toLowerCase();
      const room = (dev.roomName || "").toLowerCase();
      const devId = (dev.id || "").toLowerCase();
      const search = searchQuery.value.toLowerCase();

      const matchSearch = name.includes(search) || room.includes(search) || devId.includes(search);
      const matchStatus = filterStatus.value === "All" || dev.status === filterStatus.value;
      const matchFloor = filterFloor.value === "All" || dev.floorNum === filterFloor.value;

      return matchSearch && matchStatus && matchFloor;
    });
});

// --- Actions: Edit Config (Name & Rate) ---
const openEditModal = (device) => {
  selectedDevice.value = device;
  tempName.value = device.name || "";
  tempRate.value = device.sendRate ? parseInt(device.sendRate.toString().replace(" min", "")) : 5;
  isModalOpen.value = true;
};

// ✅ ฟังก์ชันบันทึกการตั้งค่า (พร้อมระบบ Concurrency Control)
const saveConfig = async () => {
  // 1. ตรวจสอบชื่อ: ถ้าว่าง ให้เอา defaultName หรือชื่อเดิมมาใช้ (Auto-Recovery)
  const nameToSave =
    tempName.value.trim() === ""
      ? selectedDevice.value.defaultName || selectedDevice.value.name || "Unknown Device"
      : tempName.value;

  if (selectedDevice.value && tempRate.value) {
    try {
      // ✅ 4. Concurrency Control: ใช้ runTransaction แทน update
      await runTransaction(dbRef(db, `devices/${selectedDevice.value.id}`), (currentData) => {
        if (currentData === null) {
          return {
            name: nameToSave,
            defaultName: nameToSave,
            sendRate: tempRate.value + " min",
            last_update: Date.now(),
          };
        } else {
          // ถ้ามีข้อมูลอยู่แล้ว ให้ merge ค่าใหม่เข้าไป
          return {
            ...currentData,
            name: nameToSave,
            defaultName: currentData.defaultName || nameToSave,
            sendRate: tempRate.value + " min",
            last_update: Date.now(),
          };
        }
      });

      isModalOpen.value = false;
    } catch (error) {
      alert("Error: " + error.message);
    }
  } else {
    alert("กรุณากรอกข้อมูลให้ครบถ้วน");
  }
};

// ✅ ฟังก์ชันสั่ง Sleep
const orderSleep = async () => {
  if (!selectedDevice.value) return;

  if (
    !confirm(
      `ต้องการสั่งให้ ${tempName.value || selectedDevice.value.name} เข้าโหมด Sleep ใช่หรือไม่?`,
    )
  )
    return;

  try {
    await update(dbRef(db, `devices/${selectedDevice.value.id}`), {
      pending_command: "sleep",
      status: "Pending Sleep",
      last_update: Date.now(),
    });

    isModalOpen.value = false;
  } catch (error) {
    alert("Error sending sleep command: " + error.message);
  }
};

// --- Actions: Add Device ---
const openAddModal = () => {
  newDeviceForm.value = {
    name: "",
    devEui: "",
    type: "Meter",
    status: "Active",
    sendRate: 5,
    installDate: new Date().toISOString().split("T")[0],
    description: "",
  };
  isAddModalOpen.value = true;
};

const handleAddDevice = async () => {
  if (!newDeviceForm.value.name) {
    alert("กรุณากรอกชื่ออุปกรณ์");
    return;
  }

  const payload = {
    name: newDeviceForm.value.name,
    defaultName: newDeviceForm.value.name, // ✅ เก็บชื่อตั้งต้นไว้ (กันหาย)
    devEui: newDeviceForm.value.devEui || "-",
    type: newDeviceForm.value.type,
    status: "Active",
    battery: 100,
    sendRate: newDeviceForm.value.sendRate + " min",
    installDate: newDeviceForm.value.installDate,
    description: newDeviceForm.value.description,
    last_update: Date.now(),
  };

  try {
    await push(devicesRef, payload);
    isAddModalOpen.value = false;
  } catch (error) {
    alert("Error: " + error.message);
  }
};

// --- Actions: Delete ---
const openDeleteModal = (id) => {
  deviceToDelete.value = id;
  isDeleteModalOpen.value = true;
};

const confirmDelete = async () => {
  if (deviceToDelete.value) {
    try {
      await remove(dbRef(db, `devices/${deviceToDelete.value}`));
      isDeleteModalOpen.value = false;
      deviceToDelete.value = null;
    } catch (error) {
      alert("Error: " + error.message);
    }
  }
};

// Helper Colors
const getBatteryColor = (level) => {
  if (level > 50) return "#198754";
  if (level > 20) return "#ffc107";
  return "#dc3545";
};
</script>

<template>
  <div class="device-page">
    <div class="header-section">
      <h1 class="text-2xl font-bold">Device Management</h1>
      <button class="btn-add" @click="openAddModal">+ New Device</button>
    </div>

    <div class="control-bar">
      <!-- Search Group -->
      <div class="control-group">
        <label class="group-label">Search</label>
        <div class="search-wrapper">
          <span class="search-icon">🔍</span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search Name, ID, or Room..."
            class="premium-control-input search-input"
          />
        </div>
      </div>

      <!-- Filters Group -->
      <div class="control-group">
        <label class="group-label">Filtering</label>
        <div class="select-group">
          <div class="custom-premium-select">
            <select v-model="filterFloor">
              <option value="All">All Floors</option>
              <option value="1">Floor 1</option>
              <option value="2">Floor 2</option>
              <option value="3">Floor 3</option>
            </select>
            <div class="select-arrow">▼</div>
          </div>

          <div class="custom-premium-select">
            <select v-model="filterStatus">
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Maintenance">Maintenance</option>
            </select>
            <div class="select-arrow">▼</div>
          </div>
        </div>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Device Name</th>
            <th>DevEUI / S/N</th>
            <th>Location (Auto)</th>
            <th>Type</th>
            <th>Battery</th>
            <th>Status</th>
            <th>Installed</th>
            <th class="text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="dev in filteredDevices" :key="dev.id">
            <td class="font-bold text-gray-700">
              {{ dev.name }}
              <div class="text-xs text-gray-400 font-mono">{{ dev.id }}</div>
            </td>

            <td class="font-mono text-xs text-gray-600">
              {{ dev.devEui || "-" }}
            </td>

            <td>
              <span v-if="dev.roomName !== 'Unassigned'" class="location-badge">
                📍 {{ dev.roomName }} (Fl.{{ dev.floorNum }})
              </span>
              <span v-else class="text-gray-400 text-sm italic">- Unassigned -</span>
            </td>

            <td>{{ dev.type }}</td>

            <td>
              <div class="battery-wrapper">
                <div class="battery-icon">
                  <div
                    class="battery-level"
                    :style="{
                      width: (dev.battery || 0) + '%',
                      background: getBatteryColor(dev.battery || 0),
                    }"
                  ></div>
                </div>
                <span :style="{ color: getBatteryColor(dev.battery || 0) }"
                  >{{ dev.battery || 0 }}%</span
                >
              </div>
            </td>

            <td>
              <span
                class="status-dot"
                :class="(dev.status || '').toLowerCase().replace(' ', '-')"
              ></span>
              {{ dev.status }}
            </td>

            <td class="text-sm text-gray-500">
              {{ dev.installDate || "-" }}
            </td>

            <td class="text-center">
              <button class="btn-icon btn-edit" @click="openEditModal(dev)" title="Config">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="btn-icon btn-delete" @click="openDeleteModal(dev.id)" title="Delete">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  ></path>
                </svg>
              </button>
            </td>
          </tr>
          <tr v-if="filteredDevices.length === 0">
            <td colspan="8" class="text-center py-4 text-gray-500">
              No devices found matching your search.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Transition name="fade">
      <div v-if="isModalOpen" class="modal-overlay" @click.self="isModalOpen = false">
        <div class="modal-content premium-modal">
          <div class="modal-header">
            <div class="header-title">
              <span class="icon-bg">⚙️</span>
              <div>
                <h3>Device Configuration</h3>
                <p class="subtitle">Manage settings for {{ selectedDevice?.name }}</p>
              </div>
            </div>
            <button class="close-btn" @click="isModalOpen = false">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <!-- Section 1: General Info -->
            <div class="form-section">
              <label class="section-label">General Information</label>
              <div class="input-wrapper">
                <span class="input-icon">🏷️</span>
                <input
                  v-model="tempName"
                  type="text"
                  class="premium-input"
                  placeholder="Enter device name"
                />
              </div>
              <p class="helper-text">Original Name: {{ selectedDevice?.defaultName || "-" }}</p>
            </div>

            <!-- Section 2: Transmission Rate -->
            <div class="form-section">
              <label class="section-label">Data Transmission Rate</label>
              <div class="rate-control">
                <div class="custom-rate">
                  <input v-model="tempRate" type="number" min="1" class="rate-input" />
                  <span class="unit">min</span>
                </div>
                <div class="preset-pills">
                  <button
                    v-for="rate in ratePresets"
                    :key="rate"
                    class="pill-btn"
                    :class="{ active: tempRate === rate }"
                    @click="tempRate = rate"
                  >
                    {{ rate }}m
                  </button>
                </div>
              </div>
            </div>

            <!-- Section 3: Power Management (Danger Zone) -->
            <div class="danger-zone">
              <div class="dz-header">
                <span class="dz-icon">⚡</span>
                <span class="dz-title">Power Management</span>
              </div>
              <div class="dz-content">
                <p>
                  Order the device to enter Deep Sleep mode to conserve battery. Device will wake up
                  on next scheduled uplink.
                </p>
                <button class="btn-sleep-premium" @click="orderSleep">
                  <span>💤 Order Sleep Mode</span>
                </button>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-ghost" @click="isModalOpen = false">Cancel</button>
            <button class="btn-primary-save" @click="saveConfig">Save Changes</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="isAddModalOpen" class="modal-overlay" @click.self="isAddModalOpen = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3>➕ Add New Device</h3>
            <button class="close-btn" @click="isAddModalOpen = false">×</button>
          </div>

          <div class="modal-body">
            <div class="row-2-col mb-3">
              <div class="input-group">
                <label>Device Name *</label>
                <input
                  v-model="newDeviceForm.name"
                  type="text"
                  class="form-control"
                  placeholder="e.g. Smart Meter 01"
                />
              </div>
              <div class="input-group">
                <label>DevEUI / S/N</label>
                <input
                  v-model="newDeviceForm.devEui"
                  type="text"
                  class="form-control"
                  placeholder="e.g. A84041..."
                />
              </div>
            </div>

            <div class="row-2-col mt-3">
              <div class="input-group">
                <label>Type</label>
                <select v-model="newDeviceForm.type" class="form-control">
                  <option value="Meter">Energy Meter</option>
                  <option value="Sensor">Environment Sensor</option>
                  <option value="Gateway">LoRa Gateway</option>
                </select>
              </div>
              <div class="input-group">
                <label>Send Rate (Min)</label>
                <input v-model="newDeviceForm.sendRate" type="number" class="form-control" />
              </div>
            </div>

            <div class="input-group mt-3">
              <label>Note / Description</label>
              <textarea
                v-model="newDeviceForm.description"
                class="form-control"
                style="height: 80px; resize: none"
              ></textarea>
            </div>
            <div class="text-xs text-gray-500 mt-2">
              * หมายเหตุ: การกำหนด "ห้อง" ให้ไปทำที่เมนูจัดการผังตึก (Building Config)
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" @click="isAddModalOpen = false">Cancel</button>
            <button class="btn-save" @click="handleAddDevice">Add Device</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="isDeleteModalOpen" class="modal-overlay" @click.self="isDeleteModalOpen = false">
        <div class="modal-content delete-modal">
          <div class="modal-header">
            <h3 class="text-danger">⚠️ Confirm Deletion</h3>
            <button class="close-btn" @click="isDeleteModalOpen = false">×</button>
          </div>
          <div class="modal-body text-center">
            <p class="font-bold text-lg mb-2">ยืนยันการลบอุปกรณ์นี้?</p>
            <p class="text-gray-500 text-sm">
              การกระทำนี้ไม่สามารถเรียกคืนได้ ข้อมูลอุปกรณ์จะถูกลบออกจากระบบถาวร
            </p>
          </div>
          <div class="modal-footer justify-center">
            <button class="btn-cancel" @click="isDeleteModalOpen = false">ยกเลิก</button>
            <button class="btn-delete-confirm" @click="confirmDelete">ยืนยันการลบ</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* CSS */
/* --- Premium Control Bar --- */
.control-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 12px 24px;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  border: 1px solid #f1f5f9;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 20px;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 16px;
}

.group-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.1em;
  white-space: nowrap;
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 300px;
}

.search-icon {
  position: absolute;
  left: 14px;
  font-size: 0.9rem;
  color: #94a3b8;
}

.premium-control-input {
  width: 100%;
  padding: 10px 16px 10px 40px;
  font-size: 0.9rem;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  transition: all 0.2s;
  color: #1e293b;
  font-weight: 500;
}

.premium-control-input:focus {
  background: white;
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
  outline: none;
}

.select-group {
  display: flex;
  gap: 8px;
}

.custom-premium-select {
  position: relative;
  min-width: 140px;
}

.custom-premium-select select {
  width: 100%;
  appearance: none;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 10px 36px 10px 16px;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.custom-premium-select select:hover {
  border-color: #cbd5e1;
  background: #f1f5f9;
}

.custom-premium-select select:focus {
  border-color: #3b82f6;
  background: white;
  outline: none;
}

.select-arrow {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.6rem;
  color: #94a3b8;
  pointer-events: none;
}

/* Original styles below */
.device-page {
  padding: 20px;
  background-color: #f8f9fa;
  min-height: 100vh;
  font-family: "Inter", sans-serif;
}
.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.btn-add {
  background: #212529;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 5px;
}
.btn-add:hover {
  background: #000000;
  transform: translateY(-2px);
  box-shadow: 0 6px 10px rgba(0, 0, 0, 0.2);
}
.controls-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}
.control-input {
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  outline: none;
  background: white;
}
.search {
  flex: 1;
  max-width: 300px;
}
.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  overflow-x: auto;
  border: 1px solid #e9ecef;
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
}
th {
  background: #f8f9fa;
  text-align: left;
  padding: 15px;
  font-weight: 600;
  color: #495057;
  border-bottom: 2px solid #dee2e6;
}
td {
  padding: 15px;
  border-bottom: 1px solid #e9ecef;
  vertical-align: middle;
  color: #333;
}
.text-center {
  text-align: center;
}
.font-bold {
  font-weight: bold;
}
.font-mono {
  font-family: monospace;
}
.text-gray-700 {
  color: #343a40;
}
.text-gray-600 {
  color: #6c757d;
}
.text-xs {
  font-size: 0.75rem;
}
.text-sm {
  font-size: 0.85rem;
}
.location-badge {
  background: #e9ecef;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.8rem;
  color: #495057;
  font-weight: 500;
}
.status-dot {
  height: 10px;
  width: 10px;
  background-color: #bbb;
  border-radius: 50%;
  display: inline-block;
  margin-right: 6px;
}
.status-dot.active {
  background-color: #198754;
  box-shadow: 0 0 4px #198754;
}
.status-dot.pending-sleep {
  background-color: #fd7e14;
  animation: pulse 2s infinite;
}
.status-dot.sleeping {
  background-color: #6f42c1;
}
.status-dot.inactive {
  background-color: #dc3545;
}
.status-dot.maintenance {
  background-color: #ffc107;
}

.battery-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
  font-size: 0.85rem;
}
.battery-icon {
  width: 26px;
  height: 14px;
  border: 1px solid #666;
  border-radius: 2px;
  padding: 1px;
  position: relative;
}
.battery-icon::after {
  content: "";
  position: absolute;
  right: -3px;
  top: 3px;
  width: 2px;
  height: 6px;
  background: #666;
  border-radius: 0 1px 1px 0;
}
.battery-level {
  height: 100%;
  transition: width 0.3s;
}
.btn-icon {
  border: 1px solid #333;
  background: white;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin: 0 4px;
  color: #333;
  transition: all 0.2s ease;
}

.btn-icon:hover {
  background-color: #f3f4f6;
  transform: translateY(-2px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.btn-edit:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.btn-delete:hover {
  border-color: #ef4444;
  color: #ef4444;
}
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.modal-content {
  background: white;
  width: 90%;
  max-width: 500px;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  animation: slideUp 0.3s ease-out;
}
.modal-header {
  padding: 15px 25px;
  background: #f8f9fa;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #999;
}
.modal-body {
  padding: 25px;
  max-height: 70vh;
  overflow-y: auto;
}
.modal-footer {
  padding: 15px 25px;
  background: #f8f9fa;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.input-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  font-size: 0.9rem;
  color: #444;
}
.form-control {
  width: 100%;
  height: 42px;
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 1rem;
  box-sizing: border-box;
}
.modal-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 1.1rem;
  box-sizing: border-box;
  text-align: center;
  height: 45px;
}
.modal-input.text-left {
  text-align: left;
}
/* --- Premium Modal Styles --- */
.premium-modal {
  background: white;
  width: 95%;
  max-width: 480px;
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  font-family: "Inter", sans-serif;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.8);
}

.modal-header {
  padding: 24px;
  background: white;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 16px;
}

.icon-bg {
  width: 48px;
  height: 48px;
  background: #f8fafc;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  border: 1px solid #e2e8f0;
}

.header-title h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #1e293b;
  letter-spacing: -0.5px;
}

.subtitle {
  margin: 4px 0 0 0;
  font-size: 0.875rem;
  color: #64748b;
}

.close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: all 0.2s;
  display: flex;
}

.close-btn:hover {
  background: #f1f5f9;
  color: #ef4444;
  transform: rotate(90deg);
}

.modal-body {
  padding: 24px;
}

.form-section {
  margin-bottom: 24px;
}

.section-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 12px;
  letter-spacing: 0.5px;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 16px;
  font-size: 1.1rem;
  pointer-events: none;
  z-index: 10;
}

.premium-input {
  width: 100%;
  padding: 14px 16px 14px 50px;
  font-size: 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  color: #1e293b;
  font-weight: 500;
}

.premium-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
  outline: none;
}

.helper-text {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-top: 8px;
  margin-left: 4px;
}

/* Rate Control */
.rate-control {
  background: #f8fafc;
  padding: 6px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
}

.custom-rate {
  display: flex;
  align-items: center;
  background: white;
  border-radius: 12px;
  padding: 8px 16px;
  margin-bottom: 8px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
}

.rate-input {
  border: none;
  font-size: 1.25rem;
  font-weight: 700;
  color: #3b82f6;
  width: 100%;
  outline: none;
}

.unit {
  font-size: 0.875rem;
  font-weight: 600;
  color: #64748b;
}

.preset-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.pill-btn {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  color: #64748b;
  font-weight: 600;
  font-size: 0.9rem;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.pill-btn:hover {
  background: rgba(255, 255, 255, 0.5);
  color: #334155;
}

.pill-btn.active {
  background: white;
  color: #3b82f6;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  font-weight: 700;
}

/* Danger Zone */
.danger-zone {
  margin-top: 32px;
  border: 1px solid #fecaca;
  background: #fef2f2;
  border-radius: 16px;
  overflow: hidden;
}

.dz-header {
  padding: 12px 20px;
  background: #fee2e2;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #b91c1c;
  font-weight: 700;
  font-size: 0.9rem;
}

.dz-content {
  padding: 20px;
}

.dz-content p {
  margin: 0 0 16px 0;
  font-size: 0.875rem;
  color: #7f1d1d;
  line-height: 1.5;
}

.btn-sleep-premium {
  width: 100%;
  padding: 12px;
  background: white;
  border: 1px solid #f87171;
  color: #dc2626;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
}

.btn-sleep-premium:hover {
  background: #dc2626;
  color: white;
  border-color: #dc2626;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2);
}

/* Footer */
.modal-footer {
  padding: 24px;
  background: white;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid #f1f5f9;
}

.btn-ghost {
  padding: 12px 24px;
  color: #64748b;
  font-weight: 600;
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 12px;
  transition: all 0.2s;
}

.btn-ghost:hover {
  background: #f8fafc;
  color: #334155;
}

.btn-primary-save {
  padding: 12px 32px;
  background: #0f172a;
  color: white;
  font-weight: 600;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
  transition: all 0.2s;
}

.btn-primary-save:hover {
  background: #1e293b;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.3);
}

.btn-primary-save:active {
  transform: translateY(0);
}

.row-2-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  align-items: end;
}
.mb-3 {
  margin-bottom: 15px;
}
.mt-3 {
  margin-top: 15px;
}
.preset-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 10px;
}
.preset-btn {
  background: #fff;
  border: 1px solid #dee2e6;
  color: #495057;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}
.preset-btn.active {
  background: #e7f1ff;
  border-color: #0d6efd;
  color: #0d6efd;
  font-weight: bold;
}

/* ปุ่ม Sleep */
.btn-sleep {
  width: 100%;
  background: #6610f2;
  color: white;
  border: none;
  padding: 10px;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-sleep:hover {
  background: #520dc2;
}
.divider {
  border: 0;
  border-top: 1px solid #eee;
  margin: 20px 0;
}

.btn-cancel {
  background: #e9ecef;
  color: #495057;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}
.btn-save {
  background: #0d6efd;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.delete-modal {
  max-width: 400px;
}
.text-danger {
  color: #dc3545;
  font-weight: 700;
}
.btn-delete-confirm {
  background: #dc3545;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}
.btn-delete-confirm:hover {
  background: #bb2d3b;
}
.justify-center {
  justify-content: center !important;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Responsive Adjustments */
@media (max-width: 1024px) {
  .header-section {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }

  .btn-add {
    width: 100%;
    justify-content: center;
  }

  .controls-bar {
    flex-direction: column;
    gap: 10px;
  }

  .control-input {
    width: 100%;
    max-width: none;
  }

  .table-container {
    overflow-x: auto;
    margin: 0 -15px;
    border-radius: 0;
  }

  table {
    min-width: 900px; /* Keep table wide enough to be readable */
  }
}

@media (max-width: 600px) {
  .device-page {
    padding: 15px;
  }

  .modal-content {
    width: 95%;
    margin: 10px;
    padding: 0; /* Let body handle padding */
  }

  .modal-body {
    padding: 20px 15px;
  }

  .row-2-col {
    grid-template-columns: 1fr;
    gap: 15px;
  }

  .preset-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .modal-footer {
    flex-direction: column-reverse;
  }

  .modal-footer button {
    width: 100%;
  }
}
</style>
