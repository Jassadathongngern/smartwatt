<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { rtdb as db } from "../firebase";
import { ref as dbRef, onValue, push, off } from "firebase/database";

// --- Configuration ---
const CHECK_INTERVAL = 60000; // Run checks every 1 minute
const THRESHOLD_POWER_USAGE = 100; // Watts (Threshold to consider "in use")
const SPAM_COOLDOWN = 12 * 60 * 60 * 1000; // 12 Hours (Don't alert same issue again within this time)

// --- State ---
const devices = ref([]);
const schedules = ref([]);
const buildingConfig = ref({});
const alertSettings = ref({ batteryThreshold: 20 });
const notifications = ref([]);

// --- Firebase References ---
const devicesRef = dbRef(db, "devices");
const schedulesRef = dbRef(db, "schedules");
const configRef = dbRef(db, "building_configs");
const settingsRef = dbRef(db, "alert_settings");
const notiRef = dbRef(db, "notifications");

let timer = null;

// --- Helper: Get Location ---
const getDeviceLocation = (deviceId) => {
  if (!buildingConfig.value) return { room: "Unknown", floor: "-" };
  for (const [floorKey, floorData] of Object.entries(buildingConfig.value)) {
    if (floorData.rooms) {
      for (const [roomName, roomData] of Object.entries(floorData.rooms)) {
        if (roomData.deviceId === deviceId) {
          return { room: roomName, floor: floorKey.replace("floor_", "") };
        }
      }
    }
  }
  return { room: "Unassigned", floor: "-" };
};

// --- Helper: Spam Check ---
// Returns true if we should alert
const shouldAlert = (type, deviceId) => {
  const now = Date.now();
  // Check existing notifications in local state (or fetch recent ones)
  // We look for a similar alert for this device in the last 12 hours
  const recentAlert = notifications.value.find(
    (n) =>
      n.type === type &&
      n.deviceId === deviceId &&
      now - new Date(n.timestamp).getTime() < SPAM_COOLDOWN,
  );
  return !recentAlert;
};

// --- Main Check Logic ---
const runSystemChecks = async () => {
  console.log("🔍 System Monitor: Running Background Checks...");
  const now = Date.now();

  // 1. Check Low Battery
  devices.value.forEach((device) => {
    if (device.battery < alertSettings.value.batteryThreshold) {
      if (shouldAlert("warning", device.id)) {
        pushNotification({
          title: "Low Battery Warning",
          message: `Device '${device.name}' battery is at ${device.battery}% (Lower than ${alertSettings.value.batteryThreshold}%)`,
          type: "warning",
          deviceId: device.id,
        });
      }
    }
  });

  // 2. Check Inactive Device (Offline)
  devices.value.forEach((device) => {
    // Default rate 5 min if not set
    const rateMin = device.sendRate ? parseInt(device.sendRate.toString().replace(" min", "")) : 5;
    const timeoutMs = rateMin * 3 * 60 * 1000; // 3 times the send rate
    const lastUpdate = device.last_update || 0;

    if (now - lastUpdate > timeoutMs) {
      if (shouldAlert("alert", device.id)) {
        pushNotification({
          title: "Device Offline",
          message: `Device '${device.name}' has not updated since ${new Date(
            lastUpdate,
          ).toLocaleString()}`,
          type: "alert",
          deviceId: device.id,
        });
      }
    }
  });

  // 3. Check Unscheduled Usage
  devices.value.forEach((device) => {
    // Only check if device is a Meter (not Sensor) and has high power usage
    // Access 'power' or 'kW' field. Assuming 'power' (Watts)
    const currentPower = Number(device.power || 0);

    if (device.type === "Meter" && currentPower > THRESHOLD_POWER_USAGE) {
      const location = getDeviceLocation(device.id);

      if (location.room !== "Unassigned") {
        // Check if room is currently booked
        const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" }); // e.g., "Monday"
        const nowTime = new Date().toTimeString().slice(0, 5); // "09:30"

        // Find active schedule for this room
        const isOccupied = schedules.value.some((schedule) => {
          if (
            schedule.day !== dayName ||
            schedule.room !== location.room ||
            schedule.status !== "Active"
          )
            return false;
          // Parse time range "09:00 - 12:00"
          const [start, end] = schedule.time.split(" - ");
          return nowTime >= start && nowTime <= end;
        });

        // If NOT occupied but using power -> Alert
        if (!isOccupied) {
          if (shouldAlert("info", device.id)) {
            pushNotification({
              title: "Unscheduled Energy Usage",
              message: `High usage (${currentPower}W) detected in '${location.room}' with no scheduled class.`,
              type: "info",
              deviceId: device.id,
            });
          }
        }
      }
    }
  });
};

const pushNotification = async (payload) => {
  try {
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

  // Start Interval
  timer = setInterval(runSystemChecks, CHECK_INTERVAL);
  // Run once immediately after short delay to ensure data loaded
  setTimeout(runSystemChecks, 3000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  off(devicesRef);
  off(schedulesRef);
  off(configRef);
  off(settingsRef);
  off(notiRef);
});
</script>

<template>
  <!-- Renderless Component -->
  <div v-if="false"></div>
</template>
