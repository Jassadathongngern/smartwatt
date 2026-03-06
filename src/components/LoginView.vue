<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";

// ✅ แก้ไข Import: ดึง auth มาใช้ และเปลี่ยน rtdb ให้เป็น db (เพื่อให้โค้ดข้างล่างใช้งานได้)
import { auth, rtdb as db } from "../firebase";

import { signInWithEmailAndPassword } from "firebase/auth";
import { ref as dbRef, get, update } from "firebase/database";

const router = useRouter();

// --- Form State ---
const email = ref("");
const password = ref("");
const errorMsg = ref("");

// --- UI State ---
const showPassword = ref(false);
const isLoading = ref(false);

// --- Popup State ---
const showSuccessModal = ref(false);
const targetRoute = ref("/");

// ฟังก์ชันหลังจากกด Enter ใน Popup สำเร็จ
const proceedToDashboard = () => {
  showSuccessModal.value = false;
  router.push(targetRoute.value);
};

// ✅ ฟังก์ชันปุ่ม Back
const handleBack = async () => {
  const currentUser = auth.currentUser; // ตอนนี้เรียกใช้ auth ได้แล้ว ไม่ Error แน่นอน

  if (currentUser) {
    // กรณีมี Session ค้างอยู่ ให้เช็ค Role แล้วไป Dashboard
    try {
      // ใช้ db (ซึ่งคือ rtdb) ในการดึงข้อมูล user
      const snapshot = await get(dbRef(db, `users/${currentUser.uid}`));
      if (snapshot.exists()) {
        const role = snapshot.val().role_id;
        router.push(role == 1 ? "/admin/dashboard" : "/");
      } else {
        router.push("/");
      }
    } catch (e) {
      router.push("/");
    }
  } else {
    // ✅ กรณีปกติ (ยังไม่ล็อกอิน) ให้กลับไปหน้าแรก (Guest)
    router.push("/");
  }
};

// ฟังก์ชัน Login
const handleLogin = async () => {
  errorMsg.value = "";
  isLoading.value = true;

  try {
    // ✅ ใช้ auth ตัวจริงในการล็อกอิน
    const userCredential = await signInWithEmailAndPassword(auth, email.value, password.value);
    const user = userCredential.user;

    // ✅ ใช้ db (rtdb) ไปดึงข้อมูล Role
    const userRef = dbRef(db, `users/${user.uid}`);
    const snapshot = await get(userRef);

    if (snapshot.exists()) {
      const userData = snapshot.val();

      await update(userRef, { last_login: Date.now() });

      if (userData.role_id == 1) {
        targetRoute.value = "/admin/dashboard";
      } else {
        targetRoute.value = "/";
      }

      showSuccessModal.value = true;
    } else {
      errorMsg.value = "ไม่พบข้อมูลผู้ใช้ในระบบ (กรุณาติดต่อ Admin เพื่อสร้างบัญชี)";
      auth.signOut();
    }
  } catch (error) {
    console.error("Login Error:", error);
    if (error.code === "auth/invalid-credential") {
      errorMsg.value = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    } else if (error.code === "auth/too-many-requests") {
      errorMsg.value = "ล็อกอินผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่";
    } else {
      errorMsg.value = "เกิดข้อผิดพลาด: " + error.message;
    }
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="login-wrapper">
    <div class="login-box">
      <h2>เข้าสู่ระบบ SmartWatt</h2>
      <form @submit.prevent="handleLogin">
        <div class="input-group">
          <input v-model="email" type="email" placeholder="อีเมล" required :disabled="isLoading" />
        </div>

        <div class="input-group password-group">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="รหัสผ่าน"
            required
            :disabled="isLoading"
          />

          <span class="eye-icon" @click="showPassword = !showPassword">
            <svg
              v-if="showPassword"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path
                d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
              ></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          </span>
        </div>

        <p v-if="errorMsg" class="error-text">{{ errorMsg }}</p>

        <button type="submit" class="btn-primary" :disabled="isLoading">
          <span v-if="isLoading" class="loader"></span>
          <span v-if="isLoading">กำลังเข้าสู่ระบบ...</span>
          <span v-else>เข้าสู่ระบบ</span>
        </button>

        <button type="button" class="btn-secondary" @click="handleBack" :disabled="isLoading">
          ย้อนกลับ
        </button>
      </form>
    </div>

    <div v-if="showSuccessModal" class="modal-overlay">
      <div class="modal-content">
        <div class="success-icon">✓</div>
        <h3>เข้าสู่ระบบสำเร็จ!</h3>

        <button
          class="btn-primary"
          @click="proceedToDashboard"
          style="width: auto; padding: 12px 40px; margin: 20px auto 0"
        >
          ตกลง
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* พื้นหลัง */
.login-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f4f6f9;
  font-family: "Inter", "Sarabun", sans-serif;
}

/* กล่อง Login */
.login-box {
  background: white;
  padding: 40px;
  width: 100%;
  max-width: 400px;
  border-radius: 15px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  text-align: center;
}

h2 {
  color: #333;
  margin-bottom: 25px;
  font-weight: 700;
}

.input-group {
  margin-bottom: 15px;
}

input {
  width: 100%;
  padding: 12px 15px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 16px;
  transition: all 0.3s;
  box-sizing: border-box;
}

input:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}
input:disabled {
  background-color: #f8f9fa;
  cursor: not-allowed;
}

.password-group {
  position: relative;
}

.password-group input {
  padding-right: 40px;
}

.eye-icon {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  cursor: pointer;
  color: #999;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.eye-icon:hover {
  color: #555;
}

/* ปุ่มทั่วไป */
button {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.btn-primary {
  background-color: #007bff;
  color: white;
}
.btn-primary:hover:not(:disabled) {
  background-color: #0056b3;
}
.btn-primary:disabled {
  background-color: #8abcf5;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: #e9ecef;
  color: #495057;
}
.btn-secondary:hover:not(:disabled) {
  background-color: #dee2e6;
}

.error-text {
  color: #dc3545;
  font-size: 14px;
  margin-top: 10px;
  margin-bottom: 10px;
}

/* Spinner */
.loader {
  width: 18px;
  height: 18px;
  border: 2px solid #fff;
  border-bottom-color: transparent;
  border-radius: 50%;
  display: inline-block;
  box-sizing: border-box;
  animation: rotation 1s linear infinite;
}

@keyframes rotation {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(5px);
}

.modal-content {
  background: white;
  padding: 40px;
  border-radius: 20px;
  text-align: center;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  width: 300px;
  animation: popIn 0.3s ease-out;
}

.success-icon {
  width: 80px;
  height: 80px;
  background-color: #d1e7dd;
  color: #198754;
  border-radius: 50%;
  font-size: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px auto;
  font-weight: bold;
}

.modal-content h3 {
  margin-bottom: 10px;
  color: #333;
}

@keyframes popIn {
  from {
    transform: scale(0.8);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* Responsive Adjustments */
@media (max-width: 480px) {
  .login-box {
    padding: 30px 20px;
    margin: 20px;
    border-radius: 12px;
  }

  h2 {
    font-size: 1.5rem;
    margin-bottom: 20px;
  }

  .modal-content {
    width: 85%;
    padding: 30px 20px;
  }
}
</style>
