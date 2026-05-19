import { ref, reactive, onMounted } from 'vue'
import { apiHeaders } from '../api.js'

const SOURCES = [
  { slug: 'pan89', label: '源1' },
  { slug: 'nailong', label: '源2' },
  { slug: 'ilanzou', label: '源3' },
]

const STORAGE_KEY = 'txtsearch_last_keyword'

export function useTxtSearchWorkspace() {
  const keyword = ref('')
  const sourceResults = reactive({})
  const batchIdMap = reactive({})
  const loading = ref(false)
  const sourceStatus = ref({})
  const errorMsg = ref('')
  const activeTab = ref('pan89')
  const showConfirm = ref(false)
  const confirmItem = ref(null)

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
      errorMsg.value = '请输入搜索关键词'
      return
    }

    loading.value = true
    errorMsg.value = ''
    resetSearch()

    await Promise.all(SOURCES.map((s) => searchOne(kw, s)))

    loading.value = false
    sessionStorage.setItem(STORAGE_KEY, kw)

    const total = SOURCES.reduce((sum, s) => sum + (sourceResults[s.slug]?.length || 0), 0)
    if (total === 0 && !Object.values(sourceStatus.value).some((v) => v === 'loading')) {
      errorMsg.value = '未找到相关文件，请尝试更换关键词'
    }
  }

  onMounted(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved && saved.trim()) {
      keyword.value = saved
      search()
    }
  })

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
    showConfirm.value = false
    confirmItem.value = null

    if (item.dlIndex == null) return

    const source = activeTab.value
    const batchId = batchIdMap[source]
    if (!batchId) {
      errorMsg.value = '搜索结果已过期，请重新搜索'
      return
    }

    try {
      const r = await fetch('/api/txtsearch/download-claim', {
        method: 'POST',
        headers: apiHeaders(true),
        body: JSON.stringify({ batchId, dlIndex: item.dlIndex, fileName: item.fileName }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`)

      const url = `/txtsearch-dl?token=${encodeURIComponent(data.token)}&name=${encodeURIComponent(item.fileName)}`
      const a = document.createElement('a')
      a.href = url
      a.download = item.fileName || 'download.txt'
      a.click()
    } catch (e) {
      errorMsg.value = e.message || '下载失败，请检查账号余量'
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
    errorMsg,
    sourceStatus,
    SOURCES,
    activeTab,
    showConfirm,
    confirmItem,
    search,
    openConfirm,
    cancelDownload,
    doDownload,
    formatSize,
    totalCount,
  }
}
