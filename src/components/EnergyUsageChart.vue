<script setup>
import { computed, ref, watch, onMounted } from "vue";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "vue-chartjs";

// TODO: Optimization Plan - Consider migrating to ApexCharts or ECharts in the next phase to reduce memory usage.
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

const props = defineProps({
  floors: { type: Array, required: true, default: () => ["3"] },
  timeRange: { type: String, default: "24H" },
  livePower: { type: Object, default: () => ({ 1: 0, 2: 0, 3: 0 }) },
});

// --- 1. ตัวแปรเก็บข้อมูลจริง (Real Memory) ---
const MAX_POINTS = 50;
const labelsRef = ref([]);
const dataF1 = ref([]);
const dataF2 = ref([]);
const dataF3 = ref([]);

// ฟังก์ชันเพิ่มข้อมูลลงกราฟ
const addDataPoint = (dataObj) => {
  let labelStr = "";

  if (props.timeRange === "24H") {
    // 24H: โชว์เวลา (HH:mm)
    labelStr = new Date().toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } else {
    // 7D, 30D: โชว์วันที่ (DD/MM)
    labelStr = new Date().toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "2-digit",
    });
  }

  labelsRef.value.push(labelStr);

  // บันทึกข้อมูลแต่ละชั้น (ถ้าไม่มีค่า ให้เป็น 0)
  dataF1.value.push(dataObj["1"] || 0); // ชั้น 1
  dataF2.value.push(dataObj["2"] || 0); // ชั้น 2
  dataF3.value.push(dataObj["3"] || 0); // ชั้น 3

  // ตัดหางแถว
  if (labelsRef.value.length > MAX_POINTS) {
    labelsRef.value.shift();
    dataF1.value.shift();
    dataF2.value.shift();
    dataF3.value.shift();
  }
};

// --- 2. ฟังก์ชันอัปเดตข้อมูล (Real-time Recording) ---
watch(
  () => props.livePower,
  (newVal) => {
    // เมื่อค่าเปลี่ยน ให้เพิ่มจุดใหม่ทันที
    addDataPoint(newVal);
  },
  { deep: true }, // เพิ่ม deep watch เผื่อ Object เปลี่ยนไส้ใน
);

// ✅ เมื่อเปลี่ยน Time Range ให้เคลียร์กราฟเริ่มใหม่ (UX)
watch(
  () => props.timeRange,
  () => {
    labelsRef.value = [];
    dataF1.value = [];
    dataF2.value = [];
    dataF3.value = [];
  },
);

// ✅ เพิ่ม onMounted: เริ่มต้นปุ๊บ วาดจุดแรกปั๊บ
onMounted(() => {
  addDataPoint(props.livePower);
});

// --- 3. จัดข้อมูลส่งให้ Chart ---
const chartData = computed(() => {
  return {
    labels: [...labelsRef.value],
    datasets: [
      // ชั้น 1 (สีน้ำเงิน)
      ...(props.floors.includes("1")
        ? [
            {
              label: "Floor 1",
              borderColor: "#0d6efd",
              backgroundColor: "rgba(13,110,253,0.1)",
              data: [...dataF1.value],
              fill: true,
              pointRadius: 0, // ซ่อนจุดให้กราฟดูสมูท
            },
          ]
        : []),
      // ชั้น 2 (สีเขียว)
      ...(props.floors.includes("2")
        ? [
            {
              label: "Floor 2",
              borderColor: "#198754",
              backgroundColor: "rgba(25,135,84,0.1)",
              data: [...dataF2.value],
              fill: true,
              pointRadius: 0,
            },
          ]
        : []),
      // ชั้น 3 (สีเหลือง - พระเอกของเรา)
      ...(props.floors.includes("3")
        ? [
            {
              label: "Floor 3",
              borderColor: "#ffc107",
              backgroundColor: "rgba(255,193,7,0.2)",
              data: [...dataF3.value],
              fill: true,
              borderWidth: 3,
              pointRadius: 3, // โชว์จุดเฉพาะชั้นหลัก
            },
          ]
        : []),
    ],
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: {
    duration: 1000,
    easing: "easeOutQuart",
  },
  interaction: { mode: "index", intersect: false },
  scales: {
    y: {
      beginAtZero: true,
      title: {
        display: true,
        text: "Electric Power (kW)",
        font: { size: 14, weight: "bold" },
      },
      // suggestedMax: 5, // ปล่อยให้กราฟปรับสเกลเองตามข้อมูลจริง (Dynamic Scaling)
    },
    x: {
      title: {
        display: true,
        text: "Time",
        font: { size: 14, weight: "bold" },
      },
      ticks: {
        maxTicksLimit: 10,
        maxRotation: 0,
      },
    },
  },
  plugins: {
    legend: { position: "top" },
  },
};
</script>

<template>
  <div style="width: 100%; height: 100%; position: relative">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>
