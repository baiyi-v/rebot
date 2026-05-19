<script setup>
import { useRouter } from 'vue-router'
import { auth } from '../auth.js'
import { useTxtSearchWorkspace } from '../composables/useTxtSearchWorkspace.js'

const router = useRouter()

const {
  keyword,
  sourceResults,
  loading,
  errorMsg,
  sourceStatus,
  SOURCES,
  activeTab,
  showConfirm,
  confirmItem,
  downloading,
  downloadError,
  search,
  openConfirm,
  cancelDownload,
  doDownload,
  formatSize,
  totalCount,
} = useTxtSearchWorkspace()

function onKeydown(e) {
  if (e.key === 'Enter') search()
}

function statusIcon(slug) {
  const v = sourceStatus.value[slug]
  if (v === 'loading') return '⏳'
  if (v === 'done') return '✅'
  if (v === 'empty') return '⭕'
  if (v === 'error') return '❌'
  return '⬜'
}
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="top__brand">
        <div class="top__brand-row">
          <div class="top__titles">
            <span class="top__badge">TXT搜索</span>
            <span class="top__title">TXT 搜索下载</span>
            <span class="top__hint">
              在线书库搜索，直接下载 TXT 小说文件
            </span>
          </div>
          <div class="top__actions">
            <button type="button" class="top__switch" @click="router.push('/platforms')">
              切换平台
            </button>
            <template v-if="!auth.authDisabled && auth.user">
              <a href="/app/tomato/account?back=/app/txtsearch" class="top__auth-link">
                <span class="top__auth-user">{{ auth.user.username }}</span>
                <span class="top__auth-arrow">→</span>
              </a>
            </template>
          </div>
        </div>
      </div>
    </header>

    <div class="search-bar">
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

    <div v-if="errorMsg && loading" class="banner banner--info">
      正在搜索中...结果快的书库优先返回
    </div>

    <div v-if="errorMsg && !loading" class="banner banner--error">{{ errorMsg }}</div>

    <div class="tabs-bar">
      <button
        v-for="s in SOURCES"
        :key="s.slug"
        class="tab-btn"
        :class="{
          'tab-btn--active': activeTab === s.slug,
          'tab-btn--loading': sourceStatus[s.slug] === 'loading',
          'tab-btn--done': sourceStatus[s.slug] === 'done',
          'tab-btn--error': sourceStatus[s.slug] === 'error',
        }"
        @click="activeTab = s.slug"
      >
        <span class="tab-btn__spinner" v-if="sourceStatus[s.slug] === 'loading'"></span>
        <span class="tab-btn__icon" v-else>{{ statusIcon(s.slug) }}</span>
        <span class="tab-btn__label">{{ s.label }}</span>
        <span v-if="sourceResults[s.slug]?.length" class="tab-btn__count">{{ sourceResults[s.slug].length }}</span>
      </button>
    </div>

    <div v-for="s in SOURCES" :key="s.slug" class="tab-panel" :class="{ 'tab-panel--hide': activeTab !== s.slug }">
      <div v-if="sourceResults[s.slug]?.length > 0" class="results">
        <div v-for="item in sourceResults[s.slug]" :key="item.fileId || item.fileName" class="result-row">
          <div class="result-row__info">
            <div class="result-row__name" :title="item.fileName">{{ item.fileName }}</div>
            <div class="result-row__meta">
              <span v-if="item.fileSizeText" class="result-row__size">{{ item.fileSizeText }}</span>
              <span v-if="item.addTime" class="result-row__time">{{ item.addTime }}</span>
              <span class="result-row__source">{{ item.searchSource }}</span>
            </div>
          </div>
          <button class="btn btn--primary result-row__dl" @click="openConfirm(item)">下载</button>
        </div>
      </div>
      <div v-else-if="sourceStatus[s.slug] === 'empty'" class="banner">
        {{ s.label }} 未搜索到相关文件
      </div>
      <div v-else-if="sourceStatus[s.slug] === 'error'" class="banner banner--error">
        {{ s.label }} 搜索失败
      </div>
      <div v-else-if="sourceStatus[s.slug] === 'idle' && totalCount() > 0" class="banner">
        等待中...
      </div>
    </div>

    <!-- 下载确认弹窗 -->
    <Teleport to="body">
      <div v-if="showConfirm" class="confirm-overlay" @click.self="cancelDownload">
        <div class="confirm-dialog">
          <div class="confirm-dialog__title">确认下载</div>
          <div class="confirm-dialog__name">{{ confirmItem?.fileName }}</div>
          <div v-if="confirmItem?.fileSizeText" class="confirm-dialog__size">文件大小: {{ confirmItem.fileSizeText }}</div>
          <div class="confirm-dialog__hint">下载将消耗 1 次下载次数</div>
          <div v-if="downloadError" class="confirm-dialog__error">{{ downloadError }}</div>
          <div class="confirm-dialog__actions">
            <button class="btn" @click="cancelDownload">取消</button>
            <button class="btn btn--primary" :disabled="downloading" @click="doDownload">
              <span v-if="downloading" class="spinner"></span>
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
  background: rgba(34, 197, 94, 0.18);
  color: #4ade80;
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

.banner {
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--bg-panel);
  color: var(--text-dim);
  font-size: 13px;
  margin-bottom: 18px;
  line-height: 1.5;
}

.banner--error {
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
}

.banner--info {
  background: rgba(14, 165, 233, 0.12);
  color: #7dd3fc;
}

.tabs-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 18px;
  background: var(--bg-row);
  padding: 4px;
  border-radius: 10px;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-dim);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  flex: 1;
  justify-content: center;
  min-width: 0;
}

.tab-btn:hover {
  color: var(--text);
}

.tab-btn--active {
  background: var(--bg-panel);
  color: var(--text);
}

.tab-btn--loading {
  color: #60a5fa;
}

.tab-btn--done .tab-btn__icon {
  color: #4ade80;
}

.tab-btn--error {
  color: #f87171;
}

.tab-btn__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(96, 165, 250, 0.3);
  border-top-color: #60a5fa;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  display: inline-block;
  flex-shrink: 0;
}

.tab-btn__icon {
  font-size: 12px;
}

.tab-btn__label {
  white-space: nowrap;
}

.tab-btn__count {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 10px;
  background: var(--border);
  color: var(--text-dim);
}

.tab-panel {
  display: block;
}

.tab-panel--hide {
  display: none;
}

.results {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-panel);
  transition: border-color 0.12s;
}

.result-row:hover {
  border-color: var(--accent);
}

.result-row__info {
  min-width: 0;
  flex: 1;
}

.result-row__name {
  font-size: 14px;
  font-weight: 600;
  word-break: break-all;
  line-height: 1.4;
  margin-bottom: 4px;
}

.result-row__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--text-dim);
}

.result-row__source {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-row);
  font-size: 11px;
}

.result-row__dl {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── 确认弹窗 ── */
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

.confirm-dialog__size {
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 6px;
}

.confirm-dialog__hint {
  font-size: 13px;
  color: #fbbf24;
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(251, 191, 36, 0.1);
  border-radius: 6px;
}

.confirm-dialog__error {
  font-size: 13px;
  color: #fecaca;
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.15);
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
