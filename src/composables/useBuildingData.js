import { ref, onMounted, onUnmounted } from "vue";
import { db } from "../firebase";
import { ref as dbRef, onValue, off } from "firebase/database";

// Path constants
const DEVICES_PATH = "devices";

export function useBuildingData() {
  // --- Shared State ---
  const gatewayStatus = ref("Connecting...");
  const lastUpdate = ref("-");
  const allBuildingTotal = ref(0); // W (วัตต์รวม)

  // ✅ เพิ่มตัวแปรที่ขาดหายไป กัน Error
  const dailyEnergy = ref(0); // kWh
  const cost = ref(0); // Baht
  const totalUsage = ref(0); // MWh
  const pm25 = ref(0); // ug/m3

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

  const deviceCache = ref({});

  // Main logic
  const updateFloorValues = () => {
    const allDevices = deviceCache.value;
    if (!allDevices) return;

    let grandTotal = 0; // Watt

    floorData.value.forEach((floor) => {
      let floorTotal = 0;
      floor.rooms.forEach((room) => {
        // ⚠️ แก้เรื่อง Case Sensitive: พยายามหาทั้งแบบตรงตัวและตัวเล็ก
        const exactKey = room.deviceId;
        const lowerKey = room.deviceId?.toLowerCase();
        const deviceData = allDevices[exactKey] || allDevices[lowerKey];

        if (deviceData) {
          // รองรับทั้ง key 'w' (สั้น) และ 'power' (ยาว)
          const p = Number(deviceData.w || deviceData.power || 0);
          room.power = (p / 1000).toFixed(2); // แปลง W -> kW
          room.status = "online";
          floorTotal += p;
        } else {
          room.status = "offline";
        }
      });
      floor.totalPower = (floorTotal / 1000).toFixed(2);
      grandTotal += floorTotal;
    });

    allBuildingTotal.value = grandTotal;

    // ✅ คำนวณค่าไฟจำลอง (Mock Calculation) จาก Watt รวม
    // สมมติ: เปิดแบบนี้มา 8 ชม. แล้ว (แค่ให้เลขมันขยับดูสมจริง)
    const kwhEstimate = (grandTotal * 8) / 1000;
    dailyEnergy.value = kwhEstimate.toFixed(2);
    cost.value = (kwhEstimate * 4.5).toFixed(2); // ค่าไฟหน่วยละ 4.5 บาท
    totalUsage.value = ((kwhEstimate * 30) / 1000).toFixed(3); // Mock รายเดือน (MWh)
  };

  // Stats
  const voltage = ref(0);
  const current = ref(0);
  const power = ref(0);
  const temperature = ref(0);
  const humidity = ref(0);

  const updateMainCardStats = (allDevices) => {
    // เลือกตัวแทนหมู่บ้านมา 1 ตัว (dev_001)
    const mainDev = allDevices?.["dev_001"] || allDevices?.["DEV_001"];

    if (mainDev) {
      gatewayStatus.value = "Active";
      if (mainDev.last_update) {
        // แปลงเวลาให้สวยงาม
        try {
          lastUpdate.value = new Date(mainDev.last_update).toLocaleTimeString("th-TH");
        } catch {
          lastUpdate.value = mainDev.last_update;
        }
      }
      voltage.value = mainDev.v || mainDev.voltage || 0;
      current.value = mainDev.a || mainDev.current || 0;
      power.value = mainDev.w || mainDev.power || 0;
      temperature.value = mainDev.temp || 0;
      humidity.value = mainDev.hum || mainDev.humidity || 0;
      pm25.value = mainDev.pm2_5 || 35; // ถ้าไม่มีให้ Default 35
    } else {
      gatewayStatus.value = "Offline";
      lastUpdate.value = "-";
    }
  };

  const deviceRef = dbRef(db, DEVICES_PATH);

  onMounted(() => {
    onValue(
      deviceRef,
      (snapshot) => {
        const allDevices = snapshot.val();
        if (allDevices) {
          deviceCache.value = allDevices;
          updateFloorValues();
          updateMainCardStats(allDevices);
        } else {
          deviceCache.value = {};
          updateFloorValues();
          updateMainCardStats(null);
        }
      },
      (error) => {
        console.error("Firebase Error:", error);
        gatewayStatus.value = "Error";
      },
    );
  });

  onUnmounted(() => {
    off(deviceRef);
  });

  return {
    gatewayStatus,
    lastUpdate,
    allBuildingTotal,
    floorData,
    voltage,
    current,
    power,
    temperature,
    humidity,
    // ✅ ส่งตัวแปรที่เพิ่มใหม่กลับไปด้วย
    dailyEnergy,
    cost,
    totalUsage,
    pm25,
    toggleFloorExpand: (floorId) => {
      const target = floorData.value.find((f) => f.id === floorId);
      if (target) {
        target.isExpanded = !target.isExpanded;
      }
    },
  };
}
