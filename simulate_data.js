/* global process */
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set } from "firebase/database";

console.log("⚡ SmartWatt Simulation Controller Starting...");

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDkeraOC7VoIFfUnTAYYtro3RedRGWOjgo",
  authDomain: "smartwattproject.firebaseapp.com",
  databaseURL: "https://smartwattproject-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smartwattproject",
  storageBucket: "smartwattproject.firebasestorage.app",
  messagingSenderId: "938006945198",
  appId: "1:938006945198:web:d4407c06df3a6bd170fc3f",
  measurementId: "G-BJZ05YDNG1",
};

const app = initializeApp(firebaseConfig);
const rtdb = getDatabase(app);

async function setSimulationMode(enabled) {
  const simRef = ref(rtdb, "system_logs/simulation_mode");
  try {
    console.log(`📡 Sending command to Firebase: ${enabled ? "START" : "STOP"}...`);
    await set(simRef, enabled);
    console.log(`✅ Success! Simulation Mode set to: ${enabled ? "ON" : "OFF"}`);
    process.exit(0);
  } catch {
    console.error("❌ Permission Denied.");
    console.error("The database rules are blocking this script.");
    process.exit(1);
  }
}

const mode = process.argv[2];
if (mode === "start") {
  setSimulationMode(true);
} else if (mode === "stop") {
  setSimulationMode(false);
} else {
  console.log("💡 Usage: node simulate_data.js start | stop");
  process.exit(0);
}
