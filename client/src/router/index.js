import { createRouter, createWebHistory } from 'vue-router'
import { auth } from '../auth.js'
import LoginView from '../views/LoginView.vue'
import PlatformSelectView from '../views/PlatformSelectView.vue'
import TomatoWorkspace from '../components/TomatoWorkspace.vue'
import TxtSearchWorkspace from '../components/TxtSearchWorkspace.vue'
import ZhihuWorkspace from '../components/ZhihuWorkspace.vue'
import AccountView from '../views/AccountView.vue'
import TutorialView from '../views/TutorialView.vue'
import AdminView from '../views/AdminView.vue'

function authBypass() {
  return auth.authDisabled
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      redirect: () => {
        if (authBypass()) return '/platforms'
        if (auth.token && auth.user) return '/platforms'
        return '/login'
      },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { guestGate: true },
    },
    {
      path: '/platforms',
      name: 'platforms',
      component: PlatformSelectView,
      meta: { requiresAuth: true },
    },
    {
      path: '/app/tomato',
      name: 'tomato',
      component: TomatoWorkspace,
      meta: { requiresAuth: true, platform: 'tomato' },
    },
    {
      path: '/app/txtsearch',
      name: 'txtsearch',
      component: TxtSearchWorkspace,
      meta: { requiresAuth: true, platform: 'txtsearch' },
    },
    {
      path: '/app/zhihu',
      name: 'zhihu',
      component: ZhihuWorkspace,
      meta: { requiresAuth: true, platform: 'zhihu' },
    },
    {
      path: '/app/tomato/account',
      name: 'tomato-account',
      component: AccountView,
      meta: { requiresAuth: true, platform: 'tomato' },
    },
    {
      path: '/tutorial',
      name: 'tutorial',
      component: TutorialView,
      meta: { requiresAuth: true },
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
    },
  ],
})

router.beforeEach((to, _from, next) => {
  if (authBypass()) {
    if (to.meta.guestGate && to.path === '/login') {
      return next({ path: '/platforms', replace: true })
    }
    return next()
  }

  if (to.meta.requiresAuth && !auth.token) {
    return next({ path: '/login', query: { redirect: to.fullPath } })
  }

  if (to.meta.guestGate && auth.token && auth.user) {
    return next({ path: '/platforms', replace: true })
  }

  next()
})

export default router
