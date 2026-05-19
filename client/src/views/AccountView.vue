<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { auth } from '../auth.js'

const router = useRouter()
const route = useRoute()
const cardCode = ref('')
const busy = ref('')
const msg = ref('')
const msgKind = ref('')

const quotaLine = computed(() => {
  const u = auth.user
  if (!u) return ''
  const exp =
    u.membership_expires_at != null
      ? new Date(u.membership_expires_at).toLocaleString('zh-CN', {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : '未激活'
  return `会员到期：${exp} · 剩余下载次数：${u.downloads_remaining ?? 0}`
})

async function onLogout() {
  busy.value = 'logout'
  try {
    await auth.logout()
    await router.replace('/login')
  } finally {
    busy.value = ''
  }
}

async function onRedeem() {
  busy.value = 'redeem'
  msg.value = ''
  try {
    await auth.redeem(cardCode.value)
    cardCode.value = ''
    msgKind.value = 'ok'
    msg.value = '充值成功'
  } catch (e) {
    msgKind.value = 'err'
    msg.value = e.message || '充值失败'
  } finally {
    busy.value = ''
  }
}

function backToPlatform() {
  const back = String(route.query.back || '')
  router.push(back || '/app/tomato')
}
</script>

<template>
  <div class="account-page">
    <header class="account-page__header">
      <button type="button" class="btn btn--ghost account-page__back" @click="backToPlatform">
        ← 返回
      </button>
      <h1 class="account-page__title">账户管理</h1>
    </header>
    
    <main class="account-page__content">
      <div v-if="auth.authDisabled" class="account-page__panel account-page__muted">
        <p>当前未启用账号校验，番茄功能可直接使用。</p>
        <button type="button" class="btn btn--primary account-page__mt" @click="backToPlatform">返回</button>
      </div>

      <div v-else-if="auth.user" class="account-page__panel">
        <div class="account-page__welcome">
          <div class="account-page__username">{{ auth.user.username }}</div>
          <div class="account-page__platform">当前平台：番茄小说</div>
        </div>

        <div class="account-page__stats">
          <div class="account-page__stat-item">
            <span class="account-page__stat-label">会员到期</span>
            <span class="account-page__stat-value">
              {{ auth.user.membership_expires_at != null
                ? new Date(auth.user.membership_expires_at).toLocaleString('zh-CN', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })
                : '未激活'
              }}
            </span>
          </div>
          <div class="account-page__stat-item">
            <span class="account-page__stat-label">剩余下载次数</span>
            <span class="account-page__stat-value account-page__stat-value--highlight">
              {{ auth.user.downloads_remaining ?? 0 }}
            </span>
          </div>
        </div>

        <div class="account-page__section">
          <h3 class="account-page__section-title">卡密充值</h3>
          <p class="account-page__hint">卡密含会员天数与下载次数；创建番茄下载任务成功消耗 1 次。</p>
          <div class="account-page__redeem">
            <input
              v-model="cardCode"
              class="account-page__input input"
              type="text"
              placeholder="粘贴卡密"
              autocomplete="off"
            />
            <button 
              type="button" 
              class="btn btn--primary account-page__redeem-btn" 
              :disabled="busy === 'redeem'"
              @click="onRedeem"
            >
              {{ busy === 'redeem' ? '充值中…' : '充值' }}
            </button>
          </div>
          <p v-if="msg" class="account-page__msg" :class="'account-page__msg--' + msgKind">{{ msg }}</p>
        </div>

        <div class="account-page__section">
          <h3 class="account-page__section-title">使用帮助</h3>
          <button type="button" class="btn btn--secondary" @click="router.push('/tutorial')">
            查看使用教程
          </button>
        </div>

        <div class="account-page__actions">
          <button type="button" class="btn btn--danger" :disabled="busy === 'logout'" @click="onLogout">
            退出登录
          </button>
        </div>
      </div>

      <div v-else class="account-page__panel account-page__muted">
        <p>未登录，请重新登录。</p>
        <button type="button" class="btn btn--primary" @click="router.replace('/login')">去登录</button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.account-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 16px 20px 32px;
}

.account-page__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.account-page__back {
  padding: 6px 12px;
  font-size: 13px;
}

.account-page__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.account-page__content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.account-page__panel {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-panel);
}

.account-page__muted {
  color: var(--text-dim);
  font-size: 13px;
  line-height: 1.5;
}

.account-page__mt {
  margin-top: 12px;
}

.account-page__welcome {
  margin-bottom: 20px;
}

.account-page__username {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
}

.account-page__platform {
  font-size: 12px;
  color: var(--text-dim);
}

.account-page__stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 14px;
  background: var(--bg-row);
  border-radius: 6px;
  margin-bottom: 20px;
}

.account-page__stat-item {
  text-align: center;
}

.account-page__stat-label {
  display: block;
  font-size: 11px;
  color: var(--text-dim);
  margin-bottom: 6px;
}

.account-page__stat-value {
  display: block;
  font-size: 16px;
  font-weight: 600;
}

.account-page__stat-value--highlight {
  color: #4ade80;
}

.account-page__section {
  margin-bottom: 20px;
}

.account-page__section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
}

.account-page__hint {
  font-size: 12px;
  color: var(--text-dim);
  margin: 0 0 12px;
  line-height: 1.45;
}

.account-page__redeem {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.account-page__input {
  flex: 1;
  min-width: 200px;
}

.account-page__redeem-btn {
  flex-shrink: 0;
}

.account-page__msg {
  margin-top: 10px;
  font-size: 12px;
}

.account-page__msg--ok {
  color: #86efac;
}

.account-page__msg--err {
  color: #fecaca;
}

.account-page__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn--danger {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}

.btn--danger:hover {
  background: rgba(239, 68, 68, 0.3);
  color: #fecaca;
}
</style>
