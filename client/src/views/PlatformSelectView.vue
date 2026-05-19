<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../auth.js'

const router = useRouter()

const activePlatforms = new Set(['tomato', 'txtsearch'])

const platformRoutes = {
  tomato: '/app/tomato',
  txtsearch: '/app/txtsearch',
}

onMounted(async () => {
  await auth.loadPlatforms()
  await auth.loadMe()
})

async function logout() {
  await auth.logout()
  await router.replace('/login')
}

function enterPlatform(slug) {
  const route = platformRoutes[slug]
  if (route) router.push(route)
}

function isActive(slug) {
  return activePlatforms.has(slug)
}
</script>

<template>
  <div class="plat">
    <header class="plat__head">
      <div>
        <h1 class="plat__title">选择平台</h1>
        <p class="plat__sub">进入对应平台后使用该平台专属功能（与其它平台不共用界面）。</p>
      </div>
      <div class="plat__head-actions">
        <span v-if="!auth.authDisabled && auth.user" class="plat__user">{{ auth.user.username }}</span>
        <button
          v-if="!auth.authDisabled"
          type="button"
          class="btn plat__logout"
          @click="logout"
        >
          退出登录
        </button>
      </div>
    </header>

    <div class="plat__grid">
      <template v-for="p in auth.platforms" :key="p.slug">
        <button
          v-if="isActive(p.slug)"
          type="button"
          class="plat-card"
          :class="{ 'plat-card--tomato': p.slug === 'tomato', 'plat-card--txtsearch': p.slug === 'txtsearch' }"
          @click="enterPlatform(p.slug)"
        >
          <span class="plat-card__name">{{ p.name }}</span>
          <span class="plat-card__slug">{{ p.slug }}</span>
          <span class="plat-card__desc">{{ activePlatformDesc(p.slug) }}</span>
          <span class="plat-card__cta">点击进入</span>
        </button>

        <div
          v-else
          class="plat-card plat-card--soon"
        >
          <span class="plat-card__name">{{ p.name }}</span>
          <span class="plat-card__slug">{{ p.slug }}</span>
          <span class="plat-card__desc">功能开发中，敬请期待</span>
          <span class="plat-card__cta plat-card__cta--muted">即将开放</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
export function activePlatformDesc(slug) {
  switch (slug) {
    case 'tomato': return '链接解析、下载任务、本机成品（Tomato 下载器）'
    case 'txtsearch': return '在线书库搜索，直接下载 TXT 小说文件'
    default: return '专属下载功能'
  }
}
</script>

<style scoped>
.plat {
  max-width: 920px;
  margin: 0 auto;
  padding: 28px 20px 48px;
}

.plat__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
}

.plat__title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
}

.plat__sub {
  margin: 0;
  font-size: 13px;
  color: var(--text-dim);
  line-height: 1.5;
  max-width: 520px;
}

.plat__head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.plat__user {
  font-size: 13px;
  color: var(--text-dim);
}

.plat__logout {
  font-size: 12px;
}

.plat__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.plat-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  padding: 22px 20px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  cursor: pointer;
  transition:
    transform 0.12s ease,
    border-color 0.12s ease,
    box-shadow 0.12s ease;
}

.plat-card--tomato {
  border-color: rgba(234, 88, 12, 0.55);
  background: linear-gradient(165deg, rgba(245, 158, 11, 0.14), var(--bg-panel));
}

.plat-card--tomato:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 28px rgba(234, 88, 12, 0.22);
  border-color: rgba(251, 191, 36, 0.65);
}

.plat-card--txtsearch {
  border-color: rgba(34, 197, 94, 0.55);
  background: linear-gradient(165deg, rgba(34, 197, 94, 0.12), var(--bg-panel));
}

.plat-card--txtsearch:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 28px rgba(34, 197, 94, 0.22);
  border-color: rgba(74, 222, 128, 0.55);
}

.plat-card--soon {
  cursor: not-allowed;
  opacity: 0.72;
}

.plat-card__name {
  font-size: 17px;
  font-weight: 700;
}

.plat-card__slug {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-dim);
  font-family: ui-monospace, monospace;
}

.plat-card__desc {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.45;
  flex: 1;
}

.plat-card__cta {
  margin-top: 18px;
  font-size: 13px;
  font-weight: 700;
  color: #fb923c;
}

.plat-card--tomato .plat-card__cta {
  color: #fdba74;
}

.plat-card--txtsearch .plat-card__cta {
  color: #4ade80;
}

.plat-card__cta--muted {
  color: var(--text-dim);
  font-weight: 600;
}
</style>
