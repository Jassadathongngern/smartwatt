import { ref, onMounted, onUnmounted } from "vue";
import { db, rtdb } from "../firebase";
import { ref as dbRef, onValue } from "firebase/database";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";

export function useBuildingData() {
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

  // Dynamic Floor Data
  const floorData = ref([]);

  // Raw Data Refs
  const devices = ref({});
  const buildingConfig = ref({});

  let unsubFirestore = null;

  // --- Logic: Process Data ---
  const processData = () => {
    if (!devices.value || !buildingConfig.value) return;

    // 1. Reset Totals
    let rawTotalPower = 0; // Watts
    const newFloorData = [];

    // 2. Iterate Config to build Floor Data
    // Force Include Floors 1, 2, 3 even if no data
    const floorsToCheck = ["1", "2", "3"];

    floorsToCheck.forEach((floorNum) => {
      const floorKey = `floor_${floorNum}`;
      const floorVal = buildingConfig.value[floorKey] || {};
      const rooms = floorVal.rooms || {};

      // Preserve expansion state if exists
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

      // If no rooms, maybe add a dummy placeholder or just leave empty?
      // User said "put them in even if no data".
      // Let's populate rooms if they exist in config.

      if (Object.keys(rooms).length > 0) {
        Object.entries(rooms).forEach(([roomName, roomData]) => {
          const deviceId = roomData.deviceId;
          const device = devices.value[deviceId];

          let roomPowerW = 0; // Watts
          let roomStatus = "offline";

          if (device) {
            roomStatus = device.status === "Active" ? "online" : "offline";

            // --- ⚡ Sub-metering Logic ⚡ ---
            const specificKey = `power_room_${roomName}`;

            if (device[specificKey] !== undefined) {
              roomPowerW = Number(device[specificKey]);
            } else {
              roomPowerW = Number(device.power || 0);
            }

            if (roomPowerW < 0 || roomPowerW > 50000) roomPowerW = 0;
          }

          floorTotalWatts += roomPowerW;

          floorObj.rooms.push({
            name: roomName,
            deviceId: deviceId,
            type: roomData.type || "Room",
            power: (roomPowerW / 1000).toFixed(2), // kW
            status: roomStatus,
          });
        });
      } else {
        // Optional: Add a default "Empty" room setup if absolute zero config?
        // For now, let's keep rooms array empty, so it just shows the Floor header with 0 kW.
      }

      floorObj.totalPower = (floorTotalWatts / 1000).toFixed(2); // kW
      rawTotalPower += floorTotalWatts;
      newFloorData.push(floorObj);
    });

    // Sort Floors (3, 2, 1) - Building Layout
    newFloorData.sort((a, b) => Number(b.id) - Number(a.id));
    floorData.value = newFloorData;

    // 3. Update Building Globals
    // Simple Moving Average to smooth values
    if (!window.powerHistory) window.powerHistory = [];
    window.powerHistory.push(rawTotalPower);
    if (window.powerHistory.length > 5) window.powerHistory.shift();

    const avgPower = window.powerHistory.reduce((a, b) => a + b, 0) / window.powerHistory.length;

    allBuildingTotal.value = avgPower.toFixed(2);
    dailyEnergy.value = ((avgPower * 24) / 1000).toFixed(2); // Estimate
    cost.value = (dailyEnergy.value * 4.5).toFixed(2);

    // Update Gateway Status based on whether we have devices
    gatewayStatus.value = Object.keys(devices.value).length > 0 ? "Active" : "Offline";

    // 4. Update Electrical Metrics (Take from first active meter)
    const firstMeter = Object.values(devices.value).find(
      (d) => d.device_type === "POWER_METER" || d.power !== undefined,
    );
    if (firstMeter) {
      voltage.value = Number(firstMeter.voltage || 0).toFixed(1);
      current.value = Number(firstMeter.current || 0).toFixed(2);
    }
  };

  let unsubConfig = null;
  let unsubDevices = null;

  onMounted(() => {
    // 1. Listen to Config
    const configRef = dbRef(rtdb, "building_configs");
    unsubConfig = onValue(configRef, (snapshot) => {
      buildingConfig.value = snapshot.val() || {};
      processData();
    });

    // 2. Listen to Devices
    const devicesRef = dbRef(rtdb, "devices");
    unsubDevices = onValue(devicesRef, (snapshot) => {
      devices.value = snapshot.val() || {};
      processData();
    });

    // 3. Listen to Environment (Legacy Firestore)
    const q = query(collection(db, "measurements"), orderBy("timestamp", "desc"), limit(1));
    unsubFirestore = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        pm25.value = data.pm2_5 || 0;
        temperature.value = data.temperature || 0;
        humidity.value = data.humidity || 0;
        battery.value = data.battery || data.bat || 0;
        if (data.timestamp) {
          lastUpdate.value = data.timestamp.toDate().toLocaleTimeString("th-TH");
        }
      }
    });
  });

  onUnmounted(() => {
    if (unsubConfig) unsubConfig();
    if (unsubDevices) unsubDevices();
    if (unsubFirestore) unsubFirestore();
  });

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
    toggleFloorExpand: (id) => {
      const f = floorData.value.find((x) => x.id === id);
      if (f) f.isExpanded = !f.isExpanded;
    },
  };
}
