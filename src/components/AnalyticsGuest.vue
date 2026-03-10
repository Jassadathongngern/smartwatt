<script setup>
import { ref, computed, onMounted, watch } from "vue";
console.error("DEBUG: AnalyticsGuest script loading...");
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

import { auth, rtdb, db } from "../firebase";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { ref as dbRef, onValue, get } from "firebase/database";
import { useBuildingData } from "../composables/useBuildingData";
import DailyEnergyCalendar from "./DailyEnergyCalendar.vue"; // Import Calendar
import { normalizeMeasurement } from "../utils/measurementUtils";

const dbFirestore = db;

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
const dateRange = ref("24H");
const selectedFloor = ref("All");
const selectedRoom = ref("All");
const isLoading = ref(false);
const isMonthlyLoading = ref(false);

// --- Fetch Optimization ---
const fetchLock = ref(false);
let fetchTimeout = null;

const triggerFetch = (type = "all") => {
  if (fetchTimeout) clearTimeout(fetchTimeout);
  fetchTimeout = setTimeout(() => {
    if (type === "history" || type === "all") fetchHistoryData();
    if (type === "monthly" || type === "all") fetchMonthlyComparison();
  }, 100);
};

// 💡 1. State สำหรับเลือกเดือนเปรียบเทียบ
const currentDate = new Date();
const currentMonthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;

const lastDate = new Date();
lastDate.setMonth(lastDate.getMonth() - 1);
const lastMonthStr = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, "0")}`;

const selectedMonth1 = ref(currentMonthStr);
const selectedMonth2 = ref(lastMonthStr);

// --- Calendar Integration State ---
const showCalendar = ref(false);
const specificDate = ref(null);
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

// เก็บข้อมูลสรุปรายเดือนเพื่อทำกราฟเปรียบเทียบ
const month1Summary = ref({ total: 0, days: Array(31).fill(0) });
const month2Summary = ref({ total: 0, days: Array(31).fill(0) });

// --- 1. Check User Role & Fetch Config ---
onMounted(async () => {
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

  console.log("[Analytics] Component Mounted");
  const configRef = dbRef(rtdb, "building_configs");
  onValue(configRef, (snapshot) => {
    console.log("[Analytics] Building Config Loaded");
    buildingConfig.value = snapshot.val() || {};
    fetchHistoryData();
    fetchMonthlyComparison(); // โหลดข้อมูลเปรียบเทียบรายเดือนตอนเปิดหน้า
  });
});

// --- Calendar Interaction ---
const toggleCalendar = () => {
  showCalendar.value = !showCalendar.value;
};

const handleDateSelection = (datePayload) => {
  specificDate.value = datePayload.dateStr;
  selectedDateLabel.value = datePayload.displayDate;
  dateRange.value = "Single";
  showCalendar.value = false;
  fetchHistoryData();
};

// --- 2. Fetch History (สำหรับกราฟล่างและตาราง) ---
const fetchHistoryData = async () => {
  if (fetchLock.value) return;
  fetchLock.value = true;
  isLoading.value = true;

  try {
    const logsRef = collection(dbFirestore, "measurements");
    const now = new Date();
    let queryStart = new Date();
    let queryEnd = new Date();

    if (dateRange.value === "Single" && specificDate.value) {
      queryStart = new Date(specificDate.value + "T00:00:00");
      queryEnd = new Date(specificDate.value + "T23:59:59");
    } else {
      if (dateRange.value === "24H") queryStart.setHours(now.getHours() - 24);
      else if (dateRange.value === "7D") queryStart.setDate(now.getDate() - 7);
      else if (dateRange.value === "30D") queryStart.setDate(now.getDate() - 30);
      else if (dateRange.value === "1Y") queryStart.setFullYear(now.getFullYear() - 1);
      queryEnd = now;
    }

    const formatToThaiString = (date) => {
      const pad = (num) => String(num).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    const startStr = formatToThaiString(queryStart);
    const endStr = formatToThaiString(queryEnd);

    const q = query(
      logsRef,
      where("timestamp", ">=", startStr),
      where("timestamp", "<=", endStr),
      orderBy("timestamp", "desc"),
      limit(500),
    );

    const snapshot = await getDocs(q);
    const tempLogs = [];

    snapshot.forEach((doc) => {
      const records = normalizeMeasurement(
        doc,
        deviceMappings.value,
        getFloorOfDevice,
        getRoomOfDevice,
      );
      records.forEach((record) => {
        // Apply Filters (Remaining component-specific filters)
        if (
          selectedFloor.value !== "All" &&
          record.floor.replace("Floor ", "") !== selectedFloor.value
        )
          return;
        if (selectedRoom.value !== "All" && record.room !== selectedRoom.value) return;
        tempLogs.push(record);
      });
    });

    processedLogs.value = tempLogs;
    currentPage.value = 1;
  } catch (error) {
    console.error("Firestore Fetch Error:", error);
  } finally {
    isLoading.value = false;
    fetchLock.value = false;
  }
};

// --- 3. Fetch Monthly Comparison ---
const fetchMonthlyComparison = async () => {
  if (!selectedMonth1.value || !selectedMonth2.value) return;
  if (fetchLock.value) return; // Note: We share the lock for simplicity as they usually fire together

  isMonthlyLoading.value = true;

  try {
    const logsRef = collection(dbFirestore, "measurements");

    const getMonthRange = (monthStrParam) => {
      const [yearStr, mStr] = monthStrParam.split("-");
      const targetYear = parseInt(yearStr);
      const targetMonth = parseInt(mStr) - 1;
      return {
        start: new Date(targetYear, targetMonth, 1),
        end: new Date(targetYear, targetMonth + 1, 0, 23, 59, 59),
      };
    };

    const range1 = getMonthRange(selectedMonth1.value);
    const range2 = getMonthRange(selectedMonth2.value);

    const formatToThaiString = (date) => {
      const pad = (num) => String(num).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    const start1Str = formatToThaiString(range1.start);
    const end1Str = formatToThaiString(range1.end);
    const start2Str = formatToThaiString(range2.start);
    const end2Str = formatToThaiString(range2.end);

    const q1 = query(
      logsRef,
      where("timestamp", ">=", start1Str),
      where("timestamp", "<=", end1Str),
      orderBy("timestamp", "asc"),
      limit(2000),
    );
    const q2 = query(
      logsRef,
      where("timestamp", ">=", start2Str),
      where("timestamp", "<=", end2Str),
      orderBy("timestamp", "asc"),
      limit(2000),
    );

    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

    const processMonthlySnap = (snap) => {
      let totalEnergy = 0;
      const days = Array(31).fill(0);
      const dailyDeviceData = {}; // { day: { fullDeviceId: [energy1, energy2, ...] } }

      snap.forEach((doc) => {
        const records = normalizeMeasurement(
          doc,
          deviceMappings.value,
          getFloorOfDevice,
          getRoomOfDevice,
        );
        records.forEach((record) => {
          // Apply Filters
          if (
            selectedFloor.value !== "All" &&
            record.floor.replace("Floor ", "") !== selectedFloor.value
          )
            return;
          if (selectedRoom.value !== "All" && record.room !== selectedRoom.value) return;

          // Only process if energy field exists and is valid
          if (typeof record.energy !== "number" || isNaN(record.energy)) return;

          const day = record.rawTimestamp.getDate();
          if (!dailyDeviceData[day]) dailyDeviceData[day] = {};

          const devKey = record.fullDeviceId;
          if (!dailyDeviceData[day][devKey]) dailyDeviceData[day][devKey] = [];

          dailyDeviceData[day][devKey].push(record.energy);
        });
      });

      // After collecting all data, calculate daily differences per device
      Object.keys(dailyDeviceData).forEach((dayStr) => {
        const d = parseInt(dayStr);
        let dayTotalKWh = 0;

        Object.values(dailyDeviceData[d]).forEach((energies) => {
          if (energies.length < 2) return; // Need at least 2 points to calculate difference (earliest & latest)

          // Since snapshot is ordered by timestamp ASC from the query,
          // and we pushed in order, energies[0] is earliest and last is latest.
          const earliest = energies[0];
          const latest = energies[energies.length - 1];

          // energy_used = max(0, latest - earliest)
          // Fields are already in kWh per user requirement.
          const diff = Math.max(0, latest - earliest);
          dayTotalKWh += diff;
        });

        totalEnergy += dayTotalKWh;
        if (d >= 1 && d <= 31) days[d - 1] = dayTotalKWh;
      });

      return { total: totalEnergy, days };
    };

    month1Summary.value = processMonthlySnap(snap1);
    month2Summary.value = processMonthlySnap(snap2);
  } catch (error) {
    console.error("Monthly Fetch Error:", error);
  } finally {
    isMonthlyLoading.value = false;
  }
};

const { deviceMappings, getFloorOfDevice, getRoomOfDevice } = useBuildingData();

// --- Advanced Filtering Logic ---
const filteredLogs = computed(() => {
  return processedLogs.value.filter((log) => {
    if (filterStatus.value === "Warning" && !log.isWarning) return false;
    if (filterStatus.value === "Normal" && log.isWarning) return false;

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
  const powerCount = filteredLogs.value.filter((l) => l.hasPower).length;
  return Math.ceil(powerCount / itemsPerPage) || 1;
});

const paginatedLogs = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  return filteredLogs.value.filter((l) => l.hasPower).slice(start, start + itemsPerPage);
});

const environmentalLogs = computed(() => {
  return filteredLogs.value.filter((l) => l.hasEnv);
});

const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++;
};
const prevPage = () => {
  if (currentPage.value > 1) currentPage.value--;
};

// --- Watchers ---
watch([selectedFloor, selectedRoom, dateRange], () => triggerFetch("history"));
watch([selectedFloor, selectedRoom, selectedMonth1, selectedMonth2], () => triggerFetch("monthly"));
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
  const validLogs = filteredLogs.value.filter((l) => l.pf > 0);
  if (!validLogs.length) return "0.98"; // Default fallback
  const sum = validLogs.reduce((acc, curr) => acc + curr.pf, 0);
  return (sum / validLogs.length).toFixed(2);
});

const kpiPeak = computed(() => {
  if (!filteredLogs.value.length) return 0;
  return Math.max(...filteredLogs.value.map((l) => l.power)).toFixed(0);
});
//======== ENV SCRIPT ========
const envSummary = computed(() => {
  const logs = environmentalLogs.value;
  if (logs.length === 0) return { temp: 0, humid: 0, dust: 0 };

  let totalTemp = 0;
  let tempCount = 0;
  let totalHumid = 0;
  let humidCount = 0;
  let totalDust = 0;
  let dustCount = 0;

  logs.forEach((log) => {
    if (log.temp > 0) {
      totalTemp += log.temp;
      tempCount++;
    }
    if (log.humid > 0) {
      totalHumid += log.humid;
      humidCount++;
    }
    if (log.dust > 0) {
      totalDust += log.dust;
      dustCount++;
    }
  });

  return {
    temp: tempCount > 0 ? (totalTemp / tempCount).toFixed(1) : "0.0",
    humid: humidCount > 0 ? (totalHumid / humidCount).toFixed(1) : "0.0",
    dust: dustCount > 0 ? (totalDust / dustCount).toFixed(1) : "0.0",
  };
});

//=============================

// สร้างฟังก์ชันช่วยแปลงตัวเลขเดือนเป็นชื่อเดือนเพื่อใช้แสดงผล
const getMonthLabel = (year, monthIndex) => {
  const d = new Date(year, monthIndex);
  return d.toLocaleString("th-TH", { month: "short", year: "numeric" });
};

// --- Date Options for Custom Select (Only show recent months with data) ---
const monthSelectOptions = computed(() => {
  const options = [];
  const d = new Date();

  // สมมติว่าระบบเริ่มเก็บข้อมูลเมื่อต้นปี 2026 เราจะจำกัดการแสดงผลไว้แค่นั้น
  // หรือแสดงแค่ 2-3 เดือนล่าสุดเพื่อให้ไม่โชว์เปรียบเทียบเดือนที่เป็นศูนย์หรืออดีตที่ไม่มีฮาร์ดแวร์
  // ในที่นี้จะจำกัดให้ย้อนหลังได้แค่ 2 เดือน (เดือนปัจจุบัน, เดือนก่อนหน้า, เดือนก่อนหน้าอีกหนึ่ง)
  for (let i = 0; i < 3; i++) {
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const value = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    const label = getMonthLabel(year, monthIndex);
    options.push({ value, label });
    d.setMonth(d.getMonth() - 1);
  }
  return options;
});

const comparisonData = computed(() => {
  const currentTotal = month1Summary.value.total;
  const lastMonthTotal = month2Summary.value.total;
  const diff = currentTotal - lastMonthTotal;
  let percent = 0;

  if (lastMonthTotal > 0) {
    percent = (Math.abs(diff) / lastMonthTotal) * 100;
  }

  // ดึงป้ายกำกับเดือนมาแสดงในการ์ด KPI
  const [year1, m1] = selectedMonth1.value.split("-");
  const month1Label = getMonthLabel(parseInt(year1), parseInt(m1) - 1);

  const [year2, m2] = selectedMonth2.value.split("-");
  const month2Label = getMonthLabel(parseInt(year2), parseInt(m2) - 1);

  return {
    current: currentTotal.toFixed(1),
    last: lastMonthTotal.toFixed(1),
    percent: percent.toFixed(1),
    isSaving: currentTotal <= lastMonthTotal,
    month1Label: month1Label,
    month2Label: month2Label,
  };
});

// --- Chart Computeds ---

// 💡 4. ข้อมูลกราฟแท่งที่เปลี่ยนชื่อป้ายกำกับ (Label) อัตโนมัติตามเดือนที่เลือก
const monthlyChartData = computed(() => {
  const [year1, m1] = selectedMonth1.value.split("-");
  const label1 = getMonthLabel(parseInt(year1), parseInt(m1) - 1);

  const [year2, m2] = selectedMonth2.value.split("-");
  const label2 = getMonthLabel(parseInt(year2), parseInt(m2) - 1);

  const daysLabel = Array.from({ length: 31 }, (_, i) => `${i + 1}`);

  return {
    labels: daysLabel,
    datasets: [
      {
        label: `${label1} (kWh)`,
        data: month1Summary.value.days,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        fill: true,
        tension: 0.4,
        pointRadius: 2,
      },
      {
        label: `${label2} (kWh)`,
        data: month2Summary.value.days,
        borderColor: "#ef4444",
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        fill: true,
        tension: 0.4,
        pointRadius: 2,
      },
    ],
  };
});

const monthlyLineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: "top" },
    tooltip: { mode: "index", intersect: false },
  },
  scales: {
    x: {
      title: { display: true, text: "วันที่ของเดือน" },
    },
    y: {
      beginAtZero: true,
      title: { display: true, text: "พลังงาน (kWh)" },
    },
  },
};

const reactiveCorrelationData = computed(() => {
  // 1. Group by time string to avoid duplicate X-axis labels (Multiple nodes reporting at the same time)
  const grouped = {};
  filteredLogs.value.forEach((log) => {
    // Determine label based on date range (24H uses time, others use Date+Time)
    const tLabel = dateRange.value === "24H" ? log.time : `${log.date.substring(0, 5)} ${log.time}`;

    if (!grouped[tLabel]) grouped[tLabel] = { powerSum: 0, pCount: 0, tempSum: 0, tCount: 0 };

    if (log.hasPower && log.power > 0) {
      grouped[tLabel].powerSum += Number(log.power);
      grouped[tLabel].pCount++;
    }
    // Only average nodes that report valid environment data
    if (log.hasEnv && log.temp > 0) {
      grouped[tLabel].tempSum += Number(log.temp);
      grouped[tLabel].tCount++;
    }
  });

  // 2. Sort and slice to show relevant historical data (Latest 30 points)
  const sortedLabels = Object.keys(grouped).sort().slice(-30);

  return {
    labels: sortedLabels,
    datasets: [
      {
        label: "กำลังไฟฟ้า (kW)",
        type: "bar",
        data: sortedLabels.map((lab) =>
          grouped[lab].pCount > 0 ? grouped[lab].powerSum / grouped[lab].pCount / 1000 : 0,
        ),
        backgroundColor: "rgba(54, 162, 235, 0.6)",
        yAxisID: "y",
        borderRadius: 4,
      },
      {
        label: "อุณหภูมิ (°C)",
        type: "line",
        data: sortedLabels.map((lab) =>
          grouped[lab].tCount > 0 ? grouped[lab].tempSum / grouped[lab].tCount : null,
        ),
        borderColor: "#ff6384",
        backgroundColor: "transparent",
        borderWidth: 3,
        pointRadius: 3,
        tension: 0.4,
        yAxisID: "y1",
        spanGaps: true,
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
        label: "เฟส A (V)",
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
        label: "โหลดรวม (kW)",
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
  plugins: {
    legend: { position: "top" },
    tooltip: {
      backgroundColor: "rgba(255, 255, 255, 0.9)",
      titleColor: "#1e293b",
      bodyColor: "#475569",
      borderColor: "#e2e8f0",
      borderWidth: 1,
    },
  },
  scales: {
    y: {
      type: "linear",
      display: true,
      position: "left",
      min: 0,
      max: 5, // Peak scale for ACs
      title: { display: true, text: "กำลังไฟฟ้า (kW)", font: { weight: "bold" } },
      grid: { color: "rgba(0, 0, 0, 0.05)" },
    },
    y1: {
      type: "linear",
      display: true,
      position: "right",
      min: 20,
      max: 40, // Range for room temperature
      grid: { drawOnChartArea: false },
      title: { display: true, text: "อุณหภูมิ (°C)", font: { weight: "bold" } },
    },
  },
};

const voltageOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: { y: { min: 200, max: 240, title: { display: true, text: "แรงดันไฟฟ้า (V)" } } },
};

// --- Export Function (มีสิทธิ์เฉพาะ Admin) ---
const handleExport = () => {
  const headers = [
    "วัน-เวลา",
    "ชั้น",
    "ห้อง",
    "กำลังไฟฟ้า (W)",
    "แรงดันไฟฟ้า (V)",
    "กระแสไฟฟ้า (A)",
    "อุณหภูมิ (°C)",
    "ความชื้น (%)",
    "ค่าฝุ่น (PM2.5)",
  ];
  const rows = filteredLogs.value.map((log) => [
    `${log.date} ${log.time}`,
    log.floor,
    log.room,
    log.power,
    log.volt,
    log.amp,
    (log.temp ?? 0).toFixed(1),
    log.humid,
    log.pm25 ?? log.dust ?? 0,
  ]);
  const escapeCSV = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const csvContent = [
    headers.map(escapeCSV).join(","),
    ...rows.map((row) => row.map(escapeCSV).join(",")),
  ].join("\u000D\u000A");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `SmartWatt_Report_${selectedFloor.value}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
console.error("DEBUG: AnalyticsGuest script finished loading.");
</script>

<template>
  <div class="analytics-page">
    <div class="page-header">
      <div class="header-content">
        <div>
          <h1 class="page-title">วิเคราะห์การใช้พลังงานไฟฟ้า</h1>
          <p class="text-gray-500">จัดการและวิเคราะห์ข้อมูลการใช้พลังงานเชิงลึก</p>
        </div>

        <div class="action-group">
          <button v-if="userRole === 1" @click="handleExport" class="btn-premium icon-btn">
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

      <div class="control-bar">
        <div class="control-group">
          <label class="group-label">ช่วงเวลา</label>
          <div class="toggle-group">
            <button
              @click="toggleCalendar"
              class="toggle-btn calendar-trigger"
              :class="{ active: showCalendar || dateRange === 'Single' }"
            >
              📅 {{ dateRange === "Single" ? selectedDateLabel : "เลือกวันที่" }}
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

        <div class="control-group">
          <label class="group-label">ตำแหน่ง</label>
          <div class="select-group">
            <div class="custom-select">
              <select v-model="selectedFloor">
                <option value="All">ทุกชั้น</option>
                <option value="1">ชั้น 1</option>
                <option value="2">ชั้น 2</option>
                <option value="3">ชั้น 3</option>
              </select>
              <div class="select-arrow">▼</div>
            </div>

            <div class="custom-select">
              <select v-model="selectedRoom" :disabled="selectedFloor === 'All'">
                <option value="All">ทุกห้อง</option>
                <option v-for="room in roomOptions" :key="room" :value="room">
                  ห้อง {{ room }}
                </option>
              </select>
              <div class="select-arrow">▼</div>
            </div>
          </div>
        </div>
      </div>
    </div>

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
          <p class="kpi-label">
            เปรียบเทียบ: {{ comparisonData.month1Label }} กับ {{ comparisonData.month2Label }}
          </p>
          <span class="badge" :class="comparisonData.isSaving ? 'ok' : 'warn'">
            {{ comparisonData.isSaving ? "▼" : "▲" }} {{ comparisonData.percent }}%
          </span>
        </div>
        <div class="mt-2">
          <h3 class="text-blue-600">
            {{ comparisonData.current }} <small class="text-gray-500">kWh</small>
          </h3>
          <p class="text-xs text-gray-500 mt-1">
            {{ comparisonData.month2Label }}: {{ comparisonData.last }} kWh
          </p>
        </div>
      </div>

      <div class="kpi-card">
        <div class="card-top-row">
          <p class="kpi-label">ดัชนีวัดประสิทธิภาพการใช้ไฟฟ้า</p>
        </div>
        <h3 class="text-green-600">{{ kpiPF }}</h3>
        <div class="progress-bar">
          <div :style="{ width: kpiPF * 100 + '%' }" class="bg-green-500"></div>
        </div>
      </div>

      <div class="kpi-card">
        <div class="card-top-row">
          <p class="kpi-label">ความต้องการไฟฟ้าสูงสุด</p>
        </div>
        <h3 class="text-red-500">{{ ((Number(kpiPeak) || 0) / 1000).toFixed(2) }} kW</h3>
        <div class="progress-bar">
          <div style="width: 85%" class="bg-red-500"></div>
        </div>
      </div>

      <div class="kpi-card">
        <div class="card-top-row">
          <p class="kpi-label">แรงดันไม่สมดุล</p>
        </div>
        <h3>-</h3>
        <div class="progress-bar">
          <div style="width: 0%" class="bg-blue-500"></div>
        </div>
      </div>
    </div>

    <div v-if="isLoading || isMonthlyLoading" class="loading-state">
      Loading data from Cloud Firestore...
    </div>

    <div v-else>
      <div class="chart-section">
        <div class="chart-header-row chart-header-with-picker">
          <div>
            <h3>การเปรียบเทียบการใช้พลังงานไฟฟ้ารายเดือน</h3>
            <small
              >เปรียบเทียบการใช้พลังงานรายวันของเดือนที่เลือก | ชั้น {{ selectedFloor }} ห้อง
              {{ selectedRoom }}</small
            >
            <div style="font-size: 0.85rem; color: #4b5563; margin-top: 4px">
              กำลังเปรียบเทียบ:
              <strong style="color: #3b82f6">{{ comparisonData.month1Label }}</strong> กับ
              <strong style="color: #94a3b8">{{ comparisonData.month2Label }}</strong>
            </div>
          </div>
          <div
            class="month-picker-container"
            style="
              display: flex;
              gap: 12px;
              align-items: center;
              background: #f8fafc;
              padding: 6px 16px;
              border-radius: 8px;
              border: 1px solid #e2e8f0;
            "
          >
            <div class="custom-select" style="min-width: 140px; margin-bottom: 0">
              <select v-model="selectedMonth1" title="เดือนหลัก">
                <option
                  v-for="opt in monthSelectOptions"
                  :key="'m1-' + opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
              <div class="select-arrow">▼</div>
            </div>
            <span style="font-weight: 600; color: #475569; font-size: 0.95rem; margin-top: 2px"
              >เทียบกับ</span
            >
            <div class="custom-select" style="min-width: 140px; margin-bottom: 0">
              <select v-model="selectedMonth2" title="เดือนที่เปรียบเทียบ">
                <option
                  v-for="opt in monthSelectOptions"
                  :key="'m2-' + opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
              <div class="select-arrow">▼</div>
            </div>
          </div>
        </div>
        <div class="chart-container medium">
          <Line :data="monthlyChartData" :options="monthlyLineOptions" />
        </div>
      </div>

      <div class="chart-section">
        <div class="chart-header-row">
          <div>
            <h3>ความสัมพันธ์ระหว่างพลังงานกับอุณหภูมิ</h3>
            <small>แสดงข้อมูลล่าสุด: ชั้น {{ selectedFloor }} | ห้อง {{ selectedRoom }}</small>
          </div>
        </div>
        <div class="chart-container large">
          <Bar :data="reactiveCorrelationData" :options="mixedChartOptions" />
        </div>
      </div>

      <div class="grid-row">
        <div class="chart-section half">
          <div class="chart-header-row">
            <h3>เสถียรภาพของแรงดัน</h3>
          </div>
          <div class="chart-container medium">
            <Line :data="reactiveVoltageData" :options="voltageOptions" />
          </div>
        </div>
        <div class="chart-section half">
          <div class="chart-header-row">
            <h3>กราฟลักษณะการใช้กำลังไฟฟ้าจริง</h3>
          </div>
          <div class="chart-container medium">
            <Line
              :data="reactiveLoadProfile"
              :options="{ responsive: true, maintainAspectRatio: false }"
            />
          </div>
        </div>
      </div>
      <div class="table-section" style="margin-bottom: 25px">
        <div class="chart-header-row table-header-flex">
          <div>
            <h3>ตารางบันทึกข้อมูลสภาวะแวดล้อม</h3>
            <small style="color: #64748b"
              >สรุปข้อมูลอุณหภูมิ, ความชื้น และค่าฝุ่นละออง (PM2.5)</small
            >
          </div>
        </div>

        <div
          style="
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-bottom: 20px;
          "
        >
          <div
            style="
              background: #f8fafc;
              padding: 15px;
              border-radius: 8px;
              border: 1px solid #e2e8f0;
              text-align: center;
            "
          >
            <p style="font-size: 0.8rem; color: #64748b; font-weight: bold; margin-bottom: 5px">
              อุณหภูมิเฉลี่ย
            </p>
            <h4 style="color: #dc2626; font-size: 1.5rem; margin: 0; font-weight: 700">
              {{ envSummary.temp }} <span style="font-size: 0.9rem">°C</span>
            </h4>
          </div>
          <div
            style="
              background: #f8fafc;
              padding: 15px;
              border-radius: 8px;
              border: 1px solid #e2e8f0;
              text-align: center;
            "
          >
            <p style="font-size: 0.8rem; color: #64748b; font-weight: bold; margin-bottom: 5px">
              ความชื้นเฉลี่ย
            </p>
            <h4 style="color: #059669; font-size: 1.5rem; margin: 0; font-weight: 700">
              {{ envSummary.humid }} <span style="font-size: 0.9rem">%</span>
            </h4>
          </div>
          <div
            style="
              background: #f8fafc;
              padding: 15px;
              border-radius: 8px;
              border: 1px solid #e2e8f0;
              text-align: center;
            "
          >
            <p style="font-size: 0.8rem; color: #64748b; font-weight: bold; margin-bottom: 5px">
              ค่าฝุ่น (PM2.5) เฉลี่ย
            </p>
            <h4 style="color: #475569; font-size: 1.5rem; margin: 0; font-weight: 700">
              {{ envSummary.dust }} <span style="font-size: 0.9rem">µg/m³</span>
            </h4>
          </div>
        </div>

        <div class="table-responsive" style="max-height: 400px; overflow-y: auto">
          <table>
            <thead>
              <tr>
                <th style="background: #f1f5f9; position: sticky; top: 0">วันที่ - เวลา</th>
                <th style="background: #f1f5f9; position: sticky; top: 0">ชั้น</th>
                <th style="background: #f1f5f9; position: sticky; top: 0">ห้อง</th>
                <th style="background: #f1f5f9; position: sticky; top: 0">อุณหภูมิ (°C)</th>
                <th style="background: #f1f5f9; position: sticky; top: 0">ความชื้น (%)</th>
                <th style="background: #f1f5f9; position: sticky; top: 0">ค่าฝุ่น (PM2.5)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(log, index) in environmentalLogs" :key="'env-' + index">
                <td style="font-family: monospace">{{ log.date }} {{ log.time }}</td>
                <td>{{ log.floor }}</td>
                <td>
                  <span class="room-tag">{{ log.room }}</span>
                </td>
                <td style="font-family: monospace; color: #dc2626">
                  {{ (log.temp ?? 0).toFixed(1) }} °C
                </td>

                <td style="font-family: monospace; color: #059669">
                  {{ (log.humid ?? 0).toFixed(1) }} %
                </td>
                <td
                  style="font-family: monospace"
                  :style="{ color: (log.pm25 ?? log.dust ?? 0) > 50 ? '#ea580c' : '#475569' }"
                >
                  {{ (log.pm25 ?? log.dust ?? 0).toFixed(1) }}
                  µg/m³
                </td>
              </tr>
              <tr v-if="filteredLogs.length === 0">
                <td colspan="6" class="empty-table" style="text-align: center">
                  ไม่พบข้อมูลในช่วงเวลาที่เลือก
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="userRole === 1" class="table-section">
        <div class="chart-header-row table-header-flex">
          <h3>ตารางรายงานข้อมูลไฟฟ้าโดยละเอียด</h3>
          <div class="table-filters">
            <div class="custom-select" style="min-width: 150px">
              <select v-model="filterStatus">
                <option value="All">สถานะ: ทั้งหมด</option>
                <option value="Normal">สถานะ: ปกติ</option>
                <option value="Warning">สถานะ: คำเตือนเท่านั้น</option>
              </select>
              <div class="select-arrow">▼</div>
            </div>

            <div class="custom-select" style="min-width: 180px">
              <select v-model="filterTimeSlot">
                <option value="All">เวลา: ทั้งวัน</option>
                <option value="Day">เวลา: กลางวัน (08:00-17:00)</option>
                <option value="Night">เวลา: กลางคืน (17:00-08:00)</option>
              </select>
              <div class="select-arrow">▼</div>
            </div>
          </div>
        </div>

        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>วัน-เวลา</th>
                <th>ชั้น</th>
                <th>ห้อง</th>
                <th>กำลังไฟฟ้า (W)</th>
                <th>แรงดันไฟฟ้า (V)</th>
                <th>กระแสไฟฟ้า (A)</th>
                <th>ตัวประกอบกำลัง (PF)</th>
                <th>สถานะ</th>
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
                <td colspan="8" class="empty-table">ไม่พบข้อมูลที่ตรงตามเงื่อนไข</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pagination-controls" v-if="filteredLogs.filter((l) => l.hasPower).length > 0">
          <button @click="prevPage" :disabled="currentPage === 1" class="page-btn">ก่อนหน้า</button>
          <span class="page-info">หน้า {{ currentPage }} จาก {{ totalPages }}</span>
          <button @click="nextPage" :disabled="currentPage === totalPages" class="page-btn">
            ถัดไป
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
  background-color: #f8f9fc;
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
  color: #000000;
  font-size: 0.95rem;
  margin-top: 4px;
}

/* --- Control Bar --- */
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
  color: #3b82f6;
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

.btn-premium {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1e293b;
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
}

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
  border-left: 3px solid #3b82f6;
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

.chart-section {
  background: white;
  padding: 25px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  margin-bottom: 25px;
  border: 1px solid #e9ecef;
}

/* 💡 สไตล์สำหรับกล่องเลือกเดือน */
.chart-header-with-picker {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.month-picker-container {
  display: flex;
  align-items: center;
  background: #f8fafc;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.picker-input {
  background: transparent;
  border: none;
  font-family: inherit;
  font-size: 0.9rem;
  color: #334155;
  outline: none;
  cursor: pointer;
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
