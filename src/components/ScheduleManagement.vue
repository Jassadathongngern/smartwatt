<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { rtdb as db } from "../firebase";
import { ref as dbRef, onValue, remove, update, off, push } from "firebase/database";
import RoomManagerModal from "./RoomManagerModal.vue";

// --- 1. Date & Time Logistics ---
const today = new Date();
const daysOrder = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const selectedDay = ref("All");

const currentTimeMinutes = ref(0);
let timeInterval = null;

const updateCurrentTime = () => {
  const now = new Date();
  currentTimeMinutes.value = now.getHours() * 60 + now.getMinutes();
};

// --- 2. State & Data ---
const schedules = ref([]);
const searchQuery = ref("");
const selectedFloor = ref("All");
const selectedRoom = ref("All");

const showModal = ref(false);
const isEditMode = ref(false);
const editId = ref(null);

const isDeleteModalOpen = ref(false);
const deleteId = ref(null);

const showAddRoomModal = ref(false);
const showRoomListModal = ref(false);

const form = ref({
  day: "Monday",
  startTime: "09:00",
  endTime: "12:00",
  room: "",
  subject: "",
  status: "Active",
});

const sRef = dbRef(db, "schedules");
const isLoading = ref(true);
const errorMessage = ref("");

onMounted(() => {
  updateCurrentTime();
  timeInterval = setInterval(updateCurrentTime, 60000);

  onValue(
    sRef,
    (snapshot) => {
      const data = snapshot.val();
      if (data) {
        schedules.value = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
      } else {
        schedules.value = [];
      }
      isLoading.value = false;
      errorMessage.value = "";
    },
    (error) => {
      console.error("Firebase Error:", error);
      errorMessage.value = "Error loading data: " + error.message;
      isLoading.value = false;
    },
  );
});

onUnmounted(() => {
  off(sRef);
  if (timeInterval) clearInterval(timeInterval);
});

// --- 3. Filter Logic ---
const getFloorFromRoom = (roomStr) => {
  if (!roomStr) return "Unknown";
  const match = roomStr.match(/16([1-9])\d\d/);
  if (match) return match[1];
  const numMatch = roomStr.match(/\d+/);
  if (numMatch) {
    const numStr = numMatch[0];
    if (numStr.length === 5) return numStr[2];
    if (numStr.length >= 3) return numStr[0];
  }
  return "Other";
};

const availableFloors = computed(() => {
  const floors = new Set(
    schedules.value.map((item) => getFloorFromRoom(item.room)).filter((f) => f !== "Unknown"),
  );
  return ["All", ...Array.from(floors).sort()];
});

const availableRooms = computed(() => {
  let filtered = schedules.value;
  if (selectedFloor.value !== "All") {
    filtered = filtered.filter((item) => getFloorFromRoom(item.room) === selectedFloor.value);
  }
  const rooms = new Set(filtered.map((item) => item.room).filter((r) => r));
  // default sort alphabetically
  return ["All", ...Array.from(rooms).sort()];
});

// Display Rooms
const displayRooms = computed(() => {
  let filtered = schedules.value;

  if (selectedFloor.value !== "All") {
    filtered = filtered.filter((s) => getFloorFromRoom(s.room) === selectedFloor.value);
  }
  if (selectedRoom.value !== "All") {
    filtered = filtered.filter((s) => s.room === selectedRoom.value);
  }

  const search = searchQuery.value.toLowerCase();
  if (search) {
    filtered = filtered.filter((s) => {
      const subj = (s.subject || "").toLowerCase();
      const rm = (s.room || "").toLowerCase();
      return subj.includes(search) || rm.includes(search);
    });
  }

  if (selectedDay.value !== "All") {
    filtered = filtered.filter((s) => s.day === selectedDay.value);
  }

  const rooms = new Set(filtered.map((s) => s.room).filter((r) => r));
  return Array.from(rooms).sort();
});

// Helper for UI formatting
const dayNamesTH = {
  Sunday: "อาทิตย์",
  Monday: "จันทร์",
  Tuesday: "อังคาร",
  Wednesday: "พุธ",
  Thursday: "พฤหัสบดี",
  Friday: "ศุกร์",
  Saturday: "เสาร์",
};

const dayColors = {
  Sunday: "#ef4444",
  Monday: "#eab308",
  Tuesday: "#ec4899",
  Wednesday: "#22c55e",
  Thursday: "#f97316",
  Friday: "#3b82f6",
  Saturday: "#a855f7",
};

// Group schedules by room -> day
const getGroupedSchedulesForRoom = (room) => {
  const search = searchQuery.value.toLowerCase();

  let roomSchedules = schedules.value.filter((s) => s.room === room);

  if (selectedDay.value !== "All") {
    roomSchedules = roomSchedules.filter((s) => s.day === selectedDay.value);
  }
  if (search) {
    roomSchedules = roomSchedules.filter((s) => {
      const subj = (s.subject || "").toLowerCase();
      return subj.includes(search) || room.toLowerCase().includes(search);
    });
  }

  const grouped = {};
  daysOrder.forEach((day) => {
    const daySchedules = roomSchedules.filter((s) => s.day === day);
    if (daySchedules.length > 0) {
      daySchedules.sort((a, b) => {
        const timeA = a.time ? a.time.split("-")[0].trim() : "00:00";
        const timeB = b.time ? b.time.split("-")[0].trim() : "00:00";
        return timeA.localeCompare(timeB);
      });
      grouped[day] = daySchedules;
    }
  });

  return grouped;
};

// Compute Dynamic Status per item
const getDynamicStatusText = (item) => {
  if (item.status === "Cancelled") return "Cancelled";
  if (item.status !== "Active") return item.status;

  const currentDayStr = daysOrder[today.getDay()];

  if (item.day !== currentDayStr) {
    return "Active";
  }

  if (!item.time || !item.time.includes("-")) return "Scheduled";

  const [startStr, endStr] = item.time.split("-").map((s) => s.trim());
  const currentMinutes = today.getHours() * 60 + today.getMinutes();

  const [sH, sM] = startStr.split(":").map(Number);
  const startMinutes = (sH || 0) * 60 + (sM || 0);

  const [eH, eM] = endStr.split(":").map(Number);
  const endMinutes = (eH || 0) * 60 + (eM || 0);

  if (currentMinutes < startMinutes) return "รอใช้งาน";
  if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) return "กำลังเรียน";
  return "เสร็จสิ้น";
};

const getDynamicStatusClass = (statusStr) => {
  if (statusStr === "Cancelled") return "cancelled";
  if (statusStr === "กำลังเรียน") return "active";
  if (statusStr === "เสร็จสิ้น") return "completed";
  return "pending";
};

// --- 5. Actions (Add/Edit Modal) ---
const openAddModal = () => {
  isEditMode.value = false;
  form.value = {
    day: selectedDay.value === "All" ? "Monday" : selectedDay.value,
    startTime: "09:00",
    endTime: "12:00",
    room: selectedRoom.value === "All" ? "" : selectedRoom.value,
    subject: "",
    status: "Active",
  };
  showModal.value = true;
};

const openEditModal = (item) => {
  isEditMode.value = true;
  editId.value = item.id;
  const timeStr = item.time ? item.time : "09:00 - 12:00";
  const parts = timeStr.split("-");
  const start = parts[0] ? parts[0].trim() : "09:00";
  const end = parts[1] ? parts[1].trim() : "12:00";

  form.value = {
    day: item.day,
    startTime: start,
    endTime: end,
    room: item.room,
    subject: item.subject,
    status: item.status,
  };
  showModal.value = true;
};

// --- 6. Save Data ---
const handleSave = async () => {
  const timeString = `${form.value.startTime} - ${form.value.endTime}`;
  const payload = {
    time: timeString,
    day: form.value.day,
    room: form.value.room,
    subject: form.value.subject,
    status: form.value.status,
  };

  try {
    if (isEditMode.value) {
      await update(dbRef(db, `schedules/${editId.value}`), payload);
    } else {
      await push(sRef, payload);
    }
    showModal.value = false;
  } catch (error) {
    alert("Error: " + error.message);
  }
};

// --- 7. Delete Logic (Modal) ---
const openDeleteModal = (id) => {
  deleteId.value = id;
  isDeleteModalOpen.value = true;
};

const confirmDelete = async () => {
  if (deleteId.value) {
    try {
      await remove(dbRef(db, `schedules/${deleteId.value}`));
      isDeleteModalOpen.value = false;
      deleteId.value = null;
    } catch (error) {
      alert("Error deleting: " + error.message);
    }
  }
};
</script>

<template>
  <div class="schedule-page">
    <div class="header-section">
      <div>
        <h1 class="text-2xl font-bold">ตารางเรียน</h1>
        <p class="text-gray-500">จัดการตารางเรียน (ผู้ดูแลระบบ)</p>
      </div>

      <div style="display: flex; gap: 10px">
        <button
          class="btn-add btn-secondary"
          @click="showRoomListModal = true"
          style="background: #475569"
        >
          จัดการห้อง
        </button>
        <button class="btn-add" @click="openAddModal">+ เพิ่มตารางเรียน</button>
      </div>
    </div>

    <!-- View Controls -->
    <div class="control-bar">
      <!-- Day Selection Group -->
      <div class="control-group">
        <label class="group-label">วัน (Day)</label>
        <div class="toggle-group day-pills">
          <button
            v-for="day in [
              'All',
              'Sunday',
              'Monday',
              'Tuesday',
              'Wednesday',
              'Thursday',
              'Friday',
              'Saturday',
            ]"
            :key="day"
            class="toggle-btn"
            :class="{ active: selectedDay === day }"
            @click="selectedDay = day"
          >
            {{ day === "All" ? "ทุกวัน" : dayNamesTH[day] }}
          </button>
        </div>
      </div>

      <!-- Floor & Room Selection Group -->
      <div class="control-group" style="display: flex; gap: 15px">
        <div>
          <label class="group-label">ชั้น (Floor)</label>
          <div class="select-wrapper room-filter-wrapper">
            <select
              v-model="selectedFloor"
              class="premium-control-input room-select"
              @change="selectedRoom = 'All'"
            >
              <option v-for="floor in availableFloors" :key="floor" :value="floor">
                {{ floor === "All" ? "ทุกชั้น" : `ชั้น ${floor}` }}
              </option>
            </select>
          </div>
        </div>

        <div>
          <label class="group-label">ห้อง (Room)</label>
          <div class="select-wrapper room-filter-wrapper">
            <select v-model="selectedRoom" class="premium-control-input room-select">
              <option v-for="room in availableRooms" :key="room" :value="room">
                {{ room === "All" ? "ทุกห้อง" : room }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- Search Group -->
      <div class="control-group">
        <label class="group-label">ค้นหา</label>
        <div class="search-wrapper">
          <span class="search-icon">🔍</span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="ค้นหาวิชา..."
            class="premium-control-input"
          />
        </div>
      </div>
    </div>

    <!-- Grouped Layout Wrapper -->
    <div class="grouped-layout-wrapper">
      <div v-if="isLoading" class="text-center py-8 text-blue-600 font-bold text-lg">
        ⏳ กำลังโหลด...
      </div>
      <div v-else-if="errorMessage" class="text-center py-8 text-red-600 font-bold">
        ⚠️ {{ errorMessage }}
      </div>
      <div v-else-if="displayRooms.length === 0" class="empty-state">
        <div class="empty-icon">📂</div>
        <h3>ไม่พบตารางเรียน</h3>
        <p>ลองปรับตัวกรองหรือค้นหาด้วยคำอื่น</p>
      </div>

      <div v-else class="room-blocks-container">
        <!-- Room Block -->
        <div class="room-block" v-for="room in displayRooms" :key="room">
          <div class="room-header">
            <div class="room-title-wrapper">
              <span class="room-icon">🚪</span>
              <h2>ห้อง {{ room }}</h2>
            </div>
            <div class="room-meta">ชั้น {{ getFloorFromRoom(room) }}</div>
          </div>

          <div class="room-content">
            <!-- Iterating over days that have schedules for this room -->
            <template v-for="(daySchedules, day) in getGroupedSchedulesForRoom(room)" :key="day">
              <div class="day-section">
                <div class="day-header" :style="{ borderLeftColor: dayColors[day] }">
                  <h4 :style="{ color: dayColors[day] }">วัน{{ dayNamesTH[day] }}</h4>
                  <span class="day-en">{{ day }}</span>
                </div>

                <div class="schedule-list">
                  <!-- Schedule Items -->
                  <div
                    class="schedule-item-card"
                    v-for="item in daySchedules"
                    :key="item.id"
                    @click="openEditModal(item)"
                  >
                    <button class="card-delete-btn" @click.stop="openDeleteModal(item.id)">
                      ×
                    </button>

                    <div class="schedule-time">
                      <span class="time-icon">⏰</span>
                      {{ item.time }}
                    </div>
                    <div class="schedule-details">
                      <h5 class="subject-title">{{ item.subject }}</h5>
                    </div>
                    <div class="schedule-status-wrapper">
                      <span
                        class="status-badge"
                        :class="getDynamicStatusClass(getDynamicStatusText(item))"
                        v-if="getDynamicStatusText(item) !== 'Active'"
                      >
                        {{ getDynamicStatusText(item) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit/Add Modal -->
    <Transition name="fade">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-content premium-modal">
          <div class="modal-header">
            <div class="header-title">
              <span class="icon-bg">📅</span>
              <div>
                <h3>{{ isEditMode ? "แก้ไขตารางเรียน" : "เพิ่มตารางเรียน" }}</h3>
                <p class="subtitle">จัดการเวลาเรียนและอุปกรณ์ในห้องเรียน</p>
              </div>
            </div>
            <button class="close-btn" @click="showModal = false">
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
            <form @submit.prevent="handleSave">
              <div class="form-section">
                <label class="section-label">รายละเอียดวิชา</label>
                <div class="input-wrapper">
                  <span class="input-icon">📚</span>
                  <input
                    v-model="form.subject"
                    type="text"
                    required
                    class="premium-input"
                    placeholder="เช่น การเขียนโปรแกรมคอมพิวเตอร์"
                  />
                </div>
              </div>

              <div class="row-2-col">
                <div class="form-group">
                  <label class="section-label">ห้อง</label>
                  <div class="input-wrapper">
                    <span class="input-icon">📍</span>
                    <input
                      v-model="form.room"
                      type="text"
                      required
                      class="premium-input"
                      placeholder="เช่น 16101"
                    />
                  </div>
                </div>
                <div class="form-group">
                  <label class="section-label">วัน</label>
                  <div class="select-wrapper">
                    <select v-model="form.day" class="premium-input">
                      <option value="Monday">วันจันทร์</option>
                      <option value="Tuesday">วันอังคาร</option>
                      <option value="Wednesday">วันพุธ</option>
                      <option value="Thursday">วันพฤหัสบดี</option>
                      <option value="Friday">วันศุกร์</option>
                      <option value="Saturday">วันเสาร์</option>
                      <option value="Sunday">วันอาทิตย์</option>
                    </select>
                  </div>
                </div>
              </div>

              <div class="form-section mt-4">
                <label class="section-label">ช่วงเวลา</label>
                <div class="row-2-col">
                  <div class="time-input-group">
                    <span class="time-label">เวลาเริ่ม</span>
                    <input
                      v-model="form.startTime"
                      type="time"
                      required
                      class="premium-input time-field"
                    />
                  </div>
                  <div class="time-input-group">
                    <span class="time-label">เวลาสิ้นสุด</span>
                    <input
                      v-model="form.endTime"
                      type="time"
                      required
                      class="premium-input time-field"
                    />
                  </div>
                </div>
              </div>

              <div class="form-section mt-4">
                <label class="section-label">สถานะ</label>
                <div class="status-options">
                  <label class="radio-card" :class="{ active: form.status === 'Active' }">
                    <input type="radio" v-model="form.status" value="Active" />
                    <span class="radio-icon">✓</span>
                    <span>เปิดใช้งาน</span>
                  </label>
                  <label class="radio-card" :class="{ active: form.status === 'Cancelled' }">
                    <input type="radio" v-model="form.status" value="Cancelled" />
                    <span class="radio-icon">✕</span>
                    <span>ยกเลิกคลาส</span>
                  </label>
                </div>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn-ghost" @click="showModal = false">ยกเลิก</button>
                <button type="submit" class="btn-primary-save">บันทึกตารางเรียน</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Delete Confirmation Modal -->
    <div v-if="isDeleteModalOpen" class="modal-overlay">
      <div class="modal-content delete-modal">
        <div class="modal-header">
          <h3 class="text-danger">⚠️ ยืนยันการลบ</h3>
          <button class="close-btn" @click="isDeleteModalOpen = false">×</button>
        </div>
        <div class="modal-body text-center">
          <p class="font-bold text-lg mb-2">ยืนยันการลบตารางเรียนนี้?</p>
          <p class="text-gray-500 text-sm">การกระทำนี้ไม่สามารถเรียกคืนได้</p>
        </div>
        <div class="modal-actions justify-center">
          <button class="btn-cancel" @click="isDeleteModalOpen = false">ยกเลิก</button>
          <button class="btn-delete-confirm" @click="confirmDelete">ยืนยันการลบ</button>
        </div>
      </div>
    </div>

    <RoomManagerModal v-model:showAdd="showAddRoomModal" v-model:showList="showRoomListModal" />
  </div>
</template>

<style scoped>
/* --- Components Overrides --- */
.schedule-page {
  padding: 20px;
  background-color: #f8f9fa;
  min-height: 100vh;
  font-family: "Inter", "Prompt", sans-serif;
}
.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.control-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 16px 20px;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  border: 1px solid #f1f5f9;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 20px;
}
.control-group {
  display: flex;
  align-items: center;
  gap: 12px;
}
.group-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.05em;
}
.toggle-group {
  display: flex;
  align-items: center;
  background: #f1f5f9;
  padding: 6px;
  border-radius: 12px;
  gap: 4px;
}
.toggle-btn {
  background: transparent;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.toggle-btn.active {
  background: white;
  color: #3b82f6;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}
.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 260px;
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
  color: #1e293b;
  font-weight: 500;
  transition: all 0.2s;
}
.premium-control-input:focus {
  background: white;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  outline: none;
}

/* --- Grouped Layout Styles (Room -> Day) --- */
.grouped-layout-wrapper {
  max-width: 1200px;
  margin: 0 auto;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: white;
  border-radius: 20px;
  border: 1px dashed #cbd5e1;
}
.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}
.empty-state h3 {
  font-size: 1.25rem;
  color: #475569;
  margin-bottom: 8px;
}
.empty-state p {
  color: #94a3b8;
}

.room-blocks-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.room-block {
  background: white;
  border-radius: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  border: 1px solid #f1f5f9;
  overflow: hidden;
  transition: box-shadow 0.3s ease;
}
.room-block:hover {
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.06);
}

.room-header {
  background: #f8fafc;
  padding: 16px 24px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.room-title-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}
.room-icon {
  font-size: 1.5rem;
}
.room-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: #1e293b;
}
.room-meta {
  font-size: 0.85rem;
  font-weight: 600;
  color: #64748b;
  background: #e2e8f0;
  padding: 4px 10px;
  border-radius: 20px;
}

.room-content {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.day-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.day-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 12px;
  border-left: 4px solid #cbd5e1;
}
.day-header h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #334155;
}
.day-en {
  font-size: 0.75rem;
  color: #94a3b8;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.05em;
}

.schedule-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  padding-left: 16px;
}

.schedule-item-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
  transition: all 0.2s ease;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}
.schedule-item-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.06);
  border-color: #cbd5e1;
}

.schedule-time {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 90px;
  font-size: 0.85rem;
  font-weight: 700;
  color: #475569;
  background: #f8fafc;
  padding: 8px 12px;
  border-radius: 8px;
  white-space: nowrap;
}
.time-icon {
  margin-bottom: 4px;
  font-size: 1.1rem;
}

.schedule-details {
  flex: 1;
  min-width: 0;
}
.subject-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.schedule-status-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
}
.status-badge.active {
  background: #dcfce7;
  color: #166534;
} /* กำลังเรียน - Green */
.status-badge.pending {
  background: #fef3c7;
  color: #92400e;
} /* รอใช้งาน - Yellow */
.status-badge.completed {
  background: #f1f5f9;
  color: #64748b;
} /* เสร็จสิ้น - Gray */
.status-badge.cancelled {
  background: #fee2e2;
  color: #b91c1c;
} /* ยกเลิก - Red */

.card-delete-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 24px;
  height: 24px;
  background: white;
  color: #ef4444;
  border: 1px solid #fee2e2;
  border-radius: 50%;
  font-size: 14px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(239, 68, 68, 0.2);
}
.schedule-item-card:hover .card-delete-btn {
  opacity: 1;
}
.card-delete-btn:hover {
  background: #ef4444;
  color: white;
  transform: scale(1.1);
}

/* Modals & Buttons (Kept consistent with your style) */
.btn-add {
  background: #0f172a;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}
.btn-add:hover {
  background: #1e293b;
  transform: translateY(-1px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  backdrop-filter: blur(4px);
}
.premium-modal {
  background: white;
  width: 95%;
  max-width: 500px;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}
.modal-header {
  padding: 20px;
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
}
.modal-body {
  padding: 20px;
  max-height: 80vh;
  overflow-y: auto;
}
.form-section {
  margin-bottom: 20px;
}
.row-2-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}
.input-wrapper {
  position: relative;
  margin-top: 8px;
}
.input-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1.2rem;
  pointer-events: none;
}
.premium-input {
  width: 100%;
  padding: 12px 12px 12px 42px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 0.95rem;
  font-family: inherit;
  box-sizing: border-box;
  background: #fff;
  transition: border-color 0.2s;
}
.premium-input:focus {
  border-color: #3b82f6;
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}
select.premium-input,
input[type="time"].premium-input {
  padding-left: 12px;
  margin-top: 8px;
}
.section-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  display: block;
  letter-spacing: 0.05em;
}
.time-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  display: block;
  letter-spacing: 0.05em;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid #f1f5f9;
  padding-top: 20px;
  margin-top: 20px;
}
.btn-ghost {
  padding: 10px 20px;
  background: none;
  border: none;
  cursor: pointer;
  color: #64748b;
  font-weight: 600;
}
.btn-primary-save {
  padding: 10px 24px;
  background: #0f172a;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}
.status-options {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
.radio-card {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}
.radio-card.active {
  border-color: #3b82f6;
  background: #eff6ff;
  color: #1e40af;
}
.radio-card input {
  display: none;
}
.icon-bg {
  font-size: 24px;
  background: #f1f5f9;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  margin-right: 16px;
}
.header-title {
  display: flex;
  align-items: center;
}
.header-title h3 {
  margin: 0;
  font-size: 1.25rem;
}

/* Delete Modal Styles */
.delete-modal {
  max-width: 400px;
  border-radius: 20px;
}
.text-danger {
  color: #dc3545;
  font-weight: 700;
}
.btn-cancel {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  background: #f1f5f9;
  color: #64748b;
  margin-right: 10px;
}
.btn-delete-confirm {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  background: #dc3545;
  color: white;
}
.justify-center {
  justify-content: center;
  display: flex;
  gap: 12px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #94a3b8;
}
.close-btn:hover {
  color: #ef4444;
}
.time-input-group {
  display: flex;
  flex-direction: column;
}
</style>
