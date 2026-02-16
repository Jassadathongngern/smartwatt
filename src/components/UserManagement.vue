<script setup>
import { ref, onMounted } from "vue";
import { getDatabase, ref as dbRef, onValue, update, remove } from "firebase/database";

const db = getDatabase();
const users = ref([]);
const loading = ref(true);

// --- ดึงข้อมูล Users ---
onMounted(() => {
  const usersRef = dbRef(db, "users");
  onValue(usersRef, (snapshot) => {
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
  });
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
        <h1 class="text-2xl font-bold text-gray-800">User Management</h1>
        <p class="text-sm text-gray-500">จัดการผู้ใช้งานและกำหนดสิทธิ์แอดมิน</p>
      </div>
      <div class="stats-badge">
        Total Users: <strong>{{ users.length }}</strong>
      </div>
    </div>

    <div v-if="loading" class="loading-box">กำลังโหลดข้อมูล...</div>

    <div v-else class="table-card">
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Current Role</th>
              <th>Actions</th>
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
                    class="btn-action btn-edit"
                    :title="user.role_id == 1 ? 'Demote to User' : 'Promote to Admin'"
                  >
                    {{ user.role_id == 1 ? "⬇️ ลดเป็น User" : "⬆️ ตั้งเป็น Admin" }}
                  </button>

                  <button @click="deleteUser(user.id)" class="btn-action btn-delete">ลบ</button>
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
.btn-action {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}
.btn-edit {
  background-color: #fff;
  border-color: #d1d5db;
  color: #374151;
}
.btn-edit:hover {
  background-color: #f3f4f6;
  border-color: #9ca3af;
}
.btn-delete {
  background-color: #fee2e2;
  color: #991b1b;
}
.btn-delete:hover {
  background-color: #fecaca;
}

.loading-box {
  text-align: center;
  padding: 40px;
  color: #6b7280;
}
</style>
