import { ref, reactive } from 'vue'
import { apiHeaders } from '../api.js'
import { auth } from '../auth.js'
import { toastError, toastInfo, toastSuccess } from '../toast.js'

const SOURCES = [
  { slug: 'pan89', label: '源1' },
  { slug: 'nailong', label: '源2' },
  { slug: 'ilanzou', label: '源3' },
]

function sourceLabel(raw) {
  const s = SOURCES.find((s) => s.slug === String(raw).toLowerCase())
  return s ? s.label : raw
}

const STORAGE_KEY = 'txtsearch_last_keyword'

export function useTxtSearchWorkspace() {
  const keyword = ref('')
  const sourceResults = reactive({})
  const batchIdMap = reactive({})
  const loading = ref(false)
  const sourceStatus = ref({})
  const activeTab = ref('pan89')
  const showConfirm = ref(false)
  const confirmItem = ref(null)
  const downloading = ref(false)

  const RESULTS_STORAGE_KEY = 'txtsearch_last_results'

  function saveSearchState() {
    try {
      const state = {
        keyword: keyword.value,
        sourceResults: SOURCES.reduce((acc, s) => {
          acc[s.slug] = sourceResults[s.slug] || []
          return acc
        }, {}),
        batchIdMap: SOURCES.reduce((acc, s) => {
          acc[s.slug] = batchIdMap[s.slug] || ''
          return acc
        }, {}),
        sourceStatus: SOURCES.reduce((acc, s) => {
          acc[s.slug] = sourceStatus.value[s.slug] || 'idle'
          return acc
        }, {}),
        activeTab: activeTab.value,
      }
      sessionStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }

  function loadSearchState() {
    try {
      const raw = sessionStorage.getItem(RESULTS_STORAGE_KEY)
      if (!raw) return
      const state = JSON.parse(raw)
      if (!state) return

      if (state.sourceResults) {
        SOURCES.forEach((s) => {
          if (Array.isArray(state.sourceResults[s.slug])) {
            sourceResults[s.slug] = state.sourceResults[s.slug]
          }
        })
      }
      if (state.batchIdMap) {
        SOURCES.forEach((s) => {
          if (typeof state.batchIdMap[s.slug] === 'string') {
            batchIdMap[s.slug] = state.batchIdMap[s.slug]
          }
        })
      }
      if (state.sourceStatus) {
        SOURCES.forEach((s) => {
          if (typeof state.sourceStatus[s.slug] === 'string') {
            sourceStatus.value[s.slug] = state.sourceStatus[s.slug]
          }
        })
      }
      if (state.activeTab && SOURCES.some((s) => s.slug === state.activeTab)) {
        activeTab.value = state.activeTab
      }
    } catch {
      /* ignore */
    }
  }

  loadSearchState()

  function resetSearch() {
    SOURCES.forEach((s) => {
      sourceResults[s.slug] = []
      batchIdMap[s.slug] = ''
      sourceStatus.value[s.slug] = 'idle'
    })
  }

  async function searchOne(keywordVal, source) {
    const slug = source.slug
    sourceStatus.value[slug] = 'loading'
    try {
      const r = await fetch(`/api/txtsearch/search/${slug}`, {
        method: 'POST',
        headers: apiHeaders(true),
        body: JSON.stringify({ keyword: keywordVal }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`)

      const items = Array.isArray(data.items) ? data.items : []
      sourceResults[slug] = items
      batchIdMap[slug] = data.batchId || ''
      sourceStatus.value[slug] = items.length > 0 ? 'done' : 'empty'
    } catch (e) {
      sourceResults[slug] = []
      sourceStatus.value[slug] = 'error'
    }
  }

  async function search() {
    const kw = keyword.value.trim()
    if (!kw) {
      toastError('请输入搜索关键词')
      return
    }

    loading.value = true
    resetSearch()

    await Promise.all(SOURCES.map((s) => searchOne(kw, s)))

    loading.value = false
    sessionStorage.setItem(STORAGE_KEY, kw)
    saveSearchState()

    const total = SOURCES.reduce((sum, s) => sum + (sourceResults[s.slug]?.length || 0), 0)
    if (total === 0 && !Object.values(sourceStatus.value).some((v) => v === 'loading')) {
      toastInfo('网络波动，请等待1~2分钟后重试')
    }
  }

  function openConfirm(item) {
    confirmItem.value = item
    showConfirm.value = true
  }

  function cancelDownload() {
    showConfirm.value = false
    confirmItem.value = null
  }

  async function doDownload() {
    const item = confirmItem.value
    const source = activeTab.value
    const batchId = batchIdMap[source]

    if (item.dlIndex == null) return
    if (!batchId) {
      showConfirm.value = false
      confirmItem.value = null
      toastError('搜索结果已过期，请重新搜索')
      return
    }

    downloading.value = true
    try {
      const claimR = await fetch('/api/txtsearch/download-claim', {
        method: 'POST',
        headers: apiHeaders(true),
        body: JSON.stringify({ batchId, dlIndex: item.dlIndex, fileName: item.fileName }),
      })
      const claimData = await claimR.json()
      if (!claimR.ok) throw new Error(claimData.message || `HTTP ${claimR.status}`)

      const dlUrl = `/txtsearch-dl?token=${encodeURIComponent(claimData.token)}&name=${encodeURIComponent(item.fileName)}`
      const dlR = await fetch(dlUrl, { headers: apiHeaders() })

      if (!dlR.ok) {
        const errData = await dlR.json().catch(() => ({}))
        throw new Error(errData.message || `服务器返回 ${dlR.status}`)
      }

      const contentType = dlR.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const errData = await dlR.json().catch(() => ({}))
        throw new Error(errData.message || '下载请求被拒绝')
      }

      const blob = await dlR.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = item.fileName || 'download.txt'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)

      if (auth.user && auth.user.downloads_remaining > 0) {
        await auth.loadMe()
        toastSuccess(`下载成功 · 剩余 ${auth.user.downloads_remaining} 次`)
      }
    } catch (e) {
      toastError(e.message || '下载失败，请检查账号余量')
    } finally {
      downloading.value = false
      showConfirm.value = false
      confirmItem.value = null
    }
  }

  function formatSize(bytes) {
    if (bytes == null || Number.isNaN(bytes) || bytes <= 0) return ''
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  function totalCount() {
    return SOURCES.reduce((sum, s) => sum + (sourceResults[s.slug]?.length || 0), 0)
  }

  return {
    keyword,
    sourceResults,
    batchIdMap,
    loading,
    sourceStatus,
    SOURCES,
    activeTab,
    showConfirm,
    confirmItem,
    downloading,
    search,
    openConfirm,
    cancelDownload,
    doDownload,
    formatSize,
    totalCount,
    sourceLabel,
  }
}
