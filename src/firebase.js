import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database"; // ท่อเดิม
import { getFirestore } from "firebase/firestore"; // ท่อใหม่

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
const auth = getAuth(app);
const rtdb = getDatabase(app);
const db = getFirestore(app);

export { auth, db, rtdb };
