<template>
  <div class="report-page">
    <div class="header">
      <h1>Report Management</h1>
      <p class="subtitle">หน้านี้สำหรับดูรายงาน (กำลังพัฒนา)</p>
    </div>

    <div class="content-placeholder glass-effect">
      <div class="icon">📊</div>
      <h3>Coming Soon</h3>
      <p>ระบบรายงานกำลังอยู่ระหว่างการพัฒนา โปรดติดตามในเวอร์ชันถัดไป</p>
    </div>
  </div>
</template>

<script setup>
// Future Logic
</script>

<style scoped>
.report-page {
  padding: 30px;
  background-color: #f8f9fa;
  min-height: 100vh;
  font-family: "Inter", sans-serif;
}

.header {
  margin-bottom: 30px;
}

h1 {
  font-size: 1.8rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.subtitle {
  color: #64748b;
  margin-top: 5px;
}

.content-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  background: white;
  border-radius: 16px;
  text-align: center;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.icon {
  font-size: 4rem;
  margin-bottom: 20px;
}

h3 {
  font-size: 1.5rem;
  color: #1e293b;
  margin-bottom: 10px;
}

p {
  color: #64748b;
}

.glass-effect {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
}

@media (max-width: 768px) {
  .report-page {
    padding: 20px 15px;
  }
}
</style>
