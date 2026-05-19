<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { auth } from '../auth.js'

const route = useRoute()
const router = useRouter()

const mode = ref('login')
const username = ref('')
const password = ref('')
const cardCode = ref('')
const busy = ref('')
const msg = ref('')
const msgKind = ref('')

watch(mode, () => {
  msg.value = ''
  busy.value = ''
})

onMounted(async () => {
  await auth.loadPlatforms()
  await auth.loadMe()
})

async function afterAuthOk() {
  const redir = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  if (redir && redir.startsWith('/') && !redir.startsWith('//')) {
    await router.replace(redir)
  } else {
    await router.replace('/platforms')
  }
}

async function onLogin() {
  busy.value = 'login'
  msg.value = ''
  try {
    await auth.login(username.value.trim().toLowerCase(), password.value)
    msgKind.value = 'ok'
    await afterAuthOk()
  } catch (e) {
    msgKind.value = 'err'
    msg.value = e.message || '登录失败'
  } finally {
    busy.value = ''
  }
}

async function onRegister() {
  busy.value = 'register'
  msg.value = ''
  try {
    if (!cardCode.value.trim()) {
      throw new Error('请输入卡密')
    }
    await auth.register(username.value.trim().toLowerCase(), password.value, 'tomato', cardCode.value.trim())
    msgKind.value = 'ok'
    await router.replace('/tutorial')
  } catch (e) {
    msgKind.value = 'err'
    msg.value = e.message || '注册失败'
  } finally {
    busy.value = ''
    cardCode.value = ''
  }
}

async function goPlatformsSkip() {
  await router.replace('/platforms')
}
</script>

<template>
  <div class="gate">
    <div class="gate__card">
      <h1 class="gate__title">账号登录</h1>
      <p class="gate__sub">登录或注册后选择平台；各平台功能相互独立。</p>

      <div v-if="auth.authDisabled" class="gate__banner gate__banner--info">
        <p>服务端已关闭账号校验，可直接进入平台选择。</p>
        <button type="button" class="btn btn--primary gate__skip" @click="goPlatformsSkip">
          进入平台选择
        </button>
      </div>

      <template v-else>
        <div class="gate__tabs">
          <button
            type="button"
            class="gate__tab"
            :class="{ 'gate__tab--on': mode === 'login' }"
            @click="mode = 'login'"
          >
            登录
          </button>
          <button
            type="button"
            class="gate__tab"
            :class="{ 'gate__tab--on': mode === 'register' }"
            @click="mode = 'register'"
          >
            注册
          </button>
        </div>

        <label class="gate__label">用户名（小写、数字、下划线）</label>
        <input v-model="username" class="input gate__input" type="text" autocomplete="username" />

        <label class="gate__label">密码（至少 6 位）</label>
        <input
          v-model="password"
          class="input gate__input"
          type="password"
          autocomplete="current-password"
        />

        <template v-if="mode === 'register'">
          <label class="gate__label">卡密（必填，注册后自动充值）</label>
          <input
            v-model="cardCode"
            class="input gate__input"
            type="text"
            placeholder="请输入卡密"
            autocomplete="off"
          />
        </template>

        <div class="gate__actions">
          <button
            v-if="mode === 'login'"
            type="button"
            class="btn btn--primary gate__btn"
            :disabled="!!busy"
            @click="onLogin"
          >
            {{ busy === 'login' ? '登录中…' : '登录' }}
          </button>
          <button
            v-else
            type="button"
            class="btn btn--primary gate__btn"
            :disabled="!!busy"
            @click="onRegister"
          >
            {{ busy === 'register' ? '提交中…' : '注册' }}
          </button>
        </div>

        <p v-if="msg" class="gate__msg" :class="'gate__msg--' + msgKind">{{ msg }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.gate {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  box-sizing: border-box;
}

.gate__card {
  width: 100%;
  max-width: 420px;
  padding: 28px 26px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-panel);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}

.gate__title {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 700;
}

.gate__sub {
  margin: 0 0 22px;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
}

.gate__banner {
  padding: 14px;
  border-radius: 8px;
  font-size: 13px;
}

.gate__banner--info {
  background: rgba(14, 165, 233, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #bae6fd;
}

.gate__banner p {
  margin: 0 0 12px;
}

.gate__skip {
  width: 100%;
}

.gate__tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
}

.gate__tab {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-row);
  color: var(--text-dim);
  cursor: pointer;
  font-size: 13px;
}

.gate__tab--on {
  border-color: #0369a1;
  background: #0c4a6e;
  color: #e0f2fe;
}

.gate__label {
  display: block;
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 4px;
  margin-top: 14px;
}

.gate__label:first-of-type {
  margin-top: 0;
}

.gate__input {
  width: 100%;
}

.gate__actions {
  margin-top: 22px;
}

.gate__btn {
  width: 100%;
}

.gate__msg {
  margin-top: 14px;
  font-size: 12px;
}

.gate__msg--ok {
  color: #86efac;
}

.gate__msg--err {
  color: #fecaca;
}
</style>
