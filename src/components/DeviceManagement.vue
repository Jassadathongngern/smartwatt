<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { rtdb as db } from "../firebase";
import { ref as dbRef, onValue, update, off, runTransaction, set } from "firebase/database";
import RoomManagerModal from "./RoomManagerModal.vue";

// --- State ---
const devices = ref([]);
const buildingConfig = ref({});
const searchQuery = ref("");
const filterStatus = ref("All");
const filterFloor = ref("All");

// --- Modal State ---
const isModalOpen = ref(false);
const isAddModalOpen = ref(false);
const isDeleteModalOpen = ref(false);
const isSuccessModalOpen = ref(false);
const successMessage = ref("");
const showRoomListModal = ref(false);

const isWarningModalOpen = ref(false);
const warningTitle = ref("");
const warningMessage = ref("");

const showWarning = (title, msg) => {
  warningTitle.value = title;
  warningMessage.value = msg;
  isWarningModalOpen.value = true;
};

// ** Add Room Modal State **
const showAddRoomModal = ref(false);

const currentTime = ref(Date.now());
let timeInterval = null;

const selectedDevice = ref(null);
const deviceToDelete = ref(null);

// --- State สำหรับ Channel / Expand ---
const deviceMappings = ref({});
const expandedRows = ref([]); // เก็บ id ของ device ที่ถูกกางออก
const isChannelModalOpen = ref(false);
const selectedChannelDevId = ref(null);
const selectedChannelId = ref(null);
const tempRoom = ref("");
const tempLabel = ref("");

const toggleExpand = (id) => {
  const index = expandedRows.value.indexOf(id);
  if (index > -1) {
    expandedRows.value.splice(index, 1);
  } else {
    expandedRows.value.push(id);
  }
};

// State สำหรับแก้ไข
const tempName = ref("");
const tempRate = ref(5);
const tempDeviceType = ref("");
const tempAssignedRoom = ref("");
const tempAssignedChannel = ref("ch1");
const ratePresets = [1, 5, 10, 15, 30, 60];

// Form for Add Device
const newDeviceForm = ref({
  name: "",
  devEui: "",
  appKey: "",
  deviceProfileId: "1fc24fd7-5148-453b-9ce5-abfd51e2c6b4",
});

// --- Firebase References ---
const devicesRef = dbRef(db, "devices");
const configRef = dbRef(db, "building_configs");
const mappingsRef = dbRef(db, "device_mappings");

// --- 1. Fetch Data ---
onMounted(() => {
  // Update time every minute to trigger reactive offline checks
  timeInterval = setInterval(() => {
    currentTime.value = Date.now();
  }, 60000);

  onValue(devicesRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      devices.value = Object.keys(data)
        .map((key) => ({
          id: key,
          ...data[key],
        }))
        .reverse();
    } else {
      devices.value = [];
    }
  });

  onValue(configRef, (snapshot) => {
    buildingConfig.value = snapshot.val() || {};
  });

  onValue(mappingsRef, (snapshot) => {
    deviceMappings.value = snapshot.val() || {};
  });
});

onUnmounted(() => {
  if (timeInterval) clearInterval(timeInterval);
  off(devicesRef);
  off(configRef);
  off(mappingsRef);
});

// --- Helper: Find Room ---
const getDeviceLocation = (deviceId) => {
  const mappings = deviceMappings.value[deviceId] || {};
  const mappedRooms = Object.values(mappings).filter(Boolean);

  if (mappedRooms.length === 0) {
    return { room: "ยังไม่ได้ระบุ", floor: "-" };
  }

  if (mappedRooms.length > 1) {
    return { room: `ติดตั้งใน ${mappedRooms.length} ห้อง`, floor: "หลายชั้น" };
  }

  const roomName = mappedRooms[0];
  let floorResult = "-";

  if (buildingConfig.value) {
    for (const [floorKey, floorData] of Object.entries(buildingConfig.value)) {
      if (floorData.rooms && floorData.rooms[roomName]) {
        floorResult = floorKey.replace("floor_", "");
        break;
      }
    }
  }

  return {
    room: roomName,
    floor: floorResult,
  };
};

const availableRooms = computed(() => {
  if (!buildingConfig.value) return [];
  const rooms = [];
  for (const [floorKey, floorData] of Object.entries(buildingConfig.value)) {
    if (floorData.rooms) {
      for (const [roomName] of Object.entries(floorData.rooms)) {
        rooms.push({
          label: `(Fl.${floorKey.replace("floor_", "")}) ${roomName}`,
          value: roomName,
          floorId: floorKey,
        });
      }
    }
  }
  return rooms.sort((a, b) => a.label.localeCompare(b.label));
});

// --- 2. Filter Logic ---
const filteredDevices = computed(() => {
  const now = currentTime.value;
  return devices.value
    .map((dev) => {
      const location = getDeviceLocation(dev.id);

      // Compute dynamic status
      const rateMin = dev.sendRate ? parseInt(dev.sendRate.toString().replace(" min", "")) : 5;
      const timeoutMs = rateMin * 3 * 60 * 1000;
      // Handle last_update which might be ISO string or timestamp
      let lastUpdate = 0;
      if (dev.last_update) {
        // If it's a string, try parsing it
        if (typeof dev.last_update === "string") {
          lastUpdate = new Date(dev.last_update).getTime();
        } else {
          lastUpdate = dev.last_update;
        }
      }

      const isOfflineText = lastUpdate ? now - lastUpdate > timeoutMs : true;
      const isSleeping =
        dev.status === "Sleep" ||
        dev.status === "Pending Sleep" ||
        dev.status === "Pending Interval Update";

      let computedStatus = dev.status;
      if (isOfflineText && dev.status === "Active" && !isSleeping) {
        computedStatus = "Inactive";
      }

      // ปรับปรุงการแสดงผลสถานะที่กำลังรอ (Pending) ให้สื่อความหมายมากขึ้นใน UI
      if (computedStatus === "Pending Sleep") {
        computedStatus = "Pending Interval Update";
      }

      return { ...dev, roomName: location.room, floorNum: location.floor, computedStatus };
    })
    .filter((dev) => {
      const name = (dev.name || dev.device_name || "").toLowerCase();
      const room = (dev.roomName || "").toLowerCase();
      const devId = (dev.id || "").toLowerCase();
      const search = searchQuery.value.toLowerCase();

      // Get all mapped sub-rooms for this device to include in search
      const mappings = deviceMappings.value[dev.id] || {};
      const mappedSubRooms = Object.values(mappings).filter(Boolean).join(" ").toLowerCase();

      const matchSearch =
        name.includes(search) ||
        room.includes(search) ||
        devId.includes(search) ||
        mappedSubRooms.includes(search);
      const matchStatus = filterStatus.value === "All" || dev.computedStatus === filterStatus.value;
      const matchFloor = filterFloor.value === "All" || dev.floorNum === filterFloor.value;

      return matchSearch && matchStatus && matchFloor;
    });
});

const isPowerNode = (dev) => {
  const name = dev.name || dev.device_name || "";
  const type = dev.type || "";
  const id = dev.id || "";
  return (
    dev.deviceProfileId === "1fc24fd7-5148-453b-9ce5-abfd51e2c6b4" ||
    type.toUpperCase().includes("POWER") ||
    name.toUpperCase().includes("POWER") ||
    id.toUpperCase().includes("POWER")
  );
};

const getDeviceType = (dev) => {
  if (dev.deviceProfileId === "1fc24fd7-5148-453b-9ce5-abfd51e2c6b4" || isPowerNode(dev)) {
    return "โหนดวัดพลังงานไฟฟ้า";
  }
  if (dev.deviceProfileId === "32eb3fc4-ae51-46f8-9ef1-a2917e0df79e") {
    return "โหนดวัดอุณหภูมิและความชื้น";
  }
  if (dev.type) {
    return dev.type; // Fallback to raw type if exists
  }
  return "❔ Unknown Type";
};

// --- Actions: Edit Config (Name & Rate) ---
const openEditModal = (device) => {
  selectedDevice.value = device;
  tempName.value = device.name || device.device_name || "";
  tempRate.value = device.sendRate ? parseInt(device.sendRate.toString().replace(" min", "")) : 5;
  tempDeviceType.value = device.deviceProfileId || "";

  // Load existing mapping if any
  tempAssignedRoom.value = "";
  tempAssignedChannel.value = "ch1";
  if (deviceMappings.value && deviceMappings.value[device.id]) {
    const mappings = deviceMappings.value[device.id];
    // Find the first assigned channel to populate the modal
    const assignedCh = Object.keys(mappings).find((ch) => mappings[ch]);
    if (assignedCh) {
      tempAssignedChannel.value = assignedCh;
      tempAssignedRoom.value = mappings[assignedCh];
    }
  }

  isModalOpen.value = true;
};

// ✅ อัปเดต: ฟังก์ชันบันทึกการตั้งค่า เพิ่ม pending_command สั่งให้ Bridge ยิง Downlink และบันทึก Room Mapping
const saveConfig = async () => {
  const nameToSave =
    tempName.value.trim() === ""
      ? selectedDevice.value.defaultName ||
        selectedDevice.value.name ||
        selectedDevice.value.device_name ||
        "Unknown Device"
      : tempName.value;

  if (selectedDevice.value && tempRate.value) {
    try {
      // 1. Update device config
      await runTransaction(dbRef(db, `devices/${selectedDevice.value.id}`), (currentData) => {
        if (currentData === null) {
          return {
            name: nameToSave,
            defaultName: nameToSave,
            deviceProfileId: tempDeviceType.value || null,
            sendRate: tempRate.value + " min",
            pending_command: "sleep",
            sleep_duration_minutes: parseInt(tempRate.value),
            status: "Pending Sleep",
          };
        } else {
          return {
            ...currentData,
            name: nameToSave,
            defaultName: currentData.defaultName || nameToSave,
            deviceProfileId: tempDeviceType.value || currentData.deviceProfileId || null,
            sendRate: tempRate.value + " min",
            pending_command: "sleep",
            sleep_duration_minutes: parseInt(tempRate.value),
            status: "Pending Sleep",
          };
        }
      });

      // 2. Update room mapping
      const devId = selectedDevice.value.id;
      const channelVal = tempAssignedChannel.value;
      const roomVal = tempAssignedRoom.value;

      if (roomVal) {
        const selectedRoomObj = availableRooms.value.find((r) => r.value === roomVal);
        if (selectedRoomObj) {
          // Update device_mappings
          await update(dbRef(db, `device_mappings/${devId}`), {
            [channelVal]: roomVal,
          });

          // Update building_configs
          await update(dbRef(db, `building_configs/${selectedRoomObj.floorId}/rooms/${roomVal}`), {
            deviceId: devId,
          });
        }
      } else {
        // Unassigned selected, clear mapping for this channel
        await update(dbRef(db, `device_mappings/${devId}`), {
          [channelVal]: null,
        });
      }

      isModalOpen.value = false;
    } catch (error) {
      alert("Error: " + error.message);
    }
  } else {
    alert("กรุณากรอกข้อมูลให้ครบถ้วน");
  }
};

const openChannelModal = (dev, channelId) => {
  selectedChannelDevId.value = dev.id;
  selectedChannelId.value = channelId;
  const currentRoom = deviceMappings.value[dev.id]?.[channelId];
  const currentLabel = deviceMappings.value[dev.id]?.[`${channelId}_label`];
  tempRoom.value = currentRoom || "";
  tempLabel.value = currentLabel || "";
  isChannelModalOpen.value = true;
};

const saveChannelConfig = async () => {
  const devId = selectedChannelDevId.value;
  const channelVal = selectedChannelId.value;
  const roomVal = tempRoom.value;
  const labelVal = tempLabel.value.trim();

  try {
    if (roomVal) {
      const selectedRoomObj = availableRooms.value.find((r) => r.value === roomVal);
      if (selectedRoomObj) {
        // Update device_mappings
        const mappingUpdate = {
          [channelVal]: roomVal,
        };
        // Save or clear label
        if (labelVal) {
          mappingUpdate[`${channelVal}_label`] = labelVal;
        } else {
          mappingUpdate[`${channelVal}_label`] = null; // Remove if empty
        }

        await update(dbRef(db, `device_mappings/${devId}`), mappingUpdate);

        // Update building_configs
        await update(dbRef(db, `building_configs/${selectedRoomObj.floorId}/rooms/${roomVal}`), {
          deviceId: devId,
        });
      }
    } else {
      // Unassign: remove mapping and its label
      await update(dbRef(db, `device_mappings/${devId}`), {
        [channelVal]: null,
        [`${channelVal}_label`]: null,
      });
      // We do not remove from building_configs explicitly here as it could be reassigned
      // A more robust backend would clean it up, but for now we trust mappings.
    }
    isChannelModalOpen.value = false;
  } catch (e) {
    showWarning("Error mapping channel", e.message);
  }
};

// ฟังก์ชันสั่ง Sleep
const orderSleep = async () => {
  if (!selectedDevice.value) return;

  if (
    !confirm(
      `ต้องการสั่งให้ ${tempName.value || selectedDevice.value.name || selectedDevice.value.device_name} เข้าโหมด Sleep ใช่หรือไม่?`,
    )
  )
    return;

  try {
    await update(dbRef(db, `devices/${selectedDevice.value.id}`), {
      pending_command: "sleep",
      sleep_duration_minutes: parseInt(tempRate.value) || 5,
      status: "Pending Sleep",
    });

    isModalOpen.value = false;
  } catch (error) {
    alert("Error sending sleep command: " + error.message);
  }
};

// ฟังก์ชันสั่ง Wake
const orderWake = async () => {
  showWarning(
    "ยังไม่รองรับ",
    "เฟิร์มแวร์ปัจจุบันยังไม่รองรับคำสั่ง Wake แบบทันที อุปกรณ์ LoRa Class A จะรับคำสั่งได้เฉพาะหลัง uplink เท่านั้น",
  );
};

// --- Actions: Auto Generate Keys & Copy ---
const autoGenerateKeys = () => {
  const generateRandomHex = (length) => {
    let result = "";
    const characters = "0123456789abcdef";
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  };

  newDeviceForm.value.devEui = "fc4f7493" + generateRandomHex(8);
  newDeviceForm.value.appKey = generateRandomHex(32);
};

const copySuccess = ref(false);

const copyToESP32 = async () => {
  const devName = newDeviceForm.value.name || "SmartWatt_Node_1";
  const devEui = newDeviceForm.value.devEui || "0000000000000000";
  const appKey = newDeviceForm.value.appKey || "00000000000000000000000000000000";

  // Format hex string to C array format e.g. "DF4C99..." -> "0xDF, 0x4C, 0x99..."
  const formatHexToCArray = (hexStr, reverse = false) => {
    const pairs = hexStr.toLowerCase().match(/.{1,2}/g) || [];
    if (reverse) pairs.reverse();
    return pairs.map((p) => `0x${p.toUpperCase()}`).join(", ");
  };

  const code = `
#define DEVICE_NAME  "${devName}"

// LSB Format
static const u1_t PROGMEM DEVEUI[8] = { ${formatHexToCArray(devEui, true)} };
void os_getDevEui (u1_t* buf) { memcpy_P(buf, DEVEUI, 8); }

static const u1_t PROGMEM APPEUI[8] = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
void os_getArtEui (u1_t* buf) { memcpy_P(buf, APPEUI, 8); }

// MSB Format
static const u1_t PROGMEM APPKEY[16] = { ${formatHexToCArray(appKey)} };
void os_getDevKey (u1_t* buf) { memcpy_P(buf, APPKEY, 16); }
`.trim();

  try {
    await navigator.clipboard.writeText(code);
    copySuccess.value = true;
    setTimeout(() => {
      copySuccess.value = false;
    }, 2000);
  } catch (err) {
    alert("Failed to copy code: " + err);
  }
};

const copiedDeviceId = ref(null);

const copyExistingToESP32 = async (device) => {
  const devName = device.name || device.id || "SmartWatt_Node_1";
  const devEui = device.devEui || "0000000000000000";
  const appKey = device.appKey || "00000000000000000000000000000000";

  const formatHexToCArray = (hexStr, reverse = false) => {
    const pairs = hexStr.toLowerCase().match(/.{1,2}/g) || [];
    if (reverse) pairs.reverse();
    return pairs.map((p) => `0x${p.toUpperCase()}`).join(", ");
  };

  const code = `
#define DEVICE_NAME  "${devName}"

// LSB Format
static const u1_t PROGMEM DEVEUI[8] = { ${formatHexToCArray(devEui, true)} };
void os_getDevEui (u1_t* buf) { memcpy_P(buf, DEVEUI, 8); }

static const u1_t PROGMEM APPEUI[8] = { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
void os_getArtEui (u1_t* buf) { memcpy_P(buf, APPEUI, 8); }

// MSB Format
static const u1_t PROGMEM APPKEY[16] = { ${formatHexToCArray(appKey)} };
void os_getDevKey (u1_t* buf) { memcpy_P(buf, APPKEY, 16); }
`.trim();

  try {
    await navigator.clipboard.writeText(code);
    copiedDeviceId.value = device.id;
    setTimeout(() => {
      copiedDeviceId.value = null;
    }, 2000);
  } catch (err) {
    alert("Failed to copy code: " + err);
  }
};

// --- Actions: Add Device ---
const openAddModal = () => {
  newDeviceForm.value = {
    name: "",
    devEui: "",
    appKey: "",
    deviceProfileId: "1fc24fd7-5148-453b-9ce5-abfd51e2c6b4",
  };
  isAddModalOpen.value = true;
};

const handleAddDevice = async () => {
  if (!newDeviceForm.value.name || !newDeviceForm.value.devEui || !newDeviceForm.value.appKey) {
    showWarning("ข้อมูลไม่ครบถ้วน", "กรุณากรอกข้อมูลที่จำเป็นทั้งหมด");
    return;
  }

  if (newDeviceForm.value.devEui.length !== 16) {
    showWarning("รูปแบบไม่ถูกต้อง", "DevEUI ต้องมีความยาว 16 ตัวอักษร");
    return;
  }

  if (newDeviceForm.value.appKey.length !== 32) {
    showWarning("รูปแบบไม่ถูกต้อง", "AppKey ต้องมีความยาว 32 ตัวอักษร");
    return;
  }

  const deviceName = newDeviceForm.value.name.trim();
  const inputDevEui = newDeviceForm.value.devEui.toLowerCase();

  // --- 🔒 Duplicate Prevention Checks ---
  const isDuplicateName = devices.value.some(
    (device) =>
      device.name?.toLowerCase() === deviceName.toLowerCase() ||
      device.id?.toLowerCase() === deviceName.toLowerCase(),
  );

  if (isDuplicateName) {
    showWarning(
      "ชื่ออุปกรณ์ซ้ำซ้อน",
      `ชื่ออุปกรณ์ "${deviceName}" มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่นเพื่อป้องกันข้อมูลทับซ้อน`,
    );
    return;
  }

  const isDuplicateDevEUI = devices.value.some(
    (device) => device.devEui?.toLowerCase() === inputDevEui,
  );

  if (isDuplicateDevEUI) {
    showWarning(
      "หมายเลขฮาร์ดแวร์ซ้ำซ้อน",
      `หมายเลข DevEUI "${inputDevEui.toUpperCase()}" กำลังถูกใช้งานโดยอุปกรณ์อื่นในระบบ`,
    );
    return;
  }

  const payload = {
    deviceName: deviceName,
    devEui: newDeviceForm.value.devEui.toUpperCase(),
    appKey: newDeviceForm.value.appKey.toUpperCase(),
    deviceProfileId: newDeviceForm.value.deviceProfileId,
  };

  try {
    await set(dbRef(db, `registration_queue/${deviceName}`), payload);

    await update(dbRef(db, `devices/${deviceName}`), {
      name: deviceName,
      devEui: newDeviceForm.value.devEui.toLowerCase(),
      appKey: newDeviceForm.value.appKey.toUpperCase(),
      deviceProfileId: newDeviceForm.value.deviceProfileId,
      status: "Pending Registration",
      last_update: Date.now(),
    });

    successMessage.value = "ส่งคำสั่งลงทะเบียนไปยัง Gateway แล้ว...";
    isSuccessModalOpen.value = true;

    setTimeout(() => {
      isSuccessModalOpen.value = false;
    }, 3000);

    isAddModalOpen.value = false;
    newDeviceForm.value = {
      name: "",
      devEui: "",
      appKey: "",
      deviceProfileId: "1fc24fd7-5148-453b-9ce5-abfd51e2c6b4",
    };
  } catch (error) {
    showWarning("เกิดข้อผิดพลาด", error.message);
  }
};

// --- Actions: Delete ---
const openDeleteModal = (id) => {
  deviceToDelete.value = id;
  isDeleteModalOpen.value = true;
};

const confirmDelete = async () => {
  if (deviceToDelete.value) {
    try {
      const device = devices.value.find((d) => d.id === deviceToDelete.value);

      await set(dbRef(db, `delete_queue/${deviceToDelete.value}`), {
        devEui: device?.devEui || "",
      });

      isDeleteModalOpen.value = false;
      deviceToDelete.value = null;
    } catch (error) {
      alert("Error: " + error.message);
    }
  }
};

// Helper Colors
const getBatteryColor = (level) => {
  if (level > 50) return "#198754";
  if (level > 20) return "#ffc107";
  return "#dc3545";
};
</script>

<template>
  <div class="device-page">
    <div class="header-section">
      <h1 class="text-2xl font-bold">การจัดการอุปกรณ์</h1>
      <div style="display: flex; gap: 10px">
        <button
          class="btn-add btn-secondary"
          @click="showRoomListModal = true"
          style="background: #475569"
        >
          จัดการห้อง
        </button>
        <button class="btn-add" @click="openAddModal">+ เพิ่มอุปกรณ์ใหม่</button>
      </div>
    </div>

    <div class="control-bar">
      <div class="control-group">
        <label class="group-label">ค้นหา</label>
        <div class="search-wrapper">
          <span class="search-icon">🔍</span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="ค้นหา ชื่อ, ID, หรือห้อง..."
            class="premium-control-input search-input"
          />
        </div>
      </div>

      <div class="control-group">
        <label class="group-label">ตัวกรอง</label>
        <div class="select-group">
          <div class="custom-premium-select">
            <select v-model="filterFloor">
              <option value="All">ทุกชั้น</option>
              <option value="1">ชั้น 1</option>
              <option value="2">ชั้น 2</option>
              <option value="3">ชั้น 3</option>
            </select>
            <div class="select-arrow">▼</div>
          </div>

          <div class="custom-premium-select">
            <select v-model="filterStatus">
              <option value="All">ทุกสถานะ</option>
              <option value="Active">เปิดใช้งาน (Active)</option>
              <option value="Inactive">ปิดใช้งาน (Inactive)</option>
              <option value="Maintenance">ซ่อมบำรุง</option>
              <option value="Sleep">โหมดพัก (Sleep)</option>
            </select>
            <div class="select-arrow">▼</div>
          </div>
        </div>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th width="40" class="text-center"></th>
            <th>ชื่ออุปกรณ์</th>
            <th>DevEUI / S/N</th>
            <th>ตำแหน่ง (Auto)</th>
            <th>ประเภท</th>
            <th>แบตเตอรี่</th>
            <th>สถานะ</th>
            <th>วันที่ติดตั้ง</th>
            <th class="text-center">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="dev in filteredDevices" :key="dev.id">
            <tr :class="{ 'expanded-row-active': expandedRows.includes(dev.id) }">
              <td class="text-center">
                <button v-if="isPowerNode(dev)" class="btn-expand" @click="toggleExpand(dev.id)">
                  <svg
                    v-if="expandedRows.includes(dev.id)"
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                  <svg
                    v-else
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </td>
              <td class="font-bold text-gray-700">
                {{ dev.name || dev.device_name || "Unknown Device" }}
                <div class="text-xs text-gray-400 font-mono">{{ dev.id }}</div>
              </td>

              <td class="font-mono text-xs text-gray-600">
                {{ dev.devEui || "-" }}
              </td>

              <td>
                <span v-if="dev.roomName !== 'Unassigned'" class="location-badge">
                  📍 {{ dev.roomName }} (ชั้น {{ dev.floorNum }})
                </span>
                <span v-else class="text-gray-400 text-sm italic">- ยังไม่ได้ระบุ -</span>
              </td>

              <td>
                <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-semibold">
                  {{ getDeviceType(dev) }}
                </span>
              </td>

              <td>
                <div class="battery-wrapper">
                  <div class="battery-icon">
                    <div
                      class="battery-level"
                      :style="{
                        width: (dev.battery || 0) + '%',
                        background: getBatteryColor(dev.battery || 0),
                      }"
                    ></div>
                  </div>
                  <div style="display: flex; flex-direction: column; line-height: 1">
                    <span :style="{ color: getBatteryColor(dev.battery || 0), fontWeight: 'bold' }">
                      {{ dev.battery || 0 }}%
                    </span>
                    <span
                      v-if="(dev.battery || 0) <= 20 && dev.battery !== undefined"
                      class="text-xs text-red-500 font-bold mt-1"
                      style="animation: pulse 2s infinite"
                    >
                      แบตเตอรี่ต่ำ
                    </span>
                  </div>
                </div>
              </td>

              <td>
                <span
                  class="status-dot"
                  :class="(dev.computedStatus || '').toLowerCase().replace(' ', '-')"
                ></span>
                {{ dev.computedStatus }}
              </td>

              <td class="text-sm text-gray-500">
                {{ dev.installDate || "-" }}
              </td>

              <td class="text-center">
                <button
                  class="btn-icon btn-copy-row"
                  @click="copyExistingToESP32(dev)"
                  :title="copiedDeviceId === dev.id ? 'Copied!' : 'Copy ESP32 Code'"
                  :class="{ 'text-success': copiedDeviceId === dev.id }"
                >
                  <svg
                    v-if="copiedDeviceId !== dev.id"
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <svg
                    v-else
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#10b981"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </button>
                <button class="btn-icon btn-edit" @click="openEditModal(dev)" title="Config">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </button>
                <button class="btn-icon btn-delete" @click="openDeleteModal(dev.id)" title="Delete">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path
                      d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                    ></path>
                  </svg>
                </button>
              </td>
            </tr>
            <!-- Sub-rows for Channels (Only visible for Power Nodes) -->
            <template v-if="isPowerNode(dev) && expandedRows.includes(dev.id)">
              <tr v-for="ch in ['ch1', 'ch2', 'ch3']" :key="`${dev.id}-${ch}`" class="sub-row">
                <td></td>
                <td class="sub-channel-name pl-6">
                  <span class="tree-line">↳</span>
                  <span class="font-bold text-gray-500"
                    >Channel {{ ch.replace("ch", "") }} ({{ ch }})
                    <span
                      v-if="deviceMappings[dev.id] && deviceMappings[dev.id][ch + '_label']"
                      class="text-blue-600 ml-1 text-sm font-medium"
                      >[{{ deviceMappings[dev.id][ch + "_label"] }}]</span
                    ></span
                  >
                </td>
                <td></td>
                <td>
                  <span
                    v-if="deviceMappings[dev.id] && deviceMappings[dev.id][ch]"
                    class="location-badge-sub"
                  >
                    📍 ห้อง {{ deviceMappings[dev.id][ch] }}
                  </span>
                  <span v-else class="text-gray-400 text-sm italic">- ยังไม่ได้ระบุ -</span>
                </td>
                <td colspan="4"></td>
                <td class="text-center">
                  <button
                    class="btn-icon btn-edit-sub"
                    @click="openChannelModal(dev, ch)"
                    title="Config Channel Location"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                  </button>
                </td>
              </tr>
            </template>
          </template>
          <tr v-if="filteredDevices.length === 0">
            <td colspan="9" class="text-center py-4 text-gray-500">
              ไม่พบอุปกรณ์ที่ตรงตามการค้นหา
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Transition name="fade">
      <div v-if="isModalOpen" class="modal-overlay" @click.self="isModalOpen = false">
        <div class="modal-content premium-modal">
          <div class="modal-header">
            <div class="header-title">
              <span class="icon-bg">⚙️</span>
              <div>
                <h3>การตั้งค่าอุปกรณ์</h3>
                <p class="subtitle">
                  จัดการการตั้งค่าสำหรับ {{ selectedDevice?.name || selectedDevice?.device_name }}
                </p>
              </div>
            </div>
            <button class="close-btn" @click="isModalOpen = false">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <div class="form-section">
              <label class="section-label">ข้อมูลทั่วไป</label>
              <div class="input-wrapper">
                <span class="input-icon">🏷️</span>
                <input
                  v-model="tempName"
                  type="text"
                  class="premium-input"
                  placeholder="กรอกชื่ออุปกรณ์"
                />
              </div>
              <p class="helper-text">
                ชื่อเดิม:
                {{ selectedDevice?.defaultName || selectedDevice?.device_name || "-" }}
              </p>
            </div>

            <div class="form-section">
              <label class="section-label">ประเภทอุปกรณ์ (Device Type)</label>
              <div class="input-wrapper">
                <select
                  v-model="tempDeviceType"
                  class="form-control"
                  style="width: 100%; cursor: pointer"
                >
                  <option value="">-- ไม่ระบุ (Unknown) --</option>
                  <option value="1fc24fd7-5148-453b-9ce5-abfd51e2c6b4">โหนดวัดพลังงานไฟฟ้า</option>
                  <option value="32eb3fc4-ae51-46f8-9ef1-a2917e0df79e">
                    โหนดวัดอุณหภูมิและความชื้น
                  </option>
                </select>
              </div>
            </div>

            <div class="form-section">
              <label class="section-label">อัตราการส่งข้อมูล</label>
              <div class="rate-control">
                <div class="custom-rate">
                  <input v-model="tempRate" type="number" min="1" class="rate-input" />
                  <span class="unit">นาที</span>
                </div>
                <div class="preset-pills">
                  <button
                    v-for="rate in ratePresets"
                    :key="rate"
                    class="pill-btn"
                    :class="{ active: tempRate === rate }"
                    @click="tempRate = rate"
                  >
                    {{ rate }}m
                  </button>
                </div>
              </div>
              <p class="helper-text mt-1" style="color: #64748b; font-size: 0.75rem">
                💡 การเปลี่ยนอัตราการส่งข้อมูลจะมีผลเมื่ออุปกรณ์ส่งข้อมูลรอบถัดไปและรับ downlink
                สำเร็จ
              </p>
            </div>

            <div class="form-section">
              <label class="section-label">การกำหนดตำแหน่ง</label>
              <div style="display: flex; gap: 15px; margin-top: 10px">
                <div class="input-group" style="flex: 1">
                  <label>กำหนดให้ห้อง</label>
                  <select v-model="tempAssignedRoom" class="form-control" style="width: 100%">
                    <option value="">-- ยังไม่ได้ระบุ --</option>
                    <option v-for="room in availableRooms" :key="room.value" :value="room.value">
                      {{ room.label }}
                    </option>
                  </select>
                </div>
                <div class="input-group" style="flex: 1">
                  <label>กำหนดให้แชนเนล</label>
                  <select
                    v-model="tempAssignedChannel"
                    class="form-control"
                    :disabled="!tempAssignedRoom"
                    style="width: 100%"
                  >
                    <option value="ch1">แชนเนล 1 (ch1)</option>
                    <option value="ch2">แชนเนล 2 (ch2)</option>
                    <option value="ch3">แชนเนล 3 (ch3)</option>
                    <option value="ch4">แชนเนล 4 (ch4)</option>
                    <option value="ch5">แชนเนล 5 (ch5)</option>
                    <option value="ch6">แชนเนล 6 (ch6)</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="danger-zone">
              <div class="dz-header">
                <span class="dz-icon">⚡</span>
                <span class="dz-title">การจัดการพลังงาน</span>
              </div>
              <div class="dz-content">
                <p>ควบคุมระยะเวลา Deep Sleep ตามความถี่ Data Transmission Rate</p>
                <div style="display: flex; gap: 10px; margin-top: 15px">
                  <button class="btn-sleep-premium" style="flex: 1" @click="orderSleep">
                    <span>สั่งหลับ (Sleep)</span>
                  </button>
                  <button class="btn-wake-premium" style="flex: 1" @click="orderWake">
                    <span>สั่งตื่น (Wake)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-ghost" @click="isModalOpen = false">ยกเลิก</button>
            <button class="btn-primary-save" @click="saveConfig">บันทึกการเปลี่ยนแปลง</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="isAddModalOpen" class="modal-overlay" @click.self="isAddModalOpen = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3>➕ เพิ่มอุปกรณ์ใหม่</h3>
            <button class="close-btn" @click="isAddModalOpen = false">×</button>
          </div>

          <div class="modal-body">
            <div class="input-group mb-3">
              <label>ชื่อโมดูล (Module Name / ID) *</label>
              <input
                v-model="newDeviceForm.name"
                type="text"
                class="form-control"
                placeholder="เช่น กล่อง A, SmartWatt_Node_01"
              />
            </div>

            <div class="input-group mb-3">
              <div
                style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-bottom: 6px;
                "
              >
                <label style="margin: 0">รหัสฮาร์ดแวร์ (DevEUI 16 หลัก) *</label>
                <div style="display: flex; gap: 8px">
                  <button
                    type="button"
                    class="btn-generate"
                    @click="autoGenerateKeys"
                    title="Generate Random Keys"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M21 2v6h-6"></path>
                      <path d="M21 13a9 9 0 1 1-3-7.7L21 8"></path>
                    </svg>
                    สร้างอัตโนมัติ
                  </button>
                  <button
                    type="button"
                    class="btn-copy-esp"
                    @click="copyToESP32"
                    :class="{ success: copySuccess }"
                    :title="copySuccess ? 'Copied!' : 'Copy ESP32 C Code'"
                  >
                    <svg
                      v-if="!copySuccess"
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <svg
                      v-else
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    {{ copySuccess ? "คัดลอกแล้ว!" : "คัดลอกโค้ดภาษา C (ESP32)" }}
                  </button>
                </div>
              </div>
              <input
                v-model="newDeviceForm.devEui"
                type="text"
                class="form-control font-mono text-sm uppercase"
                placeholder="เลข 16 หลัก"
                maxlength="16"
              />
            </div>

            <div class="input-group mb-3">
              <label>AppKey (เลข 32 หลัก) *</label>
              <input
                v-model="newDeviceForm.appKey"
                type="text"
                class="form-control font-mono text-sm uppercase"
                placeholder="เลข 32 หลัก"
                maxlength="32"
              />
            </div>

            <div class="input-group mb-3">
              <label>Device Type *</label>
              <select v-model="newDeviceForm.deviceProfileId" class="form-control">
                <option value="1fc24fd7-5148-453b-9ce5-abfd51e2c6b4">SmartWatt Power Node</option>
                <option value="32eb3fc4-ae51-46f8-9ef1-a2917e0df79e">
                  SmartWatt Environment Node
                </option>
              </select>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" @click="isAddModalOpen = false">ยกเลิก</button>
            <button class="btn-save" @click="handleAddDevice">เพิ่มอุปกรณ์</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="isChannelModalOpen" class="modal-overlay" @click.self="isChannelModalOpen = false">
        <div class="modal-content premium-modal">
          <div class="modal-header">
            <div class="header-title">
              <span class="icon-bg">📍</span>
              <div>
                <h3>การกำหนดแชนเนล</h3>
                <p class="subtitle">จัดการจุดติดตั้งของ {{ selectedChannelId }}</p>
              </div>
            </div>
            <button class="close-btn" @click="isChannelModalOpen = false">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="modal-body" style="padding: 16px 24px 32px 24px">
            <div class="form-section">
              <label class="section-label" style="display: block; margin-bottom: 8px"
                >กำหนดให้ห้อง</label
              >
              <div class="input-wrapper">
                <select
                  v-model="tempRoom"
                  class="form-control"
                  style="
                    cursor: pointer;
                    padding: 10px 14px;
                    border-radius: 8px;
                    border: 1.5px solid #cbd5e1;
                    outline: none;
                    width: 100%;
                    height: 48px;
                    font-size: 15px;
                    box-sizing: border-box;
                  "
                >
                  <option value="">-- ยังไม่ได้ระบุ --</option>
                  <option v-for="room in availableRooms" :key="room.value" :value="room.value">
                    {{ room.label }}
                  </option>
                </select>
              </div>
            </div>

            <div class="form-section" style="margin-top: 20px">
              <label class="section-label" style="display: block; margin-bottom: 8px"
                >ชื่อจุดติดตั้ง / ฉลาก (Label) *ไม่บังคับ</label
              >
              <div class="input-wrapper">
                <input
                  v-model="tempLabel"
                  type="text"
                  placeholder="เช่น แอร์ห้อง 101, ไฟทางเดิน..."
                  class="form-control"
                  style="
                    padding: 10px 14px;
                    border-radius: 8px;
                    border: 1.5px solid #cbd5e1;
                    outline: none;
                    width: 100%;
                    height: 48px;
                    font-size: 15px;
                    box-sizing: border-box;
                  "
                />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-ghost" @click="isChannelModalOpen = false">ยกเลิก</button>
            <button class="btn-primary-save" @click="saveChannelConfig">บันทึกตำแหน่ง</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="isDeleteModalOpen" class="modal-overlay" @click.self="isDeleteModalOpen = false">
        <div class="modal-content delete-modal">
          <div class="modal-header">
            <h3 class="text-danger">⚠️ ยืนยันการลบ</h3>
            <button class="close-btn" @click="isDeleteModalOpen = false">×</button>
          </div>
          <div class="modal-body text-center">
            <p class="font-bold text-lg mb-2">ยืนยันการลบอุปกรณ์นี้?</p>
            <p class="text-gray-500 text-sm">
              การกระทำนี้ไม่สามารถเรียกคืนได้ ข้อมูลอุปกรณ์จะถูกลบออกจากระบบถาวร
            </p>
          </div>
          <div class="modal-footer justify-center">
            <button class="btn-cancel" @click="isDeleteModalOpen = false">ยกเลิก</button>
            <button class="btn-delete-confirm" @click="confirmDelete">ยืนยันการลบ</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade-scale">
      <div v-if="isSuccessModalOpen" class="modal-overlay" @click.self="isSuccessModalOpen = false">
        <div class="modal-content success-premium-modal text-center">
          <div class="success-icon-wrapper">
            <div class="success-icon-bg"></div>
            <svg
              class="success-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <h3 class="success-title">สำเร็จ</h3>
          <p class="success-message text-gray-500 mt-2">{{ successMessage }}</p>
          <button class="btn-success-close mt-6" @click="isSuccessModalOpen = false">ตกลง</button>
        </div>
      </div>
    </Transition>

    <Transition name="fade-scale">
      <div v-if="isWarningModalOpen" class="modal-overlay" @click.self="isWarningModalOpen = false">
        <div class="modal-content warning-premium-modal text-center">
          <div class="warning-icon-wrapper">
            <div class="warning-icon-bg"></div>
            <svg
              class="warning-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              ></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <h3 class="warning-title">{{ warningTitle }}</h3>
          <p class="warning-message text-gray-500 mt-2">{{ warningMessage }}</p>
          <button class="btn-warning-close mt-6" @click="isWarningModalOpen = false">
            เข้าใจแล้ว
          </button>
        </div>
      </div>
    </Transition>

    <RoomManagerModal v-model:showAdd="showAddRoomModal" v-model:showList="showRoomListModal" />
  </div>
</template>

<style scoped>
/* CSS */
/* --- Premium Control Bar --- */
.control-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 12px 24px;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  border: 1px solid #f1f5f9;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 20px;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 16px;
}

.group-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.1em;
  white-space: nowrap;
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 300px;
}

.search-icon {
  position: absolute;
  left: 14px;
  font-size: 0.9rem;
  color: #94a3b8;
}

.premium-control-input {
  width: 100%;
  padding: 10px 16px 10px 40px;
  font-size: 0.9rem;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  transition: all 0.2s;
  color: #1e293b;
  font-weight: 500;
}

.premium-control-input:focus {
  background: white;
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
  outline: none;
}

.select-group {
  display: flex;
  gap: 8px;
}

.custom-premium-select {
  position: relative;
  min-width: 140px;
}

.custom-premium-select select {
  width: 100%;
  appearance: none;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 10px 36px 10px 16px;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.custom-premium-select select:hover {
  border-color: #cbd5e1;
  background: #f1f5f9;
}

.custom-premium-select select:focus {
  border-color: #3b82f6;
  background: white;
  outline: none;
}

.select-arrow {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.6rem;
  color: #94a3b8;
  pointer-events: none;
}

/* Original styles below */
.device-page {
  padding: 20px;
  background-color: #f8f9fa;
  min-height: 100vh;
  font-family: "Inter", sans-serif;
}
.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.btn-add {
  background: #212529;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 5px;
}
.btn-add:hover {
  background: #000000;
  transform: translateY(-2px);
  box-shadow: 0 6px 10px rgba(0, 0, 0, 0.2);
}
.controls-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}
.control-input {
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  outline: none;
  background: white;
}
.search {
  flex: 1;
  max-width: 300px;
}
.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  overflow-x: auto;
  border: 1px solid #e9ecef;
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
}
th {
  background: #f8f9fa;
  text-align: left;
  padding: 15px;
  font-weight: 600;
  color: #495057;
  border-bottom: 2px solid #dee2e6;
}
td {
  padding: 15px;
  border-bottom: 1px solid #e9ecef;
  vertical-align: middle;
  color: #333;
}
.text-center {
  text-align: center;
}
.font-bold {
  font-weight: bold;
}
.font-mono {
  font-family: monospace;
}
.text-gray-700 {
  color: #343a40;
}
.text-gray-600 {
  color: #6c757d;
}
.text-xs {
  font-size: 0.75rem;
}
.text-sm {
  font-size: 0.85rem;
}
.location-badge {
  background: #e9ecef;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.8rem;
  color: #495057;
  font-weight: 500;
  display: inline-block;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}
.status-dot {
  height: 10px;
  width: 10px;
  background-color: #bbb;
  border-radius: 50%;
  display: inline-block;
  margin-right: 6px;
}
.status-dot.active {
  background-color: #198754;
  box-shadow: 0 0 4px #198754;
}
.status-dot.pending-sleep,
.status-dot.pending-interval-update {
  background-color: #fd7e14;
  animation: pulse 2s infinite;
}
.status-dot.sleeping {
  background-color: #6f42c1;
}
.status-dot.inactive {
  background-color: #dc3545;
}
.status-dot.maintenance {
  background-color: #ffc107;
}

.battery-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
  font-size: 0.85rem;
}
.battery-icon {
  width: 26px;
  height: 14px;
  border: 1px solid #666;
  border-radius: 2px;
  padding: 1px;
  position: relative;
}
.battery-icon::after {
  content: "";
  position: absolute;
  right: -3px;
  top: 3px;
  width: 2px;
  height: 6px;
  background: #666;
  border-radius: 0 1px 1px 0;
}
.battery-level {
  height: 100%;
  transition: width 0.3s;
}
.btn-icon {
  border: 1px solid #333;
  background: white;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin: 0 4px;
  color: #333;
  transition: all 0.2s ease;
}

.btn-icon:hover {
  background-color: #f3f4f6;
  transform: translateY(-2px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.btn-edit:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.btn-delete:hover {
  border-color: #ef4444;
  color: #ef4444;
}
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.modal-content {
  background: white;
  width: 90%;
  max-width: 500px;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  animation: slideUp 0.3s ease-out;
}
.modal-header {
  padding: 15px 25px;
  background: #f8f9fa;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #999;
}
.modal-body {
  padding: 25px;
  max-height: 70vh;
  overflow-y: auto;
}
.modal-footer {
  padding: 15px 25px;
  background: #f8f9fa;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.input-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  font-size: 0.9rem;
  color: #444;
}
.form-control {
  width: 100%;
  height: 42px;
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 1rem;
  box-sizing: border-box;
}
.modal-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 1.1rem;
  box-sizing: border-box;
  text-align: center;
  height: 45px;
}
.modal-input.text-left {
  text-align: left;
}
/* --- Premium Modal Styles --- */
.premium-modal {
  background: white;
  width: 95%;
  max-width: 480px;
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  font-family: "Inter", sans-serif;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.8);
}

.modal-header {
  padding: 24px;
  background: white;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 16px;
}

.icon-bg {
  width: 48px;
  height: 48px;
  background: #f8fafc;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  border: 1px solid #e2e8f0;
}

.header-title h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #1e293b;
  letter-spacing: -0.5px;
}

.subtitle {
  margin: 4px 0 0 0;
  font-size: 0.875rem;
  color: #64748b;
}

.close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: all 0.2s;
  display: flex;
}

.close-btn:hover {
  background: #f1f5f9;
  color: #ef4444;
  transform: rotate(90deg);
}

.modal-body {
  padding: 24px;
}

.form-section {
  margin-bottom: 24px;
}

.section-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 12px;
  letter-spacing: 0.5px;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 16px;
  font-size: 1.1rem;
  pointer-events: none;
  z-index: 10;
}

.premium-input {
  width: 100%;
  padding: 14px 16px 14px 50px;
  font-size: 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  color: #1e293b;
  font-weight: 500;
}

.premium-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
  outline: none;
}

.helper-text {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-top: 8px;
  margin-left: 4px;
}

/* Rate Control */
.rate-control {
  background: #f8fafc;
  padding: 6px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
}

.custom-rate {
  display: flex;
  align-items: center;
  background: white;
  border-radius: 12px;
  padding: 8px 16px;
  margin-bottom: 8px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
}

.rate-input {
  border: none;
  font-size: 1.25rem;
  font-weight: 700;
  color: #3b82f6;
  width: 100%;
  outline: none;
}

.unit {
  font-size: 0.875rem;
  font-weight: 600;
  color: #64748b;
}

.preset-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.pill-btn {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  color: #64748b;
  font-weight: 600;
  font-size: 0.9rem;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.pill-btn:hover {
  background: rgba(255, 255, 255, 0.5);
  color: #334155;
}

.pill-btn.active {
  background: white;
  color: #3b82f6;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  font-weight: 700;
}

.btn-copy-row:hover {
  background: #ecfdf5;
  color: #10b981;
}

/* Danger Zone */
.danger-zone {
  margin-top: 32px;
  border: 1px solid #fecaca;
  background: #fef2f2;
  border-radius: 16px;
  overflow: hidden;
}

.dz-header {
  padding: 12px 20px;
  background: #fee2e2;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #b91c1c;
  font-weight: 700;
  font-size: 0.9rem;
}

.dz-content {
  padding: 20px;
}

.dz-content p {
  margin: 0 0 16px 0;
  font-size: 0.875rem;
  color: #7f1d1d;
  line-height: 1.5;
}

.btn-sleep-premium {
  width: 100%;
  padding: 12px;
  background: white;
  border: 1px solid #f87171;
  color: #dc2626;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
}

.btn-sleep-premium:hover {
  background: #dc2626;
  color: white;
  border-color: #dc2626;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2);
}

.btn-wake-premium {
  width: 100%;
  padding: 12px;
  background: white;
  border: 1px solid #fbbf24;
  color: #d97706;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
}

.btn-wake-premium:hover {
  background: #f59e0b;
  color: white;
  border-color: #f59e0b;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
}

/* Footer */
.modal-footer {
  padding: 24px;
  background: white;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid #f1f5f9;
}

.btn-ghost {
  padding: 12px 24px;
  color: #64748b;
  font-weight: 600;
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 12px;
  transition: all 0.2s;
}

.btn-ghost:hover {
  background: #f8fafc;
  color: #334155;
}

.btn-primary-save {
  padding: 12px 32px;
  background: #0f172a;
  color: white;
  font-weight: 600;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
  transition: all 0.2s;
}

.btn-primary-save:hover {
  background: #1e293b;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.3);
}

.btn-primary-save:active {
  transform: translateY(0);
}

.row-2-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  align-items: end;
}
.mb-3 {
  margin-bottom: 15px;
}
.mt-3 {
  margin-top: 15px;
}
.preset-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 10px;
}
.preset-btn {
  background: #fff;
  border: 1px solid #dee2e6;
  color: #495057;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}
.preset-btn.active {
  background: #e7f1ff;
  border-color: #0d6efd;
  color: #0d6efd;
  font-weight: bold;
}

/* ปุ่ม Sleep */
.btn-sleep {
  width: 100%;
  background: #6610f2;
  color: white;
  border: none;
  padding: 10px;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-sleep:hover {
  background: #520dc2;
}
.divider {
  border: 0;
  border-top: 1px solid #eee;
  margin: 20px 0;
}

.btn-cancel {
  background: #e9ecef;
  color: #495057;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}
.btn-save {
  background: #0d6efd;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.delete-modal {
  max-width: 400px;
}
.text-danger {
  color: #dc3545;
  font-weight: 700;
}
.btn-delete-confirm {
  background: #dc3545;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}
.btn-delete-confirm:hover {
  background: #bb2d3b;
}
.justify-center {
  justify-content: center !important;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Auto Generate Button */
.btn-generate {
  background: #f1f5f9;
  color: #3b82f6;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}
.btn-generate:hover {
  background: #eff6ff;
  border-color: #3b82f6;
}

/* ESP32 Copy Button */
.btn-copy-esp {
  background: #f8fafc;
  color: #475569;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.btn-copy-esp:hover {
  background: #f1f5f9;
  color: #1e293b;
  border-color: #94a3b8;
}

.btn-copy-esp.success {
  background: #ecfdf5;
  color: #10b981;
  border-color: #34d399;
}

/* Premium Success Modal */
.success-premium-modal {
  max-width: 360px;
  padding: 32px 24px;
  border-radius: 20px;
  background: #ffffff;
  box-shadow:
    0 20px 40px rgba(0, 0, 0, 0.1),
    0 0 0 1px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  overflow: hidden;
}

.success-icon-wrapper {
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
}

.success-icon-bg {
  position: absolute;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 50%;
  opacity: 0.15;
  animation: pulse-ring 2s infinite;
}

.success-icon {
  width: 40px;
  height: 40px;
  color: #10b981;
  z-index: 1;
  animation: pop-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}

.success-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 8px;
}

.success-message {
  font-size: 0.95rem;
  color: #64748b;
  line-height: 1.5;
}

.btn-success-close {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  font-weight: 600;
  font-size: 1rem;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.btn-success-close:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
}

.btn-success-close:active {
  transform: translateY(0);
}

.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  100% {
    transform: scale(1.3);
    opacity: 0;
  }
}

@keyframes pop-in {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

/* Responsive Adjustments */
@media (max-width: 1024px) {
  .header-section {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }

  .btn-add {
    width: 100%;
    justify-content: center;
  }

  .controls-bar {
    flex-direction: column;
    gap: 10px;
  }

  .control-input {
    width: 100%;
    max-width: none;
  }

  .table-container {
    overflow-x: auto;
    margin: 0 -15px;
    border-radius: 0;
  }

  table {
    min-width: 900px;
  }
}

@media (max-width: 600px) {
  .device-page {
    padding: 15px;
  }

  .modal-content {
    width: 95%;
    margin: 10px;
    padding: 0;
  }

  .modal-body {
    padding: 20px 15px;
  }

  .row-2-col {
    grid-template-columns: 1fr;
    gap: 15px;
  }

  .preset-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .modal-footer {
    flex-direction: column-reverse;
  }

  .modal-footer button {
    width: 100%;
  }
}

.btn-expand {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}
.btn-expand:hover {
  background: #f1f5f9;
  color: #3b82f6;
}
.expanded-row-active {
  background-color: #f8fafc;
}
.sub-row {
  background-color: #fafafa;
  border-bottom: 1px dashed #e2e8f0;
}
.sub-row:last-child {
  border-bottom: 1px solid #e9ecef;
}
.sub-channel-name {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tree-line {
  color: #cbd5e1;
  font-weight: bold;
}
.location-badge-sub {
  background: #e0f2fe;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  color: #0369a1;
  font-weight: 600;
  display: inline-block;
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}
.btn-edit-sub {
  width: 28px;
  height: 28px;
  border: 1px solid #cbd5e1;
  color: #64748b;
}
.pl-6 {
  padding-left: 1.5rem !important;
}

/* --- Warning Premium Modal --- */
.warning-premium-modal {
  padding: 40px;
  background: white;
  border-radius: 20px;
  max-width: 400px;
}

.warning-icon-wrapper {
  position: relative;
  width: 80px;
  height: 80px;
  margin: 0 auto 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.warning-icon-bg {
  position: absolute;
  width: 100%;
  height: 100%;
  background: #fef08a;
  border-radius: 50%;
  opacity: 0.3;
  animation: pulseWarning 2s infinite;
}

.warning-icon {
  width: 40px;
  height: 40px;
  color: #eab308;
  z-index: 1;
}

.warning-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #1f2937;
  margin: 0;
}

.warning-message {
  font-size: 0.95rem;
  line-height: 1.5;
}

.btn-warning-close {
  background: #f3f4f6;
  color: #4b5563;
  border: none;
  padding: 12px 30px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}

.btn-warning-close:hover {
  background: #e5e7eb;
  color: #1f2937;
  transform: translateY(-2px);
}

@keyframes pulseWarning {
  0% {
    transform: scale(0.9);
    opacity: 0.5;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.2;
  }
  100% {
    transform: scale(0.9);
    opacity: 0.5;
  }
}
</style>
