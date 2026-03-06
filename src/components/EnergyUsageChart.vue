<script setup>
import { computed, ref, watch, onUnmounted, onMounted } from "vue";
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

// --- Firebase Imports ---
import { db } from "../firebase";
import { collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";

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

// --- 1. Variables for Data Storage ---
const MAX_POINTS = 144; // 24 hours at 10-minute intervals = 144 points
const labelsRef = ref([]);
const dataF1 = ref([]);
const dataF2 = ref([]);
const dataF3 = ref([]);
const timestampsRef = ref([]); // To track exact time for caching

const CACHE_KEY = "smartwatt_energy_history";

// --- 2. Local Storage Caching Logic ---
const loadDataFromCache = () => {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      // Filter only last 24H
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      const recent = parsed.filter((p) => p.ts > oneDayAgo);

      recent.forEach((p) => {
        const date = new Date(p.ts);
        const label = date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
        labelsRef.value.push(label);
        dataF1.value.push(p.f1);
        dataF2.value.push(p.f2);
        dataF3.value.push(p.f3);
        timestampsRef.value.push(p.ts);
      });
      console.log(`📦 Loaded ${recent.length} points from Cache`);
    } catch (e) {
      console.error("Cache Load Error", e);
    }
  }
};

const saveDataToCache = () => {
  const dataToSave = timestampsRef.value.map((ts, i) => ({
    ts,
    f1: dataF1.value[i],
    f2: dataF2.value[i],
    f3: dataF3.value[i],
  }));

  // Keep only last 200 points to stay within 5MB limit easily
  const limited = dataToSave.slice(-200);
  localStorage.setItem(CACHE_KEY, JSON.stringify(limited));
};

// Sync "Gap" from Firestore
const syncFirestoreData = async () => {
  try {
    const now = Date.now();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    // Find last sync time
    let lastTs = oneDayAgo.getTime();
    if (timestampsRef.value.length > 0) {
      lastTs = Math.max(...timestampsRef.value);
    }

    // If last sync was less than 5 mins ago, skip to save reads
    if (now - lastTs < 5 * 60 * 1000) {
      console.log("⚡ Skip Sync: Data is fresh");
      return;
    }

    // Helper: format Date to "YYYY-MM-DD HH:MM:SS" (Thai Timezone)
    const formatToThaiString = (date) => {
      const pad = (num) => String(num).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    const lastTsStr = formatToThaiString(new Date(lastTs));
    console.log(`📡 Syncing Firestore gap since: ${lastTsStr}`);

    const q = query(
      collection(db, "measurements"),
      where("timestamp", ">", lastTsStr),
      orderBy("timestamp", "asc"),
      limit(200),
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      console.warn("[Chart] No recent history records found in Firestore.");
    } else {
      console.log(`[Chart] Syncing ${snapshot.size} history points.`);
    }

    if (!snapshot.empty) {
      snapshot.forEach((doc) => {
        const data = doc.data();
        let ts;
        if (data.timestamp && data.timestamp.toDate) {
          ts = data.timestamp.toDate().getTime();
        } else if (data.timestamp) {
          const isoStr = data.timestamp.toString().includes(" ")
            ? data.timestamp.replace(" ", "T")
            : data.timestamp;
          ts = new Date(isoStr).getTime();
        } else {
          return;
        }

        if (isNaN(ts)) return;

        // Ensure no duplicate timestamps
        if (!timestampsRef.value.includes(ts)) {
          const date = new Date(ts);
          const label = date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

          labelsRef.value.push(label);
          // Mapping logic:
          // 1. Prioritize f1, f2, f3 (Floor aggregates in kW)
          // 2. Try power_A/B/C or power_ch1/2/3 or ch1/2/3_power (Module data in Watts)
          // 3. Fallback to total 'power' as Floor 3 (Total Watt)
          dataF1.value.push(
            (
              Number(data.f1) ||
              Number(data.power_ch1 || data.ch1_power || data.power_A || 0) / 1000
            ).toFixed(2),
          );
          dataF2.value.push(
            (
              Number(data.f2) ||
              Number(data.power_ch2 || data.ch2_power || data.power_B || 0) / 1000
            ).toFixed(2),
          );
          dataF3.value.push(
            (
              Number(data.f3) ||
              Number(
                data.power_ch3 ||
                  data.ch3_power ||
                  data.power_C ||
                  data.total_power ||
                  data.power ||
                  0,
              ) / 1000
            ).toFixed(2),
          );
          timestampsRef.value.push(ts);
        }
      });
      console.log(`✅ Synced ${snapshot.size} points from Firestore`);

      // Keep within MAX_POINTS
      if (labelsRef.value.length > MAX_POINTS) {
        const diff = labelsRef.value.length - MAX_POINTS;
        labelsRef.value.splice(0, diff);
        dataF1.value.splice(0, diff);
        dataF2.value.splice(0, diff);
        dataF3.value.splice(0, diff);
        timestampsRef.value.splice(0, diff);
      }

      saveDataToCache();
    }
  } catch (e) {
    console.error("Firestore Sync Error", e);
  }
};

const addDataPoint = (dataObj) => {
  const ts = Date.now();
  const labelStr = new Date().toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });

  labelsRef.value.push(labelStr);
  dataF1.value.push(Number(dataObj["1"] || 0));
  dataF2.value.push(Number(dataObj["2"] || 0));
  dataF3.value.push(Number(dataObj["3"] || 0));
  timestampsRef.value.push(ts);

  if (labelsRef.value.length > MAX_POINTS) {
    labelsRef.value.shift();
    dataF1.value.shift();
    dataF2.value.shift();
    dataF3.value.shift();
    timestampsRef.value.shift();
  }

  saveDataToCache();
};

let chartInterval = null;

onMounted(async () => {
  loadDataFromCache();
  await syncFirestoreData();

  // Real-time interval
  chartInterval = setInterval(() => {
    addDataPoint(props.livePower);
  }, 30000); // 30s to be slightly more conservative than 10s
});

onUnmounted(() => {
  if (chartInterval) clearInterval(chartInterval);
});

watch(
  () => props.timeRange,
  () => {
    // Keep data in 24H memory even if filter changes,
    // but the chart component will handle what to show via chartData computed
  },
);

const chartData = computed(() => {
  const hasData = labelsRef.value.length > 0;
  return {
    labels: hasData ? [...labelsRef.value] : ["Waiting for data..."],
    datasets: [
      ...(props.floors.includes("1")
        ? [
            {
              label: "Floor 1",
              borderColor: "#0d6efd",
              backgroundColor: "rgba(13,110,253,0.1)",
              data: [...dataF1.value],
              fill: true,
              pointRadius: 0,
              tension: 0.4,
            },
          ]
        : []),
      ...(props.floors.includes("2")
        ? [
            {
              label: "Floor 2",
              borderColor: "#198754",
              backgroundColor: "rgba(25,135,84,0.1)",
              data: [...dataF2.value],
              fill: true,
              pointRadius: 0,
              tension: 0.4,
            },
          ]
        : []),
      ...(props.floors.includes("3")
        ? [
            {
              label: "Floor 3 / Room C",
              borderColor: "#ffc107",
              backgroundColor: "rgba(255,193,7,0.2)",
              data: [...dataF3.value],
              fill: true,
              borderWidth: 3,
              pointRadius: 1,
              tension: 0.4,
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
        font: { size: 12, weight: "bold" },
      },
    },
    x: {
      ticks: {
        maxTicksLimit: 8,
        maxRotation: 0,
        font: { size: 10 },
      },
    },
  },
  plugins: {
    legend: { position: "top", labels: { boxWidth: 12, font: { size: 11 } } },
  },
};
</script>

<template>
  <div style="width: 100%; height: 100%; position: relative">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>
