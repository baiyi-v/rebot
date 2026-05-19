<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../auth.js'

const router = useRouter()

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
          <p class="uc__ctx">当前为 <strong>番茄小说</strong> 专属页：会员与次数全账号共用；解析与任务仅在本平台使用。</p>
        </div>
        <button type="button" class="btn uc__btn-logout" :disabled="!!busy" @click="onLogout">退出登录</button>
      </div>

      <h3 class="uc__h">卡密充值</h3>
      <p class="uc__hint">卡密含会员天数与下载次数；创建番茄下载任务成功消耗 1 次。</p>
      <div class="uc__row">
        <input
          v-model="cardCode"
          class="uc__input input uc__flex"
          type="text"
          placeholder="粘贴卡密"
          autocomplete="off"
        />
        <button type="button" class="btn btn--primary" :disabled="busy === 'redeem'" @click="onRedeem">
          {{ busy === 'redeem' ? '充值中…' : '充值' }}
        </button>
      </div>

      <div class="uc__footer-actions">
        <button type="button" class="btn" @click="backPlatforms">← 返回平台选择</button>
      </div>

      <p v-if="msg" class="uc__msg" :class="'uc__msg--' + msgKind">{{ msg }}</p>
    </div>

    <div v-else class="uc__panel uc__muted">
      <p>未登录，请从平台选择页重新进入。</p>
      <button type="button" class="btn btn--primary uc__mt" @click="router.replace('/login')">去登录</button>
    </div>
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

.uc__ctx {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.45;
}

.uc__btn-logout {
  flex-shrink: 0;
}

.uc__h {
  font-size: 13px;
  font-weight: 600;
  margin: 16px 0 6px;
}

.uc__hint {
  font-size: 11px;
  color: var(--text-dim);
  margin: 0 0 10px;
  line-height: 1.45;
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
</style>
