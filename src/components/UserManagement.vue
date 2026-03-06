<script setup>
import { ref, onMounted } from "vue";
import { rtdb as db } from "../firebase";
import { ref as dbRef, onValue, update, remove } from "firebase/database";

const users = ref([]);
const loading = ref(true);
const errorMessage = ref("");

// --- ดึงข้อมูล Users ---
onMounted(() => {
  const usersRef = dbRef(db, "users");
  onValue(
    usersRef,
    (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // แปลง Object เป็น Array เพื่อมาวนลูปแสดงผล
        users.value = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
      } else {
        users.value = [];
      }
      loading.value = false;
      errorMessage.value = "";
    },
    (error) => {
      console.error("Fetch Users Error:", error);
      errorMessage.value = "ไม่สามารถดึงข้อมูลผู้ใช้ได้: " + error.message;
      loading.value = false;
    },
  );
});

// --- ฟังก์ชันเปลี่ยนสิทธิ์ (Admin/User) ---
const toggleRole = async (user) => {
  // ถ้าเป็น 1 (Admin) ให้เปลี่ยนเป็น 2 (User), ถ้าเป็น 2 ให้เป็น 1
  const newRole = user.role_id == 1 ? 2 : 1;
  const newRoleName = newRole == 1 ? "Administrator" : "User";

  if (confirm(`คุณต้องการเปลี่ยนสิทธิ์ของ "${user.username}" เป็น "${newRoleName}" ใช่หรือไม่?`)) {
    try {
      // อัปเดตค่า role_id ใน Firebase
      await update(dbRef(db, `users/${user.id}`), {
        role_id: newRole,
      });
      alert("อัปเดตสิทธิ์เรียบร้อยแล้ว!");
    } catch (error) {
      console.error("Error updating role:", error);
      alert("เกิดข้อผิดพลาดในการอัปเดต");
    }
  }
};

// --- 3. ฟังก์ชันลบผู้ใช้ ---
const deleteUser = async (userId) => {
  if (confirm("⚠️ คำเตือน: คุณแน่ใจหรือไม่ที่จะลบผู้ใช้นี้ออกจากระบบ?")) {
    try {
      await remove(dbRef(db, `users/${userId}`));
      alert("ลบผู้ใช้เรียบร้อยแล้ว");
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("เกิดข้อผิดพลาดในการลบ");
    }
  }
};
</script>

<template>
  <div class="page-container">
    <div class="header-row">
      <div>
        <h1 class="text-2xl font-bold text-gray-800">จัดการผู้ใช้งาน (User Management)</h1>
        <p class="text-sm text-gray-500">จัดการผู้ใช้งานและกำหนดสิทธิ์แอดมิน</p>
      </div>
      <div class="stats-badge">
        ผู้ใช้งานทั้งหมด: <strong>{{ users.length }}</strong>
      </div>
    </div>

    <div v-if="loading" class="loading-box">กำลังโหลดข้อมูล...</div>
    <div v-else-if="errorMessage" class="error-box">{{ errorMessage }}</div>

    <div v-else class="table-card">
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>ชื่อผู้ใช้งาน</th>
              <th>อีเมล</th>
              <th>สิทธิ์ปัจจุบัน</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>
                <div class="user-info">
                  <div class="avatar-circle">{{ user.username.charAt(0).toUpperCase() }}</div>
                  <span class="font-medium">{{ user.username }}</span>
                </div>
              </td>
              <td class="text-gray-600">{{ user.email }}</td>
              <td>
                <span class="role-badge" :class="user.role_id == 1 ? 'admin' : 'user'">
                  {{ user.role_id == 1 ? "ADMIN" : "USER" }}
                </span>
              </td>
              <td>
                <div class="action-buttons">
                  <button
                    @click="toggleRole(user)"
                    class="btn-icon btn-edit"
                    :title="user.role_id == 1 ? 'เปลี่ยนเป็น User' : 'เปลี่ยนเป็น Admin'"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>

                  <button
                    @click="deleteUser(user.id)"
                    class="btn-icon btn-delete"
                    title="ลบผู้ใช้งาน"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path
                        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                      ></path>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  padding: 30px;
  background-color: #f3f4f6;
  min-height: 100vh;
  font-family: "Inter", sans-serif;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
}

.stats-badge {
  background: white;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.9rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  color: #555;
}

.table-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.02);
  overflow: hidden;
  border: 1px solid #e5e7eb;
}

.table-responsive {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  background: #f9fafb;
  text-align: left;
  padding: 16px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #e5e7eb;
}

td {
  padding: 16px;
  border-bottom: 1px solid #e5e7eb;
  vertical-align: middle;
  font-size: 0.95rem;
}

tr:last-child td {
  border-bottom: none;
}
tr:hover {
  background-color: #f9fafb;
}

/* User Info */
.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}
.avatar-circle {
  width: 36px;
  height: 36px;
  background-color: #3b82f6;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1rem;
}

/* Role Badge */
.role-badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.role-badge.admin {
  background-color: #dbeafe;
  color: #1e40af;
  border: 1px solid #bfdbfe;
}
.role-badge.user {
  background-color: #f3f4f6;
  color: #4b5563;
  border: 1px solid #e5e7eb;
}

/* Buttons */
.action-buttons {
  display: flex;
  gap: 8px;
}

.btn-icon {
  border: 1px solid #333;
  background: white;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin: 0 4px;
  color: #333;
  transition: all 0.2s ease;
}

.btn-icon:hover {
  background-color: #f3f4f6;
  transform: translateY(-2px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.btn-edit:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.btn-delete:hover {
  border-color: #ef4444;
  color: #ef4444;
}

.loading-box {
  text-align: center;
  padding: 40px;
  color: #6b7280;
}

.error-box {
  text-align: center;
  padding: 20px;
  margin-bottom: 20px;
  background-color: #fee2e2;
  color: #991b1b;
  border-radius: 8px;
  font-weight: bold;
}

/* Responsive Adjustments */
@media (max-width: 768px) {
  .page-container {
    padding: 15px;
  }

  .header-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }

  .stats-badge {
    width: 100%;
    text-align: center;
  }

  table {
    min-width: 600px;
  }

  th,
  td {
    padding: 12px;
    font-size: 0.85rem;
  }

  .action-buttons {
    flex-direction: column;
    gap: 5px;
  }

  .btn-action {
    width: 100%;
    text-align: center;
  }
}
</style>
