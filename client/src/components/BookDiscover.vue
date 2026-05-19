<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { apiHeaders } from '../api.js'
import { extractBookInput } from '../utils/bookInput.js'

const emit = defineEmits(['task-created'])

const pasteInput = ref('')
const parseLoading = ref(false)
const parseErr = ref('')

const modalOpen = ref(false)
const preview = ref(null)
const previewLoading = ref(false)
const previewErr = ref('')
/** 用于关闭时 cleanup；优先用解析后的 book_id */
const cleanupBookKey = ref(null)
/** 打开弹窗时用于二次请求的 key（与首次解析相同） */
const previewFetchKey = ref(null)

const rangeText = ref('')
const rangeErr = ref('')
const submitting = ref(false)

const coverBase64 = ref('')

const coverSrc = computed(() => {
  if (coverBase64.value) return coverBase64.value
  const u = preview.value?.cover_url || preview.value?.detail_cover_url
  if (!u || typeof u !== 'string') return ''
  if (u.startsWith('http')) return u
  if (u.startsWith('/')) return u
  return ''
})

async function loadCover() {
  const u = preview.value?.cover_url || preview.value?.detail_cover_url
  if (!u || typeof u !== 'string' || !u.startsWith('/')) return
  
  try {
    const r = await fetch(u, { headers: apiHeaders() })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const blob = await r.blob()
    const reader = new FileReader()
    reader.onload = () => {
      coverBase64.value = reader.result
    }
    reader.readAsDataURL(blob)
  } catch (e) {
    console.warn('加载封面失败:', e)
  }
}

const statsLine = computed(() => {
  const p = preview.value
  if (!p) return ''
  const parts = []
  if (p.chapter_count) parts.push(`章节 ${p.chapter_count}`)
  if (p.finished !== null && p.finished !== undefined)
    parts.push(p.finished ? '完结' : '连载')
  if (p.word_count) {
    const w = Number(p.word_count)
    parts.push(w >= 10000 ? `约 ${(w / 10000).toFixed(1)} 万字` : `${w} 字`)
  }
  if (p.category) parts.push(p.category)
  return parts.join(' · ')
})

async function cleanupPreview(key) {
  if (!key) return
  try {
    await fetch(`/api/preview/${encodeURIComponent(key)}/cleanup`, {
      method: 'POST',
      headers: apiHeaders(),
    })
  } catch {
    /* ignore */
  }
}

function closeModal() {
  cleanupPreview(cleanupBookKey.value || previewFetchKey.value)
  modalOpen.value = false
  preview.value = null
  previewErr.value = ''
  cleanupBookKey.value = null
  previewFetchKey.value = null
  rangeText.value = ''
  rangeErr.value = ''
}

async function runParse() {
  const extracted = extractBookInput(pasteInput.value)
  parseErr.value = ''
  previewErr.value = ''
  if (!extracted) {
    parseErr.value = '请粘贴番茄分享链接（如 changdunovel.com/t/…）'
    return
  }

  parseLoading.value = true
  previewFetchKey.value = extracted
  cleanupBookKey.value = extracted
  modalOpen.value = true
  preview.value = null
  previewLoading.value = true
  rangeText.value = ''
  rangeErr.value = ''

  try {
    const r = await fetch(`/api/preview/${encodeURIComponent(extracted)}`, { headers: apiHeaders() })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.message || data.raw || `HTTP ${r.status}`)
    preview.value = data
    if (data.book_id) cleanupBookKey.value = data.book_id
    coverBase64.value = ''
    loadCover()
  } catch (e) {
    previewErr.value = e.message || '解析失败（短链需 Tomato 能访问外网并完成跳转）'
  } finally {
    previewLoading.value = false
    parseLoading.value = false
  }
}

/** @returns {{ start: number, end: number } | null} */
function parseChapterRange(total) {
  const raw = rangeText.value.trim()
  rangeErr.value = ''
  if (!raw) return null
  if (!total || total < 1) {
    rangeErr.value = '章节数未知，无法使用范围下载'
    return null
  }
  const parts = raw.split('-').map((p) => p.trim())
  if (parts.length !== 2) {
    rangeErr.value = '格式应为 start-end，例如 1-10'
    return null
  }
  const start = parts[0] === '' ? 1 : parseInt(parts[0], 10)
  const end = parts[1] === '' ? total : parseInt(parts[1], 10)
  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start < 1 ||
    end < 1 ||
    start > end ||
    end > total
  ) {
    rangeErr.value = `范围无效（1-${total}）`
    return null
  }
  return { start, end }
}

async function postDownload(payload) {
  const r = await fetch('/api/jobs', {
    method: 'POST',
    headers: apiHeaders(true),
    body: JSON.stringify(payload),
  })
  const text = await r.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  if (!r.ok) throw new Error(data.message || data.raw || text || `HTTP ${r.status}`)
  return data
}

async function confirmDownload() {
  if (!preview.value?.book_id) return
  const total = preview.value.chapter_count || 0
  const range = parseChapterRange(total)
  if (rangeText.value.trim() && !range) return

  submitting.value = true
  previewErr.value = ''
  try {
    /** @type {{ book_id: string, title?: string, author?: string, range_start?: number, range_end?: number }} */
    const payload = {
      book_id: preview.value.book_id,
      title: preview.value.book_name || preview.value.title || '',
      author: preview.value.author || '',
    }
    if (range) {
      payload.range_start = range.start
      payload.range_end = range.end
    }
    await postDownload(payload)
    closeModal()
    emit('task-created')
  } catch (e) {
    previewErr.value = e.message || '创建任务失败'
  } finally {
    submitting.value = false
  }
}

function onBackdropClick(e) {
  if (e.target === e.currentTarget) closeModal()
}

onUnmounted(() => {
  cleanupPreview(cleanupBookKey.value || previewFetchKey.value)
})
</script>

<template>
  <section class="discover">
    <h2 class="discover__title">解析链接 → 确认书籍 → 下载</h2>
    <p class="discover__desc">
      粘贴番茄分享页链接（例如 <code>changdunovel.com/t/…</code>），由下载器服务端解析短链并拉取详情；确定是目标书后再创建任务。
    </p>

    <div class="parse-row">
      <textarea
        v-model="pasteInput"
        class="textarea"
        rows="3"
        placeholder="粘贴完整链接，例如：https://changdunovel.com/t/RznjazYKrMM/&#10 "
        autocomplete="off"
      />
      <div class="parse-actions">
        <button
          type="button"
          class="btn"
          :disabled="parseLoading || !pasteInput"
          @click="pasteInput = ''"
        >
          清除
        </button>
        <button
          type="button"
          class="btn btn--primary"
          :disabled="parseLoading"
          @click="runParse"
        >
          {{ parseLoading ? '解析中…' : '解析链接' }}
        </button>
      </div>
    </div>
    <p v-if="parseErr && !modalOpen" class="err sm">{{ parseErr }}</p>

    <Teleport to="body">
      <div
        v-if="modalOpen"
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        @click="onBackdropClick"
      >
        <div class="modal" @click.stop>
          <div class="modal__head">
            <h3 id="modal-title" class="modal__title">请确认是否为您要下载的书</h3>
            <button type="button" class="btn btn--ghost btn--icon" aria-label="关闭" @click="closeModal">
              ×
            </button>
          </div>

          <div class="modal__body">
            <p v-if="previewLoading" class="muted">正在解析并加载详情…</p>
            <p v-else-if="previewErr" class="err">{{ previewErr }}</p>

            <template v-else-if="preview">
              <div class="confirm-layout">
                <div class="confirm-cover">
                  <img v-if="coverSrc" class="confirm-cover__img" :src="coverSrc" alt="封面" />
                  <div v-else class="confirm-cover__ph">无封面</div>
                </div>
                <div class="confirm-meta">
                  <p class="confirm-name">{{ preview.book_name || '未知书名' }}</p>
                  <p v-if="preview.original_book_name && preview.original_book_name !== preview.book_name" class="muted sm">
                    原名：{{ preview.original_book_name }}
                  </p>
                  <p class="confirm-author">作者：{{ preview.author || '未知' }}</p>
                  <p class="confirm-stats">{{ statsLine }}</p>
                  <p class="confirm-id"><code>book_id: {{ preview.book_id }}</code></p>
                  <p class="desc">{{ preview.description || '暂无简介' }}</p>

                  <div class="dl-block">
                    <label class="lbl">章节范围（可选）</label>
                    <input
                      v-model="rangeText"
                      class="input"
                      type="text"
                      placeholder="留空 = 全书；或 1-10"
                      autocomplete="off"
                    />
                    <p class="hint">
                      <template v-if="preview.chapter_count">
                        全书请留空；范围示例：1-{{ preview.chapter_count }}
                      </template>
                      <template v-else>全书请留空</template>
                    </p>
                    <p v-if="rangeErr" class="err sm">{{ rangeErr }}</p>
                    <p v-if="previewErr && preview" class="err sm">{{ previewErr }}</p>
                  </div>

                  <div class="modal__actions">
                    <button type="button" class="btn" @click="closeModal">取消 / 不是这本</button>
                    <button
                      type="button"
                      class="btn btn--primary"
                      :disabled="submitting"
                      @click="confirmDownload"
                    >
                      {{ submitting ? '提交中…' : '确认，开始下载' }}
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <div v-else-if="!previewLoading && !previewErr" class="modal__actions">
              <button type="button" class="btn" @click="closeModal">关闭</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.discover {
  margin-bottom: 28px;
}

.discover__title {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 600;
}

.discover__desc {
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
}

.discover__desc code {
  font-size: 11px;
  color: #a5b4fc;
}

.parse-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 560px;
}

.textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-row);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
  min-height: 72px;
}

.textarea:focus {
  outline: 1px solid var(--accent);
}

.parse-actions {
  display: flex;
  gap: 8px;
}

.btn--ghost {
  background: transparent;
  border-color: var(--border);
}

.btn--icon {
  padding: 2px 10px;
  font-size: 20px;
  line-height: 1;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal {
  width: 100%;
  max-width: 560px;
  max-height: min(90vh, 720px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
}

.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.modal__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.modal__body {
  padding: 14px 16px 18px;
  overflow-y: auto;
}

.confirm-layout {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 14px;
}

@media (max-width: 480px) {
  .confirm-layout {
    grid-template-columns: 1fr;
  }
}

.confirm-cover__img {
  width: 100px;
  height: 140px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--border);
}

.confirm-cover__ph {
  width: 100px;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--text-dim);
  border: 1px dashed var(--border);
  border-radius: 4px;
}

.confirm-name {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 600;
}

.confirm-author {
  margin: 0 0 4px;
  font-size: 13px;
}

.confirm-stats {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--accent);
}

.confirm-id {
  margin: 0 0 10px;
  font-size: 11px;
}

.confirm-id code {
  color: #a5b4fc;
}

.desc {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-dim);
  max-height: 100px;
  overflow-y: auto;
}

.dl-block {
  margin-bottom: 14px;
}

.lbl {
  display: block;
  font-size: 11px;
  color: var(--text-dim);
  margin-bottom: 6px;
}

.hint {
  font-size: 11px;
  color: var(--text-dim);
  margin: 6px 0 0;
}

.modal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 8px;
}

.muted {
  color: var(--text-dim);
}

.sm {
  font-size: 11px;
}

.err {
  color: #fecaca;
  margin: 8px 0 0;
}
</style>
