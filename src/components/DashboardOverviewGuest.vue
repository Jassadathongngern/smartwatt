<script setup>
import { ref, computed } from "vue";
import EnergyUsageChart from "./EnergyUsageChart.vue";
import { useBuildingData } from "../composables/useBuildingData";
import { DoorClosed } from "lucide-vue-next";

// --- Use the composable to get shared reactive data ---
const {
  gatewayStatus,
  lastUpdate,
  floorData,
  voltage,
  current,
  allBuildingTotal,
  temperature,
  humidity,
  toggleFloorExpand,
  dailyEnergy,
  cost,
  totalUsage,
  pm25,
} = useBuildingData();

// --- Local state for this component (UI-specific) ---
const selectedFloors = ref(["1", "2", "3"]);
const timeRange = ref("24H");
// Some data from the composable is not used here (e.g. dailyEnergy, cost) but that's fine.

const selectedRoom = ref(null);
const openRoomDetails = (room) => {
  selectedRoom.value = room;
};
const closeRoomDetails = () => {
  selectedRoom.value = null;
};

// --- Local helper functions for UI ---
const selectTimeRange = (range) => {
  timeRange.value = range;
};
const selectAllFloors = () => {
  if (selectedFloors.value.length === floorData.value.length) {
    selectedFloors.value = [];
  } else {
    selectedFloors.value = floorData.value.map((f) => f.id);
  }
};
const toggleFloor = (floor) => {
  if (selectedFloors.value.includes(floor)) {
    selectedFloors.value = selectedFloors.value.filter((f) => f !== floor);
  } else {
    selectedFloors.value.push(floor);
  }
};

// Map floorData to object for Chart
const liveFloorData = computed(() => {
  const data = {};
  if (floorData.value) {
    floorData.value.forEach((f) => {
      data[f.id] = Number(f.totalPower || 0);
    });
  }
  // Ensure we fallback to 0 for 1,2,3 if missing (to satisfy Chart expectations)
  if (data[1] === undefined) data[1] = 0;
  if (data[2] === undefined) data[2] = 0;
  if (data[3] === undefined) data[3] = 0;
  return data;
});

const isLoading = computed(() => gatewayStatus.value === "Connecting...");
</script>

<template>
  <div class="guest-dashboard">
    <div class="header-flex">
      <h2>ภาพรวมระบบ</h2>
      <div class="status-wrapper">
        Gateway:
        <span class="status-badge" :class="gatewayStatus === 'Active' ? 'online' : 'offline'">
          <span v-if="gatewayStatus === 'Active'" class="live-indicator"></span>
          {{ gatewayStatus }}
        </span>
        <span class="last-update" v-if="lastUpdate !== '-'">อัปเดตล่าสุด: {{ lastUpdate }}</span>
      </div>
    </div>

    <div class="chart-section full-width-chart glass-effect">
      <div class="chart-header">
        <div class="header-left">
          <h3>การวิเคราะห์การใช้พลังงานไฟฟ้า</h3>
          <div class="time-controls">
            <button
              v-for="range in ['24H', '7D', '30D']"
              :key="range"
              class="time-btn"
              :class="{ active: timeRange === range }"
              @click="selectTimeRange(range)"
            >
              {{ range }}
            </button>
          </div>
        </div>

        <div class="header-right">
          <div class="floor-tabs">
            <button
              class="tab-btn"
              :class="{ active: selectedFloors.length === 3 }"
              @click="selectAllFloors"
            >
              All Floors
            </button>
            <button
              v-for="floor in floorData"
              :key="floor.id"
              class="tab-btn"
              :class="{
                active:
                  selectedFloors.includes(floor.id) && selectedFloors.length !== floorData.length,
              }"
              @click="toggleFloor(floor.id)"
            >
              Floor {{ floor.id }}
            </button>
          </div>
        </div>
      </div>

      <div style="height: 350px; width: 100%; min-width: 0">
        <!-- ✅ ส่ง liveFloorData (Object) ไปให้กราฟ -->
        <EnergyUsageChart
          :floors="selectedFloors"
          :timeRange="timeRange"
          :livePower="liveFloorData"
        />
      </div>
    </div>

    <div class="bottom-row">
      <div class="stats-container">
        <div class="stats-grid">
          <div class="stat-card warning glass-effect">
            <p class="label">กำลังไฟฟ้าขณะหนึ่ง</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ allBuildingTotal }} <small class="unit">kW</small></h3>
                <span class="trend" :class="Number(allBuildingTotal) > 15 ? 'bad' : 'good'">
                  {{ Number(allBuildingTotal) > 15 ? "โหลดสูง" : "ปกติ" }}
                  <small>รวมทุกชั้น</small>
                </span>
              </template>
            </div>
          </div>

          <div class="stat-card alert glass-effect">
            <p class="label">แรงดันไฟฟ้า</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ voltage }} <small class="unit">V</small></h3>
                <span class="trend neutral">สด <small>(Live)</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card info glass-effect">
            <p class="label">กระแสไฟฟ้า</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ current }} <small class="unit">A</small></h3>
                <span class="trend neutral">สด <small>(Live)</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card success glass-effect">
            <p class="label">พลังงานไฟฟ้าต่อวัน</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ dailyEnergy }} <small class="unit">kWh</small></h3>
                <span class="trend neutral">สด <small>(Live)</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card primary glass-effect">
            <p class="label">ค่าไฟฟ้าโดยประมาณ</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ cost }} <small class="unit">฿</small></h3>
                <span class="trend neutral">อัตรา<small>ปกติ</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card secondary glass-effect">
            <p class="label">การใช้พลังงานสะสมรวม</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ totalUsage }} <small class="unit">kWh</small></h3>
                <span class="trend neutral">สะสม<small>ตั้งแต่ต้นปี</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card success glass-effect">
            <p class="label">อุณหภูมิเฉลี่ย</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ temperature }} <small class="unit">°C</small></h3>
                <span class="trend good">ระดับ<small>ปกติ</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card warning glass-effect">
            <p class="label">ความชื้นสัมพัทธ์</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ humidity }} <small class="unit">%</small></h3>
                <span class="trend good">ระดับ<small>ปกติ</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card alert glass-effect">
            <p class="label">คุณภาพอากาศ (PM2.5)</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ pm25 }} <small class="unit">µg/m³</small></h3>
                <span class="trend good">คุณภาพอากาศ<small>ปลอดภัย</small></span>
              </template>
            </div>
          </div>
        </div>
      </div>

      <div class="hierarchy-area glass-effect">
        <div class="area-header">
          <h3>สถานะอาคารรายชั้น</h3>
        </div>

        <div class="floor-list">
          <template v-if="isLoading">
            <div
              class="skeleton"
              style="height: 50px; margin-bottom: 10px"
              v-for="i in 3"
              :key="i"
            ></div>
          </template>
          <div
            v-else
            v-for="floor in floorData"
            :key="floor.id"
            class="floor-item"
            :class="{ expanded: floor.isExpanded }"
          >
            <div class="floor-header" @click="toggleFloorExpand(floor.id)">
              <div class="fh-left">
                <span class="toggle-icon">{{ floor.isExpanded ? "▼" : "▶" }}</span>
                <span class="floor-name">ชั้น {{ floor.id }}</span>
              </div>
              <div class="fh-right">
                <span class="floor-total">{{ floor.totalPower }} kW</span>
                <span class="status-dot" :class="floor.status"></span>
              </div>
            </div>

            <div class="room-list" v-if="floor.isExpanded">
              <div
                v-for="room in floor.rooms"
                :key="room.name"
                class="room-item clickable"
                @click="openRoomDetails(room)"
              >
                <div class="room-info">
                  <span class="room-icon"><DoorClosed :size="16" /></span>
                  {{ room.name }}
                </div>
                <div class="room-stat">
                  <span v-if="room.power !== null">{{ room.power }} kW</span>
                  <span v-else-if="room.temperature !== null" class="env-brief"
                    >{{ room.temperature }}°C</span
                  >
                  <span class="mini-dot" :class="room.status"></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="status-legend">
          <span><span class="mini-dot online"></span> ปกติ (Normal)</span>
          <span><span class="mini-dot warning"></span> แจ้งเตือน (Warning)</span>
          <span><span class="mini-dot offline"></span> ออฟไลน์ (Offline)</span>
        </div>
      </div>
    </div>

    <!-- Room Details Modal -->
    <div v-if="selectedRoom" class="modal-overlay" @click="closeRoomDetails">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>ห้อง {{ selectedRoom.name }}</h3>
          <button class="close-btn" @click="closeRoomDetails">✕</button>
        </div>
        <div class="modal-body">
          <p class="device-id-text">
            <strong>Device ID:</strong> {{ selectedRoom.deviceId }} |
            <span class="status-badge" :class="selectedRoom.status">{{ selectedRoom.status }}</span>
          </p>

          <div class="stats-grid-modal">
            <div v-if="selectedRoom.power !== null" class="stat-box-modal">
              <span class="modal-icon">⚡</span>
              <div class="modal-data">
                <span class="label">การใช้ไฟฟ้า</span>
                <span class="value">{{ selectedRoom.power }} kW</span>
              </div>
            </div>

            <div v-if="selectedRoom.temperature !== null" class="stat-box-modal">
              <span class="modal-icon">🌡️</span>
              <div class="modal-data">
                <span class="label">อุณหภูมิ</span>
                <span class="value">{{ selectedRoom.temperature }} °C</span>
              </div>
            </div>

            <div v-if="selectedRoom.humidity !== null" class="stat-box-modal">
              <span class="modal-icon">💧</span>
              <div class="modal-data">
                <span class="label">ความชื้น</span>
                <span class="value">{{ selectedRoom.humidity }} %</span>
              </div>
            </div>

            <div v-if="selectedRoom.pm25 !== null" class="stat-box-modal">
              <span class="modal-icon">💨</span>
              <div class="modal-data">
                <span class="label">ฝุ่น PM2.5</span>
                <span class="value">{{ selectedRoom.pm25 }} µg/m³</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.guest-dashboard {
  padding: 20px;
  background-color: #f8f9fa;
  min-height: 100vh;
  font-family: "Inter", sans-serif;
  overflow-x: hidden; /* Fix chart not resizing */
}

/* Header Flex */
.header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
}

h2 {
  color: #444;
  margin: 0;
  font-weight: 700;
}

.status-wrapper {
  font-size: 0.9rem;
  color: #666;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  color: white;
  font-size: 0.8rem;
  font-weight: bold;
  margin-left: 5px;
}
.status-badge.online {
  background-color: #198754;
}
.status-badge.offline {
  background-color: #dc3545;
}
.status-badge.sleep,
.status-badge.pending-sleep {
  background-color: #6f42c1;
}
.last-update {
  margin-left: 10px;
  font-size: 0.8rem;
  color: #999;
}

/* --- Chart Section --- */
.full-width-chart {
  background-color: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  margin-bottom: 20px;
  border: 1px solid #e9ecef;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 15px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 15px;
  flex-wrap: wrap;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.chart-header h3 {
  font-size: 1.1rem;
  margin: 0;
  color: #333;
  font-weight: 700;
}

.time-controls {
  display: flex;
  background: #f1f3f5;
  border-radius: 6px;
  padding: 2px;
}
.time-btn {
  border: none;
  background: transparent;
  padding: 4px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  border-radius: 4px;
  color: #666;
  font-weight: 600;
  transition: all 0.2s;
}
.time-btn.active {
  background: white;
  color: #0d6efd;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.tab-btn {
  border: 1px solid #dee2e6;
  background: white;
  padding: 5px 15px;
  border-radius: 20px;
  cursor: pointer;
  margin-left: 5px;
  font-size: 0.9rem;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  color: #555;
  font-weight: 500;
  user-select: none;
}
.tab-btn:hover {
  transform: translateY(-2px);
  background-color: #f8f9fa;
  border-color: #ced4da;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}
.tab-btn:active {
  transform: scale(0.95);
}
.tab-btn.active {
  background: #0d6efd;
  color: white;
  border-color: #0d6efd;
  box-shadow: 0 2px 6px rgba(13, 110, 253, 0.3);
  transform: translateY(0);
}

/* --- Bottom Row --- */
.bottom-row {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.stats-container {
  flex: 3;
  min-width: 300px;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
}

/* Stat Cards */
.stat-card {
  background: white;
  padding: 15px 20px;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
  border: 1px solid #f0f0f0;
  border-left: 8px solid #ccc;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  animation: fadeInUp 0.5s ease-out backwards;
}
/* Stagger Animation for each child */
.stat-grid > .stat-card:nth-child(1) {
  animation-delay: 0.1s;
}
.stat-grid > .stat-card:nth-child(2) {
  animation-delay: 0.2s;
}
.stat-grid > .stat-card:nth-child(3) {
  animation-delay: 0.3s;
}
.stat-grid > .stat-card:nth-child(4) {
  animation-delay: 0.4s;
}
.stat-grid > .stat-card:nth-child(5) {
  animation-delay: 0.5s;
}
.stat-grid > .stat-card:nth-child(6) {
  animation-delay: 0.6s;
}
.stat-grid > .stat-card:nth-child(7) {
  animation-delay: 0.7s;
}
.stat-grid > .stat-card:nth-child(8) {
  animation-delay: 0.8s;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
}

.stat-card.primary {
  border-left-color: #0d6efd;
}
.stat-card.info {
  border-left-color: #0dcaf0;
}
.stat-card.warning {
  border-left-color: #ffc107;
}
.stat-card.success {
  border-left-color: #198754;
}
.stat-card.alert {
  border-left-color: #dc3545;
}
.stat-card.secondary {
  border-left-color: #6c757d;
}

.label {
  font-size: 0.75rem;
  color: #888;
  font-weight: 700;
  margin-bottom: 10px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.stat-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}
.stat-card h3 {
  font-size: 1.4rem;
  margin: 0;
  color: #333;
  font-weight: 700;
}
.unit {
  font-size: 1rem;
  color: #888;
  margin-left: 3px;
}

.trend {
  font-size: 0.8rem;
  font-weight: bold;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}
.trend small {
  font-size: 0.65rem;
  font-weight: normal;
  color: #aaa;
  margin-top: 2px;
}
.trend.good {
  color: #198754;
}
.trend.bad {
  color: #dc3545;
}
.trend.neutral {
  color: #6c757d;
}
.trend.warning {
  color: #ffc107;
}

/* --- Hierarchy Area --- */
.hierarchy-area {
  flex: 1;
  background-color: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  min-width: 280px;
  display: flex;
  flex-direction: column;
  border: 1px solid #e9ecef;
}

.area-header h3 {
  font-size: 1.1rem;
  margin: 0;
  color: #333;
  font-weight: 700;
}

.floor-list {
  margin-top: 20px;
  flex: 1;
  overflow-y: auto;
  max-height: 400px;
}

.floor-item {
  border: 1px solid #e9ecef;
  border-radius: 8px;
  margin-bottom: 10px;
  overflow: hidden;
  transition: all 0.3s;
}
.floor-item.expanded {
  border-color: #0d6efd;
  box-shadow: 0 2px 8px rgba(13, 110, 253, 0.1);
}

.floor-header {
  background: #f8f9fa;
  padding: 12px 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
}
.floor-header:hover {
  background: #e2e6ea;
}

.fh-left,
.fh-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.toggle-icon {
  font-size: 0.8rem;
  color: #666;
  width: 15px;
}
.floor-name {
  font-weight: bold;
  color: #444;
}
.floor-total {
  font-size: 0.9rem;
  color: #0d6efd;
  font-weight: 600;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.status-dot.online {
  background: #198754;
  box-shadow: 0 0 5px #198754;
}
.status-dot.warning {
  background: #ffc107;
  box-shadow: 0 0 5px #ffc107;
}
.status-dot.offline {
  background: #dc3545;
}
.status-dot.sleep,
.status-dot.pending-sleep {
  background: #6f42c1;
  box-shadow: 0 0 5px #6f42c1;
}

.room-list {
  background: white;
  border-top: 1px solid #e9ecef;
  animation: slideDown 0.3s ease-out;
}
.room-item {
  padding: 10px 20px;
  border-bottom: 1px solid #f1f1f1;
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  color: #555;
}
.room-item:last-child {
  border-bottom: none;
}
.room-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.room-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
}
.room-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}

.mini-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 6px;
  vertical-align: middle;
}
.mini-dot.online {
  background: #198754;
}
.mini-dot.warning {
  background: #ffc107;
}
.mini-dot.offline {
  background: #dc3545;
}
.mini-dot.sleep,
.mini-dot.pending-sleep {
  background: #6f42c1;
}

/* Responsive Adjustments */
@media (max-width: 768px) {
  .header-flex {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .chart-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .header-left,
  .header-right {
    width: 100%;
    justify-content: flex-start;
  }

  .floor-tabs {
    display: flex;
    overflow-x: auto;
    padding-bottom: 5px;
    width: 100%;
    -webkit-overflow-scrolling: touch;
  }

  .tab-btn {
    white-space: nowrap;
    flex-shrink: 0;
  }

  .stats-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .stat-card h3 {
    font-size: 1.2rem;
  }
}

@media (max-width: 480px) {
  .guest-dashboard {
    padding: 10px;
  }

  .full-width-chart {
    padding: 15px;
  }

  .stats-grid {
    grid-template-columns: 1fr; /* Stack stats one by one on very small screens */
  }
}

.status-legend {
  margin-top: 15px;
  display: flex;
  justify-content: center;
  gap: 15px;
  font-size: 0.8rem;
  color: #666;
}

/* Room Modal Styles */
.clickable {
  cursor: pointer;
  transition: background-color 0.2s;
}
.clickable:hover {
  background-color: #f8f9fa;
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
  backdrop-filter: blur(4px);
}

.modal-content {
  background: white;
  padding: 25px;
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  transform: translateY(0);
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
}

.modal-header h3 {
  margin: 0;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #888;
}

.close-btn:hover {
  color: #d9534f;
}

.device-id-text {
  font-size: 0.9rem;
  color: #555;
  margin-bottom: 20px;
  text-align: center;
}

.stats-grid-modal {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.stat-box-modal {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid #e9ecef;
}

.modal-icon {
  font-size: 1.5rem;
}

.modal-data {
  display: flex;
  flex-direction: column;
}

.modal-data .label {
  font-size: 0.8rem;
  color: #666;
}

.modal-data .value {
  font-size: 1rem;
  font-weight: bold;
  color: #333;
}

/* Pulse Animation */
@keyframes pulse-green {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(25, 135, 84, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(25, 135, 84, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(25, 135, 84, 0);
  }
}

.live-indicator {
  width: 8px;
  height: 8px;
  background-color: #198754;
  border-radius: 50%;
  display: inline-block;
  margin-right: 8px;
  animation: pulse-green 2s infinite;
  vertical-align: middle;
}

/* Glassmorphism Card Style */
.glass-effect {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 3px solid rgba(255, 255, 255, 0.3);
}

/* Skeleton Loading */
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}
@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
.skeleton-text {
  height: 20px;
  width: 60%;
  margin-bottom: 8px;
}
.skeleton-value {
  height: 32px;
  width: 80%;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Animations... */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
