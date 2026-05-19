import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getJobDisplay, normalizeUiState } from '../utils/progress.js'
import { apiHeaders } from '../api.js'
import { encodePathSegments } from '../utils/paths.js'
import { auth } from '../auth.js'

export function useTomatoWorkspace() {
  const router = useRouter()
  const POLL_MS = 1000
  const tab = ref('discover')

  const items = ref([])
  const downloadInfoByBookId = ref({})
  const loading = ref(false)
  const loadingMore = ref(false)
  const errorMsg = ref('')
  const queueLength = ref(0)
  const isActive = ref(false)
  const currentPage = ref(1)
  const total = ref(0)
  const hasMore = ref(false)
  const limit = 5
  let timer = null

  console.log('[useTomatoWorkspace] 初始化 composable')

  function hasActiveJobs() {
    return items.value.some((j) => j.state === 'queued' || j.state === 'running') || isActive.value
  }

  async function fetchJobs(silent = false, page = 1, append = false) {
    if (!silent) loading.value = true
    if (!silent) errorMsg.value = ''
    try {
      const r = await fetch(`/api/jobs?page=${page}&limit=${limit}`, { headers: apiHeaders() })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      console.log('[fetchJobs] 返回数据:', data)
      console.log('[fetchJobs] hasMore:', data.hasMore, 'total:', data.total, 'page:', page, 'limit:', limit)
      if (append) {
        items.value = [...items.value, ...(Array.isArray(data.items) ? data.items : [])]
      } else {
        items.value = Array.isArray(data.items) ? data.items : []
        currentPage.value = page
      }
      total.value = Number(data.total) || 0
      hasMore.value = Boolean(data.hasMore)
      queueLength.value = Number(data.queueLength) || 0
      isActive.value = Boolean(data.isActive)
      console.log('[fetchJobs] 处理后 hasMore:', hasMore.value, 'total:', total.value)
    } catch (e) {
      errorMsg.value = e.message || '无法获取任务列表'
    } finally {
      if (!silent) loading.value = false
      loadingMore.value = false
    }
  }

  async function loadMore() {
    if (loadingMore.value || !hasMore.value) return
    loadingMore.value = true
    await fetchJobs(false, currentPage.value + 1, true)
  }

  function resetPagination() {
    currentPage.value = 1
    total.value = 0
    hasMore.value = false
  }

  function startPoll() {
    if (timer) return
    timer = setInterval(async () => {
      await fetchJobs(true, 1, false)
      await refreshDoneDownloadLinks(false)
      if (!hasActiveJobs()) stopPoll()
    }, POLL_MS)
  }

  function stopPoll() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  async function onTaskCreated() {
    resetPagination()
    tab.value = 'jobs'
    await fetchJobs(true)
    startPoll()
  }

  function jobSortValue(job) {
    const candidates = [job.created_at, job.created_ms, job.updated_at, job.updated_ms]
    for (const value of candidates) {
      const n = Number(value)
      if (Number.isFinite(n) && n > 0) return n
    }
    const id = String(job.id || '')
    const nodeIdMatch = id.match(/^node-(\d+)/)
    if (nodeIdMatch) return Number(nodeIdMatch[1])
    const numericId = Number(id)
    return Number.isFinite(numericId) ? numericId : 0
  }

  const sortedItems = computed(() => {
    const list = [...items.value]
    return list.sort((a, b) => {
      const byTime = jobSortValue(b) - jobSortValue(a)
      if (byTime !== 0) return byTime
      return String(b.id || '').localeCompare(String(a.id || ''))
    })
  })

  function rowClass(state) {
    const failedLike = normalizeUiState(state) === 'failed'
    return {
      'row--queued': state === 'queued',
      'row--running': state === 'running',
      'row--done': state === 'done',
      'row--error': failedLike,
      'row--canceled': state === 'canceled',
    }
  }

  function barClass(state, partial) {
    if (normalizeUiState(state) === 'failed') return 'bar__fill--error'
    if (state === 'canceled') return 'bar__fill--queued'
    if (state === 'done' && partial) return 'bar__fill--partial'
    if (state === 'done') return 'bar__fill--done'
    if (state === 'running') return 'bar__fill--running'
    return 'bar__fill--queued'
  }

  function badgeKind(state, partial) {
    if (state === 'done' && partial) return 'partial'
    if (normalizeUiState(state) === 'failed') return 'error'
    return state
  }

  function ui(job) {
    return getJobDisplay(job)
  }

  const FILE_SORT_ORDER = { epub: 0, txt: 1, pdf: 2, mp3: 3, wav: 4 }

  function normalizeFileList(files) {
    if (!Array.isArray(files)) return []
    return [...files].sort((a, b) => {
      const ae = String(a.ext || '').toLowerCase()
      const be = String(b.ext || '').toLowerCase()
      const ao = FILE_SORT_ORDER[ae] ?? 99
      const bo = FILE_SORT_ORDER[be] ?? 99
      if (ao !== bo) return ao - bo
      return (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN')
    })
  }

  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), timeoutMs)
    try {
      const r = await fetch(url, { ...options, signal: controller.signal })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.message || data.error || `HTTP ${r.status}`)
      return data
    } finally {
      window.clearTimeout(timer)
    }
  }

  async function ensureDownloadLinks(bookId, title = '', force = false, jobId = '') {
    if (!bookId) return
    const prev = downloadInfoByBookId.value[bookId]
    if (!force && prev) return

    downloadInfoByBookId.value = { ...downloadInfoByBookId.value, [bookId]: 'loading' }
    try {
      const params = new URLSearchParams()
      if (title) params.set('title', title)
      if (jobId) params.set('jobId', jobId)
      const suffix = params.toString() ? `?${params.toString()}` : ''
      const resourceData = await fetchJsonWithTimeout(
        `/api/download-resources/${encodeURIComponent(bookId)}${suffix}`,
        { headers: apiHeaders() }
      )

      if (resourceData.status === 'ready' && Array.isArray(resourceData.files) && resourceData.files.length > 0) {
        downloadInfoByBookId.value = {
          ...downloadInfoByBookId.value,
          [bookId]: {
            kind: 'local',
            status: 'ready',
            files: normalizeFileList(resourceData.files),
            folderName: resourceData.folderName,
          },
        }
        return
      }

      downloadInfoByBookId.value = {
        ...downloadInfoByBookId.value,
        [bookId]: {
          kind: 'none',
          status: resourceData.status || 'missing',
          reason: resourceData.reason || 'local_empty',
          message: resourceData.message || '',
        },
      }
    } catch {
      downloadInfoByBookId.value = {
        ...downloadInfoByBookId.value,
        [bookId]: { kind: 'none', reason: 'error' },
      }
    }
  }

  function shouldRefreshDownloadInfo(info) {
    if (!info || info === 'loading') return false
    return info.kind !== 'local'
  }

  async function refreshDoneDownloadLinks(forceAll = true) {
    const doneJobs = items.value.filter((job) => job.state === 'done' && job.book_id)
    if (!doneJobs.length) return

    if (forceAll) {
      const nextInfo = { ...downloadInfoByBookId.value }
      for (const job of doneJobs) {
        delete nextInfo[job.book_id]
      }
      downloadInfoByBookId.value = nextInfo
    }

    await Promise.all(
      doneJobs.map((job) => {
        const info = downloadInfoByBookId.value[job.book_id]
        const force = forceAll || shouldRefreshDownloadInfo(info)
        return ensureDownloadLinks(job.book_id, job.title, force, job.id)
      })
    )
  }

  async function refreshJobsAndFiles() {
    await fetchJobs(false, 1, false)
    await refreshDoneDownloadLinks()
  }

  function noneDownloadHint(info) {
    if (!info || info === 'loading') return ''
    if (info.kind !== 'none') return ''
    if (info.status === 'pending' || info.reason === 'job_not_finished') {
      return '任务已交给下载引擎，成品仍在生成中，请稍后刷新。'
    }
    if (info.status === 'failed') {
      return info.message || '下载任务未成功完成，请查看任务错误信息。'
    }
    if (info.reason === 'local_empty') {
      return '本地保存目录里还没有找到本书成品 txt（若刚完成请稍候刷新）。'
    }
    if (info.reason === 'local_library_disabled') {
      return '服务器未配置 LOCAL_LIBRARY_ROOT，无法读取下载成品。'
    }
    return '获取下载链接失败，请检查网络与 Tomato 是否运行。'
  }

  function localFileHref(relPath, token = '') {
    const suffix = token ? `?token=${encodeURIComponent(token)}` : ''
    return `/api/local-file/${encodePathSegments(relPath)}${suffix}`
  }

  function isMobileBrowser() {
    return /Android|iPhone|iPad|iPod|Mobile|MicroMessenger/i.test(navigator.userAgent || '')
  }

  function withAuthToken(href) {
    if (!auth.token) return href
    const url = new URL(href, window.location.origin)
    url.searchParams.set('auth_token', auth.token)
    return url.toString()
  }

  function directDownload(href, filename) {
    const url = withAuthToken(href)
    if (isMobileBrowser()) {
      window.location.assign(url)
      return
    }

    const a = document.createElement('a')
    a.href = url
    a.download = filename || ''
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function downloadFile(href, filename) {
    if (isMobileBrowser()) {
      directDownload(href, filename)
      return
    }

    try {
      const r = await fetch(href, { headers: apiHeaders() })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: '下载失败' }))
        throw new Error(err.message || `HTTP ${r.status}`)
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('下载失败:', e)
      directDownload(href, filename)
    }
  }

  function formatSize(bytes) {
    if (bytes == null || Number.isNaN(bytes)) return ''
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  function downloadTailNeedsStack(info) {
    if (!info || info === 'loading') return false
    if (info.kind === 'none') return true
    return false
  }

  watch(
    () =>
      items.value
        .filter((j) => j.state === 'done')
        .map((j) => `${j.book_id}:${j.title || ''}`)
        .join(','),
    () => {
      for (const job of items.value) {
        if (job.state === 'done' && job.book_id) void ensureDownloadLinks(job.book_id, job.title, false, job.id)
      }
    },
    { immediate: true }
  )

  watch(tab, (t) => {
    if (t === 'profile') void auth.loadMe()
  })

  onMounted(async () => {
    await auth.loadPlatforms()
    await auth.loadMe()
    void auth.savePlatform('tomato').catch(() => {})
    await fetchJobs(true)
    if (hasActiveJobs()) startPoll()
  })

  onUnmounted(() => {
    stopPoll()
  })

  return {
    router,
    auth,
    POLL_MS,
    tab,
    items,
    downloadInfoByBookId,
    loading,
    loadingMore,
    errorMsg,
    queueLength,
    isActive,
    hasMore,
    total,
    sortedItems,
    fetchJobs,
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
  }
}
