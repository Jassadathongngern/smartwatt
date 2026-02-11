<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { auth } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

const router = useRouter();
const isLoggedIn = ref(false);
const isAuthReady = ref(false);

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

const handleLogout = async () => {
  try {
    await signOut(auth);
    // ✅ แก้ไข: เมื่อ Logout ให้กลับไปหน้า Guest Dashboard (หน้าแรก)
    router.push("/");
  } catch (error) {
    console.error("Logout Error:", error);
  }
};

const handleLogin = () => {
  router.push("/login");
};

const refreshPage = () => {
  window.location.reload();
};
</script>

<template>
  <aside class="sidebar">
    <div class="logo" @click="refreshPage" title="Refresh Page">SmartWatt</div>

    <div v-if="!isAuthReady" class="loading-container">
      <div class="spinner"></div>
    </div>

    <template v-else>
      <nav class="menu">
        <router-link
          :to="isLoggedIn ? '/admin/dashboard' : '/'"
          class="menu-item"
          active-class="active"
        >
          Dashboard
        </router-link>

        <router-link to="/analytics" class="menu-item" active-class="active">
          Analytics
        </router-link>

        <router-link
          :to="isLoggedIn ? '/admin/room-schedule' : '/room-schedule'"
          class="menu-item"
          active-class="active"
        >
          Room Schedule
        </router-link>

        <div v-if="isLoggedIn">
          <p class="admin-tools-header">ADMIN TOOLS</p>

          <router-link to="/devices" class="menu-item" active-class="active">
            Device Management
          </router-link>

          <router-link to="/schedule" class="menu-item" active-class="active">
            Schedule Management
          </router-link>

          <router-link to="/admin/users" class="menu-item" active-class="active">
            User Management
          </router-link>

          <router-link to="/notifications" class="menu-item" active-class="active">
            Notifications
          </router-link>
        </div>
      </nav>

      <div class="auth-buttons">
        <button v-if="isLoggedIn" class="action-btn logout" @click="handleLogout">Logout</button>
        <button v-else class="action-btn login" @click="handleLogin">Login</button>
      </div>
    </template>
  </aside>
</template>

<style scoped>
/* Sidebar Layout */
.sidebar {
  width: 260px;
  background-color: #ffffff;
  padding: 30px 0;
  box-shadow: 4px 0 10px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 100;
  overflow-y: auto; /* Allow scrolling within sidebar if content is tall */
}

/* Logo */
.logo {
  font-size: 2rem;
  font-weight: 800;
  color: #3b82f6;
  text-align: center;
  margin-bottom: 30px;
  padding: 0 20px;
  cursor: pointer;
  transition: opacity 0.2s;
}
.logo:hover {
  opacity: 0.8;
}

/* Menu Items */
.menu-item {
  display: block;
  text-align: center;
  background-color: #f3f4f6;
  color: #374151;
  font-weight: 600;
  padding: 12px 10px;
  margin: 0 20px 12px 20px;
  border-radius: 8px;
  text-decoration: none;
  transition: all 0.2s ease;
  font-size: 0.95rem;
}

.menu-item:hover {
  background-color: #e5e7eb;
  transform: translateY(-2px);
}

.menu-item.active {
  background-color: #3b82f6;
  color: white;
  box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
}

/* Admin Header */
.admin-tools-header {
  padding: 0 25px;
  margin-top: 25px;
  margin-bottom: 10px;
  font-size: 0.75rem;
  color: #9ca3af;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* Auth Buttons */
.auth-buttons {
  margin-top: auto;
  padding: 0 20px 40px 20px;
}

.action-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 700;
  font-size: 1rem;
  transition: background-color 0.2s;
}

.action-btn.login {
  background-color: #dbeafe;
  color: #2563eb;
}
.action-btn.login:hover {
  background-color: #bfdbfe;
}

.action-btn.logout {
  background-color: #fee2e2;
  color: #dc2626;
}
.action-btn.logout:hover {
  background-color: #fecaca;
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
</style>
