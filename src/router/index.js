import { createRouter, createWebHistory } from "vue-router";
import { auth, rtdb } from "../firebase"; // ✅ ดึง auth และ db มาใช้เช็คสิทธิ์
import { ref as dbRef, get } from "firebase/database";

import DashboardOverviewManager from "../components/DashboardOverviewManager.vue";
import DashboardOverviewGuest from "../components/DashboardOverviewGuest.vue";
import DeviceManagement from "../components/DeviceManagement.vue";
import RoomSchedule from "../components/RoomSchedule.vue";
import NotificationManagement from "../components/NotificationManagement.vue";
import UserManagement from "../components/UserManagement.vue";
import LoginView from "../components/LoginView.vue";
import AnalyticsGuest from "../components/AnalyticsGuest.vue";

const routes = [
  // =======================================================
  // 🟢 1. Public Routes (Guest เข้าได้เลย ไม่ต้อง Login)
  // =======================================================
  {
    path: "/",
    name: "Home",
    component: DashboardOverviewGuest,
  },
  {
    path: "/dashboard-guest",
    name: "DashboardGuest",
    component: DashboardOverviewGuest,
  },
  {
    path: "/analytics",
    name: "AnalyticsGuest",
    component: AnalyticsGuest,
  },
  {
    path: "/room-schedule",
    name: "RoomSchedule",
    component: RoomSchedule,
  },
  {
    path: "/login",
    name: "Login",
    component: LoginView,
  },

  // =======================================================
  // 🔒 2. Admin Routes (ต้อง Login + เป็น Admin เท่านั้น)
  // =======================================================
  {
    path: "/admin/dashboard",
    name: "DashboardManager",
    component: DashboardOverviewManager,
    meta: { requiresAdmin: true }, // 🚩 แปะป้ายว่าต้องเป็น Admin
  },
  {
    path: "/devices",
    name: "DeviceManagement",
    component: DeviceManagement,
    meta: { requiresAdmin: true },
  },
  {
    path: "/admin/room-schedule",
    name: "AdminRoomSchedule",
    component: RoomSchedule,
    meta: { requiresAdmin: true },
  },
  {
    path: "/notifications",
    name: "NotificationManagement",
    component: NotificationManagement,
    meta: { requiresAdmin: true },
  },
  {
    path: "/admin/users",
    name: "UserManagement",
    component: UserManagement,
    meta: { requiresAdmin: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// =======================================================
// 🛡️ Navigation Guard (ยามเฝ้าประตู)
// =======================================================
router.beforeEach(async (to, from, next) => {
  const requiresAdmin = to.matched.some((record) => record.meta.requiresAdmin);

  // รอให้ Firebase ยืนยันสถานะ Login ให้เสร็จก่อน (กันค่า null)
  const currentUser = await new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });

  // 1. ถ้าจะเข้าหน้า Admin แต่ "ยังไม่ Login" -> ดีดไปหน้า Login
  if (requiresAdmin && !currentUser) {
    next("/login");
    return;
  }

  // 2. ถ้า Login แล้ว และจะเข้าหน้า Admin -> "เช็ค Role ใน Database"
  if (requiresAdmin && currentUser) {
    try {
      const snapshot = await get(dbRef(rtdb, `users/${currentUser.uid}`));
      if (snapshot.exists()) {
        const userData = snapshot.val();
        // เช็คว่า role_id เป็น 1 (Admin) หรือไม่
        if (userData.role_id == 1) {
          next(); // ผ่านโลด!
        } else {
          // เป็น User อื่นที่แอบ Login เข้ามา -> ดีดกลับหน้าบ้าน
          next("/");
        }
      } else {
        // ไม่พบข้อมูล User -> ดีดไป Login ใหม่
        next("/login");
      }
    } catch (e) {
      console.error("Auth Check Error:", e);
      next("/login");
    }
    return;
  }

  // 3. ถ้า Login ค้างอยู่แล้ว แต่อยากเข้าหน้า Login อีก -> เช็ค Role แล้วดีดไปหน้า Dashboard ของตัวเอง
  if (to.path === "/login" && currentUser) {
    try {
      const snapshot = await get(dbRef(rtdb, `users/${currentUser.uid}`));
      if (snapshot.exists()) {
        const userData = snapshot.val();
        if (userData.role_id == 1) {
          next("/admin/dashboard");
        } else {
          next("/");
        }
      } else {
        next("/");
      }
    } catch (e) {
      console.error("Redirect Check Error:", e);
      next("/");
    }
    return;
  }

  // กรณีอื่นๆ (หน้า Guest / Public) -> ให้ผ่านได้เลย
  next();
});

export default router;
