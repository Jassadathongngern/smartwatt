<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { rtdb as db } from "../firebase";
import { ref as dbRef, onValue, set, update, remove, off } from "firebase/database";

const props = defineProps({
  showAdd: Boolean,
  showList: Boolean,
});

const emit = defineEmits(["update:showAdd", "update:showList"]);

// internal states
const showEditRoomModal = ref(false);
const roomForm = ref({ floor: "1", name: "", type: "Classroom" });
const roomEditForm = ref({ floorKey: "", originalName: "", name: "", type: "Classroom" });

const buildingConfig = ref({});
const deviceMappings = ref({});
const devices = ref([]);

// fetch from RTDB
onMounted(() => {
  onValue(dbRef(db, "building_configs"), (snap) => (buildingConfig.value = snap.val() || {}));
  onValue(dbRef(db, "device_mappings"), (snap) => (deviceMappings.value = snap.val() || {}));
  onValue(dbRef(db, "devices"), (snap) => {
    const data = snap.val();
    if (data) {
      devices.value = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
    } else {
      devices.value = [];
    }
  });
});

onUnmounted(() => {
  off(dbRef(db, "building_configs"));
  off(dbRef(db, "device_mappings"));
  off(dbRef(db, "devices"));
});

// Helper
const getDeviceLocation = (deviceId) => {
  const mappings = deviceMappings.value[deviceId] || {};
  const mappedRooms = Object.values(mappings).filter(Boolean);
  if (mappedRooms.length === 0) return { room: "ยังไม่ได้ระบุ", floor: "-" };
  const roomName = mappedRooms[0];
  let floorResult = "-";
  if (buildingConfig.value) {
    for (const [floorKey, floorData] of Object.entries(buildingConfig.value)) {
      if (floorData.rooms && floorData.rooms[roomName]) {
        floorResult = floorKey.replace("floor_", "");
        break;
      }
    }
  }
  return { room: roomName, floor: floorResult };
};

// Logic
const handleAddRoom = async () => {
  if (!roomForm.value.name.trim()) {
    alert("Please enter a room name.");
    return;
  }

  const payload = {
    deviceId: "",
    type: roomForm.value.type,
  };

  try {
    await update(
      dbRef(
        db,
        `building_configs/floor_${roomForm.value.floor}/rooms/${roomForm.value.name.trim()}`,
      ),
      payload,
    );
    emit("update:showAdd", false);
    roomForm.value = { floor: "1", name: "", type: "Classroom" };
    alert("Room added successfully!");
  } catch (error) {
    alert("Error adding room: " + error.message);
  }
};

const openEditRoomModal = (floorKey, roomName, roomData) => {
  roomEditForm.value = {
    floorKey,
    originalName: roomName,
    name: roomName,
    type: roomData.type || "Classroom",
  };
  showEditRoomModal.value = true;
};

const handleEditRoom = async () => {
  const { floorKey, originalName, name, type } = roomEditForm.value;
  const newName = name.trim();

  if (!newName) {
    alert("กรุณาระบุชื่อห้อง");
    return;
  }

  try {
    if (newName !== originalName) {
      if (buildingConfig.value[floorKey]?.rooms?.[newName]) {
        alert("มีชื่อห้องนี้อยู่แล้วในชั้นนี้");
        return;
      }
    }

    const payload = {
      deviceId: buildingConfig.value[floorKey]?.rooms?.[originalName]?.deviceId || "",
      type: type,
    };

    if (newName !== originalName) {
      await set(dbRef(db, `building_configs/${floorKey}/rooms/${newName}`), payload);

      // Update mappings
      if (deviceMappings.value) {
        for (const [deviceId, mappings] of Object.entries(deviceMappings.value)) {
          for (const [chId, mappedRoom] of Object.entries(mappings)) {
            if (mappedRoom === originalName) {
              await set(dbRef(db, `device_mappings/${deviceId}/${chId}`), newName);
            }
          }
        }
      }
      await remove(dbRef(db, `building_configs/${floorKey}/rooms/${originalName}`));
    } else {
      await update(dbRef(db, `building_configs/${floorKey}/rooms/${originalName}`), payload);
    }

    showEditRoomModal.value = false;
    alert("อัปเดตข้อมูลห้องเรียบร้อยแล้ว");
  } catch (error) {
    alert("Error updating room: " + error.message);
  }
};

const handleDeleteRoom = async (floorKey, roomName) => {
  const isAssignedInDevices = devices.value.some((d) => {
    const loc = getDeviceLocation(d.id);
    return loc.room === roomName && loc.floor === floorKey.replace("floor_", "");
  });

  let isAssignedInMappings = false;
  if (deviceMappings.value) {
    Object.values(deviceMappings.value).forEach((mapping) => {
      Object.values(mapping).forEach((mappedRoom) => {
        if (mappedRoom === roomName) isAssignedInMappings = true;
      });
    });
  }

  if (isAssignedInDevices || isAssignedInMappings) {
    alert(
      `ไม่สามารถลบห้อง "${roomName}" ได้ เนื่องจากมีอุปกรณ์ติดตั้งอยู่ภายในห้องนี้ กรุณาย้ายอุปกรณ์ออกก่อนลบ`,
    );
    return;
  }

  if (confirm(`ยืนยันการลบห้อง "${roomName}"? การกระทำนี้ไม่สามารถเรียกคืนได้`)) {
    try {
      await remove(dbRef(db, `building_configs/${floorKey}/rooms/${roomName}`));
      alert("ลบห้องเรียบร้อยแล้ว");
    } catch (error) {
      alert("Error deleting room: " + error.message);
    }
  }
};
</script>

<template>
  <!-- Add Room Modal -->
  <Transition name="fade">
    <div v-if="showAdd" class="modal-overlay" @click.self="emit('update:showAdd', false)">
      <div class="modal-content premium-modal">
        <div class="modal-header">
          <div class="header-title">
            <span class="icon-bg" style="background: #f0fdf4; border-color: #bbf7d0">🚪</span>
            <div>
              <h3>เพิ่มห้องใหม่</h3>
              <p class="subtitle">สร้างห้องใหม่ในอาคาร</p>
            </div>
          </div>
          <button class="close-btn" @click="emit('update:showAdd', false)">
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
          <form @submit.prevent="handleAddRoom">
            <div class="row-2-col" style="margin-bottom: 20px">
              <div class="form-group">
                <label class="section-label">ชั้น</label>
                <div class="select-wrapper">
                  <select v-model="roomForm.floor" class="premium-input">
                    <option value="1">ชั้น 1</option>
                    <option value="2">ชั้น 2</option>
                    <option value="3">ชั้น 3</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="section-label">ประเภทห้อง</label>
                <div class="select-wrapper">
                  <select v-model="roomForm.type" class="premium-input">
                    <option value="Classroom">ห้องเรียน</option>
                    <option value="Office">ห้องพักครู/สำนักงาน</option>
                    <option value="Laboratory">ห้องแล็บ</option>
                    <option value="Storage Room">ห้องเก็บของ</option>
                    <option value="Meeting Room">ห้องประชุม</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="form-section">
              <label class="section-label">ชื่อห้อง / หมายเลขห้อง</label>
              <div class="input-wrapper">
                <span class="input-icon">🏷️</span>
                <input
                  v-model="roomForm.name"
                  type="text"
                  required
                  class="premium-input"
                  placeholder="e.g. 16101"
                />
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn-ghost" @click="emit('update:showAdd', false)">
                ยกเลิก
              </button>
              <button
                type="submit"
                class="btn-primary-save"
                style="background: #10b981; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2)"
              >
                บันทึกห้อง
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </Transition>

  <!-- Room List Modal for Deletion/Edit -->
  <Transition name="fade">
    <div v-if="showList" class="modal-overlay" @click.self="emit('update:showList', false)">
      <div class="modal-content premium-modal" style="max-width: 600px">
        <div class="modal-header">
          <div class="header-title">
            <span class="icon-bg" style="background: #f8fafc; border-color: #e2e8f0">📂</span>
            <div>
              <h3>การจัดการห้อง</h3>
              <p class="subtitle">ดูและลบห้องที่มีข้อมูลอยู่ในอาคาร</p>
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center">
            <button
              class="btn-primary-save"
              style="padding: 8px 16px; border-radius: 8px"
              @click="
                () => {
                  emit('update:showAdd', true);
                  emit('update:showList', false);
                }
              "
            >
              + เพิ่มห้องใหม่
            </button>
            <button class="close-btn" @click="emit('update:showList', false)">×</button>
          </div>
        </div>

        <div class="modal-body" style="max-height: 60vh; overflow-y: auto; padding: 0">
          <div
            v-for="(floorData, floorKey) in buildingConfig"
            :key="floorKey"
            class="management-floor-section"
          >
            <div
              class="management-floor-header"
              style="
                background: #f8fafc;
                padding: 10px 24px;
                font-weight: bold;
                font-size: 0.85rem;
                color: #64748b;
                border-bottom: 1px solid #f1f5f9;
              "
            >
              ชั้น {{ floorKey.replace("floor_", "") }}
            </div>
            <div class="management-room-list">
              <div
                v-for="(roomData, roomName) in floorData.rooms"
                :key="roomName"
                class="management-room-item"
                style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  padding: 12px 24px;
                  border-bottom: 1px solid #f8fafc;
                "
              >
                <div style="display: flex; align-items: center; gap: 12px">
                  <span style="font-size: 1.2rem">🚪</span>
                  <div>
                    <div style="font-weight: 600; color: #1e293b">{{ roomName }}</div>
                    <div style="font-size: 0.75rem; color: #94a3b8">{{ roomData.type }}</div>
                  </div>
                </div>
                <div style="display: flex; gap: 8px">
                  <button
                    class="btn-icon btn-edit"
                    style="color: #3b82f6; background: #eff6ff; border-radius: 8px; padding: 8px"
                    @click="openEditRoomModal(floorKey, roomName, roomData)"
                    title="Edit Room"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                  <button
                    class="btn-icon btn-delete"
                    style="color: #ef4444; background: #fee2e2; border-radius: 8px; padding: 8px"
                    @click="handleDeleteRoom(floorKey, roomName)"
                    title="Delete Room"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path
                        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                      ></path>
                    </svg>
                  </button>
                </div>
              </div>
              <div
                v-if="!floorData.rooms || Object.keys(floorData.rooms).length === 0"
                style="padding: 20px; text-align: center; color: #cbd5e1; font-style: italic"
              >
                No rooms on this floor
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-ghost" style="width: 100%" @click="emit('update:showList', false)">
            Close
          </button>
        </div>
      </div>
    </div>
  </Transition>

  <!-- Edit Room Modal -->
  <Transition name="fade">
    <div v-if="showEditRoomModal" class="modal-overlay" @click.self="showEditRoomModal = false">
      <div class="modal-content premium-modal">
        <div class="modal-header">
          <div class="header-title">
            <span class="icon-bg" style="background: #eff6ff; border-color: #dbeafe">✏️</span>
            <div>
              <h3>Edit Room</h3>
              <p class="subtitle">Modify room name or type</p>
            </div>
          </div>
          <button class="close-btn" @click="showEditRoomModal = false">×</button>
        </div>

        <div class="modal-body">
          <form @submit.prevent="handleEditRoom">
            <div class="form-section">
              <label class="section-label">Room Name / Number</label>
              <div class="input-wrapper">
                <span class="input-icon">🏷️</span>
                <input
                  v-model="roomEditForm.name"
                  type="text"
                  required
                  class="premium-input"
                  placeholder="e.g. 16101"
                />
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 24px">
              <label class="section-label">Room Type</label>
              <div class="select-wrapper">
                <select
                  v-model="roomEditForm.type"
                  class="premium-input"
                  style="padding-left: 16px"
                >
                  <option value="Classroom">ห้องเรียน</option>
                  <option value="Office">สำนักงาน</option>
                  <option value="Laboratory">ห้องปฏิบัติการ</option>
                  <option value="Storage Room">ห้องเก็บของ</option>
                  <option value="Meeting Room">ห้องประชุม</option>
                </select>
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn-ghost" @click="showEditRoomModal = false">
                Cancel
              </button>
              <button
                type="submit"
                class="btn-primary-save"
                style="background: #3b82f6; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2)"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Modal Animations */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Modal Overlay & Content */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.modal-content.premium-modal {
  background: white;
  border-radius: 20px;
  width: 90%;
  max-width: 480px;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  transform: translateY(0);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-header {
  padding: 24px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background: white;
}

.header-title {
  display: flex;
  gap: 16px;
  align-items: center;
}

.icon-bg {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 1.5rem;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.header-title h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #1e293b;
}

.subtitle {
  margin: 4px 0 0 0;
  font-size: 0.85rem;
  color: #64748b;
}

.close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  transition: all 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
}

.close-btn:hover {
  background: #f1f5f9;
  color: #ef4444;
}

.modal-body {
  padding: 24px;
}

.form-section,
.form-group {
  margin-bottom: 20px;
}

.section-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.input-wrapper {
  position: relative;
}

.input-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1.1rem;
  color: #94a3b8;
}

.premium-input {
  width: 100%;
  padding: 12px 16px 12px 42px;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  font-size: 0.95rem;
  color: #1e293b;
  box-sizing: border-box;
  background: #f8fafc;
  transition: all 0.2s;
}

.premium-input:focus {
  outline: none;
  border-color: #3b82f6;
  background: white;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
}

.row-2-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.select-wrapper select.premium-input {
  padding-left: 16px;
  cursor: pointer;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #f1f5f9;
  background: #f8fafc;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-ghost {
  padding: 10px 20px;
  border: none;
  background: transparent;
  color: #64748b;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-ghost:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.btn-primary-save {
  padding: 10px 24px;
  border: none;
  background: #3b82f6;
  color: white;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
}

.btn-primary-save:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.3);
}

.btn-primary-save:active {
  transform: translateY(1px);
}

.btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-icon:hover {
  transform: scale(1.1);
}
</style>
