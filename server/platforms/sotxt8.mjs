/**
 * sotxt8（搜TXT吧）平台模块
 *
 * 职责：搜索 + 下载 TXT 文件，与 Tomato 引擎完全独立。
 * 添加新平台：参照此文件，实现自己的 mountRoutes(app, services) 即可。
 */

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { performQuarkAuth, getQuarkAuthState } from './sotxt8_quark_auth.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.resolve(__dirname, '..', '..', '.env')

const BASE = 'https://sotxt8.com'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'

const CONFIG_XOR_KEY = Buffer.from([115, 84, 56, 120, 35, 107, 80, 50])

const SOTXT8_PROXY = (process.env.SOTXT8_PROXY || '').trim()
const SOTXT8_TIMEOUT = Number(process.env.SOTXT8_TIMEOUT) || 30000

let proxyDispatcher = null
if (SOTXT8_PROXY) {
  try {
    const { ProxyAgent } = await import('undici')
    proxyDispatcher = new ProxyAgent(SOTXT8_PROXY)
    console.log('[sotxt8] 代理已启用:', SOTXT8_PROXY)
  } catch {
    console.warn('[sotxt8] ProxyAgent 不可用，代理未启用')
  }
}

const LOG = (() => {
  // 生产环境关闭调试日志：设置 SOTXT8_LOG_LEVEL=prod
  if ((process.env.SOTXT8_LOG_LEVEL || '').toLowerCase() === 'prod') return () => {}
  return (...a) => console.log('[sotxt8]', ...a)
})()

function xorDecode(encoded) {
  const raw = Buffer.from(encoded, 'base64')
  const result = Buffer.alloc(raw.length)
  for (let i = 0; i < raw.length; i++) {
    result[i] = raw[i] ^ CONFIG_XOR_KEY[i % CONFIG_XOR_KEY.length]
  }
  return JSON.parse(result.toString('utf-8'))
}

function mergeCookies(oldCookieStr, setCookieHeaders) {
  const m = new Map()
  if (oldCookieStr) {
    oldCookieStr.split(';').forEach((s) => {
      const idx = s.indexOf('=')
      if (idx > 0) m.set(s.slice(0, idx).trim(), s.slice(idx + 1).trim())
    })
  }
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]
  for (const h of headers) {
    if (!h) continue
    const i = h.indexOf('=')
    const j = h.indexOf(';')
    if (i > 0) {
      const k = h.slice(0, i).trim()
      const v = j > i ? h.slice(i + 1, j).trim() : h.slice(i + 1).trim()
      m.set(k, v)
    }
  }
  return [...m].map(([k, v]) => `${k}=${v}`).join('; ')
}

function randomHex(len) {
  return [...Array(len)]
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join('')
}

async function persistCookies(cookies) {
  try {
    const content = await fs.readFile(ENV_PATH, 'utf-8')
    const updated = content.replace(/^SOTXT8_COOKIES=.*$/m, `SOTXT8_COOKIES=${cookies}`)
    await fs.writeFile(ENV_PATH, updated, 'utf-8')
    LOG('SOTXT8_COOKIES 已持久化到 .env')
  } catch (e) {
    LOG('持久化 SOTXT8_COOKIES 失败:', e.message)
  }
}

async function login(userId) {
  const sess = getSession(userId)
  LOG('开始登录流程...')

  const username = (process.env.SOTXT8_USERNAME || '').trim()
  const password = (process.env.SOTXT8_PASSWORD || '').trim()
  if (!username || !password) {
    throw new Error('缺少 SOTXT8_USERNAME 或 SOTXT8_PASSWORD 环境变量')
  }

  LOG('登录步骤1: 访问首页获取初始 cookie 和 csrf_token...')
  const resp1 = await fetch(`${BASE}/index.php`, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(SOTXT8_TIMEOUT),
    ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
  })

  LOG(`登录步骤1 响应: HTTP ${resp1.status}`)

  let loginCookies = ''
  const setCookie1 = resp1.headers.getSetCookie?.()
  if (setCookie1) {
    loginCookies = mergeCookies(loginCookies, setCookie1)
  }
  LOG(`登录步骤1 cookies: ${loginCookies.slice(0, 80)}...`)

  const html1 = await resp1.text()

  const csrfM = html1.match(/(?:csrf_token|csrfToken)\s*[:=]\s*["']([a-f0-9]{32})["']/i)
      || html1.match(/name=["']csrf_token["']\s+value=["']([a-f0-9]{32})["']/i)
  if (!csrfM) {
    throw new Error('登录失败: 无法从首页提取 csrf_token')
  }
  const csrfToken = csrfM[1]
  LOG(`登录 csrf_token: ${csrfToken.slice(0, 8)}...`)

  const srtM = html1.match(/SITE_SEARCH_REQUEST_TOKEN\s*=\s*"([^"]+)"/)
  if (srtM) {
    sess.searchRequestToken = srtM[1]
    LOG(`登录 search_request_token: ${sess.searchRequestToken.slice(0, 8)}...`)
  }

  LOG('登录步骤2: 提交登录表单...')
  const boundary = '----WebKitFormBoundary' + randomHex(16)

  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="csrf_token"',
    '',
    csrfToken,
    `--${boundary}`,
    'Content-Disposition: form-data; name="username"',
    '',
    username,
    `--${boundary}`,
    'Content-Disposition: form-data; name="password"',
    '',
    password,
    `--${boundary}`,
    'Content-Disposition: form-data; name="remember_me"',
    '',
    '1',
    `--${boundary}`,
    'Content-Disposition: form-data; name="action"',
    '',
    'login',
    `--${boundary}--`,
  ].join('\r\n')

  const resp2 = await fetch(`${BASE}/community_auth.php`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Accept: '*/*',
      Origin: BASE,
      Referer: `${BASE}/index.php`,
      Cookie: loginCookies,
    },
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(SOTXT8_TIMEOUT),
    ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
  })

  LOG(`登录步骤2 响应: HTTP ${resp2.status}`)

  const setCookie2 = resp2.headers.getSetCookie?.()
  if (setCookie2) {
    loginCookies = mergeCookies(loginCookies, setCookie2)
  }
  LOG(`登录步骤2 cookies: ${loginCookies.slice(0, 80)}...`)

  const data2 = await resp2.json().catch(() => null)
  LOG(`登录步骤2 data: ${JSON.stringify(data2)}`)
  if (!data2?.success) {
    throw new Error(data2?.message || '登录失败')
  }

  sess.cookies = loginCookies
  sess.csrfToken = csrfToken

  LOG(`登录完成, cookies: ${sess.cookies.slice(0, 80)}...`)
  await persistCookies(sess.cookies)
  return sess
}

// ---- 固定登录态参数 ----
const FIXED_COOKIES = (process.env.SOTXT8_COOKIES || 'site_device_code=19c27b8d456e9396d7e465f90fc146b9; PHPSESSID=8rt5h5lq394991iisu8jj4d53k; community_remember_login=9898549b956ab39512653fa8%3Ad4043af20c5aa5b347026a8f024dcdb4e4d90dbe569184a43db415c097489353').trim()

const FIXED_CSRF_TOKEN = (process.env.SOTXT8_CSRF_TOKEN || 'ae0b62c6aac478d7e9f212e825cf4e42').trim()

// ---- 每用户会话 ----
const sessions = new Map()

function sKey(userId) {
  return String(userId || 'anon')
}

function getSession(userId) {
  const k = sKey(userId)
  if (!sessions.has(k)) {
    sessions.set(k, {
      cookies: FIXED_COOKIES,
      csrfToken: FIXED_CSRF_TOKEN,
      searchRequestToken: '',
      indexHtml: null,
    })
  }
  return sessions.get(k)
}

async function sotxt8Fetch(userId, url, opts = {}) {
  const sess = getSession(userId)
  const headers = {
    'User-Agent': UA,
    Accept: opts.accept || '*/*',
    ...(opts.headers || {}),
  }
  if (sess.cookies) headers['Cookie'] = sess.cookies

  const method = (opts.method || 'GET').toUpperCase()
  const is401Retry = opts._401retry || false
  const is403Retry = opts._403retry || false

  LOG(`HTTP ${method} ${url}`)

  const resp = await fetch(url, {
    ...opts,
    headers,
    redirect: 'manual',
    ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
    signal: opts.signal || AbortSignal.timeout(SOTXT8_TIMEOUT),
  })

  LOG(`HTTP ${resp.status} ${method} ${url}`)

  const setCookie = resp.headers.getSetCookie?.() ?? resp.headers.raw?.()?.['set-cookie']
  if (setCookie) sess.cookies = mergeCookies(sess.cookies, setCookie)

  if (resp.status === 401 && !is401Retry) {
    LOG(`HTTP 401，执行登录...`)
    await login(userId)
    const retryOpts = { ...opts, _401retry: true }
    delete retryOpts.signal
    return sotxt8Fetch(userId, url, retryOpts)
  }

  if (resp.status === 403 && !is403Retry) {
    LOG(`HTTP 403，刷新会话...`)
    await refreshSession(userId)
    const retryOpts = { ...opts, _403retry: true }
    delete retryOpts.signal
    return sotxt8Fetch(userId, url, retryOpts)
  }

  return resp
}

async function fetchJson(userId, url, opts = {}) {
  const resp = await sotxt8Fetch(userId, url, opts)
  const text = await resp.text()
  LOG(`  response body (${text.length}B):`, text)
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// ---- 用现有 cookie 访问首页刷新会话 ----
async function refreshSession(userId) {
  const sess = getSession(userId)
  LOG('刷新会话: 用现有 cookie 访问首页...')
  const resp = await sotxt8Fetch(userId, `${BASE}/index.php`, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      Referer: `${BASE}/index.php`,
    },
    _403retry: true,
  })
  LOG(`刷新会话首页响应: HTTP ${resp.status}`)
  if (!resp.ok) {
    throw new Error(`刷新会话失败: HTTP ${resp.status}`)
  }
  const html = await resp.text()
  LOG(`刷新会话 HTML 长度: ${html.length}B`)

  sess.indexHtml = html

  const srtM = html.match(/SITE_SEARCH_REQUEST_TOKEN\s*=\s*"([^"]+)"/)
  if (srtM) {
    sess.searchRequestToken = srtM[1]
    LOG(`刷新后 search_request_token: ${sess.searchRequestToken.slice(0, 8)}...`)
  }

  const csrfM = html.match(/(?:csrf_token|csrfToken)\s*[:=]\s*["']([a-f0-9]{32})["']/i)
      || html.match(/name=["']csrf_token["']\s+value=["']([a-f0-9]{32})["']/i)
  if (csrfM) {
    sess.csrfToken = csrfM[1]
    LOG(`刷新后 csrf_token: ${sess.csrfToken.slice(0, 8)}...`)
  }

  LOG(`刷新后 cookies: ${(sess.cookies || '').slice(0, 80)}...`)
  await persistCookies(sess.cookies)
  return sess
}

// ---- 搜索守卫 ----
async function searchGuard(userId, keyword) {
  const sess = getSession(userId)
  LOG(`搜索守卫: keyword="${keyword}"`)
  const body = new URLSearchParams({ keyword: keyword.trim(), csrf_token: sess.csrfToken })
  const resp = await sotxt8Fetch(userId, `${BASE}/api_search_guard.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: BASE,
      Referer: `${BASE}/index.php`,
    },
    body: body.toString(),
  })
  const data = await resp.json()
  LOG(`搜索守卫结果: success=${data?.success}, blocked=${data?.blocked}, message="${data?.message || ''}"`)

  if (!data || !data.success) {
    const msg = (data?.message || '').trim()
    const isSessionStale = /安全校验失败.*刷新|PHPSESSID.*过期|会话.*过期|session.*expire/i.test(msg)

    if (isSessionStale) {
      LOG('检测到会话过期（安全校验失败），清除 PHPSESSID 后重新获取...')
      sess.cookies = sess.cookies.replace(/PHPSESSID=[^;]*;?\s*/gi, '').replace(/;\s*$/, '')
      if (!sess.cookies) sess.cookies = 'site_device_code=' + (process.env.SOTXT8_COOKIES || '').match(/site_device_code=([^;]+)/)?.[1] || ''

      const htmlResp = await sotxt8Fetch(userId, `${BASE}/index.php`, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          Referer: `${BASE}/index.php`,
        },
        _403retry: true,
      })
      LOG(`获取 index.php: HTTP ${htmlResp.status}`)
      if (htmlResp.ok) {
        const html = await htmlResp.text()
        sess.indexHtml = html

        const srtM = html.match(/SITE_SEARCH_REQUEST_TOKEN\s*=\s*"([^"]+)"/)
        if (srtM) sess.searchRequestToken = srtM[1]

        const csrfM = html.match(/(?:csrf_token|csrfToken)\s*[:=]\s*["']([a-f0-9]{32})["']/i)
            || html.match(/name=["']csrf_token["']\s+value=["']([a-f0-9]{32})["']/i)
        if (csrfM) sess.csrfToken = csrfM[1]

        await persistCookies(sess.cookies)
        LOG(`已更新 cookies: ${sess.cookies.slice(0, 80)}...`)
      }

      const retryResp = await sotxt8Fetch(userId, `${BASE}/api_search_guard.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Origin: BASE,
          Referer: `${BASE}/index.php`,
        },
        body: body.toString(),
      })
      const retryData = await retryResp.json()
      LOG(`搜索守卫重试结果(会话刷新后): success=${retryData?.success}, blocked=${retryData?.blocked}, message="${retryData?.message || ''}"`)
      if (retryData?.success) {
        return retryData
      }
      throw new Error('数据处理异常请等待稍后访问')
    }

    const isUnauth = /未授权|未激活|授权失败|无权限|请授权|口令/i.test(msg)

    if (isUnauth) {
      LOG('检测到未授权状态')

      const state = getQuarkAuthState()

      if (state.status === 'completed') {
        LOG('夸克授权此前已完成，刷新会话并重试守卫...')
        await refreshSession(userId)
        const retryResp = await sotxt8Fetch(userId, `${BASE}/api_search_guard.php`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Origin: BASE,
            Referer: `${BASE}/index.php`,
          },
          body: body.toString(),
        })
        const retryData = await retryResp.json()
        LOG(`搜索守卫重试结果: success=${retryData?.success}, blocked=${retryData?.blocked}, message="${retryData?.message || ''}"`)
        if (retryData?.success) {
          return retryData
        }
        LOG('授权后仍无法通过搜索守卫')
        throw new Error('数据处理异常请等待稍后访问')
      }

      if (state.status === 'in_progress') {
        LOG('夸克授权正在进行中，告知用户等待')
        throw new Error('授权进行中，请稍后再试')
      }

      LOG('状态为 idle/failed，启动异步夸克网盘授权流程...')

      let indexHtml = sess.indexHtml || null
      if (!indexHtml) {
        LOG('无缓存 HTML，重新获取 index.php...')
        const htmlResp = await sotxt8Fetch(userId, `${BASE}/index.php`, {
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            Referer: `${BASE}/index.php`,
          },
          _403retry: true,
        })
        if (htmlResp.ok) {
          indexHtml = await htmlResp.text()
          sess.indexHtml = indexHtml
        }
      }

      const capturedUserId = userId
      const capturedCookies = sess.cookies
      const capturedCsrf = sess.csrfToken
      performQuarkAuth(capturedUserId, indexHtml || '', {
        sotxt8Cookies: capturedCookies,
        sotxt8CsrfToken: capturedCsrf,
        onComplete: async (success, updatedSotxt8Cookies) => {
          if (success) {
            LOG('异步授权完成，刷新 sotxt8 会话...')
            if (updatedSotxt8Cookies) {
              LOG('授权提交带回了新 cookies，更新会话...')
              sess.cookies = updatedSotxt8Cookies
              await persistCookies(updatedSotxt8Cookies)
            }
            try {
              await refreshSession(capturedUserId)
              LOG('异步授权后 sotxt8 会话已刷新')
            } catch (e) {
              LOG(`异步授权后刷新会话失败: ${e.message}`)
            }
          }
        },
      }).catch((e) => {
        LOG(`异步授权异常: ${e.message}`)
      })

      throw new Error('操作失败，请稍后再试')
    }

    throw new Error('数据处理异常请等待稍后访问')
  }
  return data
}

// ---- 搜索一个模式（pan89 / nailong） ----
async function searchMode(userId, keyword, mode, options = {}) {
  const sess = getSession(userId)
  const params = new URLSearchParams({
    keyword: keyword.trim(),
    force_mode: mode,
    csrf_token: sess.csrfToken,
    search_request_token: sess.searchRequestToken,
  })
  if (mode === 'nailong') {
    params.set('page', String(options.page || 1))
    params.set('page_size', String(options.pageSize || 20))
  }

  LOG(`搜索模式 ${mode}: page=${options.page || 1}, pageSize=${options.pageSize || 20}, params=${params.toString()}`)
  const resp = await sotxt8Fetch(userId, `${BASE}/api_search.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: BASE,
      Referer: `${BASE}/index.php`,
    },
    body: params.toString(),
  })

  const text = await resp.text()
  LOG(`搜索 ${mode}: HTTP ${resp.status}, 响应体 ${text.length}B:`, text)
  let result = null
  try {
    result = JSON.parse(text)
  } catch (e) {
    LOG(`搜索 ${mode} JSON 解析失败: ${e.message}`)
    throw new Error('搜索响应异常')
  }

  if (result?.next_search_request_token) {
    sess.searchRequestToken = result.next_search_request_token
    LOG(`旋转 search_request_token -> ${result.next_search_request_token.slice(0, 8)}...`)
  }

  if (!resp.ok) {
    throw new Error(result?.msg || `HTTP ${resp.status}`)
  }

  const groups = Array.isArray(result?.groups) ? result.groups : []
  LOG(`搜索 ${mode} 返回 ${groups.length} 个 group`)
  for (const g of groups) {
    LOG(`  group mode=${g.mode}, code=${g.code}, list=${Array.isArray(g.list) ? g.list.length : 0}条`)
  }
  const group = groups.find((g) => g.mode === mode)
  if (!group || Number(group.code) !== 200) {
    LOG(`搜索 ${mode}: 无有效结果(code=${group?.code})`)
    return []
  }

  return Array.isArray(group.list) ? group.list : []
}

// ---- 保存搜索结果到服务端批次 ----
async function saveResults(userId, results, action = 'reset', batchId = '', retry = true) {
  const sess = getSession(userId)
  const payload = {
    csrf_token: sess.csrfToken,
    action,
    results: Array.isArray(results) ? results : [],
  }
  if (batchId) payload.batch_id = batchId

  LOG(`保存结果请求体: action=${action}, results条数=${payload.results.length}, batchId=${batchId || '(new)'}, csrf_token=${sess.csrfToken}`)
  const resp = await sotxt8Fetch(userId, `${BASE}/api_save_search_results.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-Token': sess.csrfToken,
      Origin: BASE,
      Referer: `${BASE}/index.php`,
    },
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  LOG(`保存结果响应: success=${data?.success}, batchId=${data?.batch_id || '-'}, tokens=${Array.isArray(data?.download_tokens) ? data.download_tokens.length : 0}, urls=${Array.isArray(data?.download_urls) ? data.download_urls.length : 0}`)

  if (data?.success) return data

  // 批次过期自动重建
  const errMsg = data?.error || data?.message || ''
  const isExpired = /过期|已失效|expired|重新搜索/i.test(errMsg)
  if (isExpired && retry && action !== 'reset') {
    LOG(`批次已过期，自动重建批次并重试`)
    // 清空该用户所有批次缓存
    const prefix = `${userId}::`
    for (const k of batches.keys()) {
      if (k.startsWith(prefix)) batches.delete(k)
    }
    const newBatchId = createBatchId()
    await saveResults(userId, [], 'reset', newBatchId, false)
    return saveResults(userId, results, action, newBatchId, false)
  }

  throw new Error(errMsg || '保存搜索结果失败')
}

function createBatchId() {
  return `search_${Date.now()}_${randomHex(8)}`
}

// ---- 解码 base64 URL 安全的 payload ----
function decodePayload(b64) {
  let s = b64.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const buf = Buffer.from(s, 'base64')
  return JSON.parse(buf.toString('utf-8'))
}

// ---- 共享批次管理（同一用户+关键词共享批次） ----
const batches = new Map()

function batchKey(userId, keyword) {
  return `${userId}::${keyword}`
}

function getOrCreateBatch(userId, keyword) {
  const k = batchKey(userId, keyword)
  if (!batches.has(k)) {
    batches.set(k, { batchId: '', startIndex: 0, ready: false, keyword })
  }
  return batches.get(k)
}

async function ensureBatch(userId, keyword) {
  const batch = getOrCreateBatch(userId, keyword)
  if (batch.ready) return batch

  batch.batchId = createBatchId()
  await saveResults(userId, [], 'reset', batch.batchId)
  batch.ready = true
  LOG(`批次已创建: ${batch.batchId}`)
  return batch
}

function buildDownloadUrl(file, i, urls, tokens) {
  let relUrl = urls[i] || ''
  if (!relUrl && tokens[i]) {
    relUrl = `download.php?index=${i}&token=${tokens[i]}`
  }
  return relUrl ? `${BASE}/${relUrl.replace(/^\//, '')}` : ''
}

function extractFileName(file, relUrl) {
  let name = String(file.fileName || file.name || '').trim()
  if (!name && relUrl) {
    const pm = relUrl.match(/payload=([^&]+)/)
    if (pm) {
      try {
        const decoded = decodePayload(pm[1])
        name = decoded?.file?.fileName || decoded?.file?.name || ''
      } catch {}
    }
  }
  return name
}

function extractFileSize(file) {
  let bytes = Number(file.fileSizeBytes) || 0
  let text = file.fileSizeText || ''
  if (!bytes) {
    bytes = Number(file.fileSize) * 1024
    if (bytes) text = formatSize(bytes)
  }
  return { bytes, text }
}

function buildItems(files, urls, tokens) {
  return files.map((file, i) => {
    const relUrl = urls[i] || (tokens[i] ? `download.php?index=${i}&token=${tokens[i]}` : '')
    const { bytes, text } = extractFileSize(file)
    return {
      fileId: file.fileId || '',
      fileName: extractFileName(file, relUrl),
      fileSize: bytes,
      fileSizeText: text,
      searchSource: file.searchSource || file.source || '',
      dlIndex: i,
      addTime: file.addTime || '',
    }
  })
}

// ---- 下载 URL 服务端存储（不暴露给前端） ----
const downloadUrlStore = new Map()

// ---- 分库搜索 API ----
export async function searchSource(userId, keyword, source) {
  LOG(`========== 搜索 ${source}: keyword="${keyword}" ==========`)

  const guard = await searchGuard(userId, keyword)
  if (guard.blocked) throw new Error('该关键词已被屏蔽')

  const sess = getSession(userId)
  if (!sess.searchRequestToken) {
    LOG('缺少 search_request_token，刷新会话...')
    await refreshSession(userId)
  }

  const batch = await ensureBatch(userId, keyword)

  let results = []

  if (source === 'ilanzou') {
    results = await searchIlanzouAllFolders(userId, keyword)
  } else {
    results = await searchMode(userId, keyword, source, { page: 1, pageSize: 100 }).catch((e) => {
      LOG(`⚠ ${source} 搜索异常: ${e.message}`)
      return []
    })
  }

  LOG(`${source}: ${results.length}条原始结果`)

  if (results.length === 0) {
    return { source, items: [], total: 0 }
  }

  const saved = await saveResults(userId, results, 'append', batch.batchId)
  const urls = Array.isArray(saved.download_urls) ? saved.download_urls : []
  const tokens = Array.isArray(saved.download_tokens) ? saved.download_tokens : []

  const items = buildItems(results, urls, tokens)

  const urlMap = new Map()
  items.forEach((_, i) => {
    urlMap.set(i, buildDownloadUrl(results[i], i, urls, tokens))
  })
  downloadUrlStore.set(batch.batchId, urlMap)

  LOG(`搜索完成 ${source}: 共 ${items.length} 个结果`)
  return { source, items, total: items.length, batchId: batch.batchId }
}

// ---- 蓝奏云全部文件夹搜索 ----
async function searchIlanzouAllFolders(userId, keyword) {
  const config = await fetchJson(userId, `${BASE}/api_search_config.php?_t=${Date.now()}`, {
    headers: { Referer: `${BASE}/index.php` },
  })
  const decrypted = config?.d ? xorDecode(config.d) : {}
  const shareId = decrypted.s || ''
  const apiBase = decrypted.a || 'https://apis.ilanzou.com'
  const folders = Array.isArray(decrypted.folders) ? decrypted.folders : []

  LOG(`蓝奏云: shareId=${shareId ? 'yes' : 'no'}, apiBase=${apiBase}, folders=${folders.length}个`)

  if (!shareId || folders.length === 0) {
    LOG('蓝奏云: 无有效配置')
    return []
  }

  const folderResults = await Promise.allSettled(
    folders.map((f) =>
      searchIlanzouFolder(userId, keyword, apiBase, shareId, String(f.folderId || f.id || ''))
        .catch((e) => {
          LOG(`⚠ 蓝奏云文件夹异常: ${e.message}`)
          return []
        })
    )
  )

  const seen = new Set()
  const all = []
  for (const r of folderResults) {
    if (r.status !== 'fulfilled') continue
    for (const f of r.value) {
      if (!seen.has(f.fileId)) {
        seen.add(f.fileId)
        all.push(f)
      }
    }
  }
  LOG(`蓝奏云: 合并去重后 ${all.length}条`)
  return all
}

// ---- 蓝奏云单文件夹搜索 ----
async function searchIlanzouFolder(userId, keyword, apiBase, shareId, folderId) {
  if (!folderId) return []

  const timestamp = Date.now()
  const ets = await aesEncryptTimestamp(timestamp)
  const uuid = randomHex(21)

  const url =
    `${apiBase}/unproved/share/list?devType=6&devModel=Chrome&uuid=${uuid}&extra=2` +
    `&timestamp=${ets}&shareId=${encodeURIComponent(shareId)}` +
    `&folderId=${encodeURIComponent(folderId)}&offset=1&limit=100` +
    `&search=${encodeURIComponent(keyword)}`

  LOG(`蓝奏云搜索: folderId=${folderId}`)
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Accept: 'application/json, text/plain, */*',
      Origin: BASE,
      Referer: `${BASE}/`,
    },
    signal: AbortSignal.timeout(SOTXT8_TIMEOUT),
    ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
  })
  const data = await resp.json()
  LOG(`蓝奏云搜索 folderId=${folderId}: code=${data?.code}, total=${data?.total || 0}`)
  if (data?.code !== 200) return []

  const list = Array.isArray(data?.list) ? data.list : []
  return list.map((f) => ({
    fileId: String(f.fileId || f.file_id || ''),
    fileName: String(f.name || f.fileName || f.file_name || ''),
    fileSize: Number(f.fileSize || f.size || 0),
    fileSizeText: f.fileSizeText || '',
    searchSource: 'ilanzou',
    source_url: '',
  }))
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return ''
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// ---- AES-CBC 加密时间戳（用于蓝奏云 API） ----
const AES_KEY_RAW = Buffer.from('lanZouY-disk-app'.padEnd(16, '\0').slice(0, 16))

async function aesEncryptTimestamp(ts) {
  const iv = Buffer.alloc(16)
  const data = Buffer.from(String(ts), 'utf-8')
  const paddedLen = Math.ceil(data.length / 16) * 16
  const padLen = paddedLen - data.length
  const padded = Buffer.alloc(paddedLen)
  data.copy(padded)
  padded.fill(padLen, data.length)

  const { subtle } = (globalThis.crypto ?? crypto.webcrypto)
  const key = await subtle.importKey('raw', AES_KEY_RAW, { name: 'AES-CBC' }, false, ['encrypt'])

  const out = Buffer.alloc(padded.length)
  for (let i = 0; i < padded.length; i += 16) {
    const block = padded.subarray(i, i + 16)
    const enc = await subtle.encrypt({ name: 'AES-CBC', iv }, key, block)
    Buffer.from(enc).copy(out, i, 0, 16)
  }
  return [...out].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

// ---- 下载文件 ----
export async function downloadFile(userId, downloadUrl, saveDir) {
  const fullUrl = `${BASE}/${downloadUrl.replace(/^\//, '')}`
  LOG(`开始下载: ${downloadUrl}`)

  const sess = getSession(userId)
  const resp = await fetch(fullUrl, {
    headers: {
      'User-Agent': UA,
      Accept: '*/*',
      Referer: `${BASE}/index.php`,
      Cookie: sess.cookies,
    },
    signal: AbortSignal.timeout(SOTXT8_TIMEOUT),
    ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
  })

  LOG(`下载响应: HTTP ${resp.status}, content-type=${resp.headers.get('content-type')}`)
  LOG(`下载最终 URL: ${resp.url}`)

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    LOG(`下载失败 body:`, text)
    throw new Error(`下载失败 HTTP ${resp.status}: ${text}`)
  }

  const contentDisposition = resp.headers.get('content-disposition') || ''
  LOG(`Content-Disposition: ${contentDisposition}`)
  let fileName = ''
  const fnMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?(.+?)(?:;|$)/i)
  if (fnMatch) {
    try {
      fileName = decodeURIComponent(fnMatch[1].replace(/"/g, '').trim())
    } catch {
      fileName = fnMatch[1].replace(/"/g, '').trim()
    }
  }

  await fs.mkdir(saveDir, { recursive: true })
  const savePath = path.join(saveDir, fileName || `download_${Date.now()}.txt`)
  const buf = Buffer.from(await resp.arrayBuffer())
  await fs.writeFile(savePath, buf)

  LOG(`下载完成: ${fileName}, ${buf.length}B -> ${savePath}`)
  return { fileName: fileName || path.basename(savePath), savePath, size: buf.length }
}

// ---- 列出已下载的 sotxt8 文件 ----
export async function listDownloadedFiles(saveDir) {
  let files = []
  try {
    files = await fs.readdir(saveDir)
  } catch {
    return []
  }
  const results = []
  for (const name of files) {
    const full = path.join(saveDir, name)
    try {
      const st = await fs.stat(full)
      if (st.isFile()) {
        results.push({ fileName: name, size: st.size, relPath: `sotxt8/${name}` })
      }
    } catch {}
  }
  return results
}

// ---- 搜索结果缓存（3分钟有效期） ----
const SEARCH_CACHE_TTL = 3 * 60 * 1000
const searchCache = new Map()

function getCacheKey(userId, source, keyword) {
  return `${userId}::${source}::${keyword}`
}

function getCachedResult(userId, source, keyword) {
  const key = getCacheKey(userId, source, keyword)
  const entry = searchCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > SEARCH_CACHE_TTL) {
    return null
  }
  LOG(`缓存命中: source=${source}, keyword="${keyword}", 剩余${Math.max(0, Math.round((SEARCH_CACHE_TTL - (Date.now() - entry.ts)) / 1000))}s`)
  return entry.data
}

function setCachedResult(userId, source, keyword, data) {
  const key = getCacheKey(userId, source, keyword)
  searchCache.set(key, { data, ts: Date.now() })
}

// ---- 挂载路由 ----
export function mountRoutes(app, services) {
  const { requireUser, requireJobQuota, consumeJobCredit, refundJobCredit, getLocalLibraryRoot } = services

  app.post('/api/txtsearch/search/:source', requireUser, async (req, res) => {
    try {
      const source = String(req.params.source || '').trim().toLowerCase()
      const keyword = String(req.body?.keyword || '').trim()

      if (!['pan89', 'nailong', 'ilanzou'].includes(source)) {
        return res.status(400).json({ error: 'bad_source', message: '未知搜索源，可选 pan89 / nailong / ilanzou' })
      }
      if (!keyword) {
        return res.status(400).json({ error: 'bad_keyword', message: '请输入搜索关键词' })
      }
      if (keyword.length > 200) {
        return res.status(400).json({ error: 'keyword_too_long', message: '关键词过长' })
      }

      const userId = req.user?.id || 'anon'

      const cached = getCachedResult(userId, source, keyword)
      if (cached) {
        LOG(`>>> 返回缓存结果: source=${source}, keyword="${keyword}", user=${req.user?.username}`)
        return res.json(cached)
      }

      LOG(`>>> 收到搜索请求: source=${source}, keyword="${keyword}", user=${req.user?.username}`)
      const result = await searchSource(userId, keyword, source)
      setCachedResult(userId, source, keyword, result)
      res.json(result)
    } catch (e) {
      LOG(`搜索 ${req.params.source} 异常: ${e.message}`)
      console.error('[sotxt8] 搜索失败:', e)

      const userId = req.user?.id || 'anon'
      const fallbackKey = getCacheKey(userId, req.params.source, String(req.body?.keyword || '').trim())
      const fallback = searchCache.get(fallbackKey)

      if (fallback) {
        LOG(`搜索失败，返回上一次缓存结果: source=${req.params.source}, keyword="${req.body?.keyword}"`)
        return res.json(fallback.data)
      }

      return res.json({ source: req.params.source, items: [], total: 0 })
    }
  })

  /**
   * GET /txtsearch-dl?token=...&name=...
   * 代理下载：token 由 /api/txtsearch/download-claim 签发，后端内部查找真实 URL。
   */
  app.get('/txtsearch-dl', requireUser, requireJobQuota, async (req, res) => {
    try {
      const dlToken = String(req.query.token || '').trim()
      const clientFileName = String(req.query.name || '').trim()

      if (!dlToken) {
        return res.status(400).json({ error: 'bad_token' })
      }

      const parts = dlToken.split('::')
      if (parts.length < 3) {
        return res.status(403).json({ error: 'bad_token', message: '下载凭证无效' })
      }
      const userId = parts[0]
      const batchId = parts[1]
      const dlIndex = Number(parts[2])

      if (String(req.user.id) !== userId) {
        return res.status(403).json({ error: 'bad_token', message: '下载凭证无效' })
      }

      const urlMap = downloadUrlStore.get(batchId)
      const targetUrl = urlMap?.get(dlIndex)
      if (!targetUrl) {
        return res.status(400).json({ error: 'batch_expired', message: '搜索结果已过期，请重新搜索' })
      }

      consumeJobCredit(req.user.id)

      LOG(`代理下载(扣次数): user=${req.user.username}, targetUrl=${targetUrl}`)

      const sess = getSession('anon')
      const resp = await fetch(targetUrl, {
        headers: {
          'User-Agent': UA,
          Accept: '*/*',
          Referer: `${BASE}/index.php`,
          Cookie: sess.cookies,
        },
        signal: AbortSignal.timeout(SOTXT8_TIMEOUT),
        ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
      })

      LOG(`代理下载: HTTP ${resp.status}, content-type=${resp.headers.get('content-type')}`)

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        LOG(`代理下载失败:`, text)
        refundJobCredit(req.user.id)
        LOG(`已退还下载次数: user=${req.user.username}`)
        return res.status(502).json({ error: 'download_failed', message: `上游返回 HTTP ${resp.status}` })
      }

      const contentDisposition = resp.headers.get('content-disposition') || ''
      let fileName = clientFileName
      if (!fileName) {
        const fnMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?(.+?)(?:;|$)/i)
        if (fnMatch) {
          try {
            fileName = decodeURIComponent(fnMatch[1].replace(/"/g, '').trim())
          } catch {
            fileName = fnMatch[1].replace(/"/g, '').trim()
          }
        }
      }
      if (!fileName) fileName = 'download.txt'

      const ct = resp.headers.get('content-type') || 'application/octet-stream'
      res.setHeader('Content-Type', ct)
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
      res.setHeader('Cache-Control', 'no-cache')

      const buf = Buffer.from(await resp.arrayBuffer())
      res.setHeader('Content-Length', buf.length)
      res.end(buf)
    } catch (e) {
      LOG(`代理下载异常: ${e.message}`)
      refundJobCredit(req.user.id)
      LOG(`已退还下载次数(异常): user=${req.user.username}`)
      if (!res.headersSent) {
        const errMsg = e.message || '下载失败'
        const userMsg = /fetch|network|timeout|abort|econn|enotfound|dns|socket/i.test(errMsg)
          ? '网络波动，请稍后重试'
          : errMsg
        res.status(502).json({ error: 'download_failed', message: userMsg })
      }
    }
  })

  /**
   * POST /api/txtsearch/download-claim
   * body: { batchId, dlIndex, fileName }
   * 返回 token，用于 /txtsearch-dl?token=...
   */
  app.post('/api/txtsearch/download-claim', requireUser, requireJobQuota, (req, res) => {
    const batchId = String(req.body?.batchId || '').trim()
    const dlIndex = Number(req.body?.dlIndex)

    if (!batchId || isNaN(dlIndex) || dlIndex < 0) {
      return res.status(400).json({ error: 'bad_params', message: '缺少 batchId 或 dlIndex' })
    }

    const urlMap = downloadUrlStore.get(batchId)
    if (!urlMap) {
      return res.status(400).json({ error: 'batch_expired', message: '搜索结果已过期，请重新搜索' })
    }
    if (!urlMap.has(dlIndex)) {
      return res.status(400).json({ error: 'bad_index', message: '无效的下载序号' })
    }

    const token = `${req.user.id}::${batchId}::${dlIndex}`
    res.json({ token })
  })

  app.get('/api/txtsearch/files', requireUser, async (_req, res) => {
    try {
      const lr = getLocalLibraryRoot()
      if (!lr) {
        return res.json({ files: [] })
      }
      const saveDir = path.join(lr, 'sotxt8')
      const files = await listDownloadedFiles(saveDir)
      res.json({ files })
    } catch (e) {
      console.error('[sotxt8] 列文件失败:', e.message)
      res.json({ files: [] })
    }
  })

  app.get('/api/txtsearch/file/:name', requireUser, async (req, res) => {
    try {
      const lr = getLocalLibraryRoot()
      if (!lr) {
        return res.status(404).json({ error: 'no_library_root' })
      }
      const fname = path.basename(req.params.name)
      const full = path.join(lr, 'sotxt8', fname)
      try {
        await fs.access(full)
      } catch {
        return res.status(404).json({ error: 'not_found', message: '文件不存在' })
      }
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`)
      const st = await fs.stat(full)
      res.setHeader('Content-Length', st.size)
      const stream = await fs.open(full, 'r')
      Readable.from(stream.createReadStream()).pipe(res)
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'read_failed', message: e.message })
      }
    }
  })
}
