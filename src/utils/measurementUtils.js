/**
 * Utility functions for normalizing measurement data from Firestore.
 * This centralizes field mapping and timestamp parsing across the application.
 */

/**
 * Parses a timestamp from Firestore (supports String, Timestamp Object, or Unix)
 * @param {any} ts The timestamp to parse
 * @returns {Date|null}
 */
export const parseTimestamp = (ts) => {
  if (!ts) return null;

  // Firestore Timestamp object
  if (ts.toDate && typeof ts.toDate === "function") {
    return ts.toDate();
  }

  // String format (e.g. "YYYY-MM-DD HH:mm:ss")
  if (typeof ts === "string") {
    // Standardize " " to "T" for ISO parsing compatibility in some browsers
    const isoStr = ts.includes(" ") ? ts.replace(" ", "T") : ts;
    const date = new Date(isoStr);
    return isNaN(date.getTime()) ? null : date;
  }

  // Unix timestamp (seconds or milliseconds)
  if (typeof ts === "number") {
    return new Date(ts < 10000000000 ? ts * 1000 : ts);
  }

  return null;
};

/**
 * Extracts electrical metrics from a raw document data gien the field naming patterns.
 * @param {Object} data Raw Firestore document data
 * @param {string} channel Optional sub-meter channel ('ch1', 'ch2', 'ch3')
 * @returns {Object} { power, voltage, current, energy }
 */
export const extractElectricalMetrics = (data, channel = null) => {
  let power = 0;
  let voltage = 0;
  let current = 0;
  let energy = 0;

  if (channel) {
    // Extract numeric channel (handles "1" or "ch1")
    const chNum = channel.replace("ch", "");

    // Power
    const pKey = `ch${chNum}_power`;
    const altP = chNum === "1" ? "power_A" : chNum === "2" ? "power_B" : "power_C";
    power = Number(
      data[pKey] || data[`power_ch${chNum}`] || data[`${chNum}_power`] || data[altP] || 0,
    );

    // Voltage
    const vKey = `ch${chNum}_voltage`;
    const altV = chNum === "1" ? "voltage_A" : chNum === "2" ? "voltage_B" : "voltage_C";
    voltage = Number(
      data[vKey] ||
        data[`voltage_ch${chNum}`] ||
        data[altV] ||
        data.total_voltage ||
        data.voltage ||
        0,
    );

    // Current
    const iKey = `ch${chNum}_current`;
    const altI = chNum === "1" ? "current_A" : chNum === "2" ? "current_B" : "current_C";
    current = Number(
      data[iKey] ||
        data[`current_ch${chNum}`] ||
        data[altI] ||
        data.total_current ||
        data.current ||
        0,
    );

    // Energy (Cumulative)
    const eKey = `ch${chNum}_energy`;
    energy = Number(data[eKey] || data[`energy_ch${chNum}`] || 0);
  } else {
    // Standard single-phase or aggregate
    power = Number(data.total_power || data.power || data.watt || data.p || data.w || 0);
    // Support floor-level aggregates if present in the doc
    const floorPower = Number(data.f1 || data.f2 || data.f3 || 0);
    if (floorPower > 0 && power === 0) power = floorPower * 1000; // Assuming f1/f2/f3 are in kW based on EnergyUsageChart usage

    voltage = Number(data.total_voltage || data.voltage || data.v || 0);
    current = Number(data.total_current || data.current || data.a || 0);
    energy = Number(data.total_energy || data.energy || 0);
  }

  return { power, voltage, current, energy };
};

/**
 * Extracts environment metrics from a raw document.
 * @param {Object} data Raw Firestore document data
 * @returns {Object} { temp, humid, pm25 }
 */
export const extractEnvironmentMetrics = (data) => {
  const temp = Number(data.temperature || data.temp || 0);
  const humid = Number(data.humidity || data.hum || 0);
  const pm25 = Number(data.pm25 || data.pm2_5 || data.dust || 0);

  return { temp, humid, pm25 };
};

/**
 * Normalizes a raw Firestore measurement document into a standard format.
 * @param {Object} doc Firestore document snapshot
 * @param {Object} deviceMappings Current device mappings from RTDB
 * @param {Function} getFloorHelper Helper to resolve floor
 * @param {Function} getRoomHelper Helper to resolve room
 * @returns {Array<Object>} List of records (usually 1, but multi-channel devices produce 3)
 */
export const normalizeMeasurement = (doc, deviceMappings, getFloorHelper, getRoomHelper) => {
  const data = doc.data();
  const docId = doc.id;
  const deviceId = data.deviceId || data.device_name || data.devEui || "Unknown";
  const timestamp = parseTimestamp(data.timestamp);

  if (!timestamp) return [];

  const baseRecord = {
    id: docId,
    deviceId,
    rawTimestamp: timestamp,
    time: timestamp.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
    date: timestamp.toLocaleDateString("th-TH"),
    status: data.status || "Normal",
    battery: data.battery || data.bat || null,
  };

  const mappings = deviceMappings?.[deviceId];
  const records = [];

  if (mappings) {
    // Process sub-metered channels
    Object.entries(mappings).forEach(([ch, rName]) => {
      // Skip labels and non-channel keys
      if (ch.includes("label") || !ch.startsWith("ch")) return;
      if (!rName) return;

      const electric = extractElectricalMetrics(data, ch);
      const env = extractEnvironmentMetrics(data); // Env is usually global for the device
      const floor = getFloorHelper(deviceId);

      records.push({
        ...baseRecord,
        room: rName,
        floor: `Floor ${floor}`,
        power: electric.power,
        volt: electric.voltage,
        amp: electric.current,
        energy: electric.energy,
        channel: ch,
        ...env,
        hasEnv: !!(env.temp || env.humid || env.pm25),
        hasPower: !!(electric.power || electric.voltage || electric.current),
        isWarning: electric.power > 2500,
        fullDeviceId: `${deviceId} (${ch})`,
      });
    });
  } else {
    // Standard 1-room device
    const electric = extractElectricalMetrics(data);
    const env = extractEnvironmentMetrics(data);
    const room = getRoomHelper(deviceId);
    const floor = getFloorHelper(deviceId);

    records.push({
      ...baseRecord,
      room,
      floor: `Floor ${floor}`,
      power: electric.power,
      volt: electric.voltage,
      amp: electric.current,
      energy: electric.energy,
      channel: null,
      ...env,
      hasEnv: !!(env.temp || env.humid || env.pm25),
      hasPower: !!(electric.power || electric.voltage || electric.current),
      isWarning: electric.power > 2500,
      fullDeviceId: deviceId,
    });
  }

  return records;
};
