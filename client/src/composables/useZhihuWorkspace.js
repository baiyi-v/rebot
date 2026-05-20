import { ref, reactive } from 'vue'
import { apiHeaders } from '../api.js'
import { toastError, toastInfo } from '../toast.js'

export function useZhihuWorkspace() {
  const keyword = ref('')
  const parseUrl = ref('')
  const sites = ref([])
  const currentSiteId = ref('')
  const loading = ref(false)
  const mode = ref('search')
  const searchResults = ref([])
  const parsedPreview = ref('')
  const parsedContentId = ref('')
  const parsedFullLength = ref(0)
  const parsedTitle = ref('')
  const downloading = ref(false)
  const showConfirm = ref(false)

  const STORAGE_KEY = 'zhihu_last_keyword'
  const RESULTS_STORAGE_KEY = 'zhihu_last_results'

  function saveSearchState() {
    try {
      const state = {
        keyword: keyword.value,
        searchResults: searchResults.value,
        parseUrl: parseUrl.value,
        parsedPreview: parsedPreview.value,
        parsedContentId: parsedContentId.value,
        parsedFullLength: parsedFullLength.value,
        parsedTitle: parsedTitle.value,
        currentSiteId: currentSiteId.value,
        mode: mode.value,
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

      if (state.keyword) {
        sessionStorage.setItem(STORAGE_KEY, state.keyword)
      }
      if (Array.isArray(state.searchResults) && state.searchResults.length > 0) {
        searchResults.value = state.searchResults
      }
      if (state.currentSiteId) {
        currentSiteId.value = state.currentSiteId 
      }
      if (state.parsedPreview) {
        mode.value = 'parse'
        parseUrl.value = ''
        parsedPreview.value = state.parsedPreview || ''
        parsedContentId.value = state.parsedContentId || ''
        parsedFullLength.value = state.parsedFullLength || 0
        parsedTitle.value = state.parsedTitle || ''
      }
    } catch {
      /* ignore */
    }
  }

  async function init() {
    await loadSites()
    loadSearchState()
  }

  const netError = reactive({
    show: false,
    message: '',
    currentSiteId: '',
    nextSiteId: '',
    nextSiteName: '',
    retryAction: null,
  })

  async function loadSites() {
    try {
      const r = await fetch('/api/zhihu/sites', { headers: apiHeaders() })
      const data = await r.json()
      sites.value = Array.isArray(data.items) ? data.items : []
      if (sites.value.length > 0 && !currentSiteId.value) {
        currentSiteId.value = sites.value[0].id
      }
    } catch {
      sites.value = []
    }
  }

  function currentSiteName() {
    const s = sites.value.find((s) => s.id === currentSiteId.value)
    return s ? s.name : currentSiteId.value
  }

  function switchSite(siteId) {
    currentSiteId.value = siteId
    netError.show = false
  }

  function handleNetworkError(data, action) {
    netError.show = true
    netError.message = data.message || '网络连接异常，请稍后重试'
    netError.currentSiteId = data.currentSiteId || currentSiteId.value
    netError.nextSiteId = data.nextSiteId || ''
    netError.nextSiteName = data.nextSiteName || ''
    netError.retryAction = action
  }

  function switchRoute() {
    if (netError.nextSiteId) {
      currentSiteId.value = netError.nextSiteId
    }
    netError.show = false
    const action = netError.retryAction
    if (action) {
      if (action.type === 'search') search()
      else if (action.type === 'parse') doParse()
    }
  }

  function retryLater() {
    netError.show = false
  }

  async function search() {
    const kw = keyword.value.trim()
    if (!kw) {
      toastError('请输入搜索关键词')
      return
    }

    loading.value = true
    searchResults.value = []
    parsedPreview.value = ''
    parsedContentId.value = ''

    try {
      const r = await fetch('/api/zhihu/search', {
        method: 'POST',
        headers: apiHeaders(true),
        body: JSON.stringify({ siteId: currentSiteId.value, keyword: kw }),
      })
      const data = await r.json()

      if (r.status === 502 && data.error === 'network_error') {
        handleNetworkError(data, { type: 'search' })
        loadSites()
        return
      }

      if (!r.ok) {
        toastError(data.message || `搜索失败`)
        return
      }

      searchResults.value = Array.isArray(data.items) ? data.items : []
      if (searchResults.value.length === 0) {
        toastInfo('未搜索到相关结果')
      }
      sessionStorage.setItem(STORAGE_KEY, kw)
      saveSearchState()
    } catch (e) {
      toastError('网络波动，请稍后重试')
    } finally {
      loading.value = false
    }
  }

  async function doParse() {
    const url = parseUrl.value.trim()
    if (!url) {
      toastError('请输入知乎链接')
      return
    }

    loading.value = true
    parsedPreview.value = ''
    parsedContentId.value = ''
    parsedFullLength.value = 0
    parsedTitle.value = ''
    searchResults.value = []

    try {
      const r = await fetch('/api/zhihu/parse', {
        method: 'POST',
        headers: apiHeaders(true),
        body: JSON.stringify({ siteId: currentSiteId.value, url }),
      })
      const data = await r.json()

      if (r.status === 502 && data.error === 'network_error') {
        handleNetworkError(data, { type: 'parse' })
        loadSites()
        return
      }

      if (!r.ok) {
        toastError(data.message || `解析失败`)
        return
      }

      parsedPreview.value = data.preview || ''
      parsedContentId.value = data.contentId || ''
      parsedFullLength.value = data.fullLength || 0
      parsedTitle.value = data.title || ''
      saveSearchState()
    } catch (e) {
      toastError('网络波动，请稍后重试')
    } finally {
      loading.value = false
    }
  }

  function openConfirm() {
    if (!parsedContentId.value) return
    showConfirm.value = true
  }

  function cancelDownload() {
    showConfirm.value = false
  }

  async function confirmDownload() {
    const cid = parsedContentId.value
    if (!cid) return

    downloading.value = true
    try {
      const dlUrl = `/api/zhihu/download/${encodeURIComponent(cid)}`
      const r = await fetch(dlUrl, { headers: apiHeaders() })

      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        throw new Error(data.message || `下载失败 HTTP ${r.status}`)
      }

      const contentType = r.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const data = await r.json().catch(() => ({}))
        throw new Error(data.message || '下载请求被拒绝')
      }

      const blob = await r.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = (parsedTitle.value || 'zhihu_content') + '.txt'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
      showConfirm.value = false
    } catch (e) {
      toastError(e.message || '下载失败')
    } finally {
      downloading.value = false
    }
  }

  return {
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
    loadSites,
  }
}
