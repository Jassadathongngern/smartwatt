<script setup>
import { computed, ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import AppSidebar from "./components/AppSidebar.vue";
import SystemAlertMonitor from "./components/SystemAlertMonitor.vue";
import { auth, rtdb as db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ref as dbRef, get } from "firebase/database";

const route = useRoute();
// เริ่มต้นเปิดไว้สำหรับ Desktop
const isSidebarVisible = ref(window.innerWidth > 1024);

const showSidebar = computed(() => {
  return route.path !== "/login";
});

const toggleSidebar = () => {
  isSidebarVisible.value = !isSidebarVisible.value;
  // Trigger resize event to force charts to redraw
  setTimeout(() => {
    window.dispatchEvent(new Event("resize"));
  }, 350); // Wait for transition animation
};

const closeSidebar = () => {
  if (window.innerWidth <= 1024) {
    isSidebarVisible.value = false;
  }
};

// Use Firebase Auth state to check if user is admin
const isAdmin = ref(false);

onMounted(() => {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const userSnapshot = await get(dbRef(db, `users/${user.uid}`));
        if (userSnapshot.exists()) {
          const role = userSnapshot.val().role_id;
          isAdmin.value = role == 1; // 1 = Admin
        } else {
          isAdmin.value = false;
        }
      } catch (err) {
        console.error("Error fetching user role:", err);
        isAdmin.value = false;
      }
    } else {
      isAdmin.value = false;
    }
  });
});
</script>

<template>
  <div class="app-layout">
    <!-- Background Monitor -->
    <SystemAlertMonitor v-if="isAdmin" />

    <!-- Overlay for mobile/tablet when sidebar is open -->
    <div
      v-if="isSidebarVisible && showSidebar"
      class="mobile-overlay"
      @click="isSidebarVisible = false"
    ></div>

    <AppSidebar
      v-if="showSidebar"
      :isOpen="isSidebarVisible"
      @close="closeSidebar"
      @toggle="toggleSidebar"
    />

    <main
      class="main-content"
      :class="{
        'sidebar-closed': !isSidebarVisible,
        'full-screen': !showSidebar,
      }"
    >
      <router-view @close-side="closeSidebar"></router-view>
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
  position: relative;
}

.main-content {
  flex: 1;
  background-color: #f4f6f9;
  padding: 20px;
  margin-left: 250px; /* Default margin when sidebar is open */
  min-height: 100vh;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  width: calc(100% - 250px); /* Explicit width to help charts */
}

.main-content.sidebar-closed {
  margin-left: 0 !important;
  width: 100%;
}

.main-content.full-screen {
  margin-left: 0 !important;
  padding: 0;
  width: 100%;
}

/* กรณีหน้า Login ให้ Padding เป็น 0 */
.main-content:has(.login-wrapper) {
  padding: 0;
  margin-left: 0;
}

.mobile-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(2px);
  z-index: 95;
  animation: fadeIn 0.3s ease;
}

/* บนหน้าจอใหญ่ ถ้าเปิด Sidebar ไม่ต้องโชว์ Overlay */
@media (min-width: 1025px) {
  .mobile-overlay {
    display: none;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Responsive Breakpoint */
@media (max-width: 1024px) {
  .main-content {
    margin-left: 0 !important;
    width: 100%;
    padding: 15px;
  }
}
</style>
