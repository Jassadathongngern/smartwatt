<script setup>
import { ref, computed, onMounted, watch } from "vue";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Bar } from "vue-chartjs";

// --- Firebase Imports ---
import { auth, rtdb } from "../firebase";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { ref as dbRef, onValue, get } from "firebase/database";
import DailyEnergyCalendar from "./DailyEnergyCalendar.vue"; // Import Calendar

const dbFirestore = getFirestore();

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

// --- Auth & Role State ---
const userRole = ref(null); // เก็บ Role ID: 1=Admin, 2=Guest
const isAuthChecked = ref(false);

// --- State & Filters ---
const dateRange = ref("7D");
const selectedFloor = ref("All");
const selectedRoom = ref("All");
const isLoading = ref(false);

// --- Calendar Integration State ---
const showCalendar = ref(false);
const specificDate = ref(null); // For "Single" date mode
const selectedDateLabel = ref("");

// --- Table Filters ---
const filterStatus = ref("All");
const filterTimeSlot = ref("All");

// --- Pagination ---
const currentPage = ref(1);
const itemsPerPage = 20;

// --- Data Storage ---
const buildingConfig = ref({});
const processedLogs = ref([]);

// --- 1. Check User Role & Fetch Config ---
onMounted(async () => {
  // ตรวจสอบสิทธิ์ผู้ใช้ก่อน
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const userSnapshot = await get(dbRef(rtdb, `users/${currentUser.uid}`));
      if (userSnapshot.exists()) {
        userRole.value = userSnapshot.val().role_id;
      }
    } catch (e) {
      console.error("Error checking user role:", e);
    }
  }
  isAuthChecked.value = true;

  // ดึงผังอาคาร
  const configRef = dbRef(rtdb, "building_configs");
  onValue(configRef, (snapshot) => {
    buildingConfig.value = snapshot.val() || {};
    // ดึงข้อมูลประวัติ
    fetchHistoryData();
  });
});

// --- Calendar Interaction ---
const toggleCalendar = () => {
  showCalendar.value = !showCalendar.value;
};

const handleDateSelection = (datePayload) => {
  // datePayload = { dateStr: 'YYYY-MM-DD', displayDate: '...', kwh: ... }
  specificDate.value = datePayload.dateStr;
  selectedDateLabel.value = datePayload.displayDate;

  // Set mode to Single Day
  dateRange.value = "Single";
  showCalendar.value = false; // Close Drawer

  // Fetch data for this specific day
  fetchHistoryData();
};

// --- 2. Fetch History from Cloud Firestore ---
const fetchHistoryData = async () => {
  isLoading.value = true;
  processedLogs.value = [];

  try {
    const logsRef = collection(dbFirestore, "measurements");
    const now = new Date();
    let queryStart = new Date();
    let queryEnd = new Date(); // Default to now

    // Determine Time Range
    if (dateRange.value === "Single" && specificDate.value) {
      // Query specific day 00:00:00 to 23:59:59
      queryStart = new Date(specificDate.value + "T00:00:00");
      queryEnd = new Date(specificDate.value + "T23:59:59");
    } else {
      // Standard Ranges (Backwards from now)
      if (dateRange.value === "24H") queryStart.setHours(now.getHours() - 24);
      else if (dateRange.value === "7D") queryStart.setDate(now.getDate() - 7);
      else if (dateRange.value === "30D") queryStart.setDate(now.getDate() - 30);
      else if (dateRange.value === "1Y") queryStart.setFullYear(now.getFullYear() - 1);
      // Ensure end is 'now' if not single day
      queryEnd = now;
    }

    const q = query(
      logsRef,
      where("timestamp", ">=", queryStart),
      where("timestamp", "<=", queryEnd),
      orderBy("timestamp", "desc"),
      limit(2000),
    );

    const snapshot = await getDocs(q);
    const tempLogs = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      let recordDate;

      if (data.timestamp && data.timestamp.toDate) {
        recordDate = data.timestamp.toDate();
      } else if (data.timestamp) {
        recordDate = new Date(data.timestamp);
      } else {
        return;
      }

      const deviceId = data.device_name || data.devEui || "Unknown";
      const floor = getFloorOfDevice(deviceId);
      const room = getRoomOfDevice(deviceId);

      // กรอง Floor/Room เบื้องต้น
      if (selectedFloor.value !== "All" && floor !== selectedFloor.value) return;
      if (selectedRoom.value !== "All" && room !== selectedRoom.value) return;

      const powerVal = Number(data.power || 0);

      tempLogs.push({
        rawTime: recordDate.getTime(),
        timeObj: recordDate,
        time: recordDate.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
        date: recordDate.toLocaleDateString("th-TH"),
        floor: `Floor ${floor}`,
        room: room,
        deviceId: deviceId,
        power: powerVal,
        volt: Number(data.voltage || data.v || 0),
        amp: Number(data.current || data.a || 0),
        pf: Number(data.pf || 0.95),
        temp: Number(data.temperature || data.temp || 0),
        status: data.status || "Normal",
        isWarning: powerVal > 2000,
      });
    });

    processedLogs.value = tempLogs;
    currentPage.value = 1;
  } catch (error) {
    console.error("Firestore Fetch Error:", error);
  } finally {
    isLoading.value = false;
  }
};

// --- Helper Functions ---
const getFloorOfDevice = (deviceId) => {
  if (!buildingConfig.value) return "Unknown";
  for (const [floorKey, floorData] of Object.entries(buildingConfig.value)) {
    if (floorData.rooms) {
      for (const room of Object.values(floorData.rooms)) {
        if (room.deviceId === deviceId) {
          return floorKey.replace("floor_", "") || floorKey;
        }
      }
    }
  }
  return "Unknown";
};

const getRoomOfDevice = (deviceId) => {
  if (!buildingConfig.value) return "Unknown";
  for (const floorData of Object.values(buildingConfig.value)) {
    if (floorData.rooms) {
      for (const [rName, rData] of Object.entries(floorData.rooms)) {
        if (rData.deviceId === deviceId) return rName;
      }
    }
  }
  return "Unknown";
};

// --- Advanced Filtering Logic ---
const filteredLogs = computed(() => {
  return processedLogs.value.filter((log) => {
    // กรองสถานะ Warning
    if (filterStatus.value === "Warning" && !log.isWarning) return false;
    if (filterStatus.value === "Normal" && log.isWarning) return false;

    // กรองช่วงเวลา Day/Night
    if (filterTimeSlot.value !== "All") {
      const hour = log.timeObj.getHours();
      const isDay = hour >= 8 && hour < 17;
      if (filterTimeSlot.value === "Day" && !isDay) return false;
      if (filterTimeSlot.value === "Night" && isDay) return false;
    }
    return true;
  });
});

// --- Pagination Logic ---
const totalPages = computed(() => {
  return Math.ceil(filteredLogs.value.length / itemsPerPage) || 1;
});

const paginatedLogs = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  return filteredLogs.value.slice(start, start + itemsPerPage);
});

const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++;
};
const prevPage = () => {
  if (currentPage.value > 1) currentPage.value--;
};

// --- Watchers ---
watch([selectedFloor, selectedRoom, dateRange], () => fetchHistoryData());
watch(selectedFloor, () => {
  selectedRoom.value = "All";
});
watch([filterStatus, filterTimeSlot], () => {
  currentPage.value = 1;
});

// --- Computed UI Properties ---
const roomOptions = computed(() => {
  const rooms = new Set();
  Object.entries(buildingConfig.value).forEach(([floorKey, floorData]) => {
    const currentFloor = floorKey.replace("floor_", "");
    if (selectedFloor.value !== "All" && currentFloor !== selectedFloor.value) return;
    if (floorData.rooms) {
      Object.keys(floorData.rooms).forEach((r) => rooms.add(r));
    }
  });
  return Array.from(rooms).sort();
});

const kpiPF = computed(() => {
  if (!filteredLogs.value.length) return 0.98;
  const sum = filteredLogs.value.reduce((acc, curr) => acc + curr.pf, 0);
  return (sum / filteredLogs.value.length).toFixed(2);
});

const kpiPeak = computed(() => {
  if (!filteredLogs.value.length) return 0;
  return Math.max(...filteredLogs.value.map((l) => l.power)).toFixed(0);
});

const comparisonData = computed(() => {
  const currentTotal = filteredLogs.value.reduce((acc, curr) => acc + curr.power / 1000, 0);
  const lastMonthTotal = currentTotal > 0 ? currentTotal * 1.2 + 50 : 450.5;
  const displayCurrent = currentTotal > 0 ? currentTotal : 0;
  const diff = lastMonthTotal - displayCurrent;
  return {
    current: displayCurrent.toFixed(1),
    last: lastMonthTotal.toFixed(1),
    percent: lastMonthTotal > 0 ? ((diff / lastMonthTotal) * 100).toFixed(1) : 0,
    isSaving: diff > 0,
  };
});

// --- Chart Computeds ---
const reactiveCorrelationData = computed(() => {
  const dataSlice = filteredLogs.value.slice(0, 20).reverse();
  return {
    labels: dataSlice.map((l) => {
      // Logic: ถ้าดูหลายวัน (7D, 30D, 1Y) ให้โชว์วันที่ด้วย
      if (dateRange.value !== "24H") {
        return `${l.date.substring(0, 5)} ${l.time}`; // ตัดปีออก เอาแค่ DD/MM HH:mm
      }
      return l.time;
    }),
    datasets: [
      {
        label: "Active Power (kW)",
        type: "bar",
        data: dataSlice.map((l) => l.power / 1000),
        backgroundColor: "rgba(54, 162, 235, 0.6)",
        yAxisID: "y",
      },
      {
        label: "Temperature (°C)",
        type: "line",
        data: dataSlice.map((l) => l.temp),
        borderColor: "#ff6384",
        borderWidth: 2,
        yAxisID: "y1",
      },
    ],
  };
});

const reactiveVoltageData = computed(() => {
  const dataPoints = filteredLogs.value.slice(0, 30).reverse();
  return {
    labels: dataPoints.map((l) => {
      if (dateRange.value !== "24H") {
        return `${l.date.substring(0, 5)} ${l.time}`;
      }
      return l.time;
    }),
    datasets: [
      {
        label: "Phase A (V)",
        data: dataPoints.map((l) => l.volt),
        borderColor: "#36a2eb",
        tension: 0.4,
        pointRadius: 2,
      },
    ],
  };
});

const reactiveLoadProfile = computed(() => {
  const dataPoints = filteredLogs.value.slice(0, 50).reverse();
  return {
    labels: dataPoints.map((l) => {
      if (dateRange.value !== "24H") {
        return `${l.date.substring(0, 5)} ${l.time}`;
      }
      return l.time;
    }),
    datasets: [
      {
        label: "Total Load (kW)",
        data: dataPoints.map((l) => l.power / 1000),
        borderColor: "#4bc0c0",
        backgroundColor: "rgba(75, 192, 192, 0.2)",
        fill: true,
        tension: 0.4,
      },
    ],
  };
});

const mixedChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  scales: {
    y: {
      type: "linear",
      display: true,
      position: "left",
      title: { display: true, text: "Active Power (kW)" },
    },
    y1: {
      type: "linear",
      display: true,
      position: "right",
      grid: { drawOnChartArea: false },
      title: { display: true, text: "Temperature (°C)" },
    },
  },
};

const voltageOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: { y: { min: 200, max: 240, title: { display: true, text: "Voltage (V)" } } },
};

// --- Export Function (มีสิทธิ์เฉพาะ Admin) ---
const handleExport = () => {
  const headers = [
    "Date",
    "Time",
    "Floor",
    "Room",
    "Device",
    "Power (W)",
    "Voltage (V)",
    "Current (A)",
    "PF",
  ];
  const rows = filteredLogs.value.map((log) => [
    log.date,
    log.time,
    log.floor,
    log.room,
    log.deviceId,
    log.power,
    log.volt,
    log.amp,
    log.pf,
  ]);
  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `SmartWatt_Report_${selectedFloor.value}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
</script>

<template>
  <div class="analytics-page">
    <!-- Premium Header Section -->
    <div class="page-header">
      <div class="header-content">
        <div>
          <h1 class="page-title">Energy Analytics</h1>
          <p class="page-subtitle">Real-time performance & environmental insights</p>
        </div>

        <!-- Action Group -->
        <div class="action-group">
          <button v-if="userRole === 1" @click="handleExport" class="btn-premium icon-btn">
            <!-- Simple Download Icon -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      <!-- Unified Control Bar -->
      <div class="control-bar">
        <!-- Date Selection Group -->
        <div class="control-group">
          <label class="group-label">Time Range</label>
          <div class="toggle-group">
            <button
              @click="toggleCalendar"
              class="toggle-btn calendar-trigger"
              :class="{ active: showCalendar || dateRange === 'Single' }"
            >
              📅 {{ dateRange === "Single" ? selectedDateLabel : "Custom Date" }}
            </button>
            <div class="divider"></div>
            <button
              v-for="range in ['24H', '7D', '30D', '1Y']"
              :key="range"
              class="toggle-btn"
              :class="{ active: dateRange === range }"
              @click="
                dateRange = range;
                showCalendar = false;
              "
            >
              {{ range }}
            </button>
          </div>
        </div>

        <!-- Location Filtering Group -->
        <div class="control-group">
          <label class="group-label">Location</label>
          <div class="select-group">
            <div class="custom-select">
              <select v-model="selectedFloor">
                <option value="All">All Floors</option>
                <option value="1">Floor 1</option>
                <option value="2">Floor 2</option>
                <option value="3">Floor 3</option>
              </select>
              <div class="select-arrow">▼</div>
            </div>

            <div class="custom-select">
              <select v-model="selectedRoom" :disabled="selectedFloor === 'All'">
                <option value="All">All Rooms</option>
                <option v-for="room in roomOptions" :key="room" :value="room">
                  Room {{ room }}
                </option>
              </select>
              <div class="select-arrow">▼</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Calendar Drawer -->
    <transition name="slide-down">
      <div v-if="showCalendar" class="calendar-drawer-wrapper">
        <div class="drawer-content">
          <DailyEnergyCalendar :is-selection-mode="true" @date-selected="handleDateSelection" />
        </div>
      </div>
    </transition>

    <div class="kpi-grid">
      <div class="kpi-card highlight-card">
        <div class="card-top-row">
          <p class="kpi-label">MONTHLY COMPARISON</p>
          <span class="badge" :class="comparisonData.isSaving ? 'ok' : 'warn'">
            {{ comparisonData.isSaving ? "▼" : "▲" }} {{ comparisonData.percent }}%
          </span>
        </div>
        <div class="mt-2">
          <h3 class="text-blue-600">
            {{ comparisonData.current }} <small class="text-gray-500">kWh</small>
          </h3>
          <p class="text-xs text-gray-500 mt-1">vs Last Month: {{ comparisonData.last }} kWh</p>
        </div>
      </div>

      <div class="kpi-card">
        <div class="card-top-row">
          <p class="kpi-label">POWER FACTOR (AVG)</p>
        </div>
        <h3 class="text-green-600">{{ kpiPF }}</h3>
        <div class="progress-bar">
          <div :style="{ width: kpiPF * 100 + '%' }" class="bg-green-500"></div>
        </div>
      </div>

      <div class="kpi-card">
        <div class="card-top-row">
          <p class="kpi-label">PEAK DEMAND</p>
        </div>
        <h3 class="text-red-500">{{ (kpiPeak / 1000).toFixed(2) }} kW</h3>
        <div class="progress-bar">
          <div style="width: 85%" class="bg-red-500"></div>
        </div>
      </div>

      <div class="kpi-card">
        <div class="card-top-row">
          <p class="kpi-label">VOLTAGE UNBALANCE</p>
        </div>
        <h3>0.5%</h3>
        <div class="progress-bar">
          <div style="width: 10%" class="bg-blue-500"></div>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">Loading data from Cloud Firestore...</div>

    <div v-else>
      <div class="chart-section">
        <div class="chart-header-row">
          <div>
            <h3>Energy vs Temperature Correlation</h3>
            <small>แสดงข้อมูล: Floor {{ selectedFloor }} | Room {{ selectedRoom }}</small>
          </div>
        </div>
        <div class="chart-container large">
          <Bar :data="reactiveCorrelationData" :options="mixedChartOptions" />
        </div>
      </div>

      <div class="grid-row">
        <div class="chart-section half">
          <div class="chart-header-row">
            <h3>Voltage Stability</h3>
          </div>
          <div class="chart-container medium">
            <Line :data="reactiveVoltageData" :options="voltageOptions" />
          </div>
        </div>
        <div class="chart-section half">
          <div class="chart-header-row">
            <h3>Load Profile (Active Power)</h3>
          </div>
          <div class="chart-container medium">
            <Line
              :data="reactiveLoadProfile"
              :options="{ responsive: true, maintainAspectRatio: false }"
            />
          </div>
        </div>
      </div>

      <div v-if="userRole === 1" class="table-section">
        <div class="chart-header-row table-header-flex">
          <h3>Detailed Metrics Log</h3>
          <div class="table-filters">
            <div class="custom-select-wrapper">
              <select v-model="filterStatus" class="custom-select">
                <option value="All">Status: All</option>
                <option value="Normal">Status: Normal</option>
                <option value="Warning">Status: Warning Only</option>
              </select>
            </div>

            <div class="custom-select-wrapper">
              <select v-model="filterTimeSlot" class="custom-select">
                <option value="All">Time: All Day</option>
                <option value="Day">Time: Day (08:00-17:00)</option>
                <option value="Night">Time: Night (17:00-08:00)</option>
              </select>
            </div>
          </div>
        </div>

        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Floor</th>
                <th>Room</th>
                <th>Power (W)</th>
                <th>Volt (V)</th>
                <th>Current (A)</th>
                <th>PF</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(log, index) in paginatedLogs"
                :key="index"
                :style="log.isWarning ? 'background: #fff3cd;' : ''"
              >
                <td>{{ log.date }} {{ log.time }}</td>
                <td>{{ log.floor }}</td>
                <td>
                  <span class="room-tag">{{ log.room }}</span>
                </td>
                <td :class="log.isWarning ? 'text-red-600 font-bold' : ''">{{ log.power }} W</td>
                <td>{{ log.volt }} V</td>
                <td>{{ log.amp }} A</td>
                <td :class="log.isWarning ? 'text-red-600' : ''">{{ log.pf }}</td>
                <td>
                  <span class="badge" :class="log.isWarning ? 'warn' : 'ok'">{{ log.status }}</span>
                </td>
              </tr>
              <tr v-if="filteredLogs.length === 0">
                <td colspan="8" class="empty-table">No data matches your filters.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pagination-controls" v-if="filteredLogs.length > 0">
          <button @click="prevPage" :disabled="currentPage === 1" class="page-btn">Previous</button>
          <span class="page-info">Page {{ currentPage }} of {{ totalPages }}</span>
          <button @click="nextPage" :disabled="currentPage === totalPages" class="page-btn">
            Next
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* --- Main Layout --- */
.analytics-page {
  padding: 30px;
  background-color: #f8f9fc; /* Softer gray-blue background */
  min-height: 100vh;
  font-family: "Inter", sans-serif;
  color: #1e293b;
}

/* --- Header Section --- */
.page-header {
  margin-bottom: 35px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 25px;
}

.page-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.page-subtitle {
  color: #64748b;
  font-size: 0.95rem;
  margin-top: 4px;
}

/* --- Control Bar (Glass / Card Effect) --- */
.control-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 10px 20px;
  border-radius: 16px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.05),
    0 2px 4px -1px rgba(0, 0, 0, 0.03);
  border: 1px solid #f1f5f9;
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

/* --- Toggle Buttons (Date Range) --- */
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
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
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

.divider {
  width: 1px;
  height: 16px;
  background: #cbd5e1;
  margin: 0 4px;
}

.calendar-trigger {
  color: #3b82f6; /* Highlight calendar button slightly */
  display: flex;
  align-items: center;
  gap: 6px;
}

/* --- Select Group --- */
.select-group {
  display: flex;
  gap: 12px;
}

.custom-select {
  position: relative;
  width: 160px;
}

.custom-select select {
  width: 100%;
  appearance: none;
  -webkit-appearance: none;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 8px 32px 8px 12px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  color: #334155;
  cursor: pointer;
  transition: all 0.2s;
}

.custom-select select:hover {
  border-color: #cbd5e1;
  background: white;
}

.custom-select select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.select-arrow {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.7rem;
  color: #94a3b8;
  pointer-events: none;
}

/* --- Premium Buttons --- */
.btn-premium {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1e293b; /* Dark Navy for premium feel */
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  transition: all 0.2s;
}
.btn-premium:hover {
  background: #334155;
  transform: translateY(-1px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}
.btn-premium:active {
  transform: translateY(0);
}

/* --- Calendar Drawer --- */
/* Wrapper for smooth height transition */
.calendar-drawer-wrapper {
  overflow: hidden;
  margin-bottom: 25px;
}

.drawer-content {
  background: white;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  /* Add padding if needed within the drawer container */
}

/* Animation */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  max-height: 800px;
  opacity: 1;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-10px);
}

/* KPI Grid */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
  margin-bottom: 25px;
}

.kpi-card {
  background: white;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
  border: 1px solid #e9ecef;
  position: relative;
}

.highlight-card {
  border-left: 4px solid #3b82f6;
}

.card-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.kpi-label {
  font-size: 0.8rem;
  color: #6c757d;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.progress-bar {
  height: 6px;
  background: #e9ecef;
  border-radius: 3px;
  margin-top: 15px;
  overflow: hidden;
}

.progress-bar div {
  height: 100%;
  border-radius: 3px;
}

/* Chart Sections */
.chart-section {
  background: white;
  padding: 25px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  margin-bottom: 25px;
  border: 1px solid #e9ecef;
}

.chart-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.chart-container {
  position: relative;
}
.chart-container.large {
  height: 400px;
}
.chart-container.medium {
  height: 300px;
}

/* Grid Row */
.grid-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 25px;
  margin-bottom: 25px;
}

@media (max-width: 1024px) {
  .grid-row {
    grid-template-columns: 1fr;
  }
}

/* Table Section */
.table-section {
  background: white;
  padding: 25px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  border: 1px solid #e9ecef;
}

.table-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px;
}

.table-filters {
  display: flex;
  gap: 10px;
}

.table-responsive {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 15px;
}

th {
  background: #f8f9fa;
  padding: 12px;
  text-align: left;
  font-weight: 600;
  color: #495057;
  border-bottom: 2px solid #e9ecef;
}

td {
  padding: 12px;
  border-bottom: 1px solid #f1f3f5;
  color: #212529;
}

/* Badges */
.badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
}
.badge.ok {
  background: #d3f9d8;
  color: #2b8a3e;
}
.badge.warn {
  background: #ffec99;
  color: #e67700;
}

.room-tag {
  background: #e7f5ff;
  color: #1c7ed6;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
}

/* Pagination */
.pagination-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-top: 25px;
}

.page-btn {
  background: #fff;
  border: 1px solid #dee2e6;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  color: #495057;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-btn:not(:disabled):hover {
  background: #e9ecef;
  border-color: #ced4da;
}
</style>
