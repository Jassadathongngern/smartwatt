<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router' 
import AppSidebar from './components/AppSidebar.vue'

const route = useRoute()

const showSidebar = computed(() => {
  return route.path !== '/login'
})
</script>

<template>
  <div class="app-layout">

    <AppSidebar v-if="showSidebar" />

    <main class="main-content">
      <router-view></router-view>
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  min-height: 90vh;
}

.main-content {
  flex: 1;
  background-color: #f4f6f9;
  overflow-y: auto;
  padding:  10px;
}
</style>
