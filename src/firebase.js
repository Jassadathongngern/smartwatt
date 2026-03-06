import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBQr_SkBqgtXdr0AjZ9iJKDWn8KbpoX938",
  authDomain: "smartwattproject-2903a.firebaseapp.com",
  databaseURL: "https://smartwattproject-2903a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smartwattproject-2903a",
  storageBucket: "smartwattproject-2903a.firebasestorage.app",
  messagingSenderId: "59606679605",
  appId: "1:59606679605:web:688aacf3d2a5a2561d317c",
  measurementId: "G-KZJ1XPFL8E",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
const auth = getAuth(app);
const rtdb = getDatabase(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
const analytics = getAnalytics(app);

export { auth, db, rtdb, analytics };
