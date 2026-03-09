import { ref } from "vue";
import { db, rtdb } from "../firebase";
import { ref as dbRef, onValue, push } from "firebase/database";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";

// --- Global Shared State (Singleton) ---
const gatewayStatus = ref("Connecting...");
const lastUpdate = ref("-");
const allBuildingTotal = ref(0);
const dailyEnergy = ref(0);
const cost = ref(0);
const totalUsage = ref(0);

// Environment & Electrical Metrics
const pm25 = ref(0);
const temperature = ref(0);
const humidity = ref(0);
const voltage = ref(0);
const current = ref(0);
const battery = ref(0);
const systemHealth = ref(100);

const floorData = ref([]);

// Notifications
const unreadNotiCount = ref(0);
const latestNotiMessage = ref("System Normal");

const currentTime = ref(Date.now());
let previousGatewayStatus = null; // Track previous state for logging
let lastLogTimestamp = 0; // 🆕 Track time for Anti-Spam Logging (Cooldown)

// Raw Data Refs
const devices = ref({});
const gateways = ref({});
const buildingConfig = ref({});
const deviceMappings = ref({});
const telemetryData = ref({});
const alertSettings = ref({ offlineTimeout: 15 });

let isInitialized = false;

// --- Logic: Utils ---
const normalizeTime = (time) => {
  if (!time) return 0;
  // Handle String format: "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SS" for cross-browser reliability
  if (typeof time === "string") {
    const isoStr = time.includes(" ") ? time.replace(" ", "T") : time;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  if (time > 0 && time < 10000000000) return time * 1000;
  return time;
};

// --- Logic: Process Data ---
const processData = () => {
  if (!devices.value || !buildingConfig.value) return;

  // 1. Reset Totals
  let rawTotalPower = 0; // Watts
  const newFloorData = [];
  const configuredDeviceIds = new Set(); // 🆕 Track configured IDs for health check

  // 2. Iterate Config to build Floor Data
  const floorsToCheck = ["1", "2", "3"];

  floorsToCheck.forEach((floorNum) => {
    const floorKey = `floor_${floorNum}`;
    const floorVal = buildingConfig.value[floorKey] || {};
    const rooms = floorVal.rooms || {};

    const existingFloor = floorData.value.find((f) => f.id === floorNum);
    const isExpanded = existingFloor ? existingFloor.isExpanded : floorNum === "3";

    const floorObj = {
      id: floorNum,
      totalPower: 0, // kW
      status: "online",
      isExpanded: isExpanded,
      rooms: [],
    };

    let floorTotalWatts = 0;

    if (Object.keys(rooms).length > 0) {
      Object.entries(rooms).forEach(([roomName, roomData]) => {
        const deviceId = roomData.deviceId;

        // 2.a. Aggregate data from ALL devices related to this room
        let temp = null,
          tempTs = 0;
        let hum = null,
          humTs = 0;
        let pm = null,
          pmTs = 0;
        let roomPowerW = 0;
        let hasPower = false;
        let roomStatus = "offline";
        let foundDevices = [];

        // Add the primary device from buildingConfig
        if (deviceId) {
          foundDevices.push(deviceId);
          configuredDeviceIds.add(deviceId);
        }

        // Add any devices from deviceMappings that point to this room
        if (deviceMappings.value) {
          Object.entries(deviceMappings.value).forEach(([mDevId, mappings]) => {
            if (Object.values(mappings).includes(roomName)) {
              configuredDeviceIds.add(mDevId);
              if (!foundDevices.includes(mDevId)) foundDevices.push(mDevId);
            }
          });
        }

        // Process all found devices for this room
        foundDevices.forEach((dId) => {
          const device = devices.value[dId];
          if (!device) return;

          const deviceTimestamp = normalizeTime(device.last_update);

          // --- Determine Status (Online/Offline/Sleep) ---
          const offlineNodeThresh = Number(alertSettings.value?.nodeOfflineTimeout || 15);
          const offlineNodeMs = offlineNodeThresh * 60 * 1000;

          const isOff = deviceTimestamp
            ? currentTime.value - deviceTimestamp > offlineNodeMs
            : true;
          const isSlp = device.status === "Sleep" || device.status === "Pending Sleep";

          let dStatus = isSlp
            ? "sleep"
            : isOff
              ? "offline"
              : device.status === "Active"
                ? "online"
                : "offline";

          // If any device is online, the room is online
          if (roomStatus === "offline" || (roomStatus === "sleep" && dStatus === "online")) {
            roomStatus = dStatus;
          }

          // --- Get Room Power ---
          const mappings = deviceMappings.value && deviceMappings.value[dId];
          let foundPowerForDevice = false;
          let deviceRoomPower = 0;

          if (mappings) {
            const chKey = Object.keys(mappings).find((k) => mappings[k] === roomName);

            if (chKey) {
              const pKey = `ch${chKey}_power`;
              const altPKey = chKey === "1" ? "power_A" : chKey === "2" ? "power_B" : "power_C";
              const roomPKey = `power_room_${roomName}`;
              deviceRoomPower = Number(
                device[pKey] ||
                  device[`power_ch${chKey}`] ||
                  device[`${chKey}_power`] ||
                  device[altPKey] ||
                  device[roomPKey] ||
                  0,
              );
              foundPowerForDevice = true;
            }
          } else if (device.total_power !== undefined || device.power !== undefined) {
            deviceRoomPower = Number(device.total_power || device.power || 0);
            foundPowerForDevice = true;
          }

          if (foundPowerForDevice && deviceRoomPower >= 0 && deviceRoomPower < 50000) {
            // Force power to 0 if device is offline or in error state
            if (roomStatus === "offline") {
              roomPowerW += 0;
            } else {
              roomPowerW += deviceRoomPower;
            }
            hasPower = true;
          }

          // --- Get Environment (Freshest Value Wins) ---
          const dTemp = device.temperature !== undefined ? device.temperature : device.temp;
          if (dTemp !== undefined && deviceTimestamp >= tempTs) {
            temp = dTemp;
            tempTs = deviceTimestamp;
          }

          const dHumid = device.humidity;
          if (dHumid !== undefined && deviceTimestamp >= humTs) {
            hum = dHumid;
            humTs = deviceTimestamp;
          }

          const dPM =
            device.pm2_5 !== undefined
              ? device.pm2_5
              : device.pm25 !== undefined
                ? device.pm25
                : device.pm_2_5;
          if (dPM !== undefined && deviceTimestamp >= pmTs) {
            pm = dPM;
            pmTs = deviceTimestamp;
          }
        });

        rawTotalPower += roomPowerW;

        floorTotalWatts += roomPowerW;

        floorObj.rooms.push({
          name: roomName,
          deviceId: deviceId,
          type: roomData.type || "Room",
          power: hasPower ? (roomPowerW / 1000).toFixed(2) : null, // kW
          status: roomStatus,
          temperature: temp,
          humidity: hum,
          pm25: pm,
        });
      });
    }

    floorObj.totalPower = (floorTotalWatts / 1000).toFixed(2); // kW
    newFloorData.push(floorObj);
  });

  // Sort Floors (3, 2, 1) - Building Layout
  newFloorData.sort((a, b) => Number(b.id) - Number(a.id));
  floorData.value = newFloorData;

  // --- Aggregate Global Env Stats from RTDB (instead of Firestore doc) ---
  let sumTemp = 0,
    countTemp = 0;
  let sumHum = 0,
    countHum = 0;
  let sumPM = 0,
    countPM = 0;

  newFloorData.forEach((f) => {
    f.rooms.forEach((r) => {
      if (r.temperature !== null) {
        sumTemp += Number(r.temperature);
        countTemp++;
      }
      if (r.humidity !== null) {
        sumHum += Number(r.humidity);
        countHum++;
      }
      if (r.pm25 !== null) {
        sumPM += Number(r.pm25);
        countPM++;
      }
    });
  });

  if (countTemp > 0) temperature.value = (sumTemp / countTemp).toFixed(1);
  if (countHum > 0) humidity.value = (sumHum / countHum).toFixed(0);
  if (countPM > 0) pm25.value = (sumPM / countPM).toFixed(0);

  // --- Aggregate Global Battery Status ---
  let sumBat = 0,
    countBat = 0;
  Object.values(devices.value).forEach((d) => {
    const bVal = d.battery !== undefined ? d.battery : d.bat;
    if (bVal !== undefined) {
      sumBat += Number(bVal);
      countBat++;
    }
  });
  if (countBat > 0) battery.value = Math.round(sumBat / countBat);

  // --- 6. Evaluate Gateway Status ---
  let maxGatewayTime = 0;
  Object.values(gateways.value).forEach((gw) => {
    let gwTime = gw.last_update || 0;
    if (typeof gwTime === "string") gwTime = new Date(gwTime).getTime();
    else if (gwTime > 0 && gwTime < 10000000000) gwTime *= 1000;

    if (gwTime > maxGatewayTime) {
      maxGatewayTime = gwTime;
    }
  });

  const offlineGwThresh = Number(alertSettings.value?.gatewayOfflineTimeout || 15);
  const offlineGwMs = offlineGwThresh * 60 * 1000;

  if (Object.keys(gateways.value).length === 0) {
    const offlineNodeThresh = Number(alertSettings.value?.nodeOfflineTimeout || 15);
    const offlineNodeMs = offlineNodeThresh * 60 * 1000;
    let anyDeviceActive = false;

    Object.values(devices.value).forEach((device) => {
      let dTime = device.last_update || 0;
      if (typeof dTime === "string") dTime = new Date(dTime).getTime();
      else if (dTime > 0 && dTime < 10000000000) dTime *= 1000;

      if (currentTime.value - dTime <= offlineNodeMs) {
        anyDeviceActive = true;
      }
    });
    gatewayStatus.value = anyDeviceActive ? "Active" : "Offline";
  } else {
    gatewayStatus.value = currentTime.value - maxGatewayTime > offlineGwMs ? "Offline" : "Active";
  }

  // --- 4. Global Offline Override (If Gateway is Offline, Power is 0) ---
  if (gatewayStatus.value === "Offline") {
    allBuildingTotal.value = "0.00";
    rawTotalPower = 0;
    floorData.value.forEach((floor) => {
      floor.totalPower = "0.00";
      floor.rooms.forEach((room) => {
        room.power = "0.00";
        room.status = "offline";
      });
    });
  } else {
    allBuildingTotal.value = (rawTotalPower / 1000).toFixed(2);
  }

  // Calculate Daily Energy (kWh)
  const estimatedDaily = (rawTotalPower * 24) / 1000;
  dailyEnergy.value = isNaN(estimatedDaily) ? "0.00" : estimatedDaily.toFixed(2);

  // 🆕 Calculate Total Usage (kWh) from all devices
  let buildingEnergyTotal = 0;
  if (devices.value) {
    Object.values(devices.value).forEach((dev) => {
      const eVal = Number(dev.total_energy || dev.energy || dev.kWh || dev.e || 0);
      buildingEnergyTotal += eVal;
    });
  }
  totalUsage.value = buildingEnergyTotal > 0 ? buildingEnergyTotal.toFixed(1) : "0.0";

  const calculatedCost = Number(dailyEnergy.value) * 4.5;
  cost.value = isNaN(calculatedCost) ? "0.00" : calculatedCost.toFixed(2);

  // --- 🖋️ System Recovery Logging ---
  if (previousGatewayStatus === "Offline" && gatewayStatus.value === "Active") {
    const now = Date.now();
    const LOG_COOLDOWN_MS = 5 * 60 * 1000;
    if (now - lastLogTimestamp > LOG_COOLDOWN_MS) {
      let activeGwIds = [];
      Object.entries(gateways.value).forEach(([id, gw]) => {
        let gwTime = gw.last_update || 0;
        if (typeof gwTime === "string") gwTime = new Date(gwTime).getTime();
        else if (gwTime > 0 && gwTime < 10000000000) gwTime *= 1000;
        if (currentTime.value - gwTime <= offlineGwMs) activeGwIds.push(id);
      });
      const gwName = activeGwIds.length > 0 ? activeGwIds.join(", ") : "Main Gateway";
      push(dbRef(rtdb, "system_logs/reconnections"), {
        event: "Recovery",
        target: "Gateway",
        deviceId: gwName,
        status: "Active",
        timestamp: new Date().toISOString(),
        message: `กู้คืนการเชื่อมต่อสำเร็จ: อุปกรณ์ [${gwName}] (Recovery from Offline)`,
      });
      lastLogTimestamp = now;
    }
  }
  previousGatewayStatus = gatewayStatus.value;

  // 4. Update Electrical Metrics (Stable Meter Selection Logic)
  const powerMeters = Object.values(devices.value)
    .filter(
      (d) =>
        d.device_type === "POWER_METER" || d.total_power !== undefined || d.power !== undefined,
    )
    .sort((a, b) => {
      // 1. Prioritize Main Meters (Explicitly type="POWER_METER")
      const aMain = a.device_type === "POWER_METER" ? 1 : 0;
      const bMain = b.device_type === "POWER_METER" ? 1 : 0;
      if (aMain !== bMain) return bMain - aMain;

      // 2. Prioritize higher Power reading (Likely the primary house meter)
      const aPow = Number(a.total_power || a.power || 0);
      const bPow = Number(b.total_power || b.power || 0);
      if (Math.abs(aPow - bPow) > 50) return bPow - aPow;

      // 3. Finally, use Freshest Update
      return normalizeTime(b.last_update) - normalizeTime(a.last_update);
    });

  const latestMeter = powerMeters[0];
  if (latestMeter) {
    voltage.value = Number(
      latestMeter.total_voltage || latestMeter.voltage || latestMeter.voltage_A || 0,
    ).toFixed(1);
    current.value = Number(
      latestMeter.total_current || latestMeter.current || latestMeter.current_A || 0,
    ).toFixed(2);
  }

  // 7. Calculate System Health (Only for Configured Devices)
  const allDevices = Array.from(configuredDeviceIds)
    .map((id) => devices.value[id])
    .filter(Boolean);
  const totalDevices = allDevices.length;
  let onlineDevices = 0;

  if (totalDevices > 0) {
    const offlineNodeThresh = Number(alertSettings.value?.nodeOfflineTimeout || 15);
    const offlineNodeMs = offlineNodeThresh * 60 * 1000;

    allDevices.forEach((device) => {
      let lastUpdate = 0;
      if (device.last_update) {
        if (typeof device.last_update === "string") {
          lastUpdate = new Date(device.last_update).getTime();
        } else {
          lastUpdate = device.last_update;
          if (lastUpdate > 0 && lastUpdate < 10000000000) lastUpdate *= 1000;
        }
      }

      const isOffline = lastUpdate ? currentTime.value - lastUpdate > offlineNodeMs : true;
      const isSleeping = device.status === "Sleep" || device.status === "Pending Sleep";

      if (!isOffline || isSleeping) {
        onlineDevices++;
      }
    });
    systemHealth.value = Math.round((onlineDevices / totalDevices) * 100);
  } else {
    systemHealth.value = 100;
  }
};

export function useBuildingData() {
  if (!isInitialized) {
    isInitialized = true;

    setInterval(() => {
      currentTime.value = Date.now();
      processData();
    }, 30000);

    const configRef = dbRef(rtdb, "building_configs");
    onValue(configRef, (snapshot) => {
      buildingConfig.value = snapshot.val() || {};
      processData();
    });

    const devicesRef = dbRef(rtdb, "devices");
    onValue(devicesRef, (snapshot) => {
      devices.value = snapshot.val() || {};
      processData();
    });

    const gatewaysRef = dbRef(rtdb, "gateways");
    onValue(gatewaysRef, (snapshot) => {
      gateways.value = snapshot.val() || {};
      processData();
    });

    const settingsRef = dbRef(rtdb, "alert_settings");
    onValue(settingsRef, (snapshot) => {
      alertSettings.value = snapshot.val() || { offlineTimeout: 15 };
      processData();
    });

    const mappingsRef = dbRef(rtdb, "device_mappings");
    onValue(mappingsRef, (snapshot) => {
      deviceMappings.value = snapshot.val() || {};
      processData();
    });

    const telemetryRef = dbRef(rtdb, "device_telemetry");
    onValue(telemetryRef, (snapshot) => {
      telemetryData.value = snapshot.val() || {};
      processData();
    });

    const q = query(collection(db, "measurements"), orderBy("timestamp", "desc"), limit(1));
    onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        // pm25, temperature, humidity are now driven by processData() from live RTDB
        battery.value = data.battery || data.bat || 0;
        if (data.timestamp) {
          let dateObj;
          if (data.timestamp.toDate) {
            dateObj = data.timestamp.toDate();
          } else {
            const isoStr = data.timestamp.toString().includes(" ")
              ? data.timestamp.replace(" ", "T")
              : data.timestamp;
            dateObj = new Date(isoStr);
          }
          lastUpdate.value = isNaN(dateObj.getTime()) ? "-" : dateObj.toLocaleTimeString("th-TH");
        }
      }
    });

    const notiRef = dbRef(rtdb, "notifications");
    onValue(notiRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const loadedNotis = Object.keys(data).map((key) => data[key]);
        const unread = loadedNotis.filter((n) => !n.isRead);
        unreadNotiCount.value = unread.length;

        if (unread.length > 0) {
          unread.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          latestNotiMessage.value = unread[0].title || unread[0].message || "มีแจ้งเตือนใหม่";
        } else {
          latestNotiMessage.value = "System Normal";
        }
      } else {
        unreadNotiCount.value = 0;
        latestNotiMessage.value = "System Normal";
      }
    });
  }

  return {
    gatewayStatus,
    lastUpdate,
    allBuildingTotal,
    floorData,
    voltage,
    current,
    temperature,
    humidity,
    dailyEnergy,
    cost,
    totalUsage,
    pm25,
    battery,
    unreadNotiCount,
    latestNotiMessage,
    systemHealth,
    toggleFloorExpand: (id) => {
      const f = floorData.value.find((x) => x.id === id);
      if (f) f.isExpanded = !f.isExpanded;
    },
    deviceMappings,
  };
}
