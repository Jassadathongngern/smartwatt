<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";

// ❌ ลบ Mock Data ออก
// import { scheduleDataMock } from '../data/mockData.js'

// ✅ แก้ไข: ดึง rtdb มาใช้แทน db (Firestore)
// ใส่ 'as db' เพื่อให้โค้ดข้างล่างทำงานต่อได้เลย ไม่ต้องแก้เยอะ
import { rtdb as db } from "../firebase";

import { ref as dbRef, onValue, remove, update, off, push } from "firebase/database";

const route = useRoute();

// --- 1. Check Admin Role (จาก Path) ---
const isManager = computed(() => {
  return route.path.includes("/admin");
});

// --- 2. State & Data ---
const schedules = ref([]); // เริ่มต้นเป็นอาเรย์ว่าง
const searchQuery = ref("");
const selectedDay = ref("All");

// --- 3. Modal State ---
const showModal = ref(false);
const isEditMode = ref(false);
const editId = ref(null);

// Form Data
const form = ref({
  day: "Monday",
  startTime: "09:00",
  endTime: "12:00",
  room: "",
  subject: "",
  status: "Active",
});

// --- ✅ Firebase Real-time Connection ---
// บรรทัดนี้จะทำงานได้ปกติ เพราะ db ตอนนี้คือ rtdb
const sRef = dbRef(db, "schedules");
const isLoading = ref(true); // สถานะการโหลด
const errorMessage = ref(""); // ข้อความ Error (ถ้ามี)

onMounted(() => {
  onValue(
    sRef,
    (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // แปลง Object เป็น Array เพื่อแสดงผลในตาราง
        const loadedSchedules = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        schedules.value = loadedSchedules;
      } else {
        schedules.value = [];
      }
      isLoading.value = false;
      errorMessage.value = ""; // Clear error if success
    },
    (error) => {
      console.error("Firebase Read Error:", error);
      errorMessage.value = "ไม่สามารถดึงข้อมูลได้: " + error.message;
      isLoading.value = false;
    },
  );
});

onUnmounted(() => {
  off(sRef);
});

// --- 4. Filter Logic ---
const filteredSchedules = computed(() => {
  return schedules.value.filter((item) => {
    const matchSearch =
      item.room.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.subject.toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchDay = selectedDay.value === "All" || item.day === selectedDay.value;
    return matchSearch && matchDay;
  });
});

// --- 5. Actions (เปิด Modal) ---
const openAddModal = () => {
  isEditMode.value = false;
  // Reset Form
  form.value = {
    day: "Monday",
    startTime: "09:00",
    endTime: "12:00",
    room: "",
    subject: "",
    status: "Active",
  };
  showModal.value = true;
};

const openEditModal = (item) => {
  isEditMode.value = true;
  editId.value = item.id;

  // แปลงเวลา "09:00 - 12:00" กลับมาใส่ฟอร์ม
  const [start, end] = item.time.split(" - ");
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

// --- 6. Save Data to Firebase ---
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
      // Update ข้อมูลเดิม
      await update(dbRef(db, `schedules/${editId.value}`), payload);
    } else {
      // เพิ่มข้อมูลใหม่ (Auto ID)
      await push(sRef, payload);
    }
    showModal.value = false;
  } catch (error) {
    alert("Error: " + error.message);
  }
};

const handleDelete = async (id) => {
  if (confirm("ยืนยันการลบตารางเรียนนี้?")) {
    try {
      await remove(dbRef(db, `schedules/${id}`));
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
        <h1 class="text-2xl font-bold">Classroom Schedule</h1>
        <p class="text-gray-500">
          {{ isManager ? "จัดการตารางเรียน" : "ตรวจสอบตารางเรียน" }}
        </p>
      </div>

      <button v-if="isManager" class="btn-add" @click="openAddModal">+ Add Schedule</button>
    </div>

    <div class="control-bar">
      <!-- Day Selection Group -->
      <div class="control-group">
        <label class="group-label">Day</label>
        <div class="toggle-group day-pills">
          <button
            v-for="day in ['All', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']"
            :key="day"
            class="toggle-btn"
            :class="{ active: selectedDay === day }"
            @click="selectedDay = day"
          >
            {{ day === "All" ? "All Days" : day.substring(0, 3) }}
          </button>
        </div>
      </div>

      <!-- Search Group -->
      <div class="control-group">
        <label class="group-label">Search</label>
        <div class="search-wrapper">
          <span class="search-icon">🔍</span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search Room or Subject..."
            class="premium-control-input"
          />
        </div>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th>Time</th>
            <th>Room</th>
            <th>Subject</th>
            <th>Status</th>
            <th v-if="isManager" class="text-center" width="100">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredSchedules" :key="item.id">
            <td>
              <span class="day-badge" :class="item.day.toLowerCase()">{{ item.day }}</span>
            </td>
            <td class="font-mono">{{ item.time }}</td>
            <td class="font-bold text-blue-600">{{ item.room }}</td>
            <td>{{ item.subject }}</td>
            <td>
              <span class="status-badge" :class="item.status === 'Active' ? 'active' : 'cancelled'">
                {{ item.status }}
              </span>
            </td>

            <td v-if="isManager" class="text-center action-col">
              <button class="btn-icon btn-edit" @click="openEditModal(item)" title="Edit">
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
              <button class="btn-icon btn-delete" @click="handleDelete(item.id)" title="Delete">
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
          <tr v-if="isLoading">
            <td colspan="6" class="text-center py-4 text-blue-600">⏳ กำลังโหลดข้อมูล...</td>
          </tr>
          <tr v-else-if="errorMessage">
            <td colspan="6" class="text-center py-4 text-red-600 font-bold">
              ⚠️ {{ errorMessage }}
            </td>
          </tr>
          <tr v-else-if="filteredSchedules.length === 0">
            <td colspan="6" class="text-center py-4 text-gray-500">ไม่พบรายการตารางเรียน</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Transition name="fade">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-content premium-modal">
          <div class="modal-header">
            <div class="header-title">
              <span class="icon-bg">📅</span>
              <div>
                <h3>{{ isEditMode ? "Edit Schedule" : "New Schedule" }}</h3>
                <p class="subtitle">Manage classroom & device timings</p>
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
              <!-- Subject -->
              <div class="form-section">
                <label class="section-label">Subject Details</label>
                <div class="input-wrapper">
                  <span class="input-icon">📚</span>
                  <input
                    v-model="form.subject"
                    type="text"
                    required
                    class="premium-input"
                    placeholder="e.g. Computer Programming"
                  />
                </div>
              </div>

              <!-- Room & Day -->
              <div class="row-2-col">
                <div class="form-group">
                  <label class="section-label">Room</label>
                  <div class="input-wrapper">
                    <span class="input-icon">📍</span>
                    <input
                      v-model="form.room"
                      type="text"
                      required
                      class="premium-input"
                      placeholder="Room 16101"
                    />
                  </div>
                </div>
                <div class="form-group">
                  <label class="section-label">Day</label>
                  <div class="select-wrapper">
                    <select v-model="form.day" class="premium-input">
                      <option>Monday</option>
                      <option>Tuesday</option>
                      <option>Wednesday</option>
                      <option>Thursday</option>
                      <option>Friday</option>
                      <option>Saturday</option>
                      <option>Sunday</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Time -->
              <div class="form-section mt-4">
                <label class="section-label">Time Interval</label>
                <div class="row-2-col">
                  <div class="time-input-group">
                    <span class="time-label">Start</span>
                    <input
                      v-model="form.startTime"
                      type="time"
                      required
                      class="premium-input time-field"
                    />
                  </div>
                  <div class="time-input-group">
                    <span class="time-label">End</span>
                    <input
                      v-model="form.endTime"
                      type="time"
                      required
                      class="premium-input time-field"
                    />
                  </div>
                </div>
              </div>

              <!-- Status -->
              <div class="form-section mt-4">
                <label class="section-label">Status</label>
                <div class="status-options">
                  <label class="radio-card" :class="{ active: form.status === 'Active' }">
                    <input type="radio" v-model="form.status" value="Active" />
                    <span class="radio-icon">✅</span>
                    <span>Active</span>
                  </label>
                  <label class="radio-card" :class="{ active: form.status === 'Cancelled' }">
                    <input type="radio" v-model="form.status" value="Cancelled" />
                    <span class="radio-icon">❌</span>
                    <span>Cancelled</span>
                  </label>
                </div>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn-ghost" @click="showModal = false">Cancel</button>
                <button type="submit" class="btn-primary-save">Save Schedule</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* CSS ของพี่สวยอยู่แล้วครับ ผมคงไว้เหมือนเดิมทั้งหมด */
/* --- Premium Control Bar --- */
.control-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 10px 20px;
  border-radius: 16px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
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
  padding: 4px;
  border-radius: 10px;
  gap: 4px;
}

.toggle-btn {
  background: transparent;
  border: none;
  padding: 6px 14px;
  border-radius: 7px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.toggle-btn:hover {
  color: #334155;
  background: rgba(255, 255, 255, 0.5);
}

.toggle-btn.active {
  background: white;
  color: #3b82f6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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

/* Original styles below */
.schedule-page {
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
.controls-bar {
  margin-bottom: 20px;
}
.filter-group {
  display: flex;
  gap: 10px;
}
.control-input {
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 6px;
}
.search {
  flex: 1;
  max-width: 300px;
}
.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th {
  background: #f1f3f5;
  text-align: left;
  padding: 12px;
  font-weight: 600;
  color: #495057;
  border-bottom: 2px solid #dee2e6;
}
td {
  padding: 12px;
  border-bottom: 1px solid #e9ecef;
  color: #333;
  vertical-align: middle;
}
.text-center {
  text-align: center;
}
.font-mono {
  font-family: monospace;
}
.text-blue-600 {
  color: #0d6efd;
  font-weight: bold;
}
.btn-add {
  background: #000;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
}
.btn-add:hover {
  background: #333;
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
.day-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: bold;
  color: white;
  background: #6c757d;
}
.day-badge.monday {
  background: #ffc107;
  color: #333;
}
.day-badge.tuesday {
  background: #e83e8c;
}
.day-badge.wednesday {
  background: #198754;
}
.day-badge.thursday {
  background: #fd7e14;
}
.day-badge.friday {
  background: #0d6efd;
}
.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: bold;
}
.status-badge.active {
  background: #d1e7dd;
  color: #0f5132;
}
.status-badge.cancelled {
  background: #f8d7da;
  color: #842029;
}
/* --- Modal Overlay & Base --- */
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
  backdrop-filter: blur(6px);
}

.modal-content {
  background: white;
  width: 90%;
  max-width: 500px;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  animation: slideUp 0.3s ease-out;
}

/* --- Premium Modal Styles --- */
.premium-modal {
  background: white;
  width: 95%;
  max-width: 520px;
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
  max-height: 80vh;
  overflow-y: auto;
}

.form-section {
  margin-bottom: 20px;
}

.section-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.input-wrapper,
.select-wrapper {
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
  padding: 12px 16px 12px 48px;
  font-size: 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  color: #1e293b;
  font-weight: 500;
  background: #fff;
}

select.premium-input {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 16px;
  padding-right: 40px;
}

.premium-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
  outline: none;
}

.row-2-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.time-input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.time-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: #64748b;
  margin-left: 4px;
}

.time-field {
  padding-left: 16px; /* No icon for time */
}

/* Status Radio Cards */
.status-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.radio-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 2px solid #e2e8f0;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s;
  background: #f8fafc;
}

.radio-card input {
  display: none;
}

.radio-card span {
  font-weight: 600;
  color: #64748b;
}

.radio-card:hover {
  background: #fff;
  border-color: #cbd5e1;
}

.radio-card.active {
  background: #fff;
  border-color: #3b82f6;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
}

.radio-card.active span {
  color: #1e293b;
}

.radio-icon {
  font-size: 1.2rem;
}

.modal-footer {
  padding: 24px;
  background: white;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid #f1f5f9;
  margin-top: 12px;
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

.mt-4 {
  margin-top: 1rem;
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Responsive Adjustments */
@media (max-width: 768px) {
  .header-section {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }

  .btn-add {
    width: 100%;
  }

  .filter-group {
    flex-direction: column;
    width: 100%;
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
    min-width: 600px;
  }

  .modal-content.premium-modal {
    width: 95%;
    max-width: 100%;
    border-radius: 20px;
  }

  .row-2-col {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .modal-footer {
    flex-direction: column-reverse;
  }

  .modal-footer button {
    width: 100%;
  }
}
</style>
