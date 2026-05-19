<script setup>
import BookDiscover from './BookDiscover.vue'
import { useTomatoWorkspace } from '../composables/useTomatoWorkspace.js'

const {
  router,
  auth,
  POLL_MS,
  tab,
  downloadInfoByBookId,
  loading,
  loadingMore,
  errorMsg,
  queueLength,
  isActive,
  hasMore,
  sortedItems,
  refreshJobsAndFiles,
  loadMore,
  onTaskCreated,
  rowClass,
  barClass,
  badgeKind,
  ui,
  noneDownloadHint,
  localFileHref,
  downloadFile,
  formatSize,
  downloadTailNeedsStack,
  normalizeUiState,
} = useTomatoWorkspace()
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="top__brand">
        <div class="top__brand-row">
          <div class="top__titles">
            <span class="top__badge">番茄小说</span>
            <span class="top__title">下载管理</span>
            <span class="top__hint">
              本平台专属功能：番茄链接解析 → 创建 Tomato 下载任务 → 查看进度与成品（与其它平台不共用）
            </span>
          </div>
          <div class="top__actions">
            <button type="button" class="top__switch" @click="router.push('/platforms')">
              切换平台
            </button>
            <button type="button" class="top__switch" @click="router.push('/tutorial')">
              使用教程
            </button>
            <template v-if="!auth.authDisabled && auth.user">
              <a href="/app/tomato/account?back=/app/tomato" class="top__auth-link">
                <span class="top__auth-user">{{ auth.user.username }}</span>
                <span class="top__auth-arrow">→</span>
              </a>
            </template>
          </div>
        </div>
      </div>
      <nav class="tabs">
        <button
          type="button"
          class="tabs__btn"
          :class="{ 'tabs__btn--active': tab === 'discover' }"
          @click="tab = 'discover'"
        >
          解析下载
        </button>
        <button
          type="button"
          class="tabs__btn"
          :class="{ 'tabs__btn--active': tab === 'jobs' }"
          @click="tab = 'jobs'"
        >
          任务列表
          <span v-if="queueLength > 0 || isActive" class="tabs__queue">
            <span v-if="isActive">运行中</span>
            <span v-if="queueLength > 0">排队: {{ queueLength }}</span>
          </span>
        </button>
      </nav>
    </header>

    <div
      v-if="tab === 'discover' && !auth.authDisabled && !auth.user"
      class="banner banner--warn"
    >
      创建下载任务前请先登录，并在「账号」中使用卡密开通会员与次数。
    </div>

    <BookDiscover v-show="tab === 'discover'" @task-created="onTaskCreated" />

    <div v-show="tab === 'jobs'">
      <div class="jobs-toolbar">
        <span class="jobs-toolbar__hint">
          创建任务后轮询 {{ POLL_MS / 1000 }}s，无进行中任务则停止
        </span>
        <button class="jobs-toolbar__refresh" type="button" @click="refreshJobsAndFiles">
          立即刷新
        </button>
      </div>

      <div v-if="errorMsg" class="banner banner--error">{{ errorMsg }}</div>

      <main class="list-wrap">
        <div class="list-head">
          <span>下载任务</span>
        </div>

        <div v-if="loading && !sortedItems.length" class="empty">加载中…</div>
        <div v-else-if="!sortedItems.length" class="empty">暂无任务，请在「找书下载」中创建</div>

        <div
          v-for="job in sortedItems"
          :key="job.id"
          class="row"
          :class="rowClass(job.state)"
        >
          <div class="row__main">
            <div class="row__title-line">
              <span class="row__title">{{ job.title || '（无标题）' }}</span>
              <span class="row__author">{{ job.author || '—' }}</span>
            </div>
            <div
              class="bar-dl-row"
              :class="{
                'bar-dl-row--stack':
                  job.state === 'done' &&
                  downloadTailNeedsStack(downloadInfoByBookId[job.book_id]),
              }"
            >
              <div class="bar-wrap">
                <div class="bar">
                  <div
                    class="bar__fill"
                    :class="barClass(job.state, ui(job).partial)"
                    :style="{ width: `${Math.min(100, Math.max(0, ui(job).percent))}%` }"
                  />
                </div>
                <span class="bar__pct">
                  {{ Math.round(Math.min(100, Math.max(0, ui(job).percent))) }}%
                </span>
              </div>
              <div v-if="job.state === 'done'" class="bar-dl-row__tail">
                <template v-if="downloadInfoByBookId[job.book_id] === 'loading'">
                  <span class="muted sm bar-dl-row__loading">正在查找成品…</span>
                </template>
                <template v-else-if="downloadInfoByBookId[job.book_id]?.kind === 'local'">
                  <span class="muted sm dl-caption dl-caption--inline">本机</span>
                  <div class="dl-buttons">
                    <button
                      v-for="f in downloadInfoByBookId[job.book_id].files"
                      :key="f.relPath"
                      type="button"
                      class="btn-file-dl"
                      @click="downloadFile(localFileHref(f.relPath, f.token), f.name)"
                    >
                      下载 {{ f.name }}
                      <span class="btn-file-dl__meta">{{ formatSize(f.size) }}</span>
                    </button>
                  </div>
                </template>
                <template v-else>
                  <span class="muted sm bar-dl-row__hint">{{
                    noneDownloadHint(downloadInfoByBookId[job.book_id])
                  }}</span>
                </template>
              </div>
            </div>
            <div class="row__sub">
              {{ ui(job).subLine }}
            </div>
            <div
              v-if="(normalizeUiState(job.state) === 'failed' || job.state === 'canceled') && job.message"
              class="row__err-msg"
            >
              {{ job.message }}
            </div>
          </div>
          <div class="row__state">
            <span class="badge" :class="'badge--' + badgeKind(job.state, ui(job).partial)">
              {{ ui(job).statusLabel }}
            </span>
          </div>
        </div>

        <div v-if="hasMore" class="load-more">
          <button
            type="button"
            class="btn-load-more"
            :class="{ loading: loadingMore }"
            @click="loadMore"
          >
            <span v-if="loadingMore">加载中…</span>
            <span v-else>更多</span>
          </button>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app {
  max-width: 960px;
  margin: 0 auto;
  padding: 16px 20px 32px;
}

.top {
  margin-bottom: 16px;
}

.top__brand {
  margin-bottom: 12px;
}

.top__brand-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.top__titles {
  min-width: 0;
  flex: 1;
}

.top__badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #fdba74;
  background: rgba(234, 88, 12, 0.2);
  border: 1px solid rgba(251, 146, 60, 0.45);
  padding: 2px 8px;
  border-radius: 999px;
  margin-bottom: 6px;
}

.top__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.top__switch {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-row);
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.top__switch:hover {
  color: var(--text);
  border-color: #52525b;
}

.top__auth-link {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  background: rgba(14, 165, 233, 0.12);
  color: #bae6fd;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}

.top__auth-link:hover {
  background: rgba(14, 165, 233, 0.2);
  color: #e0f2fe;
}

.top__auth-user {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top__auth-arrow {
  font-size: 10px;
}

.top__title {
  display: block;
  font-weight: 600;
  font-size: 17px;
  margin-bottom: 4px;
}

.top__hint {
  font-size: 11px;
  color: var(--text-dim);
}

.tabs {
  display: flex;
  gap: 6px;
}

.tabs__btn {
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-panel);
  color: var(--text);
  cursor: pointer;
  font-size: 13px;
}

.tabs__btn:hover {
  background: var(--bg-row);
}

.tabs__btn--active {
  background: #0c4a6e;
  border-color: #0369a1;
  color: #e0f2fe;
}

.tabs__queue {
  display: inline-flex;
  gap: 8px;
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 100, 100, 0.15);
  font-size: 11px;
  color: #ff6464;
}

.jobs-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.jobs-toolbar__hint {
  font-size: 11px;
  color: var(--text-dim);
}

.jobs-toolbar__refresh {
  flex-shrink: 0;
  padding: 7px 16px;
  border: 1px solid rgba(56, 189, 248, 0.38);
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(14, 165, 233, 0.2) 0%, rgba(14, 165, 233, 0.08) 100%);
  color: #bae6fd;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    transform 0.12s ease;
}

.jobs-toolbar__refresh:hover {
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.28) 0%, rgba(14, 165, 233, 0.14) 100%);
  border-color: rgba(125, 211, 252, 0.55);
  color: #e0f2fe;
}

.jobs-toolbar__refresh:active {
  transform: scale(0.98);
}

.banner {
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 10px;
  font-size: 12px;
}

.banner--error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid var(--error);
  color: #fecaca;
}

.banner--warn {
  background: rgba(234, 179, 8, 0.12);
  border: 1px solid rgba(234, 179, 8, 0.45);
  color: #fde68a;
  margin-bottom: 12px;
}

.list-wrap {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-panel);
}

.list-head {
  padding: 8px 14px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-dim);
  border-bottom: 1px solid var(--border);
  background: #1f1f23;
}

.row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-row);
}

.row:last-child {
  border-bottom: none;
}

.row--queued {
  border-left: 3px solid var(--queued);
}

.row--running {
  border-left: 3px solid var(--running);
}

.row--done {
  border-left: 3px solid var(--done);
}

.row--error {
  border-left: 3px solid var(--error);
}

.row--canceled {
  border-left: 3px solid #71717a;
}

.row__main {
  min-width: 0;
}

.row__title-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}

.row__title {
  font-weight: 600;
  font-size: 14px;
}

.row__author {
  font-size: 12px;
  color: var(--text-dim);
}

.bar-dl-row {
  display: flex;
  align-items: center;
  gap: 10px 12px;
  margin-bottom: 4px;
  min-width: 0;
}

.bar-dl-row--stack {
  flex-wrap: wrap;
}

.bar-dl-row--stack .bar-wrap {
  flex: 1 1 100%;
  min-width: 0;
}

.bar-dl-row--stack .bar-dl-row__tail {
  flex: 1 1 100%;
  justify-content: flex-start;
}

.bar-dl-row__tail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  justify-content: flex-end;
  flex: 0 1 auto;
  min-width: 0;
}

.bar-dl-row__loading {
  font-size: 11px;
  white-space: nowrap;
}

.bar-dl-row__hint {
  font-size: 11px;
  line-height: 1.35;
  text-align: left;
}

.bar-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  margin-bottom: 0;
}

.bar {
  flex: 1;
  height: 10px;
  background: var(--bar-track);
  border-radius: 2px;
  overflow: hidden;
  border: 1px solid #27272a;
}

.bar__fill {
  height: 100%;
  border-radius: 1px;
  transition: width 0.35s ease;
}

.bar__fill--queued {
  background: linear-gradient(90deg, #52525b, #a1a1aa);
}

.bar__fill--running {
  background: linear-gradient(90deg, #1d4ed8, #38bdf8);
}

.bar__fill--done {
  background: linear-gradient(90deg, #15803d, #4ade80);
}

.bar__fill--partial {
  background: linear-gradient(90deg, #a16207, #facc15);
}

.bar__fill--error {
  background: linear-gradient(90deg, #991b1b, #f87171);
}

.bar__pct {
  width: 40px;
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}

.row__sub {
  font-size: 11px;
  color: var(--text-dim);
}

.row__err-msg {
  margin-top: 6px;
  font-size: 11px;
  color: #fecaca;
}

.bar-dl-row .muted {
  color: var(--text-dim);
}

.bar-dl-row .sm {
  font-size: 11px;
  line-height: 1.4;
}

.dl-caption--inline {
  flex-shrink: 0;
  margin-right: 10px;
}

.dl-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.btn-file-dl {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  line-height: 1.25;
  background: linear-gradient(135deg, #f59e0b 0%, #ea580c 55%, #dc2626 100%);
  box-shadow:
    0 2px 0 rgba(0, 0, 0, 0.35),
    0 6px 20px rgba(234, 88, 12, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition:
    transform 0.12s ease,
    filter 0.12s ease,
    box-shadow 0.12s ease;
  cursor: pointer;
  outline: none;
}

.btn-file-dl:hover {
  filter: brightness(1.06);
  transform: translateY(-2px);
  box-shadow:
    0 3px 0 rgba(0, 0, 0, 0.3),
    0 10px 28px rgba(234, 88, 12, 0.5);
}

.btn-file-dl:focus {
  outline: none;
}

.btn-file-dl:active {
  transform: translateY(0);
  box-shadow:
    0 1px 0 rgba(0, 0, 0, 0.35),
    0 4px 12px rgba(234, 88, 12, 0.35);
}

.btn-file-dl--tomato {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 45%, #15803d 100%);
  box-shadow:
    0 2px 0 rgba(0, 0, 0, 0.35),
    0 6px 20px rgba(34, 197, 94, 0.38);
}

.btn-file-dl--tomato:hover {
  box-shadow:
    0 3px 0 rgba(0, 0, 0, 0.3),
    0 10px 28px rgba(34, 197, 94, 0.48);
}

.btn-file-dl--tomato:active {
  box-shadow:
    0 1px 0 rgba(0, 0, 0, 0.35),
    0 4px 12px rgba(34, 197, 94, 0.32);
}

.btn-file-dl__meta {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.92;
}

.row__state {
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
}

.badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 3px;
  white-space: nowrap;
}

.badge--queued {
  background: #3f3f46;
  color: #e4e4e7;
}

.badge--running {
  background: rgba(59, 130, 246, 0.25);
  color: #93c5fd;
}

.badge--done {
  background: rgba(34, 197, 94, 0.2);
  color: #86efac;
}

.badge--partial {
  background: rgba(234, 179, 8, 0.2);
  color: #fde047;
}

.badge--error {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}

.badge--canceled {
  background: rgba(113, 113, 122, 0.35);
  color: #d4d4d8;
}

.empty {
  padding: 32px;
  text-align: center;
  color: var(--text-dim);
}

.load-more {
  padding: 16px;
  text-align: center;
}

.btn-load-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  background: var(--bg-row);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-load-more:hover {
  background: var(--bg-hover);
  border-color: #52525b;
}

.btn-load-more.loading {
  color: var(--text-dim);
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .app {
    padding: 12px 12px 24px;
    max-width: 100%;
  }

  .top__brand-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .top__titles {
    order: 1;
  }

  .top__title {
    font-size: 18px;
  }

  .top__hint {
    font-size: 12px;
    line-height: 1.5;
  }

  .top__actions {
    order: 2;
    justify-content: flex-end;
    gap: 8px;
  }

  .top__switch {
    padding: 8px 14px;
    font-size: 13px;
  }

  .top__auth-link {
    padding: 8px 14px;
    font-size: 13px;
  }

  .top__auth-user {
    max-width: 100px;
  }

  .tabs {
    gap: 8px;
  }

  .tabs__btn {
    padding: 10px 16px;
    font-size: 14px;
    flex: 1;
    text-align: center;
  }

  .jobs-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .jobs-toolbar__hint {
    font-size: 12px;
    text-align: center;
  }

  .jobs-toolbar__refresh {
    padding: 10px 20px;
    font-size: 13px;
    text-align: center;
  }

  .row {
    padding: 14px 12px;
    gap: 12px;
  }

  .row__title-line {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .row__title {
    font-size: 15px;
  }

  .row__author {
    font-size: 13px;
  }

  .bar-dl-row {
    flex-wrap: wrap;
    gap: 10px;
  }

  .bar-dl-row__tail {
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-start;
  }

  .dl-buttons {
    flex-wrap: wrap;
    gap: 8px;
  }

  .btn-file-dl {
    padding: 12px 20px;
    font-size: 14px;
    min-height: 48px;
    min-width: 140px;
    justify-content: center;
    align-items: center;
    flex-direction: row;
    gap: 8px;
  }

  .btn-file-dl__meta {
    font-size: 12px;
  }

  .bar-wrap {
    flex: 1 1 100%;
    min-width: 0;
  }

  .bar {
    height: 12px;
  }

  .bar__pct {
    font-size: 13px;
    width: 45px;
  }

  .badge {
    padding: 4px 10px;
    font-size: 12px;
  }

  .banner {
    padding: 10px 14px;
    font-size: 13px;
  }

  .list-head {
    padding: 10px 14px;
    font-size: 12px;
  }

  .empty {
    padding: 40px 20px;
    font-size: 14px;
  }
}

@media (max-width: 480px) {
  .top__title {
    font-size: 17px;
  }

  .top__hint {
    font-size: 11px;
  }

  .tabs__btn {
    padding: 10px 12px;
    font-size: 13px;
  }

  .btn-file-dl {
    padding: 14px 16px;
    font-size: 13px;
    min-width: 120px;
  }

  .row {
    padding: 12px 10px;
  }

  .row__title {
    font-size: 14px;
  }

  .row__author {
    font-size: 12px;
  }
}
</style>
