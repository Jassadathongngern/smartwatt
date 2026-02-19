import { ref, onMounted, onUnmounted } from "vue";
import { db, rtdb } from "../firebase";
import { ref as dbRef, onValue } from "firebase/database";
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
  const battery = ref(0); // ✅ เพิ่มตัวแปร Battery

  // ข้อมูลจำลองรายชั้น (ต้องแก้ ID ให้ตรงกับใน Firebase จริงๆ เพื่อให้แยกห้องถูก)
  const floorData = ref([
    {
      id: "3",
      totalPower: 0,
      status: "online",
      isExpanded: true,
      rooms: [
        // ⚠️ ตัวอย่าง: ถ้ามี Node ชื่อ SmartWatt_Node_POWER_01 ให้ใส่ตรงนี้
        {
          name: "Server Room",
          deviceId: "SmartWatt_Node_POWER_01",
          type: "Server",
          power: 0,
          status: "offline",
        },
        { name: "Classroom", deviceId: "dev_002", type: "Classroom", power: 0, status: "offline" },
      ],
    },
    {
      id: "2",
      totalPower: 0,
      status: "online",
      isExpanded: false,
      rooms: [{ name: "16201", deviceId: "dev_004", power: 0, status: "offline" }],
    },
    {
      id: "1",
      totalPower: 0,
      status: "online",
      isExpanded: false,
      rooms: [{ name: "Lobby", deviceId: "dev_007", power: 0, status: "offline" }],
    },
  ]);

  let unsubFirestore = null;

  onMounted(() => {
    // ------------------------------------------------------------
    // 1️⃣ ดึงข้อมูล Devices จาก Realtime DB (rtdb)
    // ------------------------------------------------------------
    const deviceRef = dbRef(rtdb, DEVICES_PATH);

    onValue(deviceRef, (snapshot) => {
      const allDevices = snapshot.val();

      if (allDevices) {
        gatewayStatus.value = "Active"; // เจอข้อมูล = Active

        // --- Logic A: คำนวณยอดรวมทั้งตึก (แบบกวาดทุกตัว) ---
        // วิธีนี้จะทำให้ค่าขึ้นแน่นอน แม้ ID ใน floorData จะไม่ตรง
        let rawTotalPower = 0;
        let pzemCount = 0;

        Object.keys(allDevices).forEach((key) => {
          const device = allDevices[key];
          // เช็คว่าเป็นมิเตอร์ไฟ และมีค่า power
          if (device.device_type === "POWER_METER" || device.power !== undefined) {
            const p = Number(device.power || 0); // ✅ แก้จาก .w เป็น .power
            rawTotalPower += p;
            pzemCount++;

            // อัปเดต Voltage/Current จากตัวแรกที่เจอ (ตัวอย่าง)
            if (pzemCount === 1) {
              voltage.value = Number(device.voltage || 0).toFixed(1);
              current.value = Number(device.current || 0).toFixed(2);
            }
          }
        });

        // --- Logic B: อัปเดตข้อมูลรายชั้น (ตาม ID ที่แมพไว้) ---
        floorData.value.forEach((floor) => {
          let floorTotal = 0;
          floor.rooms.forEach((room) => {
            const deviceData = allDevices[room.deviceId]; // ค้นหาตาม ID
            if (deviceData) {
              // ✅ แก้จาก .w เป็น .power ให้ตรงกับ Python
              let p = Number(deviceData.power || 0);

              // Data Sanitization
              if (p < 0 || p > 50000) p = 0;

              room.power = (p / 1000).toFixed(2); // แปลงเป็น kW
              room.status = "online";
              floorTotal += p;
            } else {
              room.status = "offline";
            }
          });
          floor.totalPower = (floorTotal / 1000).toFixed(2); // แปลงเป็น kW
        });

        // --- Logic C: Moving Average (ลดการแกว่งของค่ารวม) ---
        if (!window.powerHistory) window.powerHistory = [];
        window.powerHistory.push(rawTotalPower);
        if (window.powerHistory.length > 5) window.powerHistory.shift();

        const avgPower =
          window.powerHistory.reduce((a, b) => a + b, 0) / window.powerHistory.length;

        // แสดงผล
        allBuildingTotal.value = avgPower.toFixed(2); // หน่วย Watt
        dailyEnergy.value = ((avgPower * 24) / 1000).toFixed(2); // สมมติคำนวณคร่าวๆ (kWh)
        cost.value = (dailyEnergy.value * 4.5).toFixed(2); // ค่าไฟ 4.5 บาท/หน่วย
      }
    });

    // ------------------------------------------------------------
    // 2️⃣ ดึงข้อมูล PM2.5/Temp จาก Firestore (db)
    // ------------------------------------------------------------
    const q = query(collection(db, "measurements"), orderBy("timestamp", "desc"), limit(1));
    unsubFirestore = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        pm25.value = data.pm2_5 || 0;
        temperature.value = data.temperature || 0;
        humidity.value = data.humidity || 0;
        // ✅ ดึงค่าแบตเตอรี่ (รองรับทั้ง battery และ bat)
        battery.value = data.battery || data.bat || 0;

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
    battery, // ✅ ส่ง battery ออกไปใช้หน้าเว็บ
    toggleFloorExpand: (id) => {
      const f = floorData.value.find((x) => x.id === id);
      if (f) f.isExpanded = !f.isExpanded;
    },
  };
}   
