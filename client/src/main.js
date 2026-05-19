import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index.js'
import { auth } from './auth.js'
import './styles.css'

async function bootstrap() {
  await auth.loadPlatforms()
  await auth.loadMe()
  const app = createApp(App)
  app.use(router)
  app.mount('#app')
}

bootstrap()
