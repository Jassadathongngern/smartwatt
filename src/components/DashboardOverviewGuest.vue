<script setup>
import { ref } from "vue";
import EnergyUsageChart from "./EnergyUsageChart.vue";
import { useBuildingData } from "../composables/useBuildingData";

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

// --- Local helper functions for UI ---
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
</script>

<template>
  <div class="guest-dashboard">
    <div class="header-flex">
      <h2>Dashboard Overview (Guest)</h2>
      <div class="status-wrapper">
        Gateway:
        <span class="status-badge" :class="gatewayStatus === 'Active' ? 'online' : 'offline'">
          {{ gatewayStatus }}
        </span>
        <span class="last-update" v-if="lastUpdate !== '-'">Updated: {{ lastUpdate }}</span>
      </div>
    </div>

    <div class="chart-section full-width-chart">
      <div class="chart-header">
        <div class="header-left">
          <h3>LAST 24 HOUR POWER CONSUMPTION</h3>
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
        <!-- ✅ ส่ง allBuildingTotal ไปให้กราฟ -->
        <EnergyUsageChart
          :floors="selectedFloors"
          :timeRange="timeRange"
          :livePower="Number(allBuildingTotal)"
        />
      </div>
    </div>

    <div class="bottom-row">
      <div class="stats-container">
        <div class="stats-grid">
          <div class="stat-card warning">
            <p class="label">CURRENT POWER</p>
            <div class="stat-content">
              <!-- ✅ แสดงผล allBuildingTotal -->
              <h3>{{ allBuildingTotal }} <small class="unit">W</small></h3>
              <span class="trend" :class="Number(allBuildingTotal) > 1000 ? 'bad' : 'good'">
                {{ Number(allBuildingTotal) > 1000 ? "High" : "Normal" }}
              </span>
            </div>
          </div>

          <div class="stat-card primary">
            <p class="label">VOLTAGE</p>
            <div class="stat-content">
              <h3>{{ voltage }} <small class="unit">V</small></h3>
              <span class="trend neutral">Live</span>
            </div>
          </div>

          <div class="stat-card info">
            <p class="label">CURRENT</p>
            <div class="stat-content">
              <h3>{{ current }} <small class="unit">A</small></h3>
              <span class="trend neutral">Live</span>
            </div>
          </div>

          <div class="stat-card success">
            <p class="label">DAILY ENERGY</p>
            <div class="stat-content">
              <h3>{{ dailyEnergy }} <small class="unit">kWh</small></h3>
              <span class="trend good">▲ 1%</span>
            </div>
          </div>

          <div class="stat-card warning">
            <p class="label">ESTIMATED COST</p>
            <div class="stat-content">
              <h3>{{ cost }} <small class="unit">฿</small></h3>
              <span class="trend neutral">Normal Rate</span>
            </div>
          </div>

          <div class="stat-card secondary">
            <p class="label">TOTAL USAGE</p>
            <div class="stat-content">
              <h3>{{ totalUsage }} <small class="unit">MWh</small></h3>
              <span class="trend neutral">YTD</span>
            </div>
          </div>

          <div class="stat-card success">
            <p class="label">AVG TEMP</p>
            <div class="stat-content">
              <h3>{{ temperature }} <small class="unit">°C</small></h3>
              <span class="trend good">Cooling</span>
            </div>
          </div>

          <div class="stat-card info">
            <p class="label">HUMIDITY</p>
            <div class="stat-content">
              <h3>{{ humidity }} <small class="unit">%</small></h3>
              <span class="trend neutral">Optimal</span>
            </div>
          </div>

          <div class="stat-card info">
            <p class="label">PM2.5</p>
            <div class="stat-content">
              <h3>{{ pm25 }} <small class="unit">µg/m³</small></h3>
              <span class="trend good">Safe</span>
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
                  {{ room.name }}
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
.guest-dashboard {
  padding: 20px;
  background-color: #f8f9fa;
  min-height: 100vh;
  font-family: "Inter", sans-serif;
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
  transition: all 0.2s;
  color: #555;
  font-weight: 500;
}
.tab-btn.hover {
  background-color: #f8f9fa;
  border-color: #ced4da;
}
.tab-btn.active {
  background: #0d6efd;
  color: white;
  border-color: #0d6efd;
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
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
