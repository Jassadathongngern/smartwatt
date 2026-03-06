<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { rtdb, db as firestoreDb } from "../firebase";
import { ref as dbRef, onValue, push, off } from "firebase/database";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";

// --- Configuration ---
const CHECK_INTERVAL = 60000; // Run checks every 1 minute
const THRESHOLD_POWER_USAGE = 100; // Watts (Threshold to consider "in use")
const SPAM_COOLDOWN = 12 * 60 * 60 * 1000; // 12 Hours (Don't alert same issue again within this time)

// --- State ---
const devices = ref([]);
const gateways = ref([]);
const schedules = ref([]);
const buildingConfig = ref({});
const alertSettings = ref({ batteryThreshold: 20 });
const notifications = ref([]);
const recoveryTimeline = ref({}); // Track recovery timestamps for each device
const deviceMappings = ref({});
const telemetryData = ref({});
const localAlertCache = ref({}); // 💡 Throttling: Track alerts sent in this session

// --- Firebase References ---
const devicesRef = dbRef(rtdb, "devices");
const gatewaysRef = dbRef(rtdb, "gateways");
const schedulesRef = dbRef(rtdb, "schedules");
const configRef = dbRef(rtdb, "building_configs");
const settingsRef = dbRef(rtdb, "alert_settings");
const notiRef = dbRef(rtdb, "notifications");
const mappingsRef = dbRef(rtdb, "device_mappings");
const telemetryRef = dbRef(rtdb, "devices"); // Use 'devices' instead of 'device_telemetry'

// Env Node State (from Firestore)
const envBattery = ref(100);
let unsubFirestore = null;

let timer = null;

const shouldAlert = (type, deviceId) => {
  const now = Date.now();

  // 1. Check local session cache first (Extreme Throttling)
  const lastLocalAlert = localAlertCache.value[`${type}_${deviceId}`] || 0;
  if (now - lastLocalAlert < SPAM_COOLDOWN) return false;

  // 2. Check global recovery (if we recovered globally, we reset the check)
  const globalRecovery = recoveryTimeline.value["global"] || 0;
  const lastRecovery = Math.max(globalRecovery, recoveryTimeline.value[deviceId] || 0);

  // 3. Check historical notifications from DB
  const recentAlert = notifications.value.slice(-500).find((n) => {
    const isSameType = n.type === type && n.deviceId === deviceId;
    if (!isSameType) return false;

    const alertTime = isNaN(new Date(n.timestamp).getTime()) ? 0 : new Date(n.timestamp).getTime();

    // IF we recovered AFTER the last alert, the cooldown is EXPIRED (reset)
    if (lastRecovery > alertTime) return false;

    // Otherwise, standard 12H cooldown
    return now - alertTime < SPAM_COOLDOWN;
  });

  return !recentAlert;
};

// --- Main Check Logic ---
const runSystemChecks = async () => {
  console.log("🔍 System Monitor: Running Background Checks...");
  const now = Date.now();

  // 0. Identify Configured Devices (to avoid ghost alerts from stale DB entries)
  const configuredIds = new Set();
  if (buildingConfig.value) {
    Object.values(buildingConfig.value).forEach((floor) => {
      if (floor.rooms) {
        Object.values(floor.rooms).forEach((room) => {
          if (room.deviceId) configuredIds.add(room.deviceId);
        });
      }
    });
  }
  if (deviceMappings.value) {
    Object.keys(deviceMappings.value).forEach((id) => configuredIds.add(id));
  }

  // 1. Check Low Battery (RTDB Devices)
  devices.value.forEach((device) => {
    if (!configuredIds.has(device.id)) return; // 🆕 Skip ghost devices
    // Only check if device explicitly reports battery, or ignore if undefined
    const batVal = Number(device.battery);
    const fallbackThresh = Number(alertSettings.value?.batteryThreshold || 20);
    if (device.battery !== undefined && !isNaN(batVal) && batVal <= fallbackThresh) {
      if (shouldAlert("warning", device.id)) {
        pushNotification({
          title: "แจ้งเตือนแบตเตอรี่ต่ำ (อุปกรณ์)",
          message: `อุปกรณ์ '${device.name}' แบตเตอรี่เหลือ ${batVal}% (เกณฑ์ที่ตั้งไว้: ${fallbackThresh}%)`,
          type: "warning",
          deviceId: device.id,
        });
      }
    }
  });

  // 1.5 Check Low Battery (Firestore ENV Node)
  const envBatVal = Number(envBattery.value);
  const threshVal = Number(alertSettings.value?.batteryThreshold || 20);
  if (!isNaN(envBatVal) && envBatVal <= threshVal) {
    if (shouldAlert("warning", "ENV-01")) {
      pushNotification({
        title: "แจ้งเตือนแบตเตอรี่ต่ำ (เซนเซอร์สิ่งแวดล้อม)",
        message: `เซนเซอร์ 'ENV-01' แบตเตอรี่เหลือ ${envBatVal}% (เกณฑ์ที่ตั้งไว้: ${threshVal}%)`,
        type: "warning",
        deviceId: "ENV-01",
      });
    }
  }

  // 1.8 Check Gateway Offline
  const gwOfflineThresh = Number(alertSettings.value?.gatewayOfflineTimeout || 15);
  const gwOfflineMs = gwOfflineThresh * 60 * 1000;

  gateways.value.forEach((gw) => {
    let lastUpdateGw = gw.last_update || 0;

    // Normalize time to milliseconds if it's a string (ISO date) or seconds (unix)
    if (typeof lastUpdateGw === "string") lastUpdateGw = new Date(lastUpdateGw).getTime();
    else if (lastUpdateGw > 0 && lastUpdateGw < 10000000000) lastUpdateGw *= 1000;

    const isGwOffline = now - lastUpdateGw > gwOfflineMs;

    if (isGwOffline) {
      if (shouldAlert("alert", gw.id)) {
        pushNotification({
          title: "Gateway ขาดการติดต่อ",
          message: `Gateway '${gw.name || gw.id}' ไม่มีการอัปเดตตั้งแต่ ${new Date(
            lastUpdateGw,
          ).toLocaleString()} (เกินขีดจำกัด ${gwOfflineThresh} นาที)`,
          type: "alert",
          deviceId: gw.id,
        });
      }
    }
  });

  // 2. Check Inactive Device (Offline)
  const nodeOfflineThresh = Number(alertSettings.value?.nodeOfflineTimeout || 15);
  const nodeOfflineMs = nodeOfflineThresh * 60 * 1000;

  devices.value.forEach((device) => {
    if (!configuredIds.has(device.id)) return; // 🆕 Skip ghost devices

    const lastUpdate = device.last_update || 0;
    const isOfflineText = now - lastUpdate > nodeOfflineMs;
    const isSleeping = device.status === "Sleep" || device.status === "Pending Sleep";

    if (isOfflineText && !isSleeping) {
      if (shouldAlert("alert", device.id)) {
        pushNotification({
          title: "อุปกรณ์ขาดการติดต่อ",
          message: `อุปกรณ์ '${device.name}' ไม่มีการอัปเดตตั้งแต่ ${new Date(
            lastUpdate,
          ).toLocaleString()}`,
          type: "alert",
          deviceId: device.id,
        });
      }
    }
  });

  // 3. Check Unscheduled Usage (Real-time Channel Level)
  if (deviceMappings.value && telemetryData.value) {
    const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" }); // e.g., "Monday"
    const nowTime = new Date().toTimeString().slice(0, 5); // "09:30"

    // Loop through all mapped devices
    Object.entries(deviceMappings.value).forEach(([deviceId, mappings]) => {
      // Loop through all channels mapped for this device
      Object.entries(mappings).forEach(([chKey, roomName]) => {
        // Skip label keys and unassigned rooms
        if (chKey.endsWith("_label") || !roomName) return;

        // Verify we have telemetry for this device and channel
        // Check both 'chX' object and 'chX_power' flat field
        const deviceTel = telemetryData.value[deviceId];
        if (deviceTel) {
          const pKey = `${chKey}_power`;
          const currentPower = Number(
            deviceTel[pKey] || deviceTel[chKey]?.power || deviceTel[chKey]?.watt || 0,
          );

          if (currentPower > THRESHOLD_POWER_USAGE) {
            // Find active schedule for this room
            const isOccupied = schedules.value.some((schedule) => {
              if (
                schedule.day !== dayName ||
                schedule.room !== roomName ||
                schedule.status !== "Active"
              )
                return false;
              // Parse time range "09:00 - 12:00"
              const [start, end] = schedule.time.split(" - ");
              return nowTime >= start && nowTime <= end;
            });

            // If NOT occupied but using power -> Alert
            if (!isOccupied) {
              const compoundId = `unscheduled_${deviceId}_${chKey}`;
              if (shouldAlert("warning", compoundId)) {
                pushNotification({
                  title: "ตรวจพบการใช้พลังงานนอกตารางเวลา 🚨",
                  message: `ตรวจพบโหนด '${deviceId}' (${chKey}) แอบดึงกระแสไฟสูงถึง ${currentPower.toFixed(0)}W ในห้อง '${roomName}' ทั้งที่ไม่มีคลาสเรียน`,
                  type: "warning",
                  deviceId: compoundId,
                });
              }
            }
          }
        }
      });
    });
  }
};

const pushNotification = async (payload) => {
  try {
    const alertKey = `${payload.type}_${payload.deviceId}`;
    localAlertCache.value[alertKey] = Date.now(); // Update local cache to prevent immediate repeat

    await push(notiRef, {
      ...payload,
      timestamp: Date.now(),
      isRead: false,
    });
    console.log("✅ Alert Sent:", payload.title);
  } catch (e) {
    console.error("Failed to send alert:", e);
  }
};

// --- Lifecycle ---
onMounted(() => {
  // Listen to data
  onValue(devicesRef, (snapshot) => {
    const data = snapshot.val();
    devices.value = data ? Object.keys(data).map((k) => ({ id: k, ...data[k] })) : [];
  });
  onValue(gatewaysRef, (snapshot) => {
    const data = snapshot.val();
    gateways.value = data ? Object.keys(data).map((k) => ({ id: k, ...data[k] })) : [];
  });
  onValue(schedulesRef, (snapshot) => {
    const data = snapshot.val();
    schedules.value = data ? Object.keys(data).map((k) => ({ id: k, ...data[k] })) : [];
  });
  onValue(configRef, (arr) => (buildingConfig.value = arr.val() || {}));
  onValue(settingsRef, (val) => (alertSettings.value = val.val() || { batteryThreshold: 20 }));
  onValue(notiRef, (snapshot) => {
    const data = snapshot.val();
    notifications.value = data ? Object.keys(data).map((k) => ({ id: k, ...data[k] })) : [];
  });
  onValue(mappingsRef, (snapshot) => {
    deviceMappings.value = snapshot.val() || {};
  });
  onValue(telemetryRef, (snapshot) => {
    telemetryData.value = snapshot.val() || {};
  });

  // Listen for Recovery Events to reset cooldowns
  const recoveryRef = dbRef(rtdb, "system_logs/reconnections");
  onValue(recoveryRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const timeline = {};
      Object.values(data).forEach((log) => {
        // We need to know which device this log belongs to.
        // Note: For now, if we don't have deviceId in recovery logs, we use the timestamp globally.
        // But better is to track per-device recovery.
        const ts = isNaN(new Date(log.timestamp).getTime()) ? 0 : new Date(log.timestamp).getTime();
        // Since current recovery logs are global messages, we'll treat any recovery as a potential reset for all.
        // In a more detailed system, we'd filter by device name if included in 'message'.
        if (!timeline["global"] || ts > timeline["global"]) {
          timeline["global"] = ts;
        }
      });
      recoveryTimeline.value = timeline;
    }
  });

  // Listen to Firestore Environment measurements
  const q = query(collection(firestoreDb, "measurements"), orderBy("timestamp", "desc"), limit(1));
  unsubFirestore = onSnapshot(q, (snapshot) => {
    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      const rawBat = data.battery !== undefined ? data.battery : data.bat;
      if (rawBat !== undefined && !isNaN(Number(String(rawBat).replace("%", "")))) {
        envBattery.value = Number(String(rawBat).replace("%", ""));

        if (data.timestamp && data.timestamp.toDate) {
          // Robust parsing logic here if needed for future battery offline checks
        }
        // Note: recordDate can be used for debugging or further logic if needed
      }

      // ⚡ Optimization: Removed auto-trigger check here.
      // It was firing too frequently (every new measurement).
      // The 1-minute interval is enough for battery/offline checks.
    }
  });

  // Start Interval
  timer = setInterval(runSystemChecks, CHECK_INTERVAL);
  // Run once immediately after short delay to ensure data loaded
  setTimeout(runSystemChecks, 3000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  off(devicesRef);
  off(gatewaysRef);
  off(schedulesRef);
  off(configRef);
  off(settingsRef);
  off(notiRef);
  off(mappingsRef);
  off(telemetryRef);
  if (unsubFirestore) unsubFirestore();
});
</script>

<template>
  <!-- Renderless Component -->
  <div v-if="false"></div>
</template>
