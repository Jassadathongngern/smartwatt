<template>
  <div class="calendar-container" :class="{ 'is-page': !isSelectionMode }">
    <div class="header-bar">
      <div>
        <h2 v-if="!isSelectionMode" class="text-2xl font-bold text-gray-800">
          Energy & Envi Calendar
        </h2>
        <h3 v-else class="text-lg font-semibold text-gray-700">Select Date to View</h3>
        <p v-if="!isSelectionMode" class="text-sm text-gray-500">
          ตรวจสอบประวัติการใช้ไฟฟ้าและสภาพแวดล้อม (Temperature, Humidity, PM2.5)
        </p>
      </div>
      <div class="month-controls">
        <button @click="changeMonth(-1)" class="control-btn" :disabled="isLoading">&lt;</button>
        <span class="month-label">{{ currentMonthName }} {{ currentYear }}</span>
        <button @click="changeMonth(1)" class="control-btn" :disabled="isLoading">&gt;</button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="spinner"></div>
      <p>กำลังโหลดข้อมูล...</p>
    </div>

    <!-- Calendar Grid -->
    <div class="calendar-grid" :class="{ opacity: isLoading }">
      <!-- Weekdays Header -->
      <div class="weekday" v-for="day in weekdays" :key="day">{{ day }}</div>

      <!-- Padding Days -->
      <div v-for="n in paddingDays" :key="'pad-' + n" class="day padding"></div>

      <!-- Calendar Days -->
      <div
        v-for="day in daysInMonth"
        :key="day.dateStr"
        class="day"
        :class="getDayClass(day)"
        @click="handleDayClick(day)"
      >
        <span class="day-number">{{ day.dayNum }}</span>
        <div v-if="day.kwh !== null" class="energy-info">
          <span class="kwh">{{ day.kwh }} kWh</span>
          <div class="mini-stats">
            <span v-if="day.avgTemp" class="mini-stat t" title="Temp">{{ day.avgTemp }}°</span>
            <span v-if="day.avgHum" class="mini-stat h" title="Hum">{{ day.avgHum }}%</span>
            <span v-if="day.avgDust" class="mini-stat d" title="PM2.5">{{ day.avgDust }}</span>
          </div>
          <span class="status-dot" :class="day.status"></span>
        </div>
        <div v-else class="no-data">-</div>
      </div>
    </div>

    <!-- Modal for Daily Detail (Only if NOT in selection mode) -->
    <div v-if="!isSelectionMode && selectedDay" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Daily Report: {{ selectedDay.displayDate }}</h3>
          <button @click="closeModal" class="close-btn">&times;</button>
        </div>

        <div v-if="modalLoading" class="modal-body loading">
          <div class="spinner"></div>
        </div>

        <div v-else class="modal-body">
          <div class="grid-stats">
            <div class="stat-card blue">
              <span class="label">Total Energy</span>
              <span class="value">{{ selectedDayModalData.totalKwh }} kWh</span>
              <span class="sub">฿{{ (selectedDayModalData.totalKwh * 4.5).toFixed(2) }}</span>
            </div>
            <div class="stat-card red">
              <span class="label">Avg Temp</span>
              <span class="value">{{ selectedDayModalData.avgTemp }}°C</span>
            </div>
            <div class="stat-card green">
              <span class="label">Avg Humidity</span>
              <span class="value">{{ selectedDayModalData.avgHum }}%</span>
            </div>
            <div class="stat-card orange">
              <span class="label">Avg PM2.5</span>
              <span class="value">{{ selectedDayModalData.avgDust }} µg</span>
            </div>
          </div>

          <div class="chart-box">
            <h4>Hourly Consumption (Real Data)</h4>
            <div class="chart-container">
              <Bar :data="hourlyChartData" :options="chartOptions" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { getFirestore, collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { useBuildingData } from "../composables/useBuildingData";
import { normalizeMeasurement } from "../utils/measurementUtils";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "vue-chartjs";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const props = defineProps({
  isSelectionMode: { type: Boolean, default: false },
});

const emit = defineEmits(["date-selected"]);

const db = getFirestore();
const currentDate = ref(new Date());
const selectedDay = ref(null);
const selectedDayModalData = ref({ totalKwh: 0, avgTemp: 0, avgHum: 0, avgDust: 0 });
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthlyData = ref({});
const isLoading = ref(false);
const modalLoading = ref(false);
const hourlyData = ref(new Array(24).fill(0));

const { deviceMappings, getFloorOfDevice, getRoomOfDevice } = useBuildingData();

const currentYear = computed(() => currentDate.value.getFullYear());
const currentMonth = computed(() => currentDate.value.getMonth());
const currentMonthName = computed(() =>
  currentDate.value.toLocaleString("default", { month: "long" }),
);

const fetchMonthData = async () => {
  console.log("[Calendar] fetchMonthData triggered");
  isLoading.value = true;
  monthlyData.value = {};

  try {
    const year = currentYear.value;
    const month = currentMonth.value;
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);

    // Helper: format Date to "YYYY-MM-DD HH:MM:SS" (Thai Timezone)
    const formatToThaiString = (date) => {
      const pad = (num) => String(num).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    const startStr = formatToThaiString(startDate);
    const endStr = formatToThaiString(endDate);

    const q = query(
      collection(db, "measurements"),
      where("timestamp", ">=", startStr),
      where("timestamp", "<=", endStr),
      orderBy("timestamp", "asc"),
    );

    const snapshot = await getDocs(q);
    const tempDaily = {};

    if (snapshot.empty) {
      console.warn(
        `[Calendar] No records found for this period (${startDate.toISOString()} to ${endDate.toISOString()})`,
      );
    } else {
      console.log(`[Calendar] Found ${snapshot.size} documents in Firestore.`);
    }

    snapshot.forEach((doc) => {
      const records = normalizeMeasurement(
        doc,
        deviceMappings.value,
        getFloorOfDevice,
        getRoomOfDevice,
      );

      records.forEach((record) => {
        const y = record.rawTimestamp.getFullYear();
        const m = String(record.rawTimestamp.getMonth() + 1).padStart(2, "0");
        const d = String(record.rawTimestamp.getDate()).padStart(2, "0");
        const dateKey = `${y}-${m}-${d}`;

        if (!tempDaily[dateKey]) {
          tempDaily[dateKey] = {
            deviceEnergies: {}, // { fullDeviceId: [e1, e2, ...] }
            sumTemp: 0,
            countTemp: 0,
            sumHum: 0,
            countHum: 0,
            sumDust: 0,
            countDust: 0,
          };
        }

        if (typeof record.energy === "number" && !isNaN(record.energy)) {
          const devKey = record.fullDeviceId;
          if (!tempDaily[dateKey].deviceEnergies[devKey]) {
            tempDaily[dateKey].deviceEnergies[devKey] = [];
          }
          tempDaily[dateKey].deviceEnergies[devKey].push(record.energy);
        }

        if (record.temp !== 0) {
          tempDaily[dateKey].sumTemp += record.temp;
          tempDaily[dateKey].countTemp++;
        }
        if (record.humid !== 0) {
          tempDaily[dateKey].sumHum += record.humid;
          tempDaily[dateKey].countHum++;
        }
        if (record.pm25 !== 0) {
          tempDaily[dateKey].sumDust += record.pm25;
          tempDaily[dateKey].countDust++;
        }
      });
    });

    for (const [key, val] of Object.entries(tempDaily)) {
      let dailyKWh = 0;
      Object.values(val.deviceEnergies).forEach((energies) => {
        if (energies.length >= 2) {
          const earliest = energies[0];
          const latest = energies[energies.length - 1];
          dailyKWh += Math.max(0, latest - earliest);
        }
      });

      monthlyData.value[key] = {
        kwh: parseFloat(dailyKWh.toFixed(2)),
        avgTemp: val.countTemp > 0 ? (val.sumTemp / val.countTemp).toFixed(1) : 0,
        avgHum: val.countHum > 0 ? (val.sumHum / val.countHum).toFixed(1) : 0,
        avgDust: val.countDust > 0 ? (val.sumDust / val.countDust).toFixed(0) : 0,
      };
    }
  } catch (error) {
    console.error("Error fetching month data:", error);
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchMonthData();
});

watch(currentDate, () => {
  fetchMonthData();
});

const daysInMonth = computed(() => {
  const year = currentYear.value;
  const month = currentMonth.value;
  const days = new Date(year, month + 1, 0).getDate();
  const result = [];

  for (let i = 1; i <= days; i++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    const data = monthlyData.value[dateKey];

    let status = "normal";
    if (!data) status = "no-data";
    else if (data.kwh > 200) status = "high";
    else if (data.kwh < 50) status = "low";

    result.push({
      dayNum: i,
      dateStr: dateKey,
      displayDate: `${i} ${currentMonthName.value} ${year}`,
      kwh: data ? data.kwh : null,
      avgTemp: data ? data.avgTemp : null,
      avgHum: data ? data.avgHum : null,
      avgDust: data ? data.avgDust : null,
      status,
    });
  }
  return result;
});

const paddingDays = computed(() => {
  const year = currentYear.value;
  const month = currentMonth.value;
  return new Date(year, month, 1).getDay();
});

const changeMonth = (delta) => {
  currentDate.value = new Date(
    currentDate.value.getFullYear(),
    currentDate.value.getMonth() + delta,
    1,
  );
};

const getDayClass = (day) => {
  return {
    "has-data": day.kwh !== null,
    "status-high": day.status === "high",
    "status-normal": day.status === "normal",
    "status-low": day.status === "low",
    "status-none": day.status === "no-data",
    selected: props.isSelectionMode && selectedDay.value?.dateStr === day.dateStr,
  };
};

const handleDayClick = (day) => {
  if (day.kwh === null) return;

  // Update local selected state
  selectedDay.value = day;

  if (props.isSelectionMode) {
    // Emit date object to parent
    emit("date-selected", {
      dateStr: day.dateStr,
      displayDate: day.displayDate,
      // Pass details if needed for parent to avoid re-fetching
      kwh: day.kwh,
    });
  } else {
    openDayModal(day);
  }
};

const openDayModal = async (day) => {
  if (day.kwh === null) return;
  selectedDay.value = day;
  modalLoading.value = true;
  hourlyData.value = new Array(24).fill(0);

  // Set initial modal data from daily summary (quick view)
  selectedDayModalData.value = {
    totalKwh: day.kwh,
    avgTemp: day.avgTemp,
    avgHum: day.avgHum,
    avgDust: day.avgDust,
  };

  try {
    const start = new Date(day.dateStr + "T00:00:00");
    const end = new Date(day.dateStr + "T23:59:59");

    const formatToThaiString = (date) => {
      const pad = (num) => String(num).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    const startStr = formatToThaiString(start);
    const endStr = formatToThaiString(end);

    const q = query(
      collection(db, "measurements"),
      where("timestamp", ">=", startStr),
      where("timestamp", "<=", endStr),
      orderBy("timestamp", "asc"),
    );

    const snapshot = await getDocs(q);
    const hourlySum = new Array(24).fill(0);
    const hourlyCount = new Array(24).fill(0);

    // Re-calculate precise daily averages from detailed logs just in case
    let sumTemp = 0,
      countTemp = 0;
    let sumHum = 0,
      countHum = 0;
    let sumDust = 0,
      countDust = 0;

    snapshot.forEach((doc) => {
      const records = normalizeMeasurement(
        doc,
        deviceMappings.value,
        getFloorOfDevice,
        getRoomOfDevice,
      );

      records.forEach((record) => {
        const h = record.rawTimestamp.getHours();
        hourlySum[h] += record.power;
        hourlyCount[h]++;

        if (record.temp !== 0) {
          sumTemp += record.temp;
          countTemp++;
        }
        if (record.humid !== 0) {
          sumHum += record.humid;
          countHum++;
        }
        if (record.pm25 !== 0) {
          sumDust += record.pm25;
          countDust++;
        }
      });
    });

    hourlyData.value = hourlySum.map((sum, i) => {
      const count = hourlyCount[i];
      const avgW = count > 0 ? sum / count : 0;
      return parseFloat((avgW / 1000).toFixed(2));
    });

    // Update with more precise averages if available
    if (countTemp > 0) selectedDayModalData.value.avgTemp = (sumTemp / countTemp).toFixed(1);
    if (countHum > 0) selectedDayModalData.value.avgHum = (sumHum / countHum).toFixed(1);
    if (countDust > 0) selectedDayModalData.value.avgDust = (sumDust / countDust).toFixed(0);
  } catch (e) {
    console.error(e);
  } finally {
    modalLoading.value = false;
  }
};

const closeModal = () => {
  selectedDay.value = null;
};

const hourlyChartData = computed(() => ({
  labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`),
  datasets: [
    {
      label: "Energy (kWh)",
      data: hourlyData.value,
      backgroundColor: "#3b82f6",
      borderRadius: 4,
    },
  ],
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.raw} kWh`,
      },
    },
  },
  scales: {
    y: { beginAtZero: true, title: { display: true, text: "kWh" } },
  },
};
</script>

<style scoped>
.calendar-container.is-page {
  padding: 20px;
  background-color: #f8f9fa;
  min-height: 100vh;
  font-family: "Inter", sans-serif;
}

.calendar-container:not(.is-page) {
  padding: 15px;
  background: #fff;
  border-bottom: 2px solid #f1f5f9;
}

.header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.month-controls {
  display: flex;
  align-items: center;
  gap: 15px;
  background: white;
  padding: 5px 15px;
  border-radius: 20px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
  border: 1px solid #e2e8f0;
}

.control-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #666;
  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.month-label {
  font-weight: bold;
  font-size: 1.1rem;
  color: #333;
  width: 140px;
  text-align: center;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 10px;
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
  transition: opacity 0.3s;
  border: 1px solid #f1f5f9;
}
.calendar-grid.opacity {
  opacity: 0.5;
  pointer-events: none;
}

.weekday {
  text-align: center;
  font-weight: bold;
  color: #888;
  padding-bottom: 10px;
  border-bottom: 1px solid #eee;
}

.day {
  height: 110px; /* Increased height for mini stats */
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 8px;
  position: relative;
  cursor: pointer;
  transition: all 0.2s;
  background: white;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.day.has-data:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
  border-color: #3b82f6;
}

.day.selected {
  border: 2px solid #3b82f6;
  background-color: #eff6ff;
}

.day.padding {
  background: #fcfcfc;
  cursor: default;
  border: none;
}

.day-number {
  font-weight: bold;
  color: #444;
  font-size: 0.9rem;
}

.energy-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1;
  justify-content: center;
}

.mini-stats {
  display: flex;
  gap: 4px;
  font-size: 0.65rem;
  color: #666;
  margin-top: 2px;
}
.mini-stat.t {
  color: #ff6384;
}
.mini-stat.h {
  color: #36a2eb;
}
.mini-stat.d {
  color: #ff9f40;
}

.no-data {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ddd;
  font-size: 1.5rem;
}

.kwh {
  font-size: 0.95rem;
  font-weight: 700;
  color: #1e293b;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-top: 4px;
}

.status-high .status-dot {
  background: #ef4444;
}
.status-normal .status-dot {
  background: #10b981;
}
.status-low .status-dot {
  background: #3b82f6;
}

.day.status-high {
  background-color: #fef2f2;
}
.day.status-normal {
  background-color: #f0fdf4;
}
.day.status-none {
  background-color: #fff;
  cursor: default;
}

/* Modal */
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
}

.modal-content {
  background: white;
  padding: 25px;
  border-radius: 16px;
  width: 90%;
  max-width: 650px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
  animation: popIn 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}

@keyframes popIn {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #888;
}

/* New Grid Stats in Modal */
.grid-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
  margin-bottom: 25px;
}

.stat-card {
  background: #f8fafc;
  padding: 15px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  border: 1px solid #e2e8f0;
}
.stat-card.blue {
  border-bottom: 4px solid #3b82f6;
}
.stat-card.red {
  border-bottom: 4px solid #ef4444;
}
.stat-card.green {
  border-bottom: 4px solid #10b981;
}
.stat-card.orange {
  border-bottom: 4px solid #f97316;
}

.stat-card .label {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
  text-transform: uppercase;
}
.stat-card .value {
  font-size: 1.2rem;
  font-weight: 700;
  color: #1e293b;
  margin: 5px 0;
}
.stat-card .sub {
  font-size: 0.7rem;
  color: #94a3b8;
}

.chart-box {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
}
.chart-container {
  height: 250px;
  width: 100%;
}

/* Responsive Grid */
@media (max-width: 600px) {
  .grid-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Spinner */
.loading-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 10;
}
.spinner {
  width: 30px;
  height: 30px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 10px;
}
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
