<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";

// ✅ แก้ไข: ดึง rtdb มาใช้แทน db (Firestore)
// ใส่ 'as db' เพื่อให้โค้ดข้างล่างที่ใช้ตัวแปร db ทำงานได้ต่อเลย ไม่ต้องไล่แก้
import { rtdb as db } from "../firebase";

import { ref as dbRef, onValue, set, remove, update, off, push } from "firebase/database";

const route = useRoute();

// --- 1. Check Admin Role ---
const isManager = computed(() => {
  return route.path.includes("/admin");
});

// --- 2. State & Data ---
const schedules = ref([]);
const searchQuery = ref("");
const selectedDay = ref("All");

// --- 3. Modal State ---
const showModal = ref(false); // Add/Edit Modal
const isEditMode = ref(false);
const editId = ref(null);

// ✅ Delete Modal State
const isDeleteModalOpen = ref(false);
const deleteId = ref(null);

// Form Data
const form = ref({
  day: "Monday",
  startTime: "09:00",
  endTime: "12:00",
  room: "",
  subject: "",
  status: "Active",
});

// --- Firebase Real-time Connection ---
// บรรทัดนี้จะทำงานได้ปกติ เพราะ db ตอนนี้คือ rtdb
const sRef = dbRef(db, "schedules");

onMounted(() => {
  onValue(sRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const loadedSchedules = Object.keys(data).map((key) => ({
        id: key,
        ...data[key],
      }));
      schedules.value = loadedSchedules;
    } else {
      schedules.value = [];
    }
  });
});

onUnmounted(() => {
  off(sRef);
});

// --- 4. Filter Logic ---
const filteredSchedules = computed(() => {
  return schedules.value.filter((item) => {
    // ใส่เกราะป้องกัน Error
    const room = (item.room || "").toLowerCase();
    const subject = (item.subject || "").toLowerCase();
    const search = searchQuery.value.toLowerCase();

    const matchSearch = room.includes(search) || subject.includes(search);
    const matchDay = selectedDay.value === "All" || item.day === selectedDay.value;
    return matchSearch && matchDay;
  });
});

// --- 5. Actions (Add/Edit Modal) ---
const openAddModal = () => {
  isEditMode.value = false;
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
  const [start, end] = item.time ? item.time.split(" - ") : ["09:00", "12:00"];

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

// --- ✅ 7. Delete Logic (Modal) ---
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
        <h1 class="text-2xl font-bold">Classroom Schedule</h1>
        <p class="text-gray-500">จัดการตารางเรียน (Admin Mode)</p>
      </div>
      <button class="btn-add" @click="openAddModal">+ Add Schedule</button>
    </div>

    <div class="controls-bar">
      <div class="filter-group">
        <select v-model="selectedDay" class="control-input">
          <option value="All">All Days</option>
          <option value="Monday">Monday</option>
          <option value="Tuesday">Tuesday</option>
          <option value="Wednesday">Wednesday</option>
          <option value="Thursday">Thursday</option>
          <option value="Friday">Friday</option>
        </select>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search Room or Subject..."
          class="control-input search"
        />
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
            <th class="text-center" width="100">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredSchedules" :key="item.id">
            <td>
              <span class="day-badge" :class="item.day ? item.day.toLowerCase() : ''">{{
                item.day
              }}</span>
            </td>
            <td class="font-mono">{{ item.time }}</td>
            <td class="font-bold text-blue-600">{{ item.room }}</td>
            <td>{{ item.subject }}</td>
            <td>
              <span class="status-badge" :class="item.status === 'Active' ? 'active' : 'cancelled'">
                {{ item.status }}
              </span>
            </td>

            <td class="text-center action-col">
              <button class="icon-btn" @click="openEditModal(item)" title="Edit">
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
              <button class="icon-btn" @click="openDeleteModal(item.id)" title="Delete">
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
          <tr v-if="filteredSchedules.length === 0">
            <td colspan="6" class="text-center py-4 text-gray-500">No schedules found.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showModal" class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ isEditMode ? "Edit Schedule" : "Add New Schedule" }}</h3>
          <button class="close-btn" @click="showModal = false">×</button>
        </div>

        <form @submit.prevent="handleSave">
          <div class="form-group">
            <label>Subject Name</label>
            <input
              v-model="form.subject"
              type="text"
              required
              placeholder="e.g. Computer Programming"
            />
          </div>

          <div class="form-row">
            <div class="form-group half">
              <label>Room</label>
              <input v-model="form.room" type="text" required placeholder="e.g. Room 16101" />
            </div>
            <div class="form-group half">
              <label>Day</label>
              <select v-model="form.day">
                <option>Monday</option>
                <option>Tuesday</option>
                <option>Wednesday</option>
                <option>Thursday</option>
                <option>Friday</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group half">
              <label>Start Time</label>
              <input v-model="form.startTime" type="time" required />
            </div>
            <div class="form-group half">
              <label>End Time</label>
              <input v-model="form.endTime" type="time" required />
            </div>
          </div>

          <div class="form-group">
            <label>Status</label>
            <select v-model="form.status">
              <option value="Active">Active</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="showModal = false">Cancel</button>
            <button type="submit" class="btn-save">Save</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="isDeleteModalOpen" class="modal-overlay">
      <div class="modal-content delete-modal">
        <div class="modal-header">
          <h3 class="text-danger">⚠️ Confirm Deletion</h3>
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
  </div>
</template>

<style scoped>
/* CSS เดิม */
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
.icon-btn {
  border: 1px solid #000;
  background: white;
  color: #000;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  margin: 0 4px;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.icon-btn:hover {
  background-color: #000;
  color: #fff;
  transform: translateY(-2px);
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
  z-index: 1000;
  backdrop-filter: blur(2px);
}
.modal-content {
  background: white;
  width: 100%;
  max-width: 500px;
  border-radius: 12px;
  padding: 25px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  animation: slideDown 0.3s ease-out;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.modal-header h3 {
  margin: 0;
  font-size: 1.5rem;
  color: #333;
}
.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #aaa;
}
.close-btn:hover {
  color: #000;
}
.form-group {
  margin-bottom: 15px;
}
.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 600;
  font-size: 0.9rem;
  color: #555;
}
.form-group input,
.form-group select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 1rem;
  box-sizing: border-box;
}
.form-row {
  display: flex;
  gap: 15px;
}
.half {
  flex: 1;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 25px;
}
.btn-cancel {
  background: #e9ecef;
  color: #333;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
}
.btn-save {
  background: #007bff;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
}
.btn-save:hover {
  background: #0056b3;
}

/* ✅ Style สำหรับ Delete Modal */
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
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
}
.btn-delete-confirm:hover {
  background: #bb2d3b;
}
.justify-center {
  justify-content: center !important;
}

@keyframes slideDown {
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
