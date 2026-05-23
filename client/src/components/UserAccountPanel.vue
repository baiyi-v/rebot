<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../auth.js'

const router = useRouter()

const cardCode = ref('')
const busy = ref('')
const msg = ref('')
const msgKind = ref('')
const showConfirm = ref(false)
const showLogoutConfirm = ref(false)
const cardInfo = ref(null)

function formatTimeShort(ts) {
  return new Date(ts).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
}

const quotaLine = computed(() => {
  const u = auth.user
  if (!u) return ''
  const exp =
    u.membership_expires_at != null
      ? formatTimeShort(u.membership_expires_at)
      : '未激活'
  return `会员到期：${exp} · 剩余下载次数：${u.downloads_remaining ?? 0}`
})

function onLogout() {
  showLogoutConfirm.value = true
}

async function confirmLogout() {
  busy.value = 'logout'
  try {
    await auth.logout()
    await router.replace('/login')
  } finally {
    busy.value = ''
  }
}

function cancelLogout() {
  showLogoutConfirm.value = false
}

function onRedeemClick() {
  msg.value = ''
  const code = cardCode.value.trim()
  if (!code) {
    msgKind.value = 'err'
    msg.value = '请输入卡密'
    return
  }
  cardInfo.value = null
  showConfirm.value = true
}

function cancelRedeem() {
  showConfirm.value = false
  cardInfo.value = null
}

async function confirmRedeem() {
  const code = cardCode.value.trim()
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
  } catch (e) {
    msgKind.value = 'err'
    msg.value = e.message || '充值失败'
  } finally {
    busy.value = ''
  }
}

function backPlatforms() {
  router.push('/platforms')
}
</script>

<template>
  <section class="uc">
    <div v-if="auth.authDisabled" class="uc__panel uc__muted">
      <p>当前未启用账号校验，番茄功能可直接使用。</p>
      <button type="button" class="btn btn--primary uc__mt" @click="backPlatforms">返回平台选择</button>
    </div>

    <div v-else-if="auth.user" class="uc__panel">
      <div class="uc__head">
        <div>
          <div class="uc__welcome">{{ auth.user.username }}</div>
          <div class="uc__quota">{{ quotaLine }}</div>
          <div class="uc__quota-hint">下载消耗时优先使用即将过期的次数</div>
        </div>
        <button type="button" class="btn uc__btn-logout" :disabled="!!busy" @click="onLogout">退出登录</button>
      </div>

      <h3 class="uc__h">卡密充值</h3>
      <div class="uc__row">
        <input
          v-model="cardCode"
          class="uc__input input uc__flex"
          type="text"
          placeholder="粘贴卡密"
          autocomplete="off"
          @keydown.enter="onRedeemClick"
        />
        <button type="button" class="btn btn--primary" :disabled="!!busy" @click="onRedeemClick">
          充值
        </button>
      </div>
      <p class="uc__pool-hint">每张卡密独立有效期，下载消耗时优先使用即将过期的次数</p>

      <div class="uc__footer-actions">
        <button type="button" class="btn" @click="backPlatforms">← 返回平台选择</button>
      </div>

      <p v-if="msg" class="uc__msg" :class="'uc__msg--' + msgKind">{{ msg }}</p>
    </div>

    <div v-else class="uc__panel uc__muted">
      <p>未登录，请从平台选择页重新进入。</p>
      <button type="button" class="btn btn--primary uc__mt" @click="router.replace('/login')">去登录</button>
    </div>

    <Teleport to="body">
      <div v-if="showConfirm" class="confirm-overlay" @click.self="cancelRedeem">
        <div class="confirm-dialog">
          <div class="confirm-dialog__title">确认充值</div>
          <div class="confirm-dialog__code">{{ cardCode }}</div>
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

    <Teleport to="body">
      <div v-if="showLogoutConfirm" class="confirm-overlay" @click.self="cancelLogout">
        <div class="confirm-dialog">
          <div class="confirm-dialog__title">确认退出</div>
          <div class="confirm-dialog__hint">退出后需要重新登录才能使用</div>
          <div class="confirm-dialog__actions">
            <button class="btn" @click="cancelLogout">取消</button>
            <button class="btn btn--danger" :disabled="busy === 'logout'" @click="confirmLogout">
              <span v-if="busy === 'logout'" class="spinner"></span>
              <span v-if="busy === 'logout'">退出中…</span>
              <span v-else>确认退出</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.uc {
  max-width: 560px;
}

.uc__panel {
  padding: 18px 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-panel);
}

.uc__muted {
  color: var(--text-dim);
  font-size: 13px;
  line-height: 1.5;
}

.uc__mt {
  margin-top: 12px;
}

.uc__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.uc__welcome {
  font-weight: 600;
  font-size: 15px;
}

.uc__quota {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.45;
}

.uc__quota-hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-dim);
  opacity: 0.6;
}

.uc__btn-logout {
  flex-shrink: 0;
}

.uc__h {
  font-size: 13px;
  font-weight: 600;
  margin: 16px 0 6px;
}

.uc__row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.uc__input {
  width: 100%;
}

.uc__flex {
  flex: 1;
  min-width: 160px;
}

.uc__footer-actions {
  margin-top: 18px;
}

.uc__msg {
  margin-top: 12px;
  font-size: 12px;
}

.uc__msg--ok {
  color: #86efac;
}

.uc__msg--err {
  color: #fecaca;
}

.uc__pool-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--text-dim);
  opacity: 0.7;
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

.confirm-dialog__hint {
  font-size: 12px;
  color: #fbbf24;
  margin-top: 10px;
  padding: 8px 12px;
  background: rgba(251, 191, 36, 0.1);
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
