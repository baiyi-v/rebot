import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index.js'
import { auth } from './auth.js'
import { setNoDownloadsHandler } from './api.js'
import './styles.css'

setNoDownloadsHandler(() => {
  const current = router.currentRoute.value
  if (current.path === '/app/tomato/account') return
  router.push('/app/tomato/account')
})

async function bootstrap() {
  await auth.loadPlatforms()
  await auth.loadMe()
  const app = createApp(App)
  app.use(router)
  app.mount('#app')
}

bootstrap()
