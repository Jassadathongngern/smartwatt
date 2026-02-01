<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
// ❌ ลบ Mock Data ทิ้ง
// import { deviceListMock } from "../data/mockData.js";

// ✅ นำเข้า Firebase
import { db } from "../firebase";
import { ref as dbRef, onValue, set, remove, update, off } from "firebase/database";

// --- State ---
const devices = ref([]); // ✅ เริ่มต้นเป็นอาเรย์ว่าง รอรับข้อมูลจริง
const searchQuery = ref("");
const filterStatus = ref("All");
const filterFloor = ref("All");

// --- Modal State (Edit Rate) ---
const isModalOpen = ref(false);
const selectedDevice = ref(null);
const tempRate = ref("");
const ratePresets = [1, 5, 10, 15, 30, 60];

// --- Modal State (Add Device) ---
const isAddModalOpen = ref(false);
const newDeviceForm = ref({
  name: "",
  id: "",
  devEui: "",
  room: "",
  floor: "1",
  type: "Meter",
  sendRate: 5,
  installDate: "",
  description: "",
});

// --- ✅ Real-time Listener (หัวใจสำคัญ) ---
const devicesRef = dbRef(db, "devices");

onMounted(() => {
  // ดึงข้อมูลจาก Firebase ทันทีที่มีการเปลี่ยนแปลง
  onValue(devicesRef, (snapshot) => {
    const data = snapshot.val();
    const loadedDevices = [];

    if (data) {
      // แปลง Object ของ Firebase ให้เป็น Array เพื่อวนลูปแสดงผล
      for (const key in data) {
        loadedDevices.push({
          id: key, // ใช้ Key ของ Firebase เป็น ID (หรือใช้ ID ที่เราตั้งเอง)
          ...data[key],
        });
      }
      // เรียงลำดับเอาตัวใหม่ล่าสุดขึ้นก่อน (ถ้าต้องการ)
      devices.value = loadedDevices.reverse();
    } else {
      devices.value = [];
    }
  });
});

onUnmounted(() => {
  // ปิดการเชื่อมต่อเมื่อเปลี่ยนหน้า (ประหยัดแรม)
  off(devicesRef);
});

// --- Logic Filter (เหมือนเดิม) ---
const filteredDevices = computed(() => {
  return devices.value.filter((dev) => {
    const matchSearch =
      dev.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      dev.room.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      dev.id.toLowerCase().includes(searchQuery.value.toLowerCase());

    const matchStatus = filterStatus.value === "All" || dev.status === filterStatus.value;
    const matchFloor = filterFloor.value === "All" || dev.floor === filterFloor.value;

    return matchSearch && matchStatus && matchFloor;
  });
});

// --- Actions: Edit Rate (Update) ---
const openEditModal = (device) => {
  selectedDevice.value = device;
  tempRate.value = parseInt(device.sendRate.toString().replace(" min", ""));
  isModalOpen.value = true;
};

const saveRate = async () => {
  if (selectedDevice.value && tempRate.value) {
    try {
      // ✅ อัปเดตข้อมูลไปที่ Firebase จริงๆ
      await update(dbRef(db, `devices/${selectedDevice.value.id}`), {
        sendRate: tempRate.value + " min",
      });

      isModalOpen.value = false;
      // ไม่ต้องแก้ devices.value เอง เพราะ onValue จะทำงานให้อัตโนมัติ
      alert("อัปเดตการตั้งค่าเรียบร้อย!");
    } catch (error) {
      console.error(error);
      alert("เกิดข้อผิดพลาดในการบันทึก");
    }
  }
};

// --- Actions: Add Device (Create) ---
const openAddModal = () => {
  newDeviceForm.value = {
    name: "",
    id: `DEV-${Math.floor(1000 + Math.random() * 9000)}`, // สุ่มเลข 4 หลัก
    devEui: "",
    room: "",
    floor: "1",
    type: "Meter",
    sendRate: 5,
    installDate: new Date().toISOString().split("T")[0],
    description: "",
  };
  isAddModalOpen.value = true;
};

const handleAddDevice = async () => {
  if (!newDeviceForm.value.name || !newDeviceForm.value.room) {
    alert("กรุณากรอกชื่ออุปกรณ์และห้องให้ครบถ้วน");
    return;
  }

  const deviceId = newDeviceForm.value.id; // ใช้ ID ที่สุ่มมาเป็น Key หลัก

  const newDev = {
    id: deviceId, // เก็บ ID ไว้ใน Object ด้วย
    devEui: newDeviceForm.value.devEui || "-",
    name: newDeviceForm.value.name,
    room: newDeviceForm.value.room,
    floor: newDeviceForm.value.floor,
    type: newDeviceForm.value.type,
    battery: 100, // ค่าเริ่มต้น
    status: "Offline", // เริ่มต้นเป็น Offline จนกว่าจะมีข้อมูลเข้า
    sendRate: newDeviceForm.value.sendRate + " min",
    lastUpdate: "-",
    installDate: newDeviceForm.value.installDate,
    description: newDeviceForm.value.description,

    // เตรียมที่ว่างสำหรับค่า Sensor (Optional)
    current_values: {
      power: 0,
      voltage: 0,
      temp: 0,
    },
  };

  try {
    // ✅ บันทึกลง Firebase (ใช้ set เพื่อระบุ ID เอง)
    await set(dbRef(db, `devices/${deviceId}`), newDev);

    isAddModalOpen.value = false;
    alert("เพิ่มอุปกรณ์ลงฐานข้อมูลเรียบร้อย!");
  } catch (error) {
    console.error(error);
    alert("ไม่สามารถเพิ่มอุปกรณ์ได้: " + error.message);
  }
};

// --- Actions: Delete Device (Delete) ---
const handleDelete = async (id) => {
  if (confirm(`ยืนยันการลบอุปกรณ์ ${id} ? ข้อมูลประวัติอาจหายไปด้วย`)) {
    try {
      // ✅ ลบจาก Firebase จริงๆ
      await remove(dbRef(db, `devices/${id}`));
      // alert("ลบเรียบร้อย"); // ไม่ต้อง alert ก็ได้เพราะเห็นผลทันที
    } catch (error) {
      alert("ลบไม่สำเร็จ: " + error.message);
    }
  }
};

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

    <div class="controls-bar">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search Device Name, ID, or Room..."
        class="control-input search"
      />
      <select v-model="filterFloor" class="control-input">
        <option value="All">All Floors</option>
        <option value="1">Floor 1</option>
        <option value="2">Floor 2</option>
        <option value="3">Floor 3</option>
      </select>
      <select v-model="filterStatus" class="control-input">
        <option value="All">All Status</option>
        <option value="Online">Online</option>
        <option value="Offline">Offline</option>
      </select>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Device Name</th>
            <th>DevEUI / S/N</th>
            <th>Location</th>
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
              <div class="text-xs text-gray-400">{{ dev.id }}</div>
            </td>

            <td class="font-mono text-xs text-gray-600">
              {{ dev.devEui || "-" }}
            </td>

            <td>
              <span class="location-badge">📍 {{ dev.room }} (Fl.{{ dev.floor }})</span>
            </td>

            <td>{{ dev.type }}</td>

            <td>
              <div class="battery-wrapper">
                <div class="battery-icon">
                  <div
                    class="battery-level"
                    :style="{ width: dev.battery + '%', background: getBatteryColor(dev.battery) }"
                  ></div>
                </div>
                <span :style="{ color: getBatteryColor(dev.battery) }">{{ dev.battery }}%</span>
                <span v-if="dev.battery <= 20" title="Low Battery" class="alert-icon">⚠️</span>
              </div>
            </td>

            <td>
              <span class="status-dot" :class="dev.status.toLowerCase()"></span>
              {{ dev.status }}
            </td>

            <td class="text-sm text-gray-500">
              {{ dev.installDate || "-" }}
            </td>

            <td class="text-center">
              <button class="btn-action settings" @click="openEditModal(dev)" title="Config">
                ⚙️
              </button>
              <button class="btn-action delete" @click="handleDelete(dev.id)" title="Delete">
                🗑
              </button>
            </td>
          </tr>
          <tr v-if="filteredDevices.length === 0">
            <td colspan="8" class="text-center py-4 text-gray-500">
              <span v-if="devices.length === 0">Loading devices... or No data found.</span>
              <span v-else>No matching devices found.</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Transition name="fade">
      <div v-if="isModalOpen" class="modal-overlay" @click.self="isModalOpen = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3>⚙️ Configure Device</h3>
            <button class="close-btn" @click="isModalOpen = false">×</button>
          </div>
          <div class="modal-body">
            <p class="device-label">
              อุปกรณ์: <strong>{{ selectedDevice?.name }}</strong>
            </p>
            <div class="input-group">
              <label>LoRa Send Rate (นาที)</label>
              <input v-model="tempRate" type="number" min="1" class="modal-input" />
            </div>
            <div class="preset-section">
              <div class="preset-grid">
                <button
                  v-for="rate in ratePresets"
                  :key="rate"
                  class="preset-btn"
                  :class="{ active: tempRate === rate }"
                  @click="tempRate = rate"
                >
                  {{ rate }} m
                </button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="isModalOpen = false">ยกเลิก</button>
            <button class="btn-save" @click="saveRate">บันทึกการตั้งค่า</button>
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
                <label>Device Name (ชื่อเรียก)</label>
                <input
                  v-model="newDeviceForm.name"
                  type="text"
                  class="form-control"
                  placeholder="Ex. Meter-01"
                />
              </div>
              <div class="input-group">
                <label>DevEUI / S/N (รหัสเครื่อง)</label>
                <input
                  v-model="newDeviceForm.devEui"
                  type="text"
                  class="form-control"
                  placeholder="Ex. A84041..."
                />
              </div>
            </div>

            <div class="row-2-col">
              <div class="input-group">
                <label>Room (ห้อง)</label>
                <input
                  v-model="newDeviceForm.room"
                  type="text"
                  class="form-control"
                  placeholder="Ex. 16101"
                />
              </div>
              <div class="input-group">
                <label>Floor (ชั้น)</label>
                <select v-model="newDeviceForm.floor" class="form-control">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </div>
            </div>

            <div class="row-2-col mt-3">
              <div class="input-group">
                <label>Type</label>
                <select v-model="newDeviceForm.type" class="form-control">
                  <option value="Meter">Energy Meter</option>
                  <option value="Sensor">Environment Sensor</option>
                </select>
              </div>
              <div class="input-group">
                <label>Send Rate (Min)</label>
                <input
                  v-model="newDeviceForm.sendRate"
                  type="number"
                  class="form-control"
                  placeholder="5"
                />
              </div>
            </div>

            <div class="row-2-col mt-3">
              <div class="input-group">
                <label>Install Date (วันที่ติดตั้ง)</label>
                <input v-model="newDeviceForm.installDate" type="date" class="form-control" />
              </div>
              <div class="input-group">
                <label>System ID (Auto)</label>
                <input
                  v-model="newDeviceForm.id"
                  type="text"
                  class="form-control bg-gray-100"
                  disabled
                />
              </div>
            </div>

            <div class="input-group mt-3">
              <label>Note / Description (หมายเหตุ)</label>
              <textarea
                v-model="newDeviceForm.description"
                class="form-control"
                style="height: 80px; resize: none; padding-top: 8px"
                placeholder="เช่น ติดตั้งอยู่เหนือตู้แร็ค, เปลี่ยนแบตล่าสุดเมื่อ..."
              ></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" @click="isAddModalOpen = false">ยกเลิก</button>
            <button class="btn-save" @click="handleAddDevice">บันทึกข้อมูล</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* --- Page Layout --- */
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
  background: #212529; /* สีดำ (เทาเข้มเกือบดำ) ดูหรู */
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15); /* เงาเข้มขึ้นนิดนึง */
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 5px;
}

.btn-add:hover {
  background: #000000; /* ดำสนิทเมื่อเอาเมาส์ชี้ */
  transform: translateY(-2px); /* ลอยขึ้นนิดนึง */
  box-shadow: 0 6px 10px rgba(0, 0, 0, 0.2);
}

/* --- Controls --- */
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
.control-input:focus {
  border-color: #0d6efd;
}
.search {
  flex: 1;
  max-width: 300px;
}

/* --- Table --- */
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
} /* เพิ่ม min-width ให้ตารางไม่เบียด */
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
  font-family: "Courier New", Courier, monospace;
} /* สำหรับ DevEUI */
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

/* Badges & Icons */
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
.status-dot.online {
  background-color: #198754;
  box-shadow: 0 0 4px #198754;
}
.status-dot.offline {
  background-color: #dc3545;
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
.alert-icon {
  font-size: 1rem;
  animation: pulse 1s infinite;
  cursor: help;
}

/* Actions */
.btn-action {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1.2rem;
  margin: 0 5px;
  transition: transform 0.2s;
  padding: 4px;
  border-radius: 4px;
}
.btn-action:hover {
  transform: scale(1.1);
  background-color: #f1f3f5;
}
.settings {
  color: #0d6efd;
}
.delete {
  color: #dc3545;
}

/* --- MODAL STYLES --- */
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
.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #333;
  font-weight: 700;
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

/* ✅ Form Styles (Unified) */
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
  transition: border-color 0.2s;
  box-sizing: border-box;
  text-align: left;
  background-color: white;
  font-family: inherit;
}
.form-control:focus {
  outline: none;
  border-color: #0d6efd;
  box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.1);
}
.form-control.bg-gray-100 {
  background-color: #f8f9fa;
  color: #6c757d;
  cursor: not-allowed;
}

/* Modal Input (Small for Edit Rate) */
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
.modal-input:focus {
  outline: none;
  border-color: #0d6efd;
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
.preset-btn:hover {
  background: #f8f9fa;
  border-color: #adb5bd;
}
.preset-btn.active {
  background: #e7f1ff;
  border-color: #0d6efd;
  color: #0d6efd;
  font-weight: bold;
}

.btn-cancel {
  background: #e9ecef;
  color: #495057;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}
.btn-cancel:hover {
  background: #dee2e6;
}
.btn-save {
  background: #0d6efd;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}
.btn-save:hover {
  background: #0b5ed7;
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
</style>
