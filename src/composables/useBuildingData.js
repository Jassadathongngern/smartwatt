import { ref, onMounted, onUnmounted } from "vue";
import { db, rtdb } from "../firebase";
import { ref as dbRef, onValue } from "firebase/database";

const DEVICES_PATH = "devices";

export function useBuildingData() {
  const gatewayStatus = ref("Connecting...");
  const lastUpdate = ref("-");

  // ค่าสรุป (Summary)
  const allBuildingTotal = ref(0);
  const dailyEnergy = ref(0);
  const cost = ref(0);
  const totalUsage = ref(0);

  // ค่า Sensor (Global Average/Total)
  const pm25 = ref(0);
  const temperature = ref(0);
  const humidity = ref(0);
  const voltage = ref(0);
  const current = ref(0);

  // ข้อมูลชั้นและห้อง
  // ✅ แก้ชื่อ deviceId ให้ตรงกับในรูปเรียบร้อยครับ
  const floorData = ref([
    {
      id: "3",
      totalPower: 0,
      status: "online",
      isExpanded: true,
      rooms: [
        {
          name: "16301",
          deviceId: "SmartWatt_Node_POWER_01", // ✅ ตัววัดไฟ (ใส่ตรงนี้)
          type: "Server Room",
          power: 0,
          status: "offline",
        },
        {
          name: "16302",
          deviceId: "SmartWatt_Node_ENV_01", // ✅ ตัววัดฝุ่น (ใส่ตรงนี้)
          type: "Classroom",
          power: 0,
          status: "offline",
        },
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

  onMounted(() => {
    const deviceRef = dbRef(rtdb, DEVICES_PATH);

    onValue(deviceRef, (snapshot) => {
      const allDevices = snapshot.val();

      if (allDevices) {
        gatewayStatus.value = "Active";

        // ตัวแปรสำหรับคำนวณ
        let grandTotalPower = 0;
        let grandTotalEnergy = 0;

        let sumCurrent = 0;
        let sumVoltage = 0;
        let countVoltage = 0;

        let sumTemp = 0;
        let countTemp = 0;
        let sumHum = 0;
        let sumPM25 = 0;
        let countEnv = 0;

        let latestTimestamp = 0;

        floorData.value.forEach((floor) => {
          let floorTotal = 0;

          floor.rooms.forEach((room) => {
            const deviceData = allDevices[room.deviceId];

            if (deviceData) {
              // --- 1. ไฟฟ้า ---
              const p = Number(deviceData.w || deviceData.power || 0);
              const v = Number(deviceData.voltage || 0);
              const c = Number(deviceData.current || 0);
              const e = Number(deviceData.energy || 0);

              room.power = (p / 1000).toFixed(2);
              room.status = "online";

              floorTotal += p;
              grandTotalEnergy += e;

              sumCurrent += c;
              if (v > 0) {
                sumVoltage += v;
                countVoltage++;
              }

              // --- 2. สภาพแวดล้อม ---
              const t = Number(deviceData.temperature || 0);
              const h = Number(deviceData.humidity || 0);
              const pm = Number(deviceData.pm2_5 || 0);

              if (t > 0 || pm > 0) {
                sumTemp += t;
                sumHum += h;
                sumPM25 += pm;
                countEnv++;
              }

              // --- 3. เช็คเวลาล่าสุด ---
              if (deviceData.last_update > latestTimestamp) {
                latestTimestamp = deviceData.last_update;
              }
            } else {
              room.status = "offline";
              room.power = 0;
            }
          });

          floor.totalPower = (floorTotal / 1000).toFixed(2);
          grandTotalPower += floorTotal;
        });

        // --- สรุปผลลัพธ์ทั้งตึก ---
        allBuildingTotal.value = grandTotalPower;
        voltage.value = countVoltage > 0 ? (sumVoltage / countVoltage).toFixed(1) : 0;
        current.value = sumCurrent.toFixed(2);

        temperature.value = countEnv > 0 ? (sumTemp / countEnv).toFixed(1) : 0;
        humidity.value = countEnv > 0 ? (sumHum / countEnv).toFixed(1) : 0;
        pm25.value = countEnv > 0 ? (sumPM25 / countEnv).toFixed(1) : 0;

        totalUsage.value = grandTotalEnergy.toFixed(2);
        dailyEnergy.value = ((grandTotalPower * 24) / 1000).toFixed(2);
        cost.value = (dailyEnergy.value * 4.5).toFixed(2);

        if (latestTimestamp > 0) {
          lastUpdate.value = new Date(latestTimestamp).toLocaleTimeString("th-TH");
        }
      }
    });
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
