<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  Activity,
  Clock,
  Settings,
  History,
  Battery,
  Wifi,
  Zap,
  CheckCircle2,
} from "lucide-vue-next";

// ✅ ใช้ rtdb ให้เหมือนกับหน้า DeviceManagement
import { rtdb as db } from "../firebase";
import { ref as dbRef, onValue, update, remove, set, off } from "firebase/database";

// --- State ---
const notifications = ref([]);
const recoveryLogs = ref([]); // สำหรับเก็บบันทึกการกู้คืนระบบ
const alertSettings = ref({
  batteryThreshold: 20, // ค่า Default
  gatewayOfflineTimeout: 15,
  nodeOfflineTimeout: 15,
});
const showSuccessModal = ref(false);
const showClearModal = ref(false);
const activeTab = ref("history");
const isSaving = ref(false);

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

  // 3. ดึงประวัติการกู้คืนระบบ (System Recovery Logs)
  const recoveryRef = dbRef(db, "system_logs/reconnections");
  onValue(recoveryRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const list = Object.entries(data).map(([id, val]) => ({
        id,
        ...val,
      }));
      recoveryLogs.value = list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } else {
      recoveryLogs.value = [];
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
      return "text-yellow-600 bg-yellow-50";
    case "alert":
      return "text-red-600 bg-red-50";
    case "info":
      return "text-blue-600 bg-blue-50";
    default:
      return "text-gray-600 bg-gray-50";
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

const confirmClearAll = () => {
  showClearModal.value = true;
};

const executeClearAll = async () => {
  try {
    await remove(notiRef);
    showClearModal.value = false;
  } catch (error) {
    alert("ลบไม่สำเร็จ: " + error.message);
  }
};

const executeClearRecovery = async () => {
  try {
    const recoveryRef = dbRef(db, "system_logs/reconnections");
    await remove(recoveryRef);
    showClearModal.value = false;
  } catch (error) {
    alert("ล้างประวัติกู้คืนไม่สำเร็จ: " + error.message);
  }
};

const saveSettings = async () => {
  isSaving.value = true;
  try {
    alertSettings.value.batteryThreshold = parseInt(alertSettings.value.batteryThreshold);
    alertSettings.value.gatewayOfflineTimeout = parseInt(alertSettings.value.gatewayOfflineTimeout);
    alertSettings.value.nodeOfflineTimeout = parseInt(alertSettings.value.nodeOfflineTimeout);

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
    <div class="header-section">
      <div class="header-left">
        <h1 class="page-title">ศูนย์แจ้งเตือน (Notification Center)</h1>
        <p class="page-desc">ติดตามสถานะและแจ้งเตือนความผิดปกติของระบบแบบเรียลไทม์</p>
      </div>

      <div class="tabs-container">
        <button
          @click="activeTab = 'history'"
          :class="['tab-item', activeTab === 'history' ? 'active' : '']"
        >
          <History :size="18" />
          <span>ประวัติ</span>
          <span v-if="unreadCount > 0" class="badge-dot">{{ unreadCount }}</span>
        </button>
        <button
          @click="activeTab = 'settings'"
          :class="['tab-item', activeTab === 'settings' ? 'active' : '']"
        >
          <Settings :size="18" />
          <span>ตั้งค่า</span>
        </button>
        <button
          @click="activeTab = 'status'"
          :class="['tab-item', activeTab === 'status' ? 'active' : '']"
        >
          <Activity :size="18" />
          <span>สถานะระบบ</span>
        </button>
      </div>
    </div>

    <!-- Tab 1: History -->
    <div v-if="activeTab === 'history'" class="content-body slide-in">
      <div class="card card-simple">
        <div class="card-header-row">
          <h3 class="card-title-internal">รายการแจ้งเตือนล่าสุด</h3>
          <button v-if="notifications.length > 0" @click="confirmClearAll" class="btn-text-danger">
            ล้างประวัติทั้งหมด
          </button>
        </div>

        <div v-if="notifications.length === 0" class="empty-placeholder">
          <div class="empty-icon-box">📭</div>
          <p class="empty-text">ไม่มีรายการแจ้งเตือนใหม่ในขณะนี้</p>
          <small>ทุกอย่างทำงานปกติ</small>
        </div>

        <div v-else class="noti-stack">
          <div
            v-for="item in notifications"
            :key="item.id"
            class="noti-row"
            :class="{ unread: !item.isRead }"
            @click="markAsRead(item.id)"
          >
            <div class="noti-type-icon" :class="getTypeColor(item.type)">
              {{ getTypeIcon(item.type) }}
            </div>
            <div class="noti-info">
              <div class="noti-header">
                <span class="noti-title-text">{{ item.title }}</span>
                <span class="noti-time-text">{{ formatDate(item.timestamp) }}</span>
              </div>
              <p class="noti-msg-text">{{ item.message }}</p>
            </div>
            <div v-if="!item.isRead" class="unread-marker"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 2: Settings -->
    <div v-if="activeTab === 'settings'" class="content-body slide-in">
      <div class="card card-simple">
        <div class="card-intro">
          <h3 class="card-title-internal">เงื่อนไขการแจ้งเตือน (Alert Rules)</h3>
          <p class="card-subtitle-internal">กำหนดจุดวิกฤตเพื่อให้ระบบแจ้งเตือนอัตโนมัติ</p>
        </div>

        <div class="settings-list">
          <!-- Item 1: Battery -->
          <div class="setting-item-block">
            <div class="setting-label-row">
              <div class="icon-circle battery"><Battery :size="18" /></div>
              <div class="label-info">
                <span class="label-primary text-lg">ระดับแบตเตอรี่ที่แจ้งเตือน</span>
                <span class="label-secondary"
                  >แจ้งเตือนเมื่อพลังงานอุปกรณ์ต่ำกว่าระดับที่กำหนด</span
                >
              </div>
            </div>
            <div class="selector-container">
              <button
                v-for="level in [10, 20, 30, 40, 50]"
                :key="level"
                class="selector-btn"
                :class="{ active: alertSettings.batteryThreshold === level }"
                @click="alertSettings.batteryThreshold = level"
              >
                {{ level }}%
              </button>
            </div>
          </div>

          <div class="divider"></div>

          <!-- Item 2: Gateway Offline -->
          <div class="setting-item-block">
            <div class="setting-label-row">
              <div class="icon-circle wifi"><Wifi :size="18" /></div>
              <div class="label-info">
                <span class="label-primary text-lg">เกณฑ์เวลา Gateway Offline</span>
                <span class="label-secondary"
                  >ระยะเวลาที่ใช้ระบุว่าตัวรับสัญญาณขาดการเชื่อมต่อ</span
                >
              </div>
            </div>
            <div class="selector-container">
              <button
                v-for="min in [5, 15, 30, 60, 120]"
                :key="`gw-${min}`"
                class="selector-btn"
                :class="{ active: alertSettings.gatewayOfflineTimeout === min }"
                @click="alertSettings.gatewayOfflineTimeout = min"
              >
                {{ min }} นาที
              </button>
            </div>
          </div>

          <div class="divider"></div>

          <!-- Item 3: Node Offline -->
          <div class="setting-item-block">
            <div class="setting-label-row">
              <div class="icon-circle node"><Zap :size="18" /></div>
              <div class="label-info">
                <span class="label-primary text-lg">เกณฑ์เวลาอุปกรณ์ Offline</span>
                <span class="label-secondary">ระยะเวลาตัดสินว่าอุปกรณ์ส่งข้อมูลล่าช้าเกินปกติ</span>
              </div>
            </div>
            <div class="selector-container">
              <button
                v-for="min in [5, 15, 30, 60, 120]"
                :key="`node-${min}`"
                class="selector-btn"
                :class="{ active: alertSettings.nodeOfflineTimeout === min }"
                @click="alertSettings.nodeOfflineTimeout = min"
              >
                {{ min }} นาที
              </button>
            </div>
          </div>
        </div>

        <div class="card-footer-action">
          <button class="btn-primary-save" @click="saveSettings" :disabled="isSaving">
            {{ isSaving ? "กำลังบันทึก..." : "บันทึกทึกการตั้งค่า" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Tab 3: System Status (Targeted Redesign Retained) -->
    <div v-if="activeTab === 'status'" class="premium-status-view slide-in">
      <div class="premium-status-board">
        <div class="board-header">
          <div class="board-text">
            <h3 class="board-title">ประวัติการเชื่อมต่อระบบ</h3>
            <p class="board-subtitle">รายการเหตุการณ์ระบบกู้คืนสถานะอัตโนมัติ (Recovery Logs)</p>
          </div>
          <button
            v-if="recoveryLogs.length > 0"
            @click="confirmClearAll"
            class="btn-text-danger ml-auto"
          >
            ล้างประวัติกู้คืนทั้งหมด
          </button>
        </div>

        <div class="board-table-wrapper">
          <table class="board-table">
            <thead>
              <tr>
                <th><Clock :size="14" class="inline mr-1" /> วัน-เวลา</th>
                <th>สถานะ</th>
                <th>ข้อมูลระบบ / ข้อความ</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(log, idx) in recoveryLogs"
                :key="log.id"
                :style="{ animationDelay: `${idx * 50}ms` }"
              >
                <td class="font-mono">{{ formatDate(log.timestamp) }}</td>
                <td>
                  <div class="live-status-pill">
                    <div class="breathing-light"></div>
                    ACTIVE
                  </div>
                </td>
                <td class="log-msg">{{ log.message }}</td>
              </tr>
              <tr v-if="recoveryLogs.length === 0">
                <td colspan="3" class="log-empty">ไม่มีบันทึกการกู้คืนระบบ</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <Transition name="toast">
      <div v-if="showSuccessModal" class="success-toast">
        <CheckCircle2 :size="18" />
        <span>บันทึกข้อมูลสำเร็จ</span>
      </div>
    </Transition>

    <!-- Custom Clear Confirmation Modal -->
    <Transition name="modal-fade">
      <div v-if="showClearModal" class="modal-overlay" @click.self="showClearModal = false">
        <div class="modal-content warning-modal">
          <div class="modal-header-warning">
            <div class="warning-icon-wrapper">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="text-red-500"
              >
                <path d="M3 6h18"></path>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </div>
          </div>
          <div class="modal-body-warning">
            <h3 class="warning-title">ล้างประวัติทั้งหมด?</h3>
            <p class="warning-desc">
              คุณแน่ใจหรือไม่ว่าต้องการลบประวัติการแจ้งเตือนทั้งหมด?<br />
              การกระทำนี้ <span class="text-red-600 font-bold">ไม่สามารถกู้คืนได้</span>
            </p>
          </div>
          <div class="modal-footer-warning">
            <button class="btn-cancel" @click="showClearModal = false">ยกเลิก</button>
            <button
              class="btn-danger-confirm"
              @click="activeTab === 'history' ? executeClearAll() : executeClearRecovery()"
            >
              ยืนยันการลบ
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Global Container */
.page-container {
  padding: 20px;
  background-color: #f6f8fa;
  min-height: 100vh;
  font-family: "Inter", "Prompt", sans-serif;
  width: 100%;
}

/* Header & Tabs Alignment Fix */
.header-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 30px;
  gap: 20px;
}

.page-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: #1a202c;
  margin: 0;
  letter-spacing: -0.5px;
}

.page-desc {
  font-size: 0.95rem;
  color: #718096;
  margin-top: 4px;
}

.tabs-container {
  display: flex;
  background: white;
  padding: 6px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  color: #4a5568;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.tab-item.active {
  background-color: #ebf4ff;
  color: #3182ce;
}

.badge-dot {
  background: #f56565;
  color: white;
  font-size: 0.7rem;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Common Card Style */
.card {
  background: white;
  border-radius: 20px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.card-simple {
  padding: 24px;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
}

.card-title-internal {
  font-size: 1.25rem;
  font-weight: 700;
  color: #2d3748;
  margin: 0;
}

.card-subtitle-internal {
  font-size: 0.9rem;
  color: #a0aec0;
  margin-top: 5px;
}

.card-intro {
  margin-bottom: 30px;
}

/* Settings List Layout */
.settings-list {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.setting-item-block {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.setting-label-row {
  display: flex;
  align-items: center;
  gap: 15px;
}

.icon-circle {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-circle.battery {
  background-color: #fff5f5;
  color: #f56565;
}
.icon-circle.wifi {
  background-color: #ebf8ff;
  color: #3182ce;
}
.icon-circle.node {
  background-color: #f0fff4;
  color: #38a169;
}

.label-info {
  display: flex;
  flex-direction: column;
}

.label-primary {
  font-weight: 700;
  color: #2d3748;
}

.label-secondary {
  font-size: 0.8rem;
  color: #718096;
}

.selector-container {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.selector-btn {
  padding: 10px 20px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: white;
  font-weight: 600;
  color: #4a5568;
  cursor: pointer;
  transition: all 0.2s;
}

.selector-btn:hover {
  background-color: #f7fafc;
}

.selector-btn.active {
  background-color: #3182ce;
  color: white;
  border-color: #3182ce;
  box-shadow: 0 4px 12px rgba(49, 130, 206, 0.3);
}

.divider {
  border-bottom: 1px solid #edf2f7;
}

.card-footer-action {
  margin-top: 40px;
  display: flex;
  justify-content: flex-end;
}

.btn-primary-save {
  background: #2d3748;
  color: white;
  padding: 14px 40px;
  border-radius: 14px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary-save:hover {
  background: #1a202c;
  transform: translateY(-2px);
}

/* History Tab Styles */
.btn-text-danger {
  color: #e53e3e;
  font-weight: 700;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
}

.empty-placeholder {
  text-align: center;
  padding: 50px;
  color: #a0aec0;
}

.empty-icon-box {
  font-size: 3.5rem;
  margin-bottom: 15px;
  opacity: 0.5;
}

.noti-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.noti-row {
  display: flex;
  padding: 20px;
  border-radius: 16px;
  border: 1px solid #edf2f7;
  cursor: pointer;
  transition: all 0.2s;
  background: white;
  position: relative;
}

.noti-row:hover {
  transform: translateX(5px);
  border-color: #bee3f8;
}

.noti-row.unread {
  background-color: #f7fafc;
  border-left: 4px solid #3182ce;
}

.noti-type-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  margin-right: 20px;
}

.noti-info {
  flex: 1;
}

.noti-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
}

.noti-title-text {
  font-weight: 700;
  color: #2d3748;
}

.noti-time-text {
  font-size: 0.75rem;
  color: #a0aec0;
}

.noti-msg-text {
  font-size: 0.9rem;
  color: #4a5568;
}

.unread-marker {
  width: 8px;
  height: 8px;
  background-color: #3182ce;
  border-radius: 50%;
  position: absolute;
  top: 25px;
  right: 20px;
}

/* Premium Status Tab Retained */
.premium-status-board {
  background: white;
  border-radius: 24px;
  padding: 24px;
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.03);
}

.board-header {
  display: flex;
  gap: 20px;
  align-items: center;
  margin-bottom: 35px;
}

.board-icon-box {
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%);
  color: white;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.board-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #1a202c;
  margin: 0;
}

.board-subtitle {
  color: #718096;
  font-size: 0.9rem;
}

.board-table-wrapper {
  overflow-x: auto;
  border-radius: 16px;
  border: 1px solid #edf2f7;
}

.board-table {
  width: 100%;
  border-collapse: collapse;
}

.board-table th {
  background: #f7fafc;
  padding: 16px;
  text-align: left;
  font-size: 0.75rem;
  text-transform: uppercase;
  color: #718096;
  letter-spacing: 1px;
}

.board-table td {
  padding: 18px 16px;
  border-bottom: 1px solid #f7fafc;
}

.live-status-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  color: #38a169;
  font-size: 0.85rem;
}

.breathing-light {
  width: 10px;
  height: 10px;
  background-color: #48bb78;
  border-radius: 50%;
  box-shadow: 0 0 10px #48bb78;
  animation: breathe 2s infinite ease-in-out;
}

.log-msg {
  color: #718096;
  font-size: 0.9rem;
}

@keyframes breathe {
  0%,
  100% {
    opacity: 0.5;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

/* Success Toast */
.success-toast {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  background-color: #2d3748;
  color: white;
  padding: 12px 30px;
  border-radius: 50px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 700;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
}

/* Responsiveness */
@media (max-width: 768px) {
  .page-container {
    padding: 20px;
  }
  .header-section {
    flex-direction: column;
    align-items: stretch;
  }
  .tabs-container {
    overflow-x: auto;
  }
  .header-left {
    text-align: center;
  }
  .card-simple {
    padding: 20px;
  }
  .noti-row {
    padding: 15px;
  }
}

/* Custom Clear Confirmation Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.modal-content {
  background: white;
  width: 90%;
  max-width: 400px;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
}

.warning-modal {
  padding: 30px;
  text-align: center;
}

.warning-icon-wrapper {
  width: 70px;
  height: 70px;
  background-color: #fff5f5;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
}

.warning-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #2d3748;
  margin-bottom: 10px;
}

.warning-desc {
  color: #718096;
  font-size: 0.95rem;
  line-height: 1.6;
  margin-bottom: 30px;
}

.modal-footer-warning {
  display: flex;
  gap: 12px;
}

.btn-cancel {
  flex: 1;
  padding: 12px;
  background: #f7fafc;
  color: #4a5568;
  border: none;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: #edf2f7;
}

.btn-danger-confirm {
  flex: 1;
  padding: 12px;
  background: #e53e3e;
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(229, 62, 62, 0.2);
}

.btn-danger-confirm:hover {
  background: #c53030;
  transform: translateY(-1px);
}

.ml-auto {
  margin-left: auto;
}

.slide-in {
  animation: slideUp 0.4s ease-out;
}
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(15px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Modal Transitions */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active .modal-content {
  animation: modalPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
@keyframes modalPop {
  from {
    transform: scale(0.9) translateY(20px);
    opacity: 0;
  }
  to {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
</style>
