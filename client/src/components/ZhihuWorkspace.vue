<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '../auth.js'
import { useZhihuWorkspace } from '../composables/useZhihuWorkspace.js'

const router = useRouter()

const {
  keyword,
  parseUrl,
  sites,
  currentSiteId,
  loading,
  mode,
  searchResults,
  parsedPreview,
  parsedContentId,
  parsedFullLength,
  parsedTitle,
  downloading,
  showConfirm,
  netError,
  currentSiteName,
  switchSite,
  switchRoute,
  retryLater,
  search,
  doParse,
  openConfirm,
  cancelDownload,
  confirmDownload,
  init,
} = useZhihuWorkspace()

onMounted(() => {
  init()
})

function onKeydown(e) {
  if (e.key === 'Enter') {
    if (mode.value === 'search') search()
    else doParse()
  }
}
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="top__brand">
        <div class="top__brand-row">
          <div class="top__titles">
            <span class="top__badge">纸糊</span>
            <span class="top__title">纸糊小说</span>
            <span class="top__hint">
              搜索纸糊小说或粘贴链接解析正文
            </span> 
          </div>
          <div class="top__actions">
            <button type="button" class="top__switch" @click="router.push('/platforms')">
              切换平台
            </button>
            <template v-if="!auth.authDisabled && auth.user">
              <a href="/app/tomato/account?back=/app/zhihu" class="top__auth-link">
                <span class="top__auth-user">{{ auth.user.username }}</span>
                <span class="top__auth-arrow">→</span>
              </a>
            </template>
          </div>
        </div>
      </div>
    </header>

    <div class="zh-toolbar">
      <div class="zh-mode-tabs">
        <button
          class="zh-mode-btn"
          :class="{ 'zh-mode-btn--active': mode === 'search' }"
          @click="mode = 'search'"
        >
          🔍 关键词搜索
        </button>
        <button
          class="zh-mode-btn"
          :class="{ 'zh-mode-btn--active': mode === 'parse' }"
          @click="mode = 'parse'"
        >
          📄 链接解析
        </button>
      </div>

      <div class="zh-site-select">
        <label class="zh-site-label">当前路线：</label>
        <select
          v-model="currentSiteId"
          class="zh-site-dropdown"
          @change="switchSite(currentSiteId)"
        >
          <option
            v-for="s in sites"
            :key="s.id"
            :value="s.id"
          >
            {{ s.name }}
          </option>
        </select>
        <span class="zh-site-hint" v-if="sites.length > 1">
          网络异常时可切换
        </span>
      </div>
    </div>

    <div class="search-bar" v-if="mode === 'search'">
      <input
        v-model="keyword"
        class="search-bar__input"
        type="text"
        placeholder="输入书名或作者，支持模糊搜索..."
        @keydown="onKeydown"
      />
      <button
        class="btn btn--primary search-bar__btn"
        :disabled="loading || !keyword.trim()"
        @click="search"
      >
        <span v-if="loading" class="spinner"></span>
        <span v-else>搜索</span>
      </button>
    </div>

    <div class="search-bar" v-else>
      <input
        v-model="parseUrl"
        class="search-bar__input"
        type="text"
        placeholder="粘贴知乎小说/专栏链接..."
        @keydown="onKeydown"
      />
      <button
        class="btn btn--primary search-bar__btn"
        :disabled="loading || !parseUrl.trim()"
        @click="doParse"
      >
        <span v-if="loading" class="spinner"></span>
        <span v-else>解析</span>
      </button>
    </div>

    <div class="zh-results" v-if="mode === 'search' && searchResults.length > 0">
      <div class="zh-results-head">
        搜索到 {{ searchResults.length }} 条结果（{{ currentSiteName() }}）
      </div>
      <div
        v-for="(item, i) in searchResults"
        :key="i"
        class="zh-result-card"
      >
        <div class="zh-result-title">{{ item.name }}</div>
        <div class="zh-result-author">作者：{{ item.author }}</div>
        <div class="zh-result-id">ID：{{ item.bookId }}</div>
        <div class="zh-result-intro" v-if="item.intro">{{ item.intro }}</div>
      </div>
    </div>

    <div class="zh-results" v-if="mode === 'parse' && parsedPreview">
      <div class="zh-results-head">
        解析结果（{{ currentSiteName() }}）&nbsp;·&nbsp;全文 {{ parsedFullLength }} 字
      </div>
      <div class="zh-content-box zh-content-box--preview">{{ parsedPreview }}</div>
      <div class="zh-content-foot" v-if="parsedContentId">
        <span class="zh-content-hint" v-if="parsedFullLength > parsedPreview.length">
          仅展示前 {{ parsedPreview.length }} 字预览，完整内容请下载
        </span>
        <button
          class="btn btn--primary zh-dl-btn"
          :disabled="downloading"
          @click="openConfirm"
        >
          <span v-if="downloading" class="spinner"></span>
          <span v-else>⬇ 下载全文</span>
        </button>
      </div>
    </div>

    <!-- 网络异常提示框 -->
    <Teleport to="body">
      <div class="zh-overlay" v-if="netError.show" @click.self="retryLater">
        <div class="zh-dialog">
          <div class="zh-dialog__icon">⚠️</div>
          <div class="zh-dialog__title">网络连接异常</div>
          <div class="zh-dialog__msg">{{ netError.message }}</div>
          <div class="zh-dialog__detail" v-if="netError.nextSiteName">
            可尝试切换到「{{ netError.nextSiteName }}」继续访问
          </div>
          <div class="zh-dialog__actions">
            <button
              class="btn zh-dialog__btn zh-dialog__btn--route"
              @click="switchRoute"
            >
              🔄 更换路线
            </button>
            <button
              class="btn zh-dialog__btn zh-dialog__btn--later"
              @click="retryLater"
            >
              ⏳ 稍后重试
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 下载确认弹窗 -->
    <Teleport to="body">
      <div v-if="showConfirm" class="confirm-overlay" @click.self="cancelDownload">
        <div class="confirm-dialog">
          <div class="confirm-dialog__title">确认下载</div>
          <div class="confirm-dialog__name">{{ parsedTitle || '知乎正文' }}</div>
          <div class="confirm-dialog__hint">下载将消耗 1 次下载次数</div>
          <div class="confirm-dialog__actions">
            <button class="btn" @click="cancelDownload">取消</button>
            <button class="btn btn--primary" :disabled="downloading" @click="confirmDownload">
              <span v-if="downloading" class="spinner"></span>
              <span v-if="downloading">下载中…</span>
              <span v-else>确认下载（-1次）</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.app {
  max-width: 860px;
  margin: 0 auto;
  padding: 28px 20px 48px;
}

.top {
  margin-bottom: 28px;
}

.top__brand-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.top__titles {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
}

.top__badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(14, 165, 233, 0.18);
  color: #7dd3fc;
}

.top__title {
  font-size: 20px;
  font-weight: 700;
}

.top__hint {
  font-size: 12px;
  color: var(--text-dim);
}

.top__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.top__switch {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
}

.top__switch:hover {
  background: var(--bg-row);
  color: var(--text);
}

.top__auth-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 6px;
  background: var(--bg-row);
  color: var(--text);
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
}

.top__auth-link:hover {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.top__auth-user {
  font-size: 13px;
}

.top__auth-arrow {
  font-size: 12px;
  color: var(--text-dim);
}

.search-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.search-bar__input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-panel);
  color: var(--text);
  font-size: 15px;
  outline: none;
}

.search-bar__input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.2);
}

.search-bar__btn {
  padding: 10px 24px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  display: inline-block;
}

@keyframes spin { to { transform: rotate(360deg); } }

.zh-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.zh-mode-tabs {
  display: flex;
  gap: 6px;
}

.zh-mode-btn {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-row);
  color: var(--text-dim);
  cursor: pointer;
  font-size: 13px;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.zh-mode-btn:hover {
  border-color: var(--accent);
  color: var(--text);
}

.zh-mode-btn--active {
  background: #0c4a6e;
  border-color: #0369a1;
  color: var(--text);
}

.zh-site-select {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.zh-site-label {
  color: var(--text-dim);
  white-space: nowrap;
}

.zh-site-dropdown {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-row);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}

.zh-site-dropdown:focus {
  outline: 1px solid var(--accent);
}

.zh-site-hint {
  color: var(--text-dim);
  opacity: 0.7;
}

.zh-results {
  margin-top: 16px;
}

.zh-results-head {
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.zh-result-card {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 10px;
  background: var(--bg-panel);
  transition: border-color 0.12s;
}

.zh-result-card:hover {
  border-color: rgba(14, 165, 233, 0.4);
}

.zh-result-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}

.zh-result-author {
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 2px;
}

.zh-result-id {
  font-size: 11px;
  color: var(--text-dim);
  opacity: 0.6;
  font-family: ui-monospace, monospace;
  margin-bottom: 6px;
}

.zh-result-intro {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.zh-content-box {
  padding: 18px 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-panel);
  font-size: 14px;
  line-height: 2;
  white-space: pre-wrap;
  word-break: break-word;
}

.zh-content-box--preview {
  max-height: 320px;
  overflow-y: auto;
}

.zh-content-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}

.zh-content-hint {
  font-size: 12px;
  color: var(--text-dim);
}

.zh-dl-btn {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 网络异常提示框 */
.zh-overlay {
  position: fixed;
  inset: 0;
  z-index: 99990;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.zh-dialog {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 32px 28px;
  max-width: 400px;
  width: calc(100% - 40px);
  text-align: center;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  animation: zh-dialog-in 0.25s ease;
}

@keyframes zh-dialog-in {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(12px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.zh-dialog__icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.zh-dialog__title {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 8px;
}

.zh-dialog__msg {
  font-size: 13px;
  color: var(--text-dim);
  line-height: 1.6;
  margin-bottom: 8px;
}

.zh-dialog__detail {
  font-size: 12px;
  color: var(--accent);
  margin-bottom: 20px;
}

.zh-dialog__actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.zh-dialog__btn {
  padding: 10px 22px;
  font-size: 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}

.zh-dialog__btn:hover {
  transform: translateY(-1px);
}

.zh-dialog__btn--route {
  background: #0c4a6e;
  border-color: #0369a1;
  color: var(--text);
}

.zh-dialog__btn--route:hover {
  background: #075985;
}

.zh-dialog__btn--later {
  background: var(--bg-row);
  border-color: var(--border);
  color: var(--text-dim);
}

.zh-dialog__btn--later:hover {
  background: #3c3c41;
  color: var(--text);
}

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
  margin-bottom: 10px;
}

.confirm-dialog__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
  word-break: break-all;
}

.confirm-dialog__hint {
  font-size: 13px;
  color: #fbbf24;
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(251, 191, 36, 0.1);
  border-radius: 6px;
}

.confirm-dialog__actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  justify-content: flex-end;
}

.confirm-dialog__actions .btn {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
}
</style>
