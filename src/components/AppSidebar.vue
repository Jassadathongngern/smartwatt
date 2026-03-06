<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { auth } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  LayoutDashboard,
  BarChart3,
  CalendarClock,
  Cpu,
  Users,
  Bell,
  LogIn,
  LogOut,
  Menu,
  X,
} from "lucide-vue-next";

defineProps({
  isOpen: Boolean,
});

const emit = defineEmits(["toggle", "close"]);

const router = useRouter();
const isLoggedIn = ref(false);
const isAuthReady = ref(false);
const showLogoutModal = ref(false);

onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      isLoggedIn.value = true;
    } else {
      isLoggedIn.value = false;
    }
    isAuthReady.value = true;
  });
});

const confirmLogout = () => {
  showLogoutModal.value = true;
};

const cancelLogout = () => {
  showLogoutModal.value = false;
};

const handleLogout = async () => {
  showLogoutModal.value = false;
  try {
    await signOut(auth);
    router.push("/");
    emit("close");
  } catch (error) {
    console.error("Logout Error:", error);
  }
};

const handleLogin = () => {
  router.push("/login");
  emit("close");
};

const refreshPage = () => {
  window.location.reload();
};
</script>

<template>
  <!-- Hamburger Button for Mobile -->
  <!-- External Button (Visible when Sidebar is CLOSED) -->
  <button
    v-if="!isOpen"
    class="mobile-toggle-external"
    @click="$emit('toggle')"
    aria-label="Open Menu"
  >
    <Menu :size="24" />
  </button>

  <aside class="sidebar" :class="{ 'is-open': isOpen }">
    <div class="logo-container" @click="refreshPage" title="Refresh Page">
      <div class="logo-icon">S</div>
      <div class="logo-text">SmartWatt</div>
      <!-- Internal Button (Visible when Sidebar is OPEN) -->
      <button
        v-if="isOpen"
        class="mobile-toggle"
        @click.stop="$emit('toggle')"
        aria-label="Close Menu"
      >
        <X :size="24" />
      </button>
    </div>

    <div v-if="!isAuthReady" class="loading-container">
      <div class="spinner"></div>
    </div>

    <template v-else>
      <nav class="menu">
        <router-link
          :to="isLoggedIn ? '/admin/dashboard' : '/'"
          class="menu-item"
          active-class="active"
          @click="emit('close')"
        >
          <div class="icon-box">
            <LayoutDashboard :size="16" />
          </div>
          <span>แดชบอร์ด</span>
        </router-link>

        <router-link to="/analytics" class="menu-item" active-class="active" @click="emit('close')">
          <div class="icon-box">
            <BarChart3 :size="16" />
          </div>
          <span>วิเคราะห์พลังงาน</span>
        </router-link>

        <router-link
          :to="isLoggedIn ? '/admin/room-schedule' : '/room-schedule'"
          class="menu-item"
          active-class="active"
          @click="emit('close')"
        >
          <div class="icon-box">
            <CalendarClock :size="16" />
          </div>
          <span>ตารางเรียน</span>
        </router-link>

        <div v-if="isLoggedIn">
          <p class="admin-tools-header">เครื่องมือผู้ดูแลระบบ</p>

          <router-link to="/devices" class="menu-item" active-class="active" @click="emit('close')">
            <div class="icon-box">
              <Cpu :size="16" />
            </div>
            <span>จัดการอุปกรณ์</span>
          </router-link>

          <router-link
            to="/admin/users"
            class="menu-item"
            active-class="active"
            @click="emit('close')"
          >
            <div class="icon-box">
              <Users :size="16" />
            </div>
            <span>จัดการผู้ใช้งาน</span>
          </router-link>

          <router-link
            to="/notifications"
            class="menu-item"
            active-class="active"
            @click="emit('close')"
          >
            <div class="icon-box">
              <Bell :size="16" />
            </div>
            <span>การแจ้งเตือน</span>
          </router-link>
        </div>
      </nav>

      <div class="auth-buttons">
        <button v-if="isLoggedIn" class="action-btn logout" @click="confirmLogout">
          <div class="icon-box">
            <LogOut :size="16" />
          </div>
          <span>ออกจากระบบ</span>
        </button>
        <button v-else class="action-btn login" @click="handleLogin">
          <div class="icon-box white">
            <LogIn :size="16" />
          </div>
          <span>เข้าสู่ระบบ</span>
        </button>
      </div>
    </template>
  </aside>

  <!-- Custom Logout Confirmation Modal -->
  <div v-if="showLogoutModal" class="modal-overlay" @click.self="cancelLogout">
    <div class="modal-content">
      <div class="modal-icon">
        <LogOut :size="32" />
      </div>
      <h3>ออกจากระบบ</h3>
      <p>คุณต้องการออกจากระบบใช่หรือไม่?</p>
      <div class="modal-actions">
        <button class="btn-cancel" @click="cancelLogout">ยกเลิก</button>
        <button class="btn-confirm" @click="handleLogout">ออกจากระบบ</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Sidebar Layout */
.sidebar {
  width: 250px;
  background-color: #ffffff;
  padding: 25px 0;
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: "Inter", sans-serif;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 100;
  border-right: 1px solid #f0f0f0;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Logo Section */
.logo-container {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 25px;
  margin-bottom: 40px;
  cursor: pointer;
  transition: transform 0.2s;
}
.logo-container:hover {
  transform: translateX(2px);
}
.logo-icon {
  background: #3b82f6;
  color: white;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-weight: 800;
  font-size: 1.2rem;
  box-shadow: 0 4px 6px rgba(59, 130, 246, 0.2);
}
.logo-text {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1e293b;
  letter-spacing: -0.5px;
}

/* Menu Items */
.menu-item {
  display: flex;
  align-items: center;
  gap: 15px;
  color: #64748b;
  font-weight: 500;
  padding: 10px 15px;
  margin: 0 15px 6px 15px;
  border-radius: 12px;
  text-decoration: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 0.9rem;
}

.icon-box {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid #f1f5f9;
  border-radius: 10px;
  background-color: #f8fafc;
  color: #64748b;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.icon-box.white {
  background-color: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
  color: white;
}

.menu-item:hover {
  background-color: #f1f5f9;
  color: #1e293b;
}

.menu-item:hover .icon-box {
  border-color: #cbd5e1;
  background-color: #ffffff;
  transform: scale(1.05);
  color: #3b82f6;
}

.menu-item.active {
  background-color: #eff6ff;
  color: #3b82f6;
  font-weight: 600;
}

.menu-item.active .icon-box {
  background-color: #3b82f6;
  color: white;
  border-color: #3b82f6;
  box-shadow: 0 4px 10px rgba(59, 130, 246, 0.25);
}

/* Admin Header */
.admin-tools-header {
  padding: 0 25px;
  margin-top: 25px;
  margin-bottom: 12px;
  font-size: 0.7rem;
  color: #94a3b8;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.2px;
}

/* Auth Buttons */
.auth-buttons {
  margin-top: auto;
  padding: 0 15px 30px 15px;
}

.action-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 15px;
  padding: 10px 15px;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.action-btn.login {
  background-color: #3b82f6;
  color: white;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
}
.action-btn.login:hover {
  background-color: #2563eb;
  transform: translateY(-2px);
}

.action-btn.logout {
  background-color: transparent;
  color: #94a3b8;
  border: 1px solid #f1f5f9;
}
.action-btn.logout:hover {
  background-color: #fff1f2;
  color: #ef4444;
  border-color: #fee2e2;
}
.action-btn.logout:hover .icon-box {
  background-color: #ef4444;
  color: white;
  border-color: #ef4444;
}

/* Sidebar Toggle inside Logo Container (Internal Close Button) */
.mobile-toggle {
  display: flex;
  margin-left: auto; /* Push to the right */
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #64748b;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.mobile-toggle:hover {
  background-color: #f8fafc;
  border-color: #cbd5e1;
  color: #ef4444; /* Subtle red on hover to indicate close */
  transform: scale(1.05);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}

/* External Toggle Button (Fixed on Screen when Sidebar Closed) */
.mobile-toggle-external {
  display: flex;
  position: fixed;
  top: 15px;
  left: 15px;
  z-index: 110;
  background: white;
  border: 1.5px solid #f1f5f9;
  border-radius: 10px;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #1e293b;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.mobile-toggle-external:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 15px rgba(0, 0, 0, 0.12);
}

.mobile-toggle-external:active {
  transform: scale(0.9);
}

/* Responsive Styles */
.sidebar {
  transform: translateX(-100%); /* Hidden by default on mobile */
  box-shadow: 10px 0 30px rgba(0, 0, 0, 0.05);
}

.sidebar.is-open {
  transform: translateX(0);
}

@media (max-width: 1024px) {
  /* On mobile, sidebar is hidden by default */
  /* If button is inside sidebar, it is also hidden */
  /* We might need a separate trigger outside if this button is moved inside */
}

/* Spinner */
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-out;
}

.modal-content {
  background: white;
  padding: 30px;
  border-radius: 16px;
  width: 90%;
  max-width: 360px;
  text-align: center;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
  animation: scaleUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.modal-icon {
  width: 64px;
  height: 64px;
  background-color: #fee2e2;
  color: #ef4444;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 15px;
}

.modal-content h3 {
  margin: 0 0 10px 0;
  font-size: 1.25rem;
  color: #1e293b;
  font-weight: 700;
}

.modal-content p {
  color: #64748b;
  margin-bottom: 25px;
  font-size: 0.95rem;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.modal-actions button {
  flex: 1;
  padding: 10px 15px;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background-color: #f1f5f9;
  color: #64748b;
}

.btn-cancel:hover {
  background-color: #e2e8f0;
  color: #334155;
}

.btn-confirm {
  background-color: #ef4444;
  color: white;
}

.btn-confirm:hover {
  background-color: #dc2626;
  box-shadow: 0 4px 6px rgba(239, 68, 68, 0.2);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes scaleUp {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
