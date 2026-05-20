<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { auth } from '../auth.js'

const router = useRouter()
const route = useRoute()
const cardCode = ref('')
const busy = ref('')
const msg = ref('')
const msgKind = ref('')
const showConfirm = ref(false)
const cardInfo = ref(null)
const cardInfoLoading = ref(false)
const pools = ref([])

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

const quotaLine = computed(() => {
  const u = auth.user
  if (!u) return ''
  const exp =
    u.membership_expires_at != null
      ? formatDate(u.membership_expires_at)
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

async function onRedeemClick() {
  msg.value = ''
  const code = cardCode.value.trim()
  if (!code) {
    msgKind.value = 'err'
    msg.value = '请输入卡密'
    return
  }
  cardInfoLoading.value = true
  try {
    const info = await auth.getCardInfo(code)
    cardInfo.value = {
      code,
      days: info.days,
      downloads: info.downloads,
    }
    showConfirm.value = true
  } catch (e) {
    msgKind.value = 'err'
    msg.value = e.message || '卡密查询失败'
  } finally {
    cardInfoLoading.value = false
  }
}

function cancelRedeem() {
  showConfirm.value = false
  cardInfo.value = null
}

async function loadPools() {
  try {
    pools.value = await auth.loadPools()
  } catch {
    pools.value = []
  }
}

async function confirmRedeem() {
  const code = cardInfo.value?.code
  if (!code) return

  busy.value = 'redeem'
  msg.value = ''
  msgKind.value = ''
  try {
    await auth.redeem(code)
    cardCode.value = ''
    showConfirm.value = false
    cardInfo.value = null
    msgKind.value = 'ok'
    msg.value = '充值成功'
    await loadPools()
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

onMounted(() => {
  loadPools()
})
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
                ? formatDate(auth.user.membership_expires_at)
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

        <p class="account-page__hint" style="text-align:center;color:#60a5fa">下载消耗时优先使用即将过期的次数</p>

        <div v-if="pools.length" class="account-page__section">
          <h3 class="account-page__section-title">生效的卡密</h3>
          <div class="account-page__pool-list">
            <div v-for="p in pools" :key="p.id" class="account-page__pool-item">
              <div class="account-page__pool-main">
                <span class="account-page__pool-code">{{ p.code }}</span>
                <span class="account-page__pool-remaining">{{ p.remaining }}/{{ p.downloads }} 次</span>
              </div>
              <div class="account-page__pool-meta">
                <span class="account-page__pool-expires">截止 {{ formatDate(p.expires_at) }}</span>
              </div>
            </div>
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
              @keydown.enter="onRedeemClick"
            />
            <button 
              type="button" 
              class="btn btn--primary account-page__redeem-btn" 
              :disabled="busy === 'redeem' || cardInfoLoading"
              @click="onRedeemClick"
            >
              <span v-if="cardInfoLoading" class="spinner"></span>
              {{ cardInfoLoading ? '查询中…' : (busy === 'redeem' ? '充值中…' : '充值') }}
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

  <Teleport to="body">
    <div v-if="showConfirm" class="confirm-overlay" @click.self="cancelRedeem">
      <div class="confirm-dialog">
        <div class="confirm-dialog__title">确认充值</div>
        <div class="confirm-dialog__code">{{ cardInfo?.code }}</div>
        <div class="confirm-dialog__info">
          <div class="confirm-dialog__info-item">
            <span class="confirm-dialog__info-label">有效天数</span>
            <span class="confirm-dialog__info-value">{{ cardInfo?.days ?? 0 }} 天</span>
          </div>
          <div class="confirm-dialog__info-item">
            <span class="confirm-dialog__info-label">下载次数</span>
            <span class="confirm-dialog__info-value">{{ cardInfo?.downloads ?? 0 }} 次</span>
          </div>
          <div class="confirm-dialog__info-item">
            <span class="confirm-dialog__info-label">到期时间</span>
            <span class="confirm-dialog__info-value">{{ formatDate(Date.now() + (cardInfo?.days ?? 0) * 86400000) }}</span>
          </div>
        </div>
        <div class="confirm-dialog__hint">下载消耗时优先使用即将过期的次数</div>
        <div class="confirm-dialog__actions">
          <button class="btn" @click="cancelRedeem">取消</button>
          <button class="btn btn--primary" :disabled="busy === 'redeem'" @click="confirmRedeem">
            <span v-if="busy === 'redeem'" class="spinner"></span>
            <span v-if="busy === 'redeem'">充值中…</span>
            <span v-else>确认充值</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
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

.account-page__pool-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.account-page__pool-item {
  padding: 8px 12px;
  background: var(--bg-row);
  border-radius: 6px;
}

.account-page__pool-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.account-page__pool-code {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  color: var(--text-dim);
}

.account-page__pool-remaining {
  font-size: 13px;
  font-weight: 600;
}

.account-page__pool-meta {
  margin-top: 2px;
}

.account-page__pool-expires {
  font-size: 11px;
  color: var(--text-dim);
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

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  display: inline-block;
}

@keyframes spin { to { transform: rotate(360deg); } }

.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.confirm-dialog {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px 32px;
  min-width: 360px;
  max-width: 440px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
}

.confirm-dialog__title {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 6px;
}

.confirm-dialog__code {
  font-size: 14px;
  font-family: ui-monospace, monospace;
  color: var(--text-dim);
  word-break: break-all;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: var(--bg-row);
  border-radius: 6px;
}

.confirm-dialog__info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 4px;
}

.confirm-dialog__info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: var(--bg-row);
  border-radius: 6px;
}

.confirm-dialog__info-label {
  font-size: 13px;
  color: var(--text-dim);
}

.confirm-dialog__info-value {
  font-size: 13px;
  font-weight: 600;
}

.confirm-dialog__hint {
  font-size: 12px;
  color: #60a5fa;
  margin-top: 10px;
  padding: 8px 12px;
  background: rgba(96, 165, 250, 0.1);
  border-radius: 6px;
}

.confirm-dialog__actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
  justify-content: flex-end;
}

.confirm-dialog__actions .btn {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
}
</style>
