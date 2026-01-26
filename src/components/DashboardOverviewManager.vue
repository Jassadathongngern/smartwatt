<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import EnergyUsageChart from "./EnergyUsageChart.vue";

// --- Firebase Imports ---
import { db } from "../firebase";
import { ref as dbRef, onValue, off } from "firebase/database";

// --- 1. State หลัก ---
const selectedFloors = ref(["1", "2", "3"]);
const timeRange = ref("24H");

// ✅ ตัวแปรสำคัญ: ยอดรวม
const floor3TotalRef = ref(0); // ยอดรวมชั้น 3 (ส่งให้กราฟ)
const allBuildingTotal = ref(0); // ยอดรวมทั้งตึก (ส่งให้การ์ด CURRENT POWER)

// --- 2. State สำหรับ Real-time Card ---
const voltage = ref(0);
const current = ref(0);
const power = ref(0); // ค่าของ dev_001 (เก็บไว้เผื่อใช้)
const dailyEnergy = ref(0);
const cost = ref(0);
const temperature = ref(0);
const humidity = ref(0);
const pm25 = ref(0);
const totalUsage = ref(0);

const gatewayStatus = ref("Connecting...");
const lastUpdate = ref("-");

// --- 3. Default Data ---
const alertData = ref({ count: 0, message: "System Normal", link: "#" });

// --- 4. ข้อมูลตึกและห้อง (Structure Layout) ---
const floorData = ref([
  {
    id: "3",
    totalPower: 0,
    status: "online",
    isExpanded: true,
    rooms: [
      { name: "16301", deviceId: "dev_001", type: "Server Room", power: 0, status: "offline" },
      { name: "16302", deviceId: "dev_002", type: "Classroom", power: 0, status: "offline" },
      { name: "16303", deviceId: "dev_003", type: "Office", power: 0, status: "offline" },
    ],
  },
  {
    id: "2",
    totalPower: 0,
    status: "online",
    isExpanded: false,
    rooms: [
      { name: "16201", deviceId: "dev_004", power: 0, status: "offline" },
      { name: "16202", deviceId: "dev_005", power: 0, status: "offline" },
      { name: "16203", deviceId: "dev_006", power: 0, status: "offline" },
    ],
  },
  {
    id: "1",
    totalPower: 0,
    status: "online",
    isExpanded: false,
    rooms: [
      { name: "16101", deviceId: "dev_007", power: 0, status: "offline" },
      { name: "16102", deviceId: "dev_008", power: 0, status: "offline" },
      { name: "Server", deviceId: "dev_009", power: 0, status: "offline" },
    ],
  },
]);

const deviceCache = ref({});
const DEVICES_PATH = "devices";
const CONFIG_PATH = "building_configs/floor_3/rooms";

onMounted(() => {
  const deviceRef = dbRef(db, DEVICES_PATH);
  onValue(deviceRef, (snapshot) => {
    const allDevices = snapshot.val();
    if (allDevices) {
      deviceCache.value = allDevices;
      updateFloorValues();
      updateMainCard(allDevices);
    }
  });

  const configRef = dbRef(db, CONFIG_PATH);
  onValue(configRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const floor3 = floorData.value.find((f) => f.id === "3");
      if (floor3) {
        floor3.rooms = Object.entries(data).map(([key, val]) => ({
          name: key,
          deviceId: val.deviceId,
          type: val.type || "General",
          power: 0,
          status: "offline",
        }));
        updateFloorValues();
      }
    }
  });
});

// ✅ ฟังก์ชันคำนวณยอดรวม (หัวใจสำคัญ)
const updateFloorValues = () => {
  const allDevices = deviceCache.value;
  if (!allDevices) return;

  let grandTotal = 0; // ตัวแปรพัก: ยอดรวมทั้งตึก

  floorData.value.forEach((floor) => {
    let floorTotal = 0;

    floor.rooms.forEach((room) => {
      const targetId = room.deviceId ? room.deviceId.toLowerCase() : "";
      const deviceData = allDevices[targetId];

      if (deviceData) {
        const p = Number(deviceData.w || deviceData.power || 0);
        room.power = (p / 1000).toFixed(2);
        room.status = "online";
        floorTotal += p;
      } else {
        room.status = "offline";
      }
    });

    floor.totalPower = (floorTotal / 1000).toFixed(2);
    grandTotal += floorTotal; // สะสมยอด

    // เก็บแยกเฉพาะชั้น 3 ไว้ส่งกราฟ
    if (floor.id === "3") {
      floor3TotalRef.value = floorTotal;
    }
  });

  // อัปเดตตัวแปรยอดรวมทั้งตึก
  allBuildingTotal.value = grandTotal;
};

// ฟังก์ชันอัปเดตการ์ดใบใหญ่ (Dev_001 เป็นตัวแทนค่า Sensor อื่นๆ)
const updateMainCard = (allDevices) => {
  const mainDev = allDevices["dev_001"] || allDevices["dev-001"];
  if (mainDev) {
    voltage.value = mainDev.v || mainDev.voltage || 0;
    current.value = mainDev.a || mainDev.current || 0;
    power.value = mainDev.w || mainDev.power || 0;
    temperature.value = mainDev.temp || mainDev.t || 0;
    humidity.value = mainDev.hum || mainDev.h || 0;
    pm25.value = mainDev.pm25 || mainDev.pm2_5 || 0;
    dailyEnergy.value = mainDev.daily_energy || 0;
    cost.value = mainDev.cost || (dailyEnergy.value * 4).toFixed(2);
    totalUsage.value = mainDev.total_usage || 0;
    gatewayStatus.value = "Active";
    if (mainDev.last_update) {
      lastUpdate.value = new Date(mainDev.last_update).toLocaleTimeString("th-TH");
    }
  }
};

onUnmounted(() => {
  off(dbRef(db, DEVICES_PATH));
  off(dbRef(db, CONFIG_PATH));
});

// --- Helper Functions ---
const selectTimeRange = (range) => {
  timeRange.value = range;
};
const selectAllFloors = () => {
  selectedFloors.value = ["1", "2", "3"];
};
const toggleFloor = (floor) => {
  if (selectedFloors.value.includes(floor)) {
    selectedFloors.value = selectedFloors.value.filter((f) => f !== floor);
  } else {
    selectedFloors.value.push(floor);
  }
};
const toggleFloorExpand = (floorId) => {
  const target = floorData.value.find((f) => f.id === floorId);
  if (target) {
    target.isExpanded = !target.isExpanded;
  }
};
</script>

<template>
  <div class="dashboard-overview">
    <div class="header-bar">
      <h2>Dashboard Overview (Manager)</h2>
      <div class="status-bar">
        Gateway:
        <span class="status-badge" :class="gatewayStatus === 'Active' ? 'online' : 'offline'">
          {{ gatewayStatus }}
        </span>
        <span class="last-update">Last Update: {{ lastUpdate }}</span>
      </div>
    </div>

    <div class="chart-section full-width-chart">
      <div class="chart-header">
        <div class="header-left">
          <h3>POWER CONSUMPTION ANALYSIS (FLOOR 3)</h3>
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
              v-for="floor in ['1', '2', '3']"
              :key="floor"
              class="tab-btn"
              :class="{ active: selectedFloors.includes(floor) }"
              @click="toggleFloor(floor)"
            >
              Floor {{ floor }}
            </button>
          </div>
        </div>
      </div>

      <div style="height: 350px; width: 100%">
        <EnergyUsageChart
          :floors="selectedFloors"
          :timeRange="timeRange"
          :livePower="floor3TotalRef"
        />
      </div>
    </div>

    <div class="bottom-row">
      <div class="stats-container">
        <div class="stats-grid">
          <div class="stat-card warning">
            <p class="label">TOTAL BUILDING POWER</p>
            <div class="stat-content">
              <h3>{{ allBuildingTotal }} <small style="font-size: 1rem; color: #666">W</small></h3>
              <span class="trend" :class="allBuildingTotal > 15000 ? 'bad' : 'good'">
                {{ allBuildingTotal > 15000 ? "High Load" : "Normal" }}
                <small>All Floors</small>
              </span>
            </div>
          </div>

          <div class="stat-card primary">
            <p class="label">VOLTAGE</p>
            <div class="stat-content">
              <h3>{{ voltage }} <small style="font-size: 1rem; color: #666">V</small></h3>
              <span class="trend neutral">Live<small>Sensor</small></span>
            </div>
          </div>

          <div class="stat-card info">
            <p class="label">CURRENT</p>
            <div class="stat-content">
              <h3>{{ current }} <small style="font-size: 1rem; color: #666">A</small></h3>
              <span class="trend neutral">Live<small>Sensor</small></span>
            </div>
          </div>

          <div class="stat-card success">
            <p class="label">DAILY ENERGY</p>
            <div class="stat-content">
              <h3>{{ dailyEnergy }} <small style="font-size: 1rem; color: #666">kWh</small></h3>
              <span class="trend good">▲ 1%<small>vs yesterday</small></span>
            </div>
          </div>

          <div class="stat-card warning">
            <p class="label">COST</p>
            <div class="stat-content">
              <h3>{{ cost }} <small style="font-size: 1rem; color: #666">฿</small></h3>
              <span class="trend neutral">Normal<small>Rate</small></span>
            </div>
          </div>

          <div class="stat-card secondary">
            <p class="label">TOTAL USAGE</p>
            <div class="stat-content">
              <h3>{{ totalUsage }} <small style="font-size: 1rem; color: #666">MWh</small></h3>
              <span class="trend neutral">Year<small>to date</small></span>
            </div>
          </div>

          <div class="stat-card success">
            <p class="label">AVG TEMP</p>
            <div class="stat-content">
              <h3>{{ temperature }} <small style="font-size: 1rem; color: #666">°C</small></h3>
              <span class="trend good">Good<small>Cooling</small></span>
            </div>
          </div>

          <div class="stat-card info">
            <p class="label">HUMIDITY</p>
            <div class="stat-content">
              <h3>{{ humidity }} <small style="font-size: 1rem; color: #666">%</small></h3>
              <span class="trend neutral">Optimal<small>Range</small></span>
            </div>
          </div>

          <div class="stat-card info">
            <p class="label">PM2.5</p>
            <div class="stat-content">
              <h3>{{ pm25 }} <small style="font-size: 1rem; color: #666">µg/m³</small></h3>
              <span class="trend good">Safe<small>Air Quality</small></span>
            </div>
          </div>

          <div class="stat-card success">
            <p class="label">STATUS</p>
            <div class="stat-content">
              <h3>100%</h3>
              <span class="trend good">Online<small>System OK</small></span>
            </div>
          </div>

          <div class="stat-card alert">
            <p class="label">ALERTS</p>
            <div class="stat-content">
              <h3>{{ alertData.count }}</h3>
              <a :href="alertData.link" class="alert-btn-soft">
                ⚠️ {{ alertData.message }} <span class="arrow">→</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <div class="hierarchy-area">
        <div class="area-header">
          <h3>Building Status</h3>
        </div>
        <div class="floor-list">
          <div
            v-for="floor in floorData"
            :key="floor.id"
            class="floor-item"
            :class="{ expanded: floor.isExpanded }"
          >
            <div class="floor-header" @click="toggleFloorExpand(floor.id)">
              <div class="fh-left">
                <span class="toggle-icon">{{ floor.isExpanded ? "▼" : "▶" }}</span>
                <span class="floor-name">Floor {{ floor.id }}</span>
              </div>
              <div class="fh-right">
                <span class="floor-total">{{ floor.totalPower }} kW</span>
                <span class="status-dot" :class="floor.status"></span>
              </div>
            </div>
            <div class="room-list" v-if="floor.isExpanded">
              <div v-for="room in floor.rooms" :key="room.name" class="room-item">
                <div class="room-info">
                  <span class="room-icon">🚪</span>
                  <div>
                    {{ room.name }}
                    <span style="font-size: 0.7em; color: #aaa; margin-left: 5px"
                      >({{ room.deviceId }})</span
                    >
                  </div>
                </div>
                <div class="room-stat">
                  <span>{{ room.power }} kW</span>
                  <span class="mini-dot" :class="room.status"></span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="status-legend">
          <span><span class="mini-dot online"></span> Normal</span>
          <span><span class="mini-dot warning"></span> Warning</span>
          <span><span class="mini-dot offline"></span> Offline</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* สไตล์เดิม */
.dashboard-overview {
  padding: 20px;
  background-color: #f8f9fa;
  min-height: 90vh;
  font-family: "Inter", sans-serif;
}
.header-bar {
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
.status-bar {
  font-size: 0.9rem;
  color: #666;
}
.last-update {
  margin-left: 10px;
  font-size: 0.8rem;
}
.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  color: white;
  font-size: 0.8rem;
  font-weight: bold;
}
.status-badge.online {
  background-color: #198754;
}
.status-badge.offline {
  background-color: #dc3545;
}

/* Chart */
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
.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 15px;
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
.time-btn:hover {
  color: #333;
}
.time-btn.active {
  background: white;
  color: #0d6efd;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}
.tab-btn {
  border: 1px solid #dee2e6;
  background: white;
  padding: 6px 16px;
  border-radius: 20px;
  cursor: pointer;
  margin-left: 5px;
  font-size: 0.85rem;
  transition: all 0.2s;
  color: #555;
  font-weight: 500;
}
.tab-btn:hover {
  background-color: #f8f9fa;
  border-color: #ced4da;
}
.tab-btn.active {
  background: #0d6efd;
  color: white;
  border-color: #0d6efd;
  font-weight: 600;
}

/* Bottom Row */
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
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 15px;
}

/* Stat Cards */
.stat-card {
  background: white;
  padding: 15px 20px;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
  border-left: 4px solid #ccc;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: transform 0.2s;
  border: 1px solid #f0f0f0;
  border-left-width: 4px;
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
.trend {
  font-size: 0.8rem;
  font-weight: bold;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
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
.alert-btn-soft {
  background-color: rgba(220, 53, 69, 0.1);
  color: #dc3545;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.alert-btn-soft:hover {
  background-color: #dc3545;
  color: white;
  box-shadow: 0 3px 6px rgba(220, 53, 69, 0.2);
}
.arrow {
  transition: transform 0.2s;
  font-size: 1rem;
  line-height: 1;
}
.alert-btn-soft:hover .arrow {
  transform: translateX(3px);
}

/* Hierarchy Area */
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
.status-legend {
  margin-top: 15px;
  display: flex;
  justify-content: center;
  gap: 15px;
  font-size: 0.8rem;
  color: #666;
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
</style>
