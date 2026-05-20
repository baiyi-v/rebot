import vm from 'node:vm'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.resolve(__dirname, '..', '..', '.env')

import { q, dbNow } from '../db.mjs'

const ZHIHU_TOKEN = (process.env.ZHIHU_TOKEN || '').trim()
if (!ZHIHU_TOKEN) console.warn('[zhihu] 未配置 ZHIHU_TOKEN 环境变量，请在 .env 中设置')

const ZHIHU_SEK = (process.env.ZHIHU_SEK || '').trim()
if (!ZHIHU_SEK) console.warn('[zhihu] 未配置 ZHIHU_SEK 环境变量，E2EE 站点签名将不可用')

const SITES = Object.freeze([
  { id: 'zhihu-1', name: '站点一', type: 'cookie', url: 'http://83.147.36.135/' },
  { id: 'zhihu-2', name: '站点二', type: 'cookie', url: 'http://83.147.36.149/' },
  { id: 'zhihu-3', name: '站点三', type: 'e2ee',  url: 'http://163.123.183.68:290/index.html' },
  { id: 'zhihu-4', name: '站点四', type: 'e2ee',  url: 'http://93.127.137.230:290/index.html' },
  { id: 'zhihu-5', name: '站点五', type: 'e2ee',  url: 'http://163.123.183.101:290/index.html' },
])

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'

const ZHIHU_TIMEOUT = Number(process.env.ZHIHU_TIMEOUT) || 15000
const ZHIHU_PROXY = (process.env.ZHIHU_PROXY || '').trim()

let proxyDispatcher = null
if (ZHIHU_PROXY) {
  try {
    const { ProxyAgent } = await import('undici')
    proxyDispatcher = new ProxyAgent(ZHIHU_PROXY)
    console.log('[zhihu] 代理已启用:', ZHIHU_PROXY)
  } catch {
    console.warn('[zhihu] ProxyAgent 不可用，代理未启用')
  }
}

const LOG = (() => {
  if ((process.env.ZHIHU_LOG_LEVEL || '').toLowerCase() === 'prod') return () => {}
  return (...a) => console.log('[zhihu]', ...a)
})()

function getSite(siteId) {
  return SITES.find((s) => s.id === siteId) || null
}

function getBaseUrl(siteId) {
  const site = getSite(siteId)
  if (!site) return null
  const u = site.url
  try {
    const parsed = new URL(u)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return u.replace(/\/$/, '')
  }
}

function pickNextSite(currentSiteId) {
  const idx = SITES.findIndex((s) => s.id === currentSiteId)
  if (idx < 0) return SITES[0]
  const nextIdx = (idx + 1) % SITES.length
  return SITES[nextIdx]
}

function randomHex(len) {
  return [...Array(len)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')
}

function randomId() {
  return `${Date.now()}_${randomHex(8)}`
}

// ---- 每站点 Cookie 会话管理 ----
const siteSessions = new Map()

function getSiteSession(siteId) {
  if (!siteSessions.has(siteId)) {
    siteSessions.set(siteId, { cookies: '', initialized: false })
  }
  return siteSessions.get(siteId)
}

function loadPersistedCookies() {
  try {
    const raw = (process.env.ZHIHU_COOKIES || '').trim()
    if (!raw) return
    const map = JSON.parse(raw)
    if (!map || typeof map !== 'object') return
    for (const [siteId, cookies] of Object.entries(map)) {
      if (typeof cookies === 'string' && cookies) {
        const sess = getSiteSession(siteId)
        sess.cookies = cookies
        sess.initialized = true
        LOG(`${siteId} 从 .env 加载已持久化 cookies (${cookies.length}B)`)
      }
    }
  } catch (e) {
    LOG(`加载持久化 ZHIHU_COOKIES 失败: ${e.message}`)
  }
}

async function persistCookies() {
  const map = {}
  for (const [siteId, sess] of siteSessions) {
    if (sess.cookies) map[siteId] = sess.cookies
  }
  const val = JSON.stringify(map)
  try {
    const content = await fs.readFile(ENV_PATH, 'utf-8')
    const updated = content.match(/^ZHIHU_COOKIES=.*$/m)
      ? content.replace(/^ZHIHU_COOKIES=.*$/m, `ZHIHU_COOKIES=${val}`)
      : content + `\nZHIHU_COOKIES=${val}\n`
    if (updated !== content) {
      await fs.writeFile(ENV_PATH, updated, 'utf-8')
      LOG(`ZHIHU_COOKIES 已持久化到 .env (${Object.keys(map).length} 个站点)`)
    }
  } catch (e) {
    LOG(`持久化 ZHIHU_COOKIES 失败: ${e.message}`)
  }
}

loadPersistedCookies()

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

// ---- 检测 HTML 响应是否包含 cookie 挑战脚本 ----
function extractScriptBlock(html) {
  const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi)
  if (!m) return []
  return m.map((tag) => tag.replace(/<\/?script[^>]*>/gi, ''))
}

function isCookieChallengeScript(scriptBody) {
  return /function\s+setCookie/i.test(scriptBody) && /sec_defend/i.test(scriptBody)
}

function computeChallengeCookies(scriptBody) {
  if (!scriptBody) return null
  const sandbox = {
    cookiePairs: [],
    get document() { return sandbox },
    get cookie() {
      return sandbox.cookiePairs.map(([k, v]) => `${k}=${escape(v || '').replace(/\+/g, '%2B')}`).join('; ')
    },
    set cookie(val) {
      const eq = val.indexOf('=')
      if (eq > 0) {
        const k = val.slice(0, eq).trim()
        const v = val.slice(eq + 1).split(';')[0].trim()
        try { sandbox.cookiePairs.push([k, unescape(v)]) } catch { sandbox.cookiePairs.push([k, v]) }
      }
    },
    escape: (s) => String(s),
    unescape: (s) => String(s),
    Date: Date,
    RegExp: RegExp,
    window: {
      get location() { return sandbox.window },
      get href() { return '' },
      set href(_v) {},
      reload() {},
    },
    self: undefined,
    top: undefined,
    globalThis: undefined,
  }
  try {
    const ctx = vm.createContext(sandbox)
    vm.runInContext(scriptBody, ctx, { timeout: 3000 })
  } catch (e) {
    if (sandbox.cookiePairs.length > 0) {
      LOG(`cookie 脚本尾部报错（cookie 已收集 ${sandbox.cookiePairs.length} 条）: ${e.message}`)
    } else {
      LOG(`cookie 脚本执行失败: ${e.message}`)
      return null
    }
  }
  const result = sandbox.cookiePairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('; ')
  if (!result) return null
  LOG(`脚本计算得到 cookies (${sandbox.cookiePairs.length}条): ${result}`)
  return result
}

// ---- 从 HTML 中尝试提取 cookie（meta + script） ----
function isHtmlResponse(rawBody) {
  const head = String(rawBody || '').slice(0, 200).toLowerCase()
  return head.includes('<html') || head.includes('<script')
}

function isUpstreamError(rawBody) {
  return /请求上游失败/i.test(String(rawBody || ''))
}

function maybeThrowUpstreamError(siteId, rawBody) {
  if (isUpstreamError(rawBody)) {
    LOG(`${siteId} 上游返回错误页面: 请求上游失败`)
    throw Object.assign(
      new Error(`站点「${getSite(siteId)?.name || siteId}」请求上游失败，建议更换路线`),
      { code: 'upstream_error' }
    )
  }
}

function applyHtmlChallengeCookies(siteId, rawBody) {
  const sess = getSiteSession(siteId)
  let updated = false

  const metaReg = /<meta\s+http-equiv\s*=\s*["']set-cookie["'][^>]*content\s*=\s*["']([^"']+)["']/gi
  let metaMatch
  const metaCookies = []
  while ((metaMatch = metaReg.exec(rawBody)) !== null) {
    metaCookies.push(metaMatch[1])
  }
  if (metaCookies.length > 0) {
    sess.cookies = mergeCookies(sess.cookies, metaCookies)
    updated = true
    LOG(`${siteId} 从 HTML meta set-cookie 提取到 ${metaCookies.length} 条`)
  }

  const scripts = extractScriptBlock(rawBody)
  for (const scriptBody of scripts) {
    if (isCookieChallengeScript(scriptBody)) {
      const result = computeChallengeCookies(scriptBody)
      if (result) {
        sess.cookies = mergeCookies(sess.cookies, [result])
        updated = true
        LOG(`${siteId} 从 script cookie 挑战提取成功`)
      }
    }
  }

  if (updated) {
    LOG(`${siteId} 更新后 cookies: ${sess.cookies}`)
    persistCookies().catch(() => {})
  }
  return updated
}

// ---- 初始化站点会话 ----
async function initSiteSession(siteId) {
  const sess = getSiteSession(siteId)
  if (sess.initialized && sess.cookies) return sess

  const site = getSite(siteId)
  if (!site) throw new Error(`未知站点: ${siteId}`)

  LOG(`初始化站点会话: ${siteId} -> ${site.url}`)

  const resp = await fetch(site.url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(ZHIHU_TIMEOUT),
    ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
  })

  LOG(`${siteId} 初始化响应: HTTP ${resp.status}`)

  let cookies = ''
  const setCookie = resp.headers.getSetCookie?.()
  if (setCookie) {
    cookies = mergeCookies(cookies, setCookie)
  }

  const html = await resp.text()
  sess.cookies = cookies

  applyHtmlChallengeCookies(siteId, html)

  sess.initialized = true
  LOG(`${siteId} 会话初始化完成, cookies: ${sess.cookies}`)
  if (sess.cookies) persistCookies().catch(() => {})
  return sess
}

// ---- 统一请求入口 ----
async function zhihuFetch(siteId, urlPath, opts = {}) {
  const baseUrl = getBaseUrl(siteId)
  if (!baseUrl) throw new Error(`未知站点: ${siteId}`)

  await initSiteSession(siteId)
  const sess = getSiteSession(siteId)

  const fullUrl = urlPath.startsWith('http') ? urlPath : `${baseUrl}${urlPath}`
  const headers = {
    'User-Agent': UA,
    Accept: opts.accept || '*/*',
    Pragma: 'no-cache',
    'Cache-Control': 'no-cache',
    Referer: baseUrl,
    ...(opts.headers || {}),
  }
  if (sess.cookies) headers['Cookie'] = sess.cookies

  const method = (opts.method || 'GET').toUpperCase()
  LOG(`HTTP ${method} ${fullUrl}`)

  const resp = await fetch(fullUrl, {
    ...opts,
    headers,
    redirect: 'follow',
    signal: opts.signal || AbortSignal.timeout(ZHIHU_TIMEOUT),
    ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
  })

  LOG(`HTTP ${resp.status} ${method} ${fullUrl}`)

  const setCookie = resp.headers.getSetCookie?.()
  if (setCookie) {
    sess.cookies = mergeCookies(sess.cookies, setCookie)
    persistCookies().catch(() => {})
  }

  return resp
}

function classifyFetchError(e) {
  const msg = (e.message || '').toLowerCase()
  if (/timeout|abort|timed out/i.test(msg)) return 'timeout'
  if (/fetch|network|econn|enotfound|dns|socket|econnrefused|econnreset|enetunreach|etimedout/i.test(msg)) return 'network'
  if (/5\d{2}/.test(msg)) return 'server_error'
  return 'unknown'
}

// ---- E2EE 协议（站点三/四/五）：MD5 签名，无 cookie ----
function e2eeSign(queryStr) {
  return crypto.createHash('md5').update(queryStr + ZHIHU_SEK).digest('hex')
}

function e2eeQuerySearchUrl(siteId, keyword) {
  const baseUrl = getBaseUrl(siteId)
  const name = keyword.trim()
  const type = '0'
  const time = String(Date.now())
  const rawParams = `command=${ZHIHU_TOKEN}&name=${name}&type=${type}&time=${time}`
  const sign = e2eeSign(rawParams)
  const urlParams = `command=${encodeURIComponent(ZHIHU_TOKEN)}&name=${encodeURIComponent(name)}&type=${type}&time=${time}&sign=${sign}`
  return `${baseUrl}/api/query?${urlParams}`
}

function e2eeQueryParseUrl(siteId, url) {
  const baseUrl = getBaseUrl(siteId)
  const name = url.trim()
  const type = '1'
  const time = String(Date.now())
  const rawParams = `command=${ZHIHU_TOKEN}&name=${name}&type=${type}&time=${time}`
  const sign = e2eeSign(rawParams)
  const urlParams = `command=${encodeURIComponent(ZHIHU_TOKEN)}&name=${encodeURIComponent(name)}&type=${type}&time=${time}&sign=${sign}`
  return `${baseUrl}/api/query?${urlParams}`
}

function e2eeDetailUrl(siteId, id) {
  const baseUrl = getBaseUrl(siteId)
  const time = String(Date.now())
  const rawParams = `id=${id}&time=${time}`
  const sign = e2eeSign(rawParams)
  return `${baseUrl}/api/datail?id=${encodeURIComponent(id)}&time=${time}&sign=${sign}`
}

function cleanBrTags(text) {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\n/g, '\n')
}

function parseE2eeResponse(rawBody) {
  let outer
  try {
    outer = JSON.parse(rawBody)
  } catch (e) {
    LOG(`E2EE JSON 解析失败 (${rawBody.length}B):`)
    LOG(rawBody)
    throw Object.assign(
      new Error('E2EE 响应格式异常，已记录到服务端日志'),
      { code: 'upstream_error' }
    )
  }
  if (!outer.stat || outer.code !== 1) {
    LOG(`E2EE 返回业务错误: stat=${outer.stat} code=${outer.code} message="${outer.message || ''}"`)
    throw Object.assign(
      new Error(outer.message || 'E2EE 返回异常'),
      { code: 'upstream_error' }
    )
  }
  const innerStr = outer.data
  if (!innerStr || typeof innerStr !== 'string') {
    LOG(`E2EE 内层 data 为空或非字符串: ${typeof innerStr}`)
    throw Object.assign(new Error('E2EE 返回数据为空'), { code: 'upstream_error' })
  }
  let inner
  try {
    inner = JSON.parse(innerStr)
  } catch (e) {
    LOG(`E2EE 内层 JSON 解析失败 (${innerStr.length}B):`)
    LOG(innerStr)
    throw Object.assign(
      new Error('E2EE 响应格式异常，已记录到服务端日志'),
      { code: 'upstream_error' }
    )
  }
  const list = Array.isArray(inner.data) ? inner.data : []
  return list.map((item) => ({
    name: String(item.name || ''),
    author: String(item.author || ''),
    bookId: String(item.id || ''),
    intro: cleanBrTags(String(item.text || item.intro || '')),
  }))
}

async function e2eeFetch(siteId, url, opts = {}) {
  const baseUrl = getBaseUrl(siteId)
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`
  const headers = {
    'User-Agent': UA,
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache',
    Referer: `${baseUrl}/index.html`,
    ...(opts.headers || {}),
  }

  LOG(`HTTP GET ${fullUrl}`)
  const resp = await fetch(fullUrl, {
    headers,
    signal: opts.signal || AbortSignal.timeout(ZHIHU_TIMEOUT),
    ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
  })
  LOG(`HTTP ${resp.status} GET ${fullUrl}`)
  return resp
}

async function e2eeSearch(siteId, keyword) {
  const url = e2eeQuerySearchUrl(siteId, keyword)
  const resp = await e2eeFetch(siteId, url)
  const rawBody = await resp.text().catch(() => '')
  LOG(`E2EE 搜索响应 (${rawBody.length}B):`)
  LOG(rawBody)
  if (!resp.ok) {
    throw Object.assign(
      new Error(`站点「${getSite(siteId)?.name || siteId}」返回异常 HTTP ${resp.status}`),
      { code: 'upstream_error' }
    )
  }
  const results = parseE2eeResponse(rawBody)
  LOG(`E2EE 搜索完成: ${results.length} 条`)
  return results
}

async function e2eeParse(siteId, zhihuUrl) {
  const url = e2eeQueryParseUrl(siteId, zhihuUrl)
  const resp = await e2eeFetch(siteId, url)
  const rawBody = await resp.text().catch(() => '')
  LOG(`E2EE 解析响应 (${rawBody.length}B):`)
  LOG(rawBody)
  if (!resp.ok) {
    throw Object.assign(
      new Error(`站点「${getSite(siteId)?.name || siteId}」返回异常 HTTP ${resp.status}`),
      { code: 'upstream_error' }
    )
  }
  const results = parseE2eeResponse(rawBody)
  const text = results.map((r) => r.intro).join('\n\n').trim()
  if (!text) throw Object.assign(new Error('站点返回空结果'), { code: 'upstream_error' })
  return { content: text, raw: false }
}

async function e2eeFetchDetail(siteId, id) {
  const url = e2eeDetailUrl(siteId, id)
  const resp = await e2eeFetch(siteId, url)
  const rawBody = await resp.text().catch(() => '')
  if (!resp.ok) {
    LOG(`E2EE 详情失败 HTTP ${resp.status}`)
    LOG(rawBody)
    return null
  }
  try {
    const outer = JSON.parse(rawBody)
    if (!outer.stat || outer.code !== 1) return null
    const inner = JSON.parse(outer.data)
    const list = Array.isArray(inner.data) ? inner.data : []
    if (list.length === 0) return null
    return cleanBrTags(list[0].text || list[0].intro || '')
  } catch {
    return null
  }
}

function isE2eeSite(siteId) {
  const site = getSite(siteId)
  return site?.type === 'e2ee'
}

// ---- 搜索（带 cookie 挑战重试 + DB 持久化） ----
async function doSearchRequest(siteId, keyword, retryCount) {
  const params = new URLSearchParams({
    type: 'name',
    keyword: keyword.trim(),
    token: ZHIHU_TOKEN,
  })

  const resp = await zhihuFetch(siteId, `/api/search?${params.toString()}`)
  const rawBody = await resp.text().catch(() => '')

  if (!resp.ok) {
    LOG(`搜索失败 HTTP ${resp.status}`)
    LOG(rawBody)
    throw new Error(`搜索失败: HTTP ${resp.status}`)
  }

  maybeThrowUpstreamError(siteId, rawBody)

  let data
  try {
    data = JSON.parse(rawBody)
  } catch {
    if (retryCount < 2 && isHtmlResponse(rawBody)) {
      LOG(`搜索返回 HTML (${rawBody.length}B)，尝试提取 cookie 挑战...`)
      if (applyHtmlChallengeCookies(siteId, rawBody)) {
        LOG(`cookie 已更新，重试搜索 (第${retryCount + 1}次)`)
        return doSearchRequest(siteId, keyword, retryCount + 1)
      }
      LOG(`HTML 中未发现 cookie 挑战脚本，无法自动重试`)
    }
    LOG(`搜索响应不是合法 JSON，原始响应体 (${rawBody.length}B):`)
    LOG(rawBody)
    throw new Error(`搜索响应格式异常，已记录到服务端日志`)
  }

  if (data.code !== 0) {
    throw new Error(data.msg || '搜索返回异常')
  }

  const list = Array.isArray(data.data) ? data.data : []
  LOG(`搜索完成: ${list.length} 条结果`)
  return list.map((item) => ({
    name: String(item.name || ''),
    author: String(item.author || ''),
    bookId: String(item.bookid || ''),
    intro: String(item.intro || ''),
  }))
}

export async function searchZhihu(account, siteId, keyword) {
  const baseUrl = getBaseUrl(siteId)
  if (!baseUrl) throw new Error(`未知站点: ${siteId}`)

  LOG(`搜索: siteId=${siteId}, keyword="${keyword}", type=${getSite(siteId)?.type}`)

  const now = dbNow()
  const maxAge = now - 5 * 60 * 1000
  q.cleanExpiredZhihuSearches.run(maxAge)

  const cached = q.getZhihuSearches.all(account, keyword.trim())
  if (cached.length > 0) {
    LOG(`搜索缓存命中: ${cached.length} 条`)
    return cached.map((r) => ({
      name: r.name,
      author: r.author || '',
      bookId: r.book_id || '',
      intro: r.intro || '',
    }))
  }

  const results = isE2eeSite(siteId)
    ? await e2eeSearch(siteId, keyword)
    : await doSearchRequest(siteId, keyword, 0)

  for (const item of results) {
    q.insertZhihuSearch.run(
      `${account}_${keyword.trim()}_${item.name}`,
      account,
      siteId,
      keyword.trim(),
      item.name,
      item.author,
      item.bookId,
      item.intro,
      now
    )
  }

  return results
}

// ---- 解析知乎链接（带 cookie 挑战重试） ----
async function doParseRequest(siteId, zhihuUrl, retryCount) {
  const params = new URLSearchParams({
    type: 'url',
    q: zhihuUrl.trim(),
    token: ZHIHU_TOKEN,
  })

  const resp = await zhihuFetch(siteId, `/read?${params.toString()}`)
  const html = await resp.text().catch(() => '')

  if (!resp.ok) {
    LOG(`解析失败 HTTP ${resp.status}`)
    LOG(html)
    throw new Error(`解析失败: HTTP ${resp.status}`)
  }

  maybeThrowUpstreamError(siteId, html)

  const contentMatch = html.match(/<article[^>]*id=["']readerContent["'][^>]*>([\s\S]*?)<\/article>/i)
  if (!contentMatch) {
    if (retryCount < 2 && isHtmlResponse(html)) {
      LOG(`解析返回无 readerContent，检查是否为 cookie 挑战...`)
      if (applyHtmlChallengeCookies(siteId, html)) {
        LOG(`cookie 已更新，重试解析 (第${retryCount + 1}次)`)
        return doParseRequest(siteId, zhihuUrl, retryCount + 1)
      }
    }
    LOG('未找到 readerContent 元素，返回原始 HTML (前5000字符)')
    LOG(html.slice(0, 5000))
    return { content: html.slice(0, 5000), raw: true }
  }

  const content = contentMatch[1]
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()

  LOG(`解析完成: ${content.length} 字符`)
  return { content, raw: false }
}

export async function parseZhihu(account, siteId, zhihuUrl) {
  const baseUrl = getBaseUrl(siteId)
  if (!baseUrl) throw new Error(`未知站点: ${siteId}`)

  LOG(`解析: siteId=${siteId}, url=${zhihuUrl}, type=${getSite(siteId)?.type}`)

  const cached = q.getZhihuParsedByUrl.get(account, zhihuUrl.trim())
  if (cached) {
    const preview = cached.preview || ''
    LOG(`解析缓存命中: contentId=${cached.id}, 全文${cached.full_content.length}字符`)
    return {
      preview,
      fullLength: cached.full_content.length,
      contentId: cached.id,
      title: cached.title || '',
    }
  }

  const now = dbNow()
  const result = isE2eeSite(siteId)
    ? await e2eeParse(siteId, zhihuUrl)
    : await doParseRequest(siteId, zhihuUrl, 0)
  const PREVIEW_LENGTH = 500
  const preview = result.content.slice(0, PREVIEW_LENGTH)
  const contentId = `${account}_${randomId()}`

  const title = zhihuUrl.slice(Math.max(0, zhihuUrl.lastIndexOf('/') - 40)).slice(0, 60) || '知乎正文'

  q.insertZhihuParsed.run(
    contentId,
    account,
    siteId,
    zhihuUrl.trim(),
    title,
    preview,
    result.content,
    now
  )

  LOG(`解析已持久化: contentId=${contentId}, 全文${result.content.length}字符, 预览${preview.length}字符`)
  return {
    preview,
    fullLength: result.content.length,
    contentId,
    title,
  }
}

// ---- 挂载路由 ----
export function mountRoutes(app, services) {
  const { requireUser, requireJobQuota, consumeJobCredit } = services

  app.get('/api/zhihu/sites', requireUser, (_req, res) => {
    res.json({
      items: SITES.map(({ id, name }) => ({ id, name })),
    })
  })

  app.post('/api/zhihu/search', requireUser, async (req, res) => {
    const siteId = String(req.body?.siteId || '').trim()
    const keyword = String(req.body?.keyword || '').trim()
    const account = String(req.user?.username || 'anon')

    if (!siteId || !getSite(siteId)) {
      return res.status(400).json({
        error: 'bad_site',
        message: '请选择有效站点',
        nextSiteId: SITES[0].id,
        nextSiteName: SITES[0].name,
      })
    }
    if (!keyword || keyword.length > 200) {
      return res.status(400).json({ error: 'bad_keyword', message: '请输入有效关键词（不超过200字）' })
    }

    try {
      const result = await searchZhihu(account, siteId, keyword)
      res.json({ siteId, items: result, total: result.length })
    } catch (e) {
      const errType = e.code === 'upstream_error' ? 'upstream_error' : classifyFetchError(e)
      const nextSite = pickNextSite(siteId)
      LOG(`搜索异常 siteId=${siteId}: ${e.message} (${errType})`)

      if (errType === 'timeout' || errType === 'network' || errType === 'upstream_error') {
        return res.status(502).json({
          error: 'network_error',
          errType,
          message: e.message || `站点「${getSite(siteId)?.name || siteId}」不可用`,
          currentSiteId: siteId,
          nextSiteId: nextSite.id,
          nextSiteName: nextSite.name,
        })
      }

      res.status(502).json({
        error: 'search_failed',
        message: e.message || '搜索失败',
        currentSiteId: siteId,
        nextSiteId: nextSite.id,
        nextSiteName: nextSite.name,
      })
    }
  })

  app.post('/api/zhihu/parse', requireUser, async (req, res) => {
    const siteId = String(req.body?.siteId || '').trim()
    const zhihuUrl = String(req.body?.url || '').trim()
    const account = String(req.user?.username || 'anon')

    if (!siteId || !getSite(siteId)) {
      return res.status(400).json({
        error: 'bad_site',
        message: '请选择有效站点',
        nextSiteId: SITES[0].id,
        nextSiteName: SITES[0].name,
      })
    }
    if (!zhihuUrl || !/^https?:\/\/.+/i.test(zhihuUrl)) {
      return res.status(400).json({ error: 'bad_url', message: '请输入有效链接' })
    }

    try {
      const result = await parseZhihu(account, siteId, zhihuUrl)
      res.json({ siteId, ...result })
    } catch (e) {
      const errType = e.code === 'upstream_error' ? 'upstream_error' : classifyFetchError(e)
      const nextSite = pickNextSite(siteId)
      LOG(`解析异常 siteId=${siteId}: ${e.message} (${errType})`)

      if (errType === 'timeout' || errType === 'network' || errType === 'upstream_error') {
        return res.status(502).json({
          error: 'network_error',
          errType,
          message: e.message || `站点「${getSite(siteId)?.name || siteId}」不可用`,
          currentSiteId: siteId,
          nextSiteId: nextSite.id,
          nextSiteName: nextSite.name,
        })
      }

      res.status(502).json({
        error: 'parse_failed',
        message: e.message || '解析失败',
        currentSiteId: siteId,
        nextSiteId: nextSite.id,
        nextSiteName: nextSite.name,
      })
    }
  })

  app.get('/api/zhihu/download/:contentId', requireUser, requireJobQuota, (req, res) => {
    const contentId = String(req.params.contentId || '').trim()
    if (!contentId) {
      return res.status(400).json({ error: 'bad_id', message: '缺少内容 ID' })
    }

    const row = q.getZhihuParsed.get(contentId)
    if (!row) {
      return res.status(404).json({ error: 'not_found', message: '内容不存在或已过期' })
    }

    const account = String(req.user?.username || '')
    const isAuthDisabled = process.env.AUTH_DISABLED === '1'
    if (!isAuthDisabled && account && row.account !== account) {
      return res.status(403).json({ error: 'forbidden', message: '无权访问该内容' })
    }

    const deducted = consumeJobCredit(req.user.id)
    if (!deducted) {
      LOG(`扣减下载次数失败: user=${req.user.username} userId=${req.user.id}`)
      return res.status(403).json({ error: 'no_downloads', message: '下载次数已用完，请使用卡密充值' })
    }

    LOG(`下载全文(扣次数): user=${req.user.username} contentId=${contentId}`)

    const cleanContent = cleanBrTags(row.full_content || '')
    const safeName = (row.title || 'zhihu_content').replace(/[\\/:*?"<>|]/g, '_')
    const fileName = `${safeName}.txt`
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    res.setHeader('Content-Length', Buffer.byteLength(cleanContent, 'utf-8'))
    res.send(cleanContent)
  })
}
