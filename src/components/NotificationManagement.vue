<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";

// ❌ ลบ Mock Data
// import { mockNotifications as initialNotis, mockAlertSettings } from '../data/mockData.js'

// ✅ นำเข้า Firebase
import { db } from "../firebase";
import { ref as dbRef, onValue, update, remove, set, off } from "firebase/database";

// --- State ---
const notifications = ref([]); // เริ่มต้นเป็นอาเรย์ว่าง
const alertSettings = ref({
  batteryThreshold: 20, // ค่า Default ก่อนโหลดจาก DB
  enableEmailNoti: false,
  enableLineNoti: false,
});
const showSuccessModal = ref(false);
const activeTab = ref("history");

// --- Firebase References ---
const notiRef = dbRef(db, "notifications");
const settingsRef = dbRef(db, "alert_settings");

// --- Real-time Logic ---
onMounted(() => {
  // 1. ดึงรายการแจ้งเตือน (Notifications)
  onValue(notiRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      // แปลง Object เป็น Array + ใส่ ID
      const loadedNotis = Object.keys(data).map((key) => ({
        id: key,
        ...data[key],
      }));
      // เรียงลำดับเอาอันใหม่สุดขึ้นบน (Sort by Timestamp Descending)
      notifications.value = loadedNotis.sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
      );
    } else {
      notifications.value = [];
    }
  });

  // 2. ดึงค่าการตั้งค่า (Settings)
  onValue(settingsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      alertSettings.value = data;
    }
  });
});

onUnmounted(() => {
  off(notiRef);
  off(settingsRef);
});

// --- Computed ---
const unreadCount = computed(() => {
  return notifications.value.filter((n) => !n.isRead).length;
});

// --- Helper Functions ---
const formatDate = (ts) => {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const getTypeColor = (type) => {
  switch (type) {
    case "warning":
      return "text-yellow-500 bg-yellow-100";
    case "alert":
      return "text-red-500 bg-red-100";
    case "info":
      return "text-blue-500 bg-blue-100";
    default:
      return "text-gray-500 bg-gray-100";
  }
};

// --- Actions (Write to Firebase) ---

// 1. อ่านแล้ว (Update)
const markAsRead = async (id) => {
  try {
    const target = notifications.value.find((n) => n.id === id);
    if (target && !target.isRead) {
      // อัปเดตเฉพาะ field isRead ใน Firebase
      await update(dbRef(db, `notifications/${id}`), { isRead: true });
    }
  } catch (error) {
    console.error("Error marking read:", error);
  }
};

// 2. ล้างประวัติทั้งหมด (Delete)
const clearAll = async () => {
  if (confirm("ยืนยันการลบประวัติการแจ้งเตือนทั้งหมด?")) {
    try {
      await remove(notiRef); // ลบทั้ง Node notifications
    } catch (error) {
      alert("ลบไม่สำเร็จ: " + error.message);
    }
  }
};

// 3. บันทึกการตั้งค่า (Set/Overwrite)
const saveSettings = async () => {
  try {
    // บันทึกลง Firebase
    await set(settingsRef, alertSettings.value);

    // แสดง Popup
    showSuccessModal.value = true;
    setTimeout(() => {
      showSuccessModal.value = false;
    }, 2000);
  } catch (error) {
    alert("บันทึกการตั้งค่าไม่สำเร็จ: " + error.message);
  }
};
</script>

<template>
  <div class="page-container">
    <div class="header-row">
      <div>
        <h1 class="text-2xl font-bold text-gray-800">Notification Management</h1>
        <p class="text-sm text-gray-500">จัดการการแจ้งเตือนและตั้งค่าความปลอดภัย</p>
      </div>

      <div class="tabs">
        <button
          @click="activeTab = 'history'"
          :class="['tab-btn', activeTab === 'history' ? 'active' : '']"
        >
          📜 ประวัติ
          <span v-if="unreadCount > 0" class="badge-count">{{ unreadCount }}</span>
        </button>
        <button
          @click="activeTab = 'settings'"
          :class="['tab-btn', activeTab === 'settings' ? 'active' : '']"
        >
          ⚙️ ตั้งค่า
        </button>
      </div>
    </div>

    <div v-if="activeTab === 'history'" class="content-card">
      <div class="section-header">
        <h3 class="font-bold text-lg">รายการแจ้งเตือนล่าสุด</h3>
        <button v-if="notifications.length > 0" @click="clearAll" class="btn-clear-soft">
          🗑️ ล้างประวัติทั้งหมด
        </button>
      </div>

      <div v-if="notifications.length === 0" class="empty-state">
        <p>ไม่มีการแจ้งเตือนในขณะนี้</p>
      </div>

      <div v-else class="noti-list">
        <div
          v-for="item in notifications"
          :key="item.id"
          class="noti-item"
          :class="{ unread: !item.isRead }"
          @click="markAsRead(item.id)"
        >
          <div class="noti-icon" :class="getTypeColor(item.type)">
            <span v-if="item.type === 'warning'">⚠️</span>
            <span v-else-if="item.type === 'alert'">🚨</span>
            <span v-else>ℹ️</span>
          </div>
          <div class="noti-content">
            <div class="flex justify-between">
              <span class="font-bold text-gray-800">{{ item.title }}</span>
              <span class="text-xs text-gray-400">{{ formatDate(item.timestamp) }}</span>
            </div>
            <p class="text-sm text-gray-600 mt-1">{{ item.message }}</p>
          </div>
          <div v-if="!item.isRead" class="status-dot"></div>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'settings'" class="content-card">
      <h3 class="font-bold text-lg mb-6">ตั้งค่าเงื่อนไขการแจ้งเตือน (Alert Rules)</h3>

      <div class="setting-group">
        <label class="setting-label">
          🔋 Battery Threshold (%)
          <small>แจ้งเตือนเมื่อแบตเตอรี่ต่ำกว่าค่าที่กำหนด</small>
        </label>
        <div class="input-with-unit">
          <input type="number" v-model="alertSettings.batteryThreshold" min="0" max="100" />
          <span>%</span>
        </div>
      </div>

      <hr class="my-6 border-gray-200" />

      <h4 class="font-bold text-md mb-4">ช่องทางการแจ้งเตือน</h4>
      <div class="flex gap-6">
        <label class="checkbox-label">
          <input type="checkbox" v-model="alertSettings.enableEmailNoti" />
          Email Notification
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="alertSettings.enableLineNoti" />
          LINE Notify (Optional)
        </label>
      </div>

      <div class="mt-8 flex justify-end">
        <button class="btn-save" @click="saveSettings">บันทึกการตั้งค่า</button>
      </div>
    </div>

    <Transition name="fade">
      <div v-if="showSuccessModal" class="success-popup">
        <div class="popup-icon">✓</div>
        <span>บันทึกการตั้งค่าเรียบร้อยแล้ว!</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.page-container {
  padding: 30px;
  background-color: #f3f4f6;
  min-height: 100vh;
  font-family: "Inter", sans-serif;
  position: relative;
}

/* Header & Tabs */
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 25px;
}
.tabs {
  display: flex;
  background: white;
  padding: 5px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}
.tab-btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  color: #6b7280;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 5px;
}
.tab-btn.active {
  background-color: #eff6ff;
  color: #3b82f6;
}
.badge-count {
  background: #ef4444;
  color: white;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 10px;
}

/* Content Card */
.content-card {
  background: white;
  border-radius: 12px;
  padding: 25px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.02);
  border: 1px solid #e5e7eb;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

/* Button Styles */
.btn-clear-soft {
  background-color: #fee2e2;
  color: #dc2626;
  border: 1px solid #fecaca;
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-clear-soft:hover {
  background-color: #ef4444;
  color: white;
  border-color: #ef4444;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(239, 68, 68, 0.2);
}

.btn-save {
  background-color: #3b82f6;
  color: white;
  border: none;
  padding: 10px 24px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-save:hover {
  background-color: #2563eb;
}

/* Notification List */
.noti-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.noti-item {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #f3f4f6;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
}
.noti-item:hover {
  background-color: #f9fafb;
}
.noti-item.unread {
  background-color: #f0f9ff;
  border-color: #bae6fd;
}
.noti-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  flex-shrink: 0;
}
.noti-content {
  flex: 1;
}
.status-dot {
  width: 8px;
  height: 8px;
  background-color: #3b82f6;
  border-radius: 50%;
  position: absolute;
  top: 20px;
  right: 15px;
}

/* Settings Form */
.setting-group {
  margin-bottom: 20px;
}
.setting-label {
  display: flex;
  flex-direction: column;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}
.setting-label small {
  color: #9ca3af;
  font-weight: 400;
  margin-top: 2px;
}
.input-with-unit {
  display: flex;
  align-items: center;
  gap: 10px;
}
.input-with-unit input {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  width: 100px;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 500;
  color: #4b5563;
  margin-bottom: 8px;
}
.empty-state {
  text-align: center;
  padding: 40px;
  color: #9ca3af;
}

/* Popup Styles */
.success-popup {
  position: fixed;
  bottom: 30px;
  right: 30px;
  background-color: #10b981;
  color: white;
  padding: 15px 25px;
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  z-index: 1000;
  animation: slideUp 0.3s ease-out;
}
.popup-icon {
  background: white;
  color: #10b981;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
}

/* Animations */
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
  transition: opacity 0.5s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
