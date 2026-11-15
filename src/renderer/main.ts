import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './style.css';
import router from '@/router';
import { applyTheme, themeMode } from '@/composables/useTeamTheme';

// Default colours before the first paint; the team's take over once the franchise loads
applyTheme(null, themeMode.value);

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
