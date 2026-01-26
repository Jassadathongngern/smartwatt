<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
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
import { db } from "../firebase";
import { ref as dbRef, onValue, off } from "firebase/database";

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

// --- State & Filters ---
const dateRange = ref("30D");
const selectedFloor = ref("All");

// --- Raw Data Storage ---
const rawSensorData = ref({}); // เก็บข้อมูลประวัติจาก sensor_data
const buildingConfig = ref({}); // เก็บผังตึกจาก building_configs
const processedLogs = ref([]); // ข้อมูลที่แปลงเป็นรูป Row พร้อมโชว์

// --- 1. Fetch Data from Firebase ---
onMounted(() => {
  // 1.1 โหลดผังตึกเพื่อรู้ว่า Device ไหนอยู่ชั้นไหน
  const configRef = dbRef(db, "building_configs");
  onValue(configRef, (snapshot) => {
    buildingConfig.value = snapshot.val() || {};
    processData(); // คำนวณใหม่เมื่อผังเปลี่ยน
  });

  // 1.2 โหลดประวัติข้อมูล (Sensor Data)
  // หมายเหตุ: การโหลดทั้งหมดอาจหนักถ้าข้อมูลเยอะมาก ใน production ควรใช้ query limitToLast
  const sensorRef = dbRef(db, "sensor_data");
  onValue(sensorRef, (snapshot) => {
    rawSensorData.value = snapshot.val() || {};
    processData(); // คำนวณใหม่เมื่อมีข้อมูลใหม่เข้ามา
  });
});

onUnmounted(() => {
  off(dbRef(db, "building_configs"));
  off(dbRef(db, "sensor_data"));
});

// --- 2. Data Processing Logic ---

// Helper: หาว่า Device ID นี้อยู่ชั้นไหน
const getFloorOfDevice = (deviceId) => {
  for (const [floorKey, floorData] of Object.entries(buildingConfig.value)) {
    if (floorData.rooms) {
      for (const room of Object.values(floorData.rooms)) {
        if (room.deviceId === deviceId) {
          // แปลง floor_3 -> 3
          return floorKey.replace("floor_", "") || floorKey;
        }
      }
    }
  }
  return "Unknown"; // ถ้าไม่เจอในผัง
};

// ฟังก์ชันหลัก: แปลงข้อมูลดิบให้เป็น Array ที่ Filter แล้ว
const processData = () => {
  let tempLogs = [];

  // วนลูปทุก Device ใน sensor_data
  Object.entries(rawSensorData.value).forEach(([deviceId, timestamps]) => {
    const floor = getFloorOfDevice(deviceId);

    // กรองตามชั้น (Floor Filter)
    if (selectedFloor.value !== "All" && floor !== selectedFloor.value) {
      return;
    }

    // วนลูปทุก Timestamp ของ Device นั้น
    Object.entries(timestamps).forEach(([ts, data]) => {
      // กรองตามเวลา (Date Range Filter) - Logic อย่างง่าย
      const recordTime = new Date(Number(ts));
      const now = new Date();
      let isValidTime = true;

      if (dateRange.value === "7D") {
        isValidTime = now - recordTime <= 7 * 24 * 60 * 60 * 1000;
      } else if (dateRange.value === "30D") {
        isValidTime = now - recordTime <= 30 * 24 * 60 * 60 * 1000;
      }
      // 1Y คือเอาหมด (ในตัวอย่างนี้)

      if (isValidTime) {
        tempLogs.push({
          rawTime: Number(ts),
          time: recordTime.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
          date: recordTime.toLocaleDateString("th-TH"),
          floor: `Floor ${floor}`,
          deviceId: deviceId,
          power: Number(data.w || data.power || 0),
          volt: Number(data.v || data.voltage || 0),
          amp: Number(data.a || data.current || 0),
          pf: Number(data.pf || 0.95), // ถ้าไม่มีใส่ 0.95
          temp: Number(data.temp || 0),
          status: "Normal",
          isWarning: Number(data.w) > 2000, // ตัวอย่างเงื่อนไข Warning
        });
      }
    });
  });

  // เรียงจากใหม่ไปเก่า
  tempLogs.sort((a, b) => b.rawTime - a.rawTime);
  processedLogs.value = tempLogs;
};

// Watchers: สั่งคำนวณเมื่อ Filter เปลี่ยน
watch([selectedFloor, dateRange], () => {
  processData();
});

// --- 3. Computed Properties for UI ---

const filteredLogs = computed(() => processedLogs.value);

// KPI Computations
const kpiPF = computed(() => {
  if (!processedLogs.value.length) return 0.98;
  const sum = processedLogs.value.reduce((acc, curr) => acc + curr.pf, 0);
  return (sum / processedLogs.value.length).toFixed(2);
});

const kpiPeak = computed(() => {
  if (!processedLogs.value.length) return 0;
  return Math.max(...processedLogs.value.map((l) => l.power)).toFixed(0);
});

// Chart 1: Energy vs Temp (Correlation)
const reactiveCorrelationData = computed(() => {
  // Group by Date or Hour for simpler chart
  // Mock Logic for Chart Structure derived from real data limits
  const labels = processedLogs.value
    .slice(0, 10)
    .map((l) => l.time)
    .reverse();
  const powerData = processedLogs.value
    .slice(0, 10)
    .map((l) => l.power / 1000)
    .reverse(); // kW
  const tempData = processedLogs.value
    .slice(0, 10)
    .map((l) => l.temp)
    .reverse();

  return {
    labels: labels.length ? labels : ["No Data"],
    datasets: [
      {
        label: "Energy (kWh)",
        type: "bar",
        data: powerData.length ? powerData : [0],
        backgroundColor: "rgba(54, 162, 235, 0.6)",
        yAxisID: "y",
      },
      {
        label: "Temperature (°C)",
        type: "line",
        data: tempData.length ? tempData : [0],
        borderColor: "#ff6384",
        borderWidth: 2,
        yAxisID: "y1",
      },
    ],
  };
});

// Chart 2: Voltage Stability
const reactiveVoltageData = computed(() => {
  const dataPoints = processedLogs.value.slice(0, 15).reverse();
  return {
    labels: dataPoints.map((l) => l.time),
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

// Chart 3: Load Profile
const reactiveLoadProfile = computed(() => {
  const dataPoints = processedLogs.value.slice(0, 20).reverse();
  return {
    labels: dataPoints.map((l) => l.time),
    datasets: [
      {
        label: "Total Load (kW)",
        data: dataPoints.map((l) => l.power / 1000), // Convert W to kW
        borderColor: "#4bc0c0",
        backgroundColor: "rgba(75, 192, 192, 0.2)",
        fill: true,
        tension: 0.4,
      },
    ],
  };
});

// --- Chart Options (Design เดิม) ---
const mixedChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  scales: {
    y: {
      type: "linear",
      display: true,
      position: "left",
      title: { display: true, text: "Energy (kWh)" },
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
  plugins: { legend: { position: "top" } },
  scales: { y: { min: 200, max: 240, title: { display: true, text: "Voltage (V)" } } },
};

// --- Export Function ---
const handleExport = () => {
  const headers = [
    "Date",
    "Time",
    "Floor",
    "Device",
    "Power (W)",
    "Voltage (V)",
    "Current (A)",
    "PF",
  ];
  const rows = processedLogs.value.map((log) => [
    log.date,
    log.time,
    log.floor,
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
  link.setAttribute("download", `SmartWatt_Report_${selectedFloor.value}_${dateRange.value}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
</script>

<template>
  <div class="analytics-page">
    <div class="header-bar">
      <div>
        <h1 class="text-2xl font-bold text-gray-800">Advanced Analytics</h1>
        <p class="text-sm text-gray-500">การวิเคราะห์เชิงลึกด้านประสิทธิภาพพลังงานและคุณภาพไฟฟ้า</p>
      </div>
      <div class="controls">
        <select v-model="selectedFloor" class="control-input">
          <option value="All">All Floors</option>
          <option value="1">Floor 1</option>
          <option value="2">Floor 2</option>
          <option value="3">Floor 3</option>
        </select>
        <select v-model="dateRange" class="control-input">
          <option value="7D">Last 7 Days</option>
          <option value="30D">Last 30 Days</option>
          <option value="1Y">Year to Date</option>
        </select>
        <button @click="handleExport" class="btn-export">Export Report (CSV)</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="card-top-row">
          <p class="kpi-label">POWER FACTOR (AVG)</p>
          <div class="tooltip-container">
            <span class="info-icon">i</span>
            <div class="tooltip-box">
              <strong>Power Factor (PF)</strong><br />
              ค่าประสิทธิภาพการใช้ไฟฟ้า (0-1). ยิ่งใกล้ 1 ยิ่งดี ถ้าต่ำกว่า 0.85 อาจถูกคิดค่าปรับ
              (kvar charge)
            </div>
          </div>
        </div>
        <h3 class="text-green-600">{{ kpiPF }}</h3>
        <small>Efficiency Status: <span class="text-green-600 font-bold">Excellent</span></small>
        <div class="progress-bar">
          <div :style="{ width: kpiPF * 100 + '%' }" class="bg-green-500"></div>
        </div>
      </div>

      <div class="kpi-card">
        <div class="card-top-row">
          <p class="kpi-label">PEAK DEMAND</p>
          <div class="tooltip-container">
            <span class="info-icon">i</span>
            <div class="tooltip-box">
              <strong>Peak Demand (kW)</strong><br />
              ความต้องการพลังงานไฟฟ้าสูงสุดในช่วง 15 นาที. ค่านี้มีผลต่อค่าไฟส่วน Demand Charge
            </div>
          </div>
        </div>
        <h3 class="text-red-500">{{ (kpiPeak / 1000).toFixed(2) }} kW</h3>
        <small>Recorded Max Load in Range</small>
        <div class="progress-bar"><div style="width: 85%" class="bg-red-500"></div></div>
      </div>

      <div class="kpi-card">
        <div class="card-top-row">
          <p class="kpi-label">VOLTAGE UNBALANCE</p>
          <div class="tooltip-container">
            <span class="info-icon">i</span>
            <div class="tooltip-box">
              <strong>Voltage Unbalance (%)</strong><br />
              ความแตกต่างของแรงดันแต่ละเฟส ไม่ควรเกิน 2% หากสูงเกินไปจะทำให้มอเตอร์เสียหายได้
            </div>
          </div>
        </div>
        <h3>0.5%</h3>
        <small>Standard: &lt; 2.0% (Passed)</small>
        <div class="progress-bar"><div style="width: 10%" class="bg-blue-500"></div></div>
      </div>

      <div class="kpi-card">
        <div class="card-top-row">
          <p class="kpi-label">CARBON INTENSITY</p>
          <div class="tooltip-container">
            <span class="info-icon">i</span>
            <div class="tooltip-box left-align">
              <strong>Carbon Footprint</strong><br />
              ปริมาณการปล่อยก๊าซเรือนกระจกจากการใช้ไฟฟ้า คำนวณตามมาตรฐาน (kgCO2e/kWh)
            </div>
          </div>
        </div>
        <h3>0.45 kg/kWh</h3>
        <small>Total Emission: Based on Usage</small>
        <div class="progress-bar"><div style="width: 45%" class="bg-gray-500"></div></div>
      </div>
    </div>

    <div class="chart-section">
      <div class="chart-header-row">
        <div>
          <h3>Energy vs Temperature Correlation</h3>
          <small>แสดงข้อมูล: Floor {{ selectedFloor }} | ช่วงเวลา: {{ dateRange }}</small>
        </div>
        <div class="tooltip-container">
          <span class="info-icon">i</span>
          <div class="tooltip-box right-align">
            <strong>Correlation Analysis</strong><br />
            วิเคราะห์ความสัมพันธ์: "อุณหภูมิมีผลต่อปริมาณการใช้ไฟฟ้าอย่างไร"<br />
            <span class="mt-2 block text-xs opacity-90">
              - แท่งสีฟ้า: พลังงานไฟฟ้า (kWh)<br />
              - เส้นสีแดง: อุณหภูมิ (°C)
            </span>
          </div>
        </div>
      </div>
      <div class="chart-container large">
        <Bar :data="reactiveCorrelationData" :options="mixedChartOptions" />
      </div>
    </div>

    <div class="grid-row">
      <div class="chart-section half">
        <div class="chart-header-row">
          <h3>Voltage Stability (Live Trend)</h3>
          <div class="tooltip-container">
            <span class="info-icon">i</span>
            <div class="tooltip-box right-align">
              <strong>Voltage Stability</strong><br />
              ตรวจสอบคุณภาพไฟฟ้า แรงดันควรอยู่ที่ 220V/380V (±10%). <br />
              ถ้านิ่งแสดงว่าระบบจ่ายไฟเสถียรดี
            </div>
          </div>
        </div>
        <div class="chart-container medium">
          <Line :data="reactiveVoltageData" :options="voltageOptions" />
        </div>
      </div>

      <div class="chart-section half">
        <div class="chart-header-row">
          <h3>Load Profile (Active Power)</h3>
          <div class="tooltip-container">
            <span class="info-icon">i</span>
            <div class="tooltip-box right-align">
              <strong>Load Profile</strong><br />
              กราฟแสดง "ช่วงเวลา Peak" ของวัน <br />
              ช่วยวางแผนประหยัดพลังงาน (Shift Load) ไปใช้ช่วงเวลาอื่น
            </div>
          </div>
        </div>
        <div class="chart-container medium">
          <Line
            :data="reactiveLoadProfile"
            :options="{ responsive: true, maintainAspectRatio: false }"
          />
        </div>
      </div>
    </div>

    <div class="table-section">
      <div class="chart-header-row">
        <h3>Detailed Metrics Log</h3>
        <div class="tooltip-container">
          <span class="info-icon">i</span>
          <div class="tooltip-box right-align">
            <strong>Raw Data Logs</strong><br />
            ข้อมูลดิบรายนาที สำหรับการตรวจสอบย้อนหลัง (Audit) <br />
            แถวสีเหลือง = มีค่าผิดปกติ (Warning)
          </div>
        </div>
      </div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Floor</th>
              <th>Active Power</th>
              <th>Voltage</th>
              <th>Current</th>
              <th>PF</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(log, index) in filteredLogs"
              :key="index"
              :style="log.isWarning ? 'background: #fff3cd;' : ''"
            >
              <td>{{ log.date }} {{ log.time }}</td>
              <td>{{ log.floor }}</td>
              <td :class="log.isWarning ? 'text-red-600 font-bold' : ''">{{ log.power }} W</td>
              <td>{{ log.volt }} V</td>
              <td>{{ log.amp }} A</td>
              <td :class="log.isWarning ? 'text-red-600' : ''">{{ log.pf }}</td>
              <td>
                <span class="badge" :class="log.isWarning ? 'warn' : 'ok'">{{ log.status }}</span>
              </td>
            </tr>
            <tr v-if="filteredLogs.length === 0">
              <td colspan="7" style="text-align: center; padding: 20px; color: #999">
                No data found for Floor {{ selectedFloor }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Main Layout */
.analytics-page {
  padding: 20px;
  background-color: #f0f2f5;
  min-height: 100vh;
  font-family: "Inter", sans-serif;
}
.header-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 25px;
}

/* Controls */
.controls {
  display: flex;
  gap: 10px;
}
.control-input {
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  background: white;
  font-size: 0.9rem;
  color: #495057;
}
.btn-export {
  background: #0d6efd;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
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
.card-top-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 5px;
}
.kpi-label {
  font-size: 0.75rem;
  color: #6c757d;
  font-weight: 700;
  margin: 0;
  letter-spacing: 0.5px;
}
.kpi-card h3 {
  font-size: 1.8rem;
  margin: 0;
  font-weight: 700;
  color: #212529;
}
.kpi-card small {
  font-size: 0.8rem;
  color: #6c757d;
}
.progress-bar {
  height: 4px;
  background: #e9ecef;
  border-radius: 2px;
  margin-top: 15px;
  overflow: hidden;
}
.progress-bar div {
  height: 100%;
  border-radius: 2px;
}

/* Charts */
.chart-section {
  background: white;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
  border: 1px solid #e9ecef;
  margin-bottom: 20px;
}
.chart-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 15px;
}
.chart-header-row h3 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #343a40;
  margin: 0;
}
.chart-header-row small {
  color: #6c757d;
  font-size: 0.85rem;
}
.grid-row {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.half {
  flex: 1;
  min-width: 350px;
}
.chart-container.large {
  height: 350px;
}
.chart-container.medium {
  height: 250px;
}

/* Table */
.table-section {
  background: white;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
}
.table-responsive {
  overflow-x: auto;
  margin-top: 10px;
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 600px;
}
th {
  text-align: left;
  padding: 12px;
  background: #f8f9fa;
  color: #495057;
  font-size: 0.85rem;
  font-weight: 600;
  border-bottom: 2px solid #dee2e6;
}
td {
  padding: 12px;
  border-bottom: 1px solid #e9ecef;
  font-size: 0.9rem;
  color: #212529;
}
tr:last-child td {
  border-bottom: none;
}
.badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}
.badge.ok {
  background: #d1e7dd;
  color: #0f5132;
}
.badge.warn {
  background: #f8d7da;
  color: #842029;
}

/* Colors */
.text-green-600 {
  color: #198754;
}
.text-red-600 {
  color: #dc3545;
}
.text-red-500 {
  color: #dc3545;
}
.bg-green-500 {
  background-color: #198754;
}
.bg-red-500 {
  background-color: #dc3545;
}
.bg-blue-500 {
  background-color: #0d6efd;
}
.bg-gray-500 {
  background-color: #6c757d;
}

/* Tooltip Styles (Fixed Z-Index) */
.tooltip-container {
  position: relative;
  display: inline-block;
  cursor: pointer;
}
.info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background-color: #e9ecef;
  color: #6c757d;
  border-radius: 50%;
  font-size: 11px;
  font-weight: bold;
  font-family: serif;
  transition: all 0.2s;
}
.info-icon:hover {
  background-color: #0d6efd;
  color: white;
}

.tooltip-box {
  visibility: hidden;
  width: 220px;
  background-color: #333;
  color: #fff;
  text-align: left;
  border-radius: 6px;
  padding: 10px;
  position: absolute;
  z-index: 1000; /* ✅ แก้ให้สูงเพื่อไม่โดนกราฟบัง */
  top: 125%;
  left: 50%;
  transform: translateX(-50%);
  opacity: 0;
  transition: opacity 0.3s;
  font-size: 0.8rem;
  line-height: 1.4;
  font-weight: normal;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}
.tooltip-box::after {
  content: "";
  position: absolute;
  bottom: 100%;
  left: 50%;
  margin-left: -5px;
  border-width: 5px;
  border-style: solid;
  border-color: transparent transparent #333 transparent;
}
.tooltip-box.right-align {
  left: auto;
  right: 0;
  transform: none;
}
.tooltip-box.right-align::after {
  left: auto;
  right: 5px;
}
.tooltip-box.left-align {
  left: 0;
  right: auto;
  transform: none;
}
.tooltip-box.left-align::after {
  left: 10px;
  right: auto;
}

.tooltip-container:hover .tooltip-box {
  visibility: visible;
  opacity: 1;
}
</style>
