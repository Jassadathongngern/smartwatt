import { ref, onMounted, onUnmounted } from "vue";
// ✅ ดึงมาทั้ง db (Firestore) และ rtdb (Realtime DB)
import { db, rtdb } from "../firebase";
import { ref as dbRef, onValue, off } from "firebase/database";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";

const DEVICES_PATH = "devices";

export function useBuildingData() {
  const gatewayStatus = ref("Connecting...");
  const lastUpdate = ref("-");
  const allBuildingTotal = ref(0);
  const dailyEnergy = ref(0);
  const cost = ref(0);
  const totalUsage = ref(0);

  // ค่าสภาพแวดล้อม
  const pm25 = ref(0);
  const temperature = ref(0);
  const humidity = ref(0);
  const voltage = ref(0);
  const current = ref(0);

  const floorData = ref([
    {
      id: "3",
      totalPower: 0,
      status: "online",
      isExpanded: true,
      rooms: [
        { name: "16301", deviceId: "dev_001", type: "Server Room", power: 0, status: "offline" },
        { name: "16302", deviceId: "dev_002", type: "Classroom", power: 0, status: "offline" },
        { name: "16303", deviceId: "dev_003", type: "Office", power: 0, status: "offline" },
      ],
    },
    {
      id: "2",
      totalPower: 0,
      status: "online",
      isExpanded: false,
      rooms: [
        { name: "16201", deviceId: "dev_004", power: 0, status: "offline" },
        { name: "16202", deviceId: "dev_005", power: 0, status: "offline" },
        { name: "16203", deviceId: "dev_006", power: 0, status: "offline" },
      ],
    },
    {
      id: "1",
      totalPower: 0,
      status: "online",
      isExpanded: false,
      rooms: [
        { name: "16101", deviceId: "dev_007", power: 0, status: "offline" },
        { name: "16102", deviceId: "dev_008", power: 0, status: "offline" },
        { name: "Server", deviceId: "dev_009", power: 0, status: "offline" },
      ],
    },
  ]);

  let unsubFirestore = null;

  onMounted(() => {
    // 1️⃣ ดึงข้อมูล Devices จาก Realtime DB (ท่อ rtdb)
    const deviceRef = dbRef(rtdb, DEVICES_PATH);
    onValue(deviceRef, (snapshot) => {
      const allDevices = snapshot.val();
      if (allDevices) {
        // Logic คำนวณค่าไฟเดิมของคุณ...
        let grandTotal = 0;
        floorData.value.forEach((floor) => {
          let floorTotal = 0;
          floor.rooms.forEach((room) => {
            const deviceData = allDevices[room.deviceId];
            if (deviceData) {
              const p = Number(deviceData.w || 0);
              room.power = (p / 1000).toFixed(2);
              room.status = "online";
              floorTotal += p;
            }
          });
          floor.totalPower = (floorTotal / 1000).toFixed(2);
          grandTotal += floorTotal;
        });
        allBuildingTotal.value = grandTotal;
        dailyEnergy.value = ((grandTotal * 8) / 1000).toFixed(2);
        cost.value = (dailyEnergy.value * 4.5).toFixed(2);
      }
    });

    // 2️⃣ ดึงข้อมูล PM2.5/Temp จาก Firestore (ท่อ db)
    const q = query(collection(db, "measurements"), orderBy("timestamp", "desc"), limit(1));
    unsubFirestore = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        pm25.value = data.pm2_5 || 0;
        temperature.value = data.temperature || 0;
        humidity.value = data.humidity || 0;
        gatewayStatus.value = "Active";
        if (data.timestamp) {
          lastUpdate.value = data.timestamp.toDate().toLocaleTimeString("th-TH");
        }
      }
    });
  });

  onUnmounted(() => {
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
    toggleFloorExpand: (id) => {
      const f = floorData.value.find((x) => x.id === id);
      if (f) f.isExpanded = !f.isExpanded;
    },
  };
}
