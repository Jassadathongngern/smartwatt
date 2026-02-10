<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";

// ✅ ใช้ rtdb ให้เหมือนกับหน้า DeviceManagement
import { rtdb as db } from "../firebase";
import { ref as dbRef, onValue, update, remove, set, off } from "firebase/database";

// --- State ---
const notifications = ref([]);
const alertSettings = ref({
  batteryThreshold: 20, // ค่า Default
  enableEmailNoti: false,
  enableLineNoti: false,
});
const showSuccessModal = ref(false);
const activeTab = ref("history");
const isSaving = ref(false); // เพิ่มสถานะกำลังบันทึก

// --- Firebase References ---
const notiRef = dbRef(db, "notifications");
const settingsRef = dbRef(db, "alert_settings");

// --- Real-time Logic ---
onMounted(() => {
  // 1. ดึงรายการแจ้งเตือน
  onValue(notiRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const loadedNotis = Object.keys(data).map((key) => ({
        id: key,
        ...data[key],
      }));
      // เรียงใหม่ล่าสุดขึ้นก่อน
      notifications.value = loadedNotis.sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
      );
    } else {
      notifications.value = [];
    }
  });

  // 2. ดึงค่าการตั้งค่า
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
      return "text-yellow-600 bg-yellow-100";
    case "alert":
      return "text-red-600 bg-red-100";
    case "info":
      return "text-blue-600 bg-blue-100";
    default:
      return "text-gray-600 bg-gray-100";
  }
};

const getTypeIcon = (type) => {
  switch (type) {
    case "warning":
      return "⚠️";
    case "alert":
      return "🚨";
    default:
      return "ℹ️";
  }
};

// --- Actions ---

const markAsRead = async (id) => {
  try {
    const target = notifications.value.find((n) => n.id === id);
    if (target && !target.isRead) {
      await update(dbRef(db, `notifications/${id}`), { isRead: true });
    }
  } catch (error) {
    console.error("Error marking read:", error);
  }
};

const clearAll = async () => {
  if (confirm("ยืนยันการลบประวัติการแจ้งเตือนทั้งหมด?")) {
    try {
      await remove(notiRef);
    } catch (error) {
      alert("ลบไม่สำเร็จ: " + error.message);
    }
  }
};

const saveSettings = async () => {
  isSaving.value = true;
  try {
    // แปลงเป็น Int ให้ชัวร์ก่อนส่ง
    alertSettings.value.batteryThreshold = parseInt(alertSettings.value.batteryThreshold);

    await set(settingsRef, alertSettings.value);

    showSuccessModal.value = true;
    setTimeout(() => {
      showSuccessModal.value = false;
    }, 2000);
  } catch (error) {
    alert("บันทึกการตั้งค่าไม่สำเร็จ: " + error.message);
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <div class="page-container">
    <div class="header-row">
      <div>
        <h1 class="text-2xl font-bold text-gray-800">Notification Center</h1>
        <p class="text-sm text-gray-500">ติดตามสถานะและแจ้งเตือนความผิดปกติของระบบ</p>
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

    <div v-if="activeTab === 'history'" class="content-card slide-in">
      <div class="section-header">
        <h3 class="font-bold text-lg">รายการแจ้งเตือนล่าสุด</h3>
        <button v-if="notifications.length > 0" @click="clearAll" class="btn-clear-soft">
          🗑️ ล้างทั้งหมด
        </button>
      </div>

      <div v-if="notifications.length === 0" class="empty-state">
        <div class="empty-icon">📭</div>
        <p>ไม่มีการแจ้งเตือนใหม่</p>
        <small>ระบบทำงานปกติ</small>
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
            {{ getTypeIcon(item.type) }}
          </div>
          <div class="noti-content">
            <div class="flex justify-between items-center mb-1">
              <span class="font-bold text-gray-800">{{ item.title }}</span>
              <span class="text-xs text-gray-400">{{ formatDate(item.timestamp) }}</span>
            </div>
            <p class="text-sm text-gray-600">{{ item.message }}</p>
          </div>
          <div v-if="!item.isRead" class="status-dot"></div>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'settings'" class="content-card slide-in">
      <h3 class="font-bold text-lg mb-2">Smart Alert Rules</h3>
      <p class="text-sm text-gray-500 mb-6">กำหนดเงื่อนไขเพื่อให้ระบบแจ้งเตือนอัตโนมัติ</p>

      <div class="setting-group">
        <div class="flex justify-between mb-2">
          <label class="setting-label">
            🔋 Battery Threshold
            <small>แจ้งเตือนเมื่อแบตเตอรี่ต่ำกว่าค่านี้</small>
          </label>
          <span class="text-blue-600 font-bold text-xl">{{ alertSettings.batteryThreshold }}%</span>
        </div>

        <div class="slider-container">
          <input
            type="range"
            v-model.number="alertSettings.batteryThreshold"
            min="0"
            max="100"
            class="range-slider"
            :style="{ backgroundSize: alertSettings.batteryThreshold + '% 100%' }"
          />
        </div>
        <div class="flex justify-between text-xs text-gray-400 mt-1">
          <span>0% (Critical)</span>
          <span>50%</span>
          <span>100% (Full)</span>
        </div>
      </div>

      <hr class="my-6 border-gray-100" />

      <h4 class="font-bold text-md mb-4">Notification Channels</h4>
      <div class="grid grid-cols-2 gap-4">
        <label class="channel-card" :class="{ active: alertSettings.enableEmailNoti }">
          <input type="checkbox" v-model="alertSettings.enableEmailNoti" class="hidden" />
          <span class="icon">📧</span>
          <span class="text">Email Alert</span>
          <span class="status">{{ alertSettings.enableEmailNoti ? "On" : "Off" }}</span>
        </label>

        <label class="channel-card" :class="{ active: alertSettings.enableLineNoti }">
          <input type="checkbox" v-model="alertSettings.enableLineNoti" class="hidden" />
          <span class="icon">💬</span>
          <span class="text">LINE Notify</span>
          <span class="status">{{ alertSettings.enableLineNoti ? "On" : "Off" }}</span>
        </label>
      </div>

      <div class="mt-8 flex justify-end">
        <button class="btn-save" @click="saveSettings" :disabled="isSaving">
          {{ isSaving ? "Saving..." : "Save Configuration" }}
        </button>
      </div>
    </div>

    <Transition name="pop">
      <div v-if="showSuccessModal" class="success-popup">
        <div class="popup-icon">✓</div>
        <span>บันทึกเรียบร้อย!</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.page-container {
  padding: 30px;
  background-color: #f8f9fa;
  min-height: 100vh;
  font-family: "Inter", sans-serif;
  max-width: 1200px;
  margin: 0 auto;
}

/* Header & Tabs */
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 25px;
  flex-wrap: wrap;
  gap: 15px;
}
.tabs {
  display: flex;
  background: white;
  padding: 4px;
  border-radius: 10px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}
.tab-btn {
  padding: 8px 20px;
  border-radius: 8px;
  font-weight: 600;
  color: #6b7280;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tab-btn.active {
  background-color: #ebf5ff;
  color: #2563eb;
}
.badge-count {
  background: #ef4444;
  color: white;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

/* Content Card */
.content-card {
  background: white;
  border-radius: 16px;
  padding: 30px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  border: 1px solid #f0f0f0;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

/* Buttons */
.btn-clear-soft {
  background-color: #fff1f2;
  color: #e11d48;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-clear-soft:hover {
  background-color: #ffe4e6;
}

.btn-save {
  background-color: #2563eb;
  color: white;
  border: none;
  padding: 12px 30px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2);
}
.btn-save:hover {
  background-color: #1d4ed8;
  transform: translateY(-1px);
}
.btn-save:disabled {
  background-color: #93c5fd;
  cursor: not-allowed;
}

/* Notification List */
.noti-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.noti-item {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #f3f4f6;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  background: white;
}
.noti-item:hover {
  border-color: #dbeafe;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}
.noti-item.unread {
  background-color: #f8fafc;
  border-left: 4px solid #3b82f6;
}
.noti-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
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
.setting-label {
  display: flex;
  flex-direction: column;
  font-weight: 600;
  color: #1f2937;
}
.setting-label small {
  color: #9ca3af;
  font-weight: 400;
  margin-top: 4px;
}

/* Range Slider Styling */
.range-slider {
  -webkit-appearance: none;
  width: 100%;
  height: 8px;
  background: #e5e7eb;
  border-radius: 5px;
  background-image: linear-gradient(#3b82f6, #3b82f6);
  background-repeat: no-repeat;
  cursor: pointer;
}
.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: 24px;
  width: 24px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #3b82f6;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.1s;
}
.range-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

/* Channel Cards */
.channel-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.channel-card:hover {
  border-color: #d1d5db;
}
.channel-card.active {
  border-color: #3b82f6;
  background-color: #eff6ff;
}
.channel-card .icon {
  font-size: 1.5rem;
  margin-bottom: 8px;
}
.channel-card .text {
  font-weight: 600;
  color: #374151;
}
.channel-card .status {
  font-size: 0.8rem;
  color: #9ca3af;
  margin-top: 4px;
}
.channel-card.active .status {
  color: #2563eb;
  font-weight: bold;
}
.hidden {
  display: none;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #9ca3af;
}
.empty-icon {
  font-size: 3rem;
  margin-bottom: 15px;
  opacity: 0.5;
}

/* Popup */
.success-popup {
  position: fixed;
  bottom: 40px;
  right: 40px;
  background-color: #10b981;
  color: white;
  padding: 12px 24px;
  border-radius: 50px;
  box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4);
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  z-index: 1000;
}
.popup-icon {
  background: white;
  color: #10b981;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
}

/* Animations */
.slide-in {
  animation: slideFade 0.4s ease-out;
}
@keyframes slideFade {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.pop-enter-active,
.pop-leave-active {
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: scale(0.8) translateY(20px);
}
</style>
