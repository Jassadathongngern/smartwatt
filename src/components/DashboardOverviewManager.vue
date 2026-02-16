<script setup>
import { ref, computed } from "vue";
import EnergyUsageChart from "./EnergyUsageChart.vue";
import { useBuildingData } from "../composables/useBuildingData";

// --- Use the composable to get shared reactive data ---
const {
  gatewayStatus,
  lastUpdate,
  allBuildingTotal,
  floorData,
  voltage,
  current,
  // power, // ไม่ได้ใช้ในหน้านี้ (ใช้ allBuildingTotal แทน)
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
const alertData = ref({ count: 0, message: "System Normal", link: "#" });

// The livePower for the manager chart should be the total of all floors
const floor3TotalRef = allBuildingTotal; // Or a more specific value if needed, for now, we use the grand total.

// --- Local helper functions for UI ---
const selectTimeRange = (range) => {
  timeRange.value = range;
};
const selectAllFloors = () => {
  if (selectedFloors.value.length === 3) {
    selectedFloors.value = [];
  } else {
    selectedFloors.value = ["1", "2", "3"];
  }
};
const toggleFloor = (floor) => {
  if (selectedFloors.value.includes(floor)) {
    selectedFloors.value = selectedFloors.value.filter((f) => f !== floor);
  } else {
    selectedFloors.value.push(floor);
  }
};

const isLoading = computed(() => gatewayStatus.value === "Connecting...");
</script>

<template>
  <div class="dashboard-overview">
    <div class="header-bar">
      <h2>Dashboard Overview (Manager)</h2>
      <div class="status-bar">
        Gateway:
        <span class="status-badge" :class="gatewayStatus === 'Active' ? 'online' : 'offline'">
          <span v-if="gatewayStatus === 'Active'" class="live-indicator"></span>
          {{ gatewayStatus }}
        </span>
        <span class="last-update">Last Update: {{ lastUpdate }}</span>
      </div>
    </div>

    <div class="chart-section full-width-chart glass-effect">
      <div class="chart-header">
        <div class="header-left">
          <h3>POWER CONSUMPTION ANALYSIS</h3>
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
              :class="{ active: selectedFloors.includes(floor) && selectedFloors.length !== 3 }"
              @click="toggleFloor(floor)"
            >
              Floor {{ floor }}
            </button>
          </div>
        </div>
      </div>

      <div style="height: 350px; width: 100%; min-width: 0">
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
          <div class="stat-card warning glass-effect">
            <p class="label">TOTAL BUILDING POWER</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>
                  {{ allBuildingTotal }} <small style="font-size: 1rem; color: #666">W</small>
                </h3>
                <span class="trend" :class="allBuildingTotal > 15000 ? 'bad' : 'good'">
                  {{ allBuildingTotal > 15000 ? "High Load" : "Normal" }}
                  <small>All Floors</small>
                </span>
              </template>
            </div>
          </div>

          <div class="stat-card primary glass-effect">
            <p class="label">VOLTAGE</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ voltage }} <small style="font-size: 1rem; color: #666">V</small></h3>
                <span class="trend neutral">Live<small>Sensor</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card info glass-effect">
            <p class="label">CURRENT</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ current }} <small style="font-size: 1rem; color: #666">A</small></h3>
                <span class="trend neutral">Live<small>Sensor</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card success glass-effect">
            <p class="label">DAILY ENERGY</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ dailyEnergy }} <small style="font-size: 1rem; color: #666">kWh</small></h3>
                <span class="trend good">▲ 1%<small>vs yesterday</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card warning glass-effect">
            <p class="label">COST</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ cost }} <small style="font-size: 1rem; color: #666">฿</small></h3>
                <span class="trend neutral">Normal<small>Rate</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card secondary glass-effect">
            <p class="label">TOTAL USAGE</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ totalUsage }} <small style="font-size: 1rem; color: #666">MWh</small></h3>
                <span class="trend neutral">Year<small>to date</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card success glass-effect">
            <p class="label">AVG TEMP</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ temperature }} <small style="font-size: 1rem; color: #666">°C</small></h3>
                <span class="trend good">Good<small>Cooling</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card info glass-effect">
            <p class="label">HUMIDITY</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ humidity }} <small style="font-size: 1rem; color: #666">%</small></h3>
                <span class="trend neutral">Optimal<small>Range</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card info glass-effect">
            <p class="label">PM2.5</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ pm25 }} <small style="font-size: 1rem; color: #666">µg/m³</small></h3>
                <span class="trend good">Safe<small>Air Quality</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card success glass-effect">
            <p class="label">STATUS</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>100%</h3>
                <span class="trend good">Online<small>System OK</small></span>
              </template>
            </div>
          </div>

          <div class="stat-card alert glass-effect">
            <p class="label">ALERTS</p>
            <div class="stat-content">
              <div v-if="isLoading" class="skeleton skeleton-value"></div>
              <template v-else>
                <h3>{{ alertData.count }}</h3>
                <a :href="alertData.link" class="alert-btn-soft">
                  ⚠️ {{ alertData.message }} <span class="arrow">→</span>
                </a>
              </template>
            </div>
          </div>
        </div>
      </div>

      <div class="hierarchy-area glass-effect">
        <div class="area-header">
          <h3>Building Status</h3>
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
  overflow-x: hidden; /* Fix chart not resizing */
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
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(13, 110, 253, 0.3);
  transform: translateY(0);
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
  border: 1px solid rgba(255, 255, 255, 0.3);
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
/* Responsive Adjustments */
@media (max-width: 768px) {
  .header-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }

  .status-bar {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .last-update {
    margin-left: 0;
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
    padding: 5px 0;
    width: 100%;
    -webkit-overflow-scrolling: touch;
    gap: 8px;
  }

  .tab-btn {
    white-space: nowrap;
    flex-shrink: 0;
    margin-left: 0;
  }

  .stats-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .stat-card h3 {
    font-size: 1.2rem;
  }
}

@media (max-width: 480px) {
  .dashboard-overview {
    padding: 10px;
  }

  .full-width-chart {
    padding: 15px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .bottom-row {
    flex-direction: column;
  }

  .hierarchy-area {
    min-width: 100%;
  }
}
</style>
