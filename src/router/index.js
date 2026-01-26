import { createRouter, createWebHistory } from 'vue-router'

import DashboardOverviewManager from '../components/DashboardOverviewManager.vue'
import DashboardOverviewGuest from '../components/DashboardOverviewGuest.vue'
import DeviceManagement from '../components/DeviceManagement.vue'
import ScheduleManagement from '../components/ScheduleManagement.vue'
import RoomSchedule from '../components/RoomSchedule.vue'
import NotificationManagement from '../components/NotificationManagement.vue'
import UserManagement from '../components/UserManagement.vue'
import LoginView from '../components/LoginView.vue'
import AnalyticsGuest from '../components/AnalyticsGuest.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: DashboardOverviewGuest
  },
  {
    path: '/admin/dashboard',
    name: 'DashboardManager',
    component: DashboardOverviewManager
  },
  {
    path: '/dashboard-guest',
    name: 'DashboardGuest',
    component: DashboardOverviewGuest
  },
  {
    path: '/devices',
    name: 'DeviceManagement',
    component: DeviceManagement
  },
  // -------------------------------------------------------
  // ✅ 2. เก็บหน้านี้ไว้ตามคำขอ (ไม่ลบ)
  // -------------------------------------------------------
  {
    path: '/schedule',
    name: 'ScheduleManagement',
    component: ScheduleManagement
  },
  // -------------------------------------------------------
  // ✅ 3. Room Schedule (Guest Mode)
  // -------------------------------------------------------
  {
    path: '/room-schedule',
    name: 'RoomSchedule',
    component: RoomSchedule
  },
  // -------------------------------------------------------
  // ✅ 4. Room Schedule (Admin Mode) -> เพิ่มใหม่
  // -------------------------------------------------------
  {
    path: '/admin/room-schedule',
    name: 'AdminRoomSchedule',
    component: RoomSchedule
  },
  // -------------------------------------------------------
  {
    path: '/notifications',
    name: 'NotificationManagement',
    component: NotificationManagement
  },
  // -------------------------------------------------------
  // ✅ 5. User Management (แนะนำให้ใช้ /admin นำหน้า)
  // -------------------------------------------------------
  {
    path: '/admin/users',
    name: 'UserManagement',
    component: UserManagement
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView
  },
  {
    path: '/analytics',
    name: 'AnalyticsGuest',
    component: AnalyticsGuest
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
