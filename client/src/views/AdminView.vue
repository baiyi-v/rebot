<template>
  <div class="admin-page">
    <div v-if="!authenticated" class="login-section">
      <h2>管理员登录</h2>
      <div class="form-group">
        <label>管理员密钥</label>
        <input 
          v-model="adminSecret" 
          type="password" 
          placeholder="请输入 ADMIN_SECRET"
          @keyup.enter="authenticate"
        />
      </div>
      <button @click="authenticate" :disabled="loading">
        {{ loading ? '验证中...' : '登录' }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>
    </div>

    <div v-else class="main-section">
      <div class="header">
        <h2>卡密生成</h2>
        <button @click="logout" class="logout-btn">退出</button>
      </div>

      <div class="form-section">
        <div class="form-row">
          <div class="form-group">
            <label>有效天数</label>
            <input 
              v-model.number="days" 
              type="number" 
              min="0" 
              max="36500"
              placeholder="0"
            />
            <span class="hint">0 表示不增加天数</span>
          </div>
          <div class="form-group">
            <label>下载次数</label>
            <input 
              v-model.number="downloads" 
              type="number" 
              min="0" 
              max="1000000"
              placeholder="10"
            />
            <span class="hint">0 表示不增加次数</span>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>生成数量</label>
            <input 
              v-model.number="count" 
              type="number" 
              min="1" 
              max="100"
              placeholder="5"
            />
            <span class="hint">最多 100 个</span>
          </div>
          <div class="form-group">
            <label>使用次数限制</label>
            <input 
              v-model.number="maxUses" 
              type="number" 
              min="1" 
              max="1000"
              placeholder="1"
            />
            <span class="hint">每个卡密可使用次数</span>
          </div>
        </div>
        <div class="form-group">
          <label>备注（可选）</label>
          <input 
            v-model="note" 
            type="text" 
            placeholder="添加备注信息"
            maxlength="200"
          />
        </div>
        <div class="form-group form-group--checkbox">
          <label class="checkbox-label">
            <input 
              v-model="isEvent" 
              type="checkbox"
            />
            <span>活动卡密（每个账号只能兑换一次）</span>
          </label>
        </div>
        <button @click="generateCards" :disabled="loading || !canGenerate">
          {{ loading ? '生成中...' : '生成卡密' }}
        </button>
      </div>

      <div v-if="generatedCodes.length > 0" class="result-section">
        <h3>生成结果</h3>
        <div class="codes-list">
          <div v-for="(code, index) in generatedCodes" :key="index" class="code-item">
            <span class="code">{{ code }}</span>
            <button type="button" @click="copyCode(code)">复制</button>
          </div>
        </div>
        <div class="summary">
          <p>共生成 <strong>{{ generatedCodes.length }}</strong> 个卡密</p>
          <p>有效期: {{ days > 0 ? days + ' 天' : '不增加' }} | 下载次数: {{ downloads > 0 ? downloads + ' 次' : '不增加' }}</p>
        </div>
        <button type="button" @click="copyAll">复制全部</button>
      </div>

      <div class="form-section">
        <h3>分享文件管理</h3>
        <div class="form-group">
          <label>分享日期（留空加入候选池）</label>
          <input v-model="shareDate" type="date" class="share-date-input" />
          <span class="hint">不填日期则加入候选池，由系统每天自动分配</span>
        </div>
        <div class="form-group">
          <label>分享文件名</label>
          <input v-model="shareName" type="text" placeholder="例如：每日活动卡密-2026-05-23" />
        </div>
        <div class="form-group">
          <label>分享链接</label>
          <input v-model="shareLink" type="text" placeholder="迅雷分享链接" />
        </div>
        <div class="form-group">
          <label>提取码（可选）</label>
          <input v-model="shareExtractionCode" type="text" placeholder="如有提取码请填写" />
        </div>
        <p v-if="shareError" class="error">{{ shareError }}</p>
        <button @click="createShare" :disabled="shareLoading">
          {{ shareLoading ? '创建中...' : '创建/更新分享' }}
        </button>
      </div>

      <div v-if="shareList.length > 0" class="result-section">
        <h3>分享记录</h3>
        <div class="share-list">
          <div v-for="s in shareList" :key="s.id" class="share-item">
            <div class="share-item__date">{{ s.share_date || '候选池' }}</div>
            <div class="share-item__name">{{ s.name }}</div>
            <div class="share-item__meta">
              <span :class="s.status === 'active' ? 'share-status--active' : s.status === 'pending' ? 'share-status--pending' : 'share-status--inactive'">
                {{ s.status === 'active' ? '使用中' : s.status === 'pending' ? '候选池' : '停用' }}
              </span>
              <span>下载 {{ s.download_count }} 次</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>import { ref, computed } from 'vue';
const adminSecret = ref('');
const authenticated = ref(false);
const loading = ref(false);
const error = ref('');
const days = ref(30);
const downloads = ref(10);
const count = ref(5);
const maxUses = ref(1);
const isEvent = ref(false);
const note = ref('');
const generatedCodes = ref([]);
const shareName = ref('');
const shareLink = ref('');
const shareExtractionCode = ref('');
const shareDate = ref(new Date().toISOString().slice(0, 10));
const shareError = ref('');
const shareList = ref([]);
const shareLoading = ref(false);
const canGenerate = computed(() => {
 return (days.value > 0 || downloads.value > 0) && count.value > 0;
});
async function authenticate() {
 if (!adminSecret.value.trim()) {
 error.value = '请输入管理员密钥';
 return;
 }
 loading.value = true;
 error.value = '';
 try {
 const r = await fetch('/api/admin/cards/validate', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'X-Admin-Secret': adminSecret.value
 }
 });
 const data = await r.json();
 if (r.ok && data.ok) {
 authenticated.value = true
 loadShares()
 }
 else {
 error.value = data.message || '密钥验证失败';
 }
 }
 catch (e) {
 error.value = '连接服务器失败';
 }
 finally {
 loading.value = false;
 }
}
async function generateCards() {
 if (!canGenerate.value)
 return;
 loading.value = true;
 error.value = '';
 try {
 const r = await fetch('/api/admin/cards', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'X-Admin-Secret': adminSecret.value
 },
 body: JSON.stringify({
 days: days.value,
 downloads: downloads.value,
 count: count.value,
        max_uses: maxUses.value,
        is_event: isEvent.value,
        note: note.value
 })
 });
 const data = await r.json();
 if (r.ok) {
 generatedCodes.value = data.codes || [];
 }
 else {
 error.value = data.message || '生成失败';
 }
 }
 catch (e) {
 error.value = '连接服务器失败';
 }
 finally {
 loading.value = false;
 }
}
async function copyText(text) {
 const value = String(text || '');
 if (!value)
 throw new Error('没有可复制的内容');
 if (navigator.clipboard && window.isSecureContext) {
 try {
 await navigator.clipboard.writeText(value);
 return;
 }
 catch {
 /* fallback below */
 }
 }
 const textarea = document.createElement('textarea');
 textarea.value = value;
 textarea.setAttribute('readonly', '');
 textarea.style.position = 'fixed';
 textarea.style.top = '0';
 textarea.style.left = '-9999px';
 textarea.style.opacity = '0';
 document.body.appendChild(textarea);
 textarea.focus();
 textarea.select();
 textarea.setSelectionRange(0, textarea.value.length);
 let ok = false;
 try {
 ok = document.execCommand('copy');
 }
 finally {
 document.body.removeChild(textarea);
 }
 if (!ok)
 throw new Error('当前浏览器不允许自动复制，请长按卡密手动复制');
}
async function copyCode(code) {
 try {
 await copyText(code);
 alert('已复制');
 }
 catch (e) {
 alert(e.message || '复制失败，请长按卡密手动复制');
 }
}
async function copyAll() {
 const text = generatedCodes.value.join('\n');
 try {
 await copyText(text);
 alert('已全部复制');
 }
 catch (e) {
 alert(e.message || '复制失败，请长按卡密手动复制');
 }
}
function logout() {
  authenticated.value = false
  adminSecret.value = ''
  generatedCodes.value = []
  shareList.value = []
}

async function loadShares() {
  shareError.value = ''
  try {
    const r = await fetch('/api/admin/shares', {
      headers: { 'X-Admin-Secret': adminSecret.value },
    })
    const data = await r.json()
    if (r.ok) {
      shareList.value = data.shares || []
    } else {
      shareError.value = data.message || '加载失败'
    }
  } catch {
    shareError.value = '连接服务器失败'
  }
}

async function createShare() {
  if (!shareName.value.trim() || !shareLink.value.trim()) {
    shareError.value = '分享名和链接为必填项'
    return
  }
  shareLoading.value = true
  shareError.value = ''
  try {
    const r = await fetch('/api/admin/shares', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': adminSecret.value,
      },
      body: JSON.stringify({
        name: shareName.value.trim(),
        link: shareLink.value.trim(),
        extraction_code: shareExtractionCode.value.trim(),
        share_date: shareDate.value.trim(),
      }),
    })
    const data = await r.json()
    if (r.ok) {
      shareName.value = ''
      shareExtractionCode.value = ''
      shareDate.value = new Date().toISOString().slice(0, 10)
      await loadShares()
    } else {
      shareError.value = data.message || '创建失败'
    }
  } catch {
    shareError.value = '连接服务器失败'
  } finally {
    shareLoading.value = false
  }
}
</script>

<style scoped>
.admin-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
}

.login-section {
  text-align: center;
  padding: 60px 20px;
}

.login-section h2 {
  margin-bottom: 30px;
  color: #333;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  text-align: left;
  font-weight: 500;
  color: #555;
}

.form-group input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color 0.3s;
}

.form-group input:focus {
  outline: none;
  border-color: #4a90d9;
}

.form-group .hint {
  display: block;
  font-size: 12px;
  color: #999;
  margin-top: 5px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

button {
  width: 100%;
  padding: 12px;
  background: #4a90d9;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.3s;
}

button:hover:not(:disabled) {
  background: #3a7bc8;
}

button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.error {
  color: #e74c3c;
  margin-top: 15px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.logout-btn {
  width: auto;
  padding: 8px 20px;
  background: #95a5a6;
}

.logout-btn:hover {
  background: #7f8c8d;
}

.form-section {
  background: #f8f9fa;
  padding: 25px;
  border-radius: 12px;
  margin-bottom: 25px;
}

.result-section {
  background: #f8f9fa;
  padding: 25px;
  border-radius: 12px;
}

.result-section h3 {
  margin-bottom: 20px;
  color: #333;
}

.codes-list {
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 20px;
}

.code-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background: white;
  border-radius: 8px;
  margin-bottom: 10px;
  font-family: monospace;
  font-size: 14px;
  word-break: break-all;
  color: #333;
}

.code-item button {
  width: auto;
  padding: 5px 15px;
  font-size: 12px;
  background: #27ae60;
}

.code-item button:hover {
  background: #1e8449;
}

.summary {
  text-align: center;
  padding: 15px;
  background: white;
  border-radius: 8px;
  margin-bottom: 15px;
  color: #666;
}

.summary strong {
  color: #333;
}

.form-group--checkbox {
  padding: 5px 0;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 500;
  color: #555;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #4a90d9;
}

.share-date-input {
  font-family: inherit;
}

.share-list {
  max-height: 300px;
  overflow-y: auto;
}

.share-item {
  padding: 12px 15px;
  background: white;
  border-radius: 8px;
  margin-bottom: 10px;
}

.share-item__date {
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

.share-item__name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 6px;
  word-break: break-all;
}

.share-item__meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #666;
}

.share-status--active {
  color: #27ae60;
  font-weight: 600;
}

.share-status--pending {
  color: #d97706;
  font-weight: 600;
}

.share-status--inactive {
  color: #999;
}
</style>