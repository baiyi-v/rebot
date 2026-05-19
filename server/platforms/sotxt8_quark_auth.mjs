/**
 * sotxt8 夸克网盘自动授权模块
 *
 * 当 api_search_guard.php 返回 403 未授权时，自动完成以下流程：
 * 1. 从 index.php 提取夸克分享链接
 * 2. 使用 Puppeteer 登录夸克网盘并下载 zip 文件
 * 3. 解压 zip 提取出口令
 * 4. 在 index.php 上提交口令完成授权
 */

import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUPPETEER_CACHE_DIR = path.resolve(__dirname, '..', '..', 'node_modules', '.cache', 'puppeteer', 'quark')
const QUARK_USER_DATA_DIR = path.join(PUPPETEER_CACHE_DIR, 'browser_profile')
const QUARK_COOKIES_FILE = path.join(PUPPETEER_CACHE_DIR, 'quark_cookies.json')
const QUARK_DOWNLOADS_DIR = path.join(PUPPETEER_CACHE_DIR, 'downloads')

const BASE = 'https://sotxt8.com'
const QUARK_BASE = 'https://pan.quark.cn'

let puppeteerModule = null
async function getPuppeteer() {
  if (!puppeteerModule) {
    try {
      puppeteerModule = await import('puppeteer')
    } catch {
      try {
        puppeteerModule = await import('puppeteer-core')
      } catch {
        throw new Error('puppeteer 不可用，请确保已安装 puppeteer')
      }
    }
  }
  return puppeteerModule
}

const LOG = (...a) => console.log('[sotxt8:quark]', ...a)

// ---- 夸克授权状态（供 sotxt8.mjs 查询） ----
const quarkAuthState = {
  status: 'idle',
  completedAt: 0,
  error: '',
}

export function getQuarkAuthState() {
  return { ...quarkAuthState }
}

// ---- 从 index.php HTML 提取夸克分享链接 ----
export function extractQuarkLink(html) {
  const idPattern = /<a\s[^>]*?\bid\s*=\s*["']latestAuthLinkButton["'][^>]*>/i
  const aMatch = html.match(idPattern)

  if (!aMatch) {
    LOG('未找到 id="latestAuthLinkButton" 元素')
    return null
  }

  const tag = aMatch[0]

  const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i)
  if (hrefMatch) {
    const href = hrefMatch[1]
    LOG(`从 href 提取到夸克链接: ${href}`)
    if (href.includes('pan.quark.cn')) return href
  }

  const fallbackMatch = tag.match(/data-fallback-url\s*=\s*["']([^"']+)["']/i)
  if (fallbackMatch) {
    const fb = fallbackMatch[1]
    LOG(`从 data-fallback-url 提取到夸克链接: ${fb}`)
    if (fb.includes('pan.quark.cn')) return fb
  }

  LOG('未能从 latestAuthLinkButton 元素中提取夸克链接')
  return null
}

// ---- 夸克网盘 Cookie 持久化 ----
async function loadQuarkCookies() {
  try {
    const raw = await fs.readFile(QUARK_COOKIES_FILE, 'utf-8')
    const arr = JSON.parse(raw)
    if (Array.isArray(arr) && arr.length > 0) {
      LOG(`加载夸克 cookies: ${arr.length} 条`)
      return arr
    }
  } catch {
    // 文件不存在或解析失败
  }
  return null
}

async function saveQuarkCookies(cookies) {
  try {
    await fs.mkdir(PUPPETEER_CACHE_DIR, { recursive: true })
    await fs.writeFile(QUARK_COOKIES_FILE, JSON.stringify(cookies, null, 2), 'utf-8')
    LOG(`夸克 cookies 已保存: ${cookies.length} 条`)
  } catch (e) {
    LOG(`保存夸克 cookies 失败: ${e.message}`)
  }
}

// ---- 夸克网盘登录 ----
async function quarkLogin(page) {
  LOG('检查夸克网盘登录状态...')

  await page.goto(QUARK_BASE, { waitUntil: 'networkidle2', timeout: 30000 })

  const currentUrl = page.url()
  LOG(`当前 URL: ${currentUrl}`)

  if (!currentUrl.includes('login') && !currentUrl.includes('passport')) {
    const isLoggedIn = await page.evaluate(() => {
      const el = document.querySelector('.user-info, .user-name, [class*="avatar"], .header-user')
      return !!el
    })
    if (isLoggedIn) {
      LOG('夸克网盘已登录（通过元素检测）')
      return true
    }
  }

  const username = (process.env.QUARK_USERNAME || '').trim()
  const password = (process.env.QUARK_PASSWORD || '').trim()

  if (!username || !password) {
    LOG('缺少 QUARK_USERNAME 或 QUARK_PASSWORD 环境变量，无法自动登录')
    return false
  }

  LOG('开始在夸克网盘登录...')

  try {
    await page.waitForSelector('input[placeholder*="手机"], input[type="tel"], input[name="phone"], input[name="account"]', {
      timeout: 5000,
    })
  } catch {
    try {
      const switchLink = await page.$('a:has-text("密码登录"), span:has-text("密码登录"), div:has-text("密码登录")')
      if (switchLink) {
        await switchLink.click()
        await new Promise((r) => setTimeout(r, 1000))
      }
    } catch { /* ignore */ }
  }

  const phoneInput = await page.$('input[placeholder*="手机"], input[type="tel"], input[name="phone"], input[name="account"]')
  if (phoneInput) {
    await phoneInput.click()
    await phoneInput.type(username, { delay: 80 })
    LOG('已输入手机号')
  } else {
    LOG('未找到手机号输入框')
  }

  const pwInputSel = 'input[type="password"], input[placeholder*="密码"], input[name="password"]'
  try {
    await page.waitForSelector(pwInputSel, { timeout: 3000 })
    const pwInput = await page.$(pwInputSel)
    if (pwInput) {
      await pwInput.click()
      await pwInput.type(password, { delay: 60 })
      LOG('已输入密码')
    }
  } catch {
    LOG('未找到密码输入框，可能需要短信验证')
  }

  const submitSel = 'button[type="submit"], button:has-text("登录"), button:has-text("登 录"), .login-btn, [class*="login"] button'
  try {
    await page.waitForSelector(submitSel, { timeout: 3000 })
    await page.click(submitSel)
    LOG('已点击登录按钮')
  } catch {
    LOG('未找到登录按钮')
  }

  await new Promise((r) => setTimeout(r, 5000))

  const afterUrl = page.url()
  if (!afterUrl.includes('login') && !afterUrl.includes('passport')) {
    LOG('夸克网盘登录成功')
    const cookies = await page.cookies()
    await saveQuarkCookies(cookies)
    return true
  }

  LOG('夸克网盘登录状态未能确认，继续尝试...')
  return false
}

// ---- 从夸克分享页下载文件 ----
async function downloadFromQuarkShare(page, shareUrl) {
  LOG(`访问夸克分享页: ${shareUrl}`)
  await page.goto(shareUrl, { waitUntil: 'networkidle2', timeout: 30000 })

  await new Promise((r) => setTimeout(r, 2000))

  const currentUrl = page.url()
  LOG(`当前页面 URL: ${currentUrl}`)

  if (currentUrl.includes('login') || currentUrl.includes('passport')) {
    LOG('需要登录才能访问分享页')
    const loggedIn = await quarkLogin(page)
    if (!loggedIn) {
      throw new Error('夸克网盘登录失败，无法下载文件')
    }
    LOG('登录完成，重新访问分享页...')
    await page.goto(shareUrl, { waitUntil: 'networkidle2', timeout: 30000 })
    await new Promise((r) => setTimeout(r, 2000))
  }

  const needCode = await page.evaluate(() => {
    return !!document.querySelector('input[placeholder*="提取码"], input[placeholder*="密码"], .extract-code, .access-code')
  })

  if (needCode) {
    const sharePwd = (process.env.QUARK_SHARE_PASSWORD || '').trim()
    if (sharePwd) {
      LOG('分享需要提取码，使用环境变量 QUARK_SHARE_PASSWORD')
      const codeInput = await page.$('input[placeholder*="提取码"], input[placeholder*="密码"]')
      if (codeInput) {
        await codeInput.type(sharePwd, { delay: 50 })
        const submitBtn = await page.$('button:has-text("提取"), button:has-text("确认"), button:has-text("提交")')
        if (submitBtn) {
          await submitBtn.click()
          await new Promise((r) => setTimeout(r, 2000))
        }
      }
    } else {
      LOG('分享需要提取码但未配置 QUARK_SHARE_PASSWORD')
    }
  }

  // 清理下载目录
  try {
    await fs.mkdir(QUARK_DOWNLOADS_DIR, { recursive: true })
  } catch { /* ignore */ }

  const existingFiles = await fs.readdir(QUARK_DOWNLOADS_DIR).catch(() => [])
  const filesBefore = new Set(existingFiles)

  // 尝试点击全选
  try {
    const selectAllBtn = await page.$('.select-all, [class*="selectAll"], input[type="checkbox"][class*="all"]')
    if (selectAllBtn) {
      await selectAllBtn.click()
      await new Promise((r) => setTimeout(r, 500))
      LOG('已点击全选')
    }
  } catch { /* ignore */ }

  // 校验文件日期是否为当天
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  LOG(`当天日期: ${todayStr}`)

  const fileRow = await page.evaluate((todayDate) => {
    const cells = document.querySelectorAll('td.td-file.td-file-sort.ant-table-row-cell-break-word')
    for (const cell of cells) {
      const text = (cell.textContent || '').trim()
      if (text.startsWith(todayDate)) {
        return { found: true, text }
      }
    }
    return { found: false, texts: Array.from(cells).map(c => c.textContent?.trim()) }
  }, todayStr)

  if (fileRow.found) {
    LOG(`找到当天文件: ${fileRow.text}`)
  } else {
    const allDates = fileRow.texts || []
    LOG(`未找到当天文件。页面上所有日期: ${JSON.stringify(allDates)}，将跳过日期校验继续尝试`)
  }

  // 找到并点击下载按钮
  const downloadSelectors = [
    '.share-download',
    'div.share-download',
    'button:has-text("下载")',
    '.download-btn',
    '[class*="download"] button',
    'a:has-text("下载")',
    '.btn-download',
    '[data-action="download"]',
    'button[class*="download"]',
  ]

  let clicked = false
  for (const sel of downloadSelectors) {
    try {
      const btn = await page.$(sel)
      if (btn) {
        const isVisible = await btn.boundingBox()
        if (isVisible) {
          LOG(`点击下载按钮: ${sel}`)
          await btn.click()
          clicked = true
          break
        }
      }
    } catch { /* try next */ }
  }

  if (!clicked) {
    LOG('未找到下载按钮，尝试右键或长按触发下载菜单')
    try {
      const fileItem = await page.$('.file-item, .file-list-item, [class*="fileItem"], [class*="file-item"]')
      if (fileItem) {
        await fileItem.click({ button: 'right' })
        await new Promise((r) => setTimeout(r, 1000))
        const menuDownload = await page.$('li:has-text("下载"), div:has-text("下载"), .menu-item:has-text("下载")')
        if (menuDownload) {
          await menuDownload.click()
          clicked = true
          LOG('通过右键菜单点击下载')
        }
      }
    } catch { /* ignore */ }
  }

  // 等待下载完成
  LOG('等待下载完成...')
  await new Promise((r) => setTimeout(r, 15000))

  const afterFiles = await fs.readdir(QUARK_DOWNLOADS_DIR).catch(() => [])
  const newFiles = afterFiles.filter((f) => !filesBefore.has(f) && !f.endsWith('.crdownload') && !f.endsWith('.tmp'))

  if (newFiles.length > 0) {
    LOG(`下载完成，新文件: ${newFiles.join(', ')}`)
    const zipFile = newFiles.find((f) => f.toLowerCase().endsWith('.zip'))
    if (zipFile) {
      return path.join(QUARK_DOWNLOADS_DIR, zipFile)
    }
    return path.join(QUARK_DOWNLOADS_DIR, newFiles[0])
  }

  LOG('未检测到新下载的文件，检查浏览器下载...')
  await new Promise((r) => setTimeout(r, 10000))
  const retryFiles = await fs.readdir(QUARK_DOWNLOADS_DIR).catch(() => [])
  const retryNew = retryFiles.filter((f) => !filesBefore.has(f) && !f.endsWith('.crdownload') && !f.endsWith('.tmp'))

  if (retryNew.length > 0) {
    LOG(`二次检测到新文件: ${retryNew.join(', ')}`)
    const zipFile = retryNew.find((f) => f.toLowerCase().endsWith('.zip'))
    return zipFile ? path.join(QUARK_DOWNLOADS_DIR, zipFile) : path.join(QUARK_DOWNLOADS_DIR, retryNew[0])
  }

  throw new Error('夸克网盘下载未检测到文件')
}

// ---- 解压 zip 并提取口令 ----
async function extractAuthCodeFromZip(zipPath) {
  LOG(`解压 zip: ${zipPath}`)
  const extractDir = path.join(QUARK_DOWNLOADS_DIR, '_extracted')

  try {
    await fs.rm(extractDir, { recursive: true, force: true })
  } catch { /* ignore */ }
  await fs.mkdir(extractDir, { recursive: true })

  if (process.platform === 'win32') {
    try {
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, {
        encoding: 'utf-8',
        timeout: 30000,
        stdio: 'pipe',
      })
      LOG('PowerShell Expand-Archive 解压完成')
    } catch (e) {
      LOG(`PowerShell 解压失败: ${e.message}，尝试 tar...`)
      execSync(`tar -xf "${zipPath}" -C "${extractDir}"`, {
        encoding: 'utf-8',
        timeout: 30000,
        stdio: 'pipe',
      })
      LOG('tar 解压完成')
    }
  } else {
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: 'pipe',
    })
    LOG('unzip 解压完成')
  }

  // 递归查找文件内容中的口令
  const files = await walkFiles(extractDir)
  LOG(`解压得到 ${files.length} 个文件`)

  for (const f of files) {
    try {
      const content = await fs.readFile(f, 'utf-8')
      const code = extractCodeFromContent(content)
      if (code) {
        LOG(`从文件 ${path.basename(f)} 中提取到口令: ${code}`)
        return code
      }

      // 从文件名也可能提取
      const basename = path.basename(f, path.extname(f))
      const nameCode = extractCodeFromContent(basename)
      if (nameCode) {
        LOG(`从文件名 ${basename} 中提取到口令: ${nameCode}`)
        return nameCode
      }
    } catch {
      // 二进制文件跳过
    }
  }

  LOG('未能从解压文件中提取到口令')
  return null
}

function extractCodeFromContent(text) {
  if (!text) return null

  const patterns = [
    /授权码[：:=\s]*([\u4e00-\u9fff\w]{2,20})/,
    /口令[：:=\s]*([\u4e00-\u9fff\w]{2,20})/,
    /密码[：:=\s]*([\u4e00-\u9fff\w]{2,20})/,
    /code[：:=\s]*([\u4e00-\u9fff\w]{2,20})/i,
    /授权[：:=\s]*([\u4e00-\u9fff\w]{2,20})/,
    /验证码[：:=\s]*([\u4e00-\u9fff\w]{2,20})/,
    /今日口令[：:=\s]*([\u4e00-\u9fff\w]{2,20})/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      let code = match[1].trim()
      code = code.replace(/[，。,.\s、；;！!？?]+$/, '')
      if (code && code.length >= 2 && code.length <= 30) {
        return code
      }
    }
  }

  return null
}

async function walkFiles(dir) {
  const result = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const sub = await walkFiles(full)
      result.push(...sub)
    } else {
      result.push(full)
    }
  }
  return result
}

// ---- 从 HTML 中提取授权提交表单信息 ----
function extractAuthForm(html) {
  const formPattern = /<form\s[^>]*?\baction\s*=\s*["']([^"']+)["'][^>]*>/gi
  let formMatch
  const forms = []

  while ((formMatch = formPattern.exec(html)) !== null) {
    const formStart = formMatch.index
    const formEndTag = html.indexOf('</form>', formStart)
    if (formEndTag === -1) continue
    const formHtml = html.slice(formStart, formEndTag + 7)
    const hasAuthBtn = /开启今日免费授权|免费授权/.test(formHtml)

    const hiddenInputs = []
    const inputPattern = /<input\s[^>]*?\btype\s*=\s*["']hidden["'][^>]*?\/?>/gi
    let inputMatch
    while ((inputMatch = inputPattern.exec(formHtml)) !== null) {
      const tag = inputMatch[0]
      const nameMatch = tag.match(/name\s*=\s*["']([^"']+)["']/i)
      const valueMatch = tag.match(/value\s*=\s*["']([^"']*)["']/i)
      if (nameMatch) {
        hiddenInputs.push({ name: nameMatch[1], value: valueMatch ? valueMatch[1] : '' })
      }
    }

    forms.push({
      action: formMatch[1],
      html: formHtml,
      hasAuthBtn,
      hiddenInputs,
    })
  }

  if (forms.length === 0) {
    LOG('未在 HTML 中找到 <form> 元素')
    return null
  }

  const authForm = forms.find((f) => f.hasAuthBtn)
  if (authForm) {
    LOG(`找到授权表单: action="${authForm.action}", hidden字段=${JSON.stringify(authForm.hiddenInputs)}`)
    return authForm
  }

  LOG(`未找到含授权按钮的表单，使用第一个表单: action="${forms[0].action}"`)
  return forms[0]
}

function extractAuthCodeInputName(formHtml) {
  const inputPattern = /<input\s[^>]*?\/?>/gi
  let inputMatch
  const candidates = []

  while ((inputMatch = inputPattern.exec(formHtml)) !== null) {
    const tag = inputMatch[0]
    const typeMatch = tag.match(/type\s*=\s*["']([^"']+)["']/i)
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'text'
    if (type === 'hidden' || type === 'submit' || type === 'button') continue

    const nameMatch = tag.match(/name\s*=\s*["']([^"']+)["']/i)
    const placeholderMatch = tag.match(/placeholder\s*=\s*["']([^"']*)["']/i)
    const name = nameMatch ? nameMatch[1] : ''
    const placeholder = placeholderMatch ? placeholderMatch[1] : ''

    if (/code|auth|口令|授权|密码|token|key|verify/i.test(name + placeholder)) {
      candidates.push({ name, placeholder, priority: /口令|授权/.test(name + placeholder) ? 1 : 0 })
    }
  }

  candidates.sort((a, b) => b.priority - a.priority)

  if (candidates.length > 0) {
    LOG(`推测授权码输入框: name="${candidates[0].name}"`)
    return candidates[0].name
  }

  const allInputs = []
  const allPattern = /<input\s[^>]*?\bname\s*=\s*["']([^"']+)["'][^>]*?\/?>/gi
  let am
  while ((am = allPattern.exec(formHtml)) !== null) {
    const tMatch = am[0].match(/type\s*=\s*["']([^"']+)["']/i)
    const t = tMatch ? tMatch[1].toLowerCase() : 'text'
    if (t !== 'hidden' && t !== 'submit' && t !== 'button') {
      allInputs.push(am[1])
    }
  }

  if (allInputs.length > 0) {
    LOG(`推测授权码输入框(候选): name="${allInputs[0]}"`)
    return allInputs[0]
  }

  return 'code'
}

// ---- 通过 HTTP POST 提交授权码 ----
export async function submitAuthCodeViaHttp(cookies, csrfToken, authCode, html) {
  LOG('通过 HTTP API 提交授权码...')

  const formInfo = extractAuthForm(html)
  if (!formInfo) {
    throw new Error('无法从 HTML 中提取授权表单')
  }

  let actionUrl = formInfo.action
  if (!actionUrl.startsWith('http')) {
    actionUrl = actionUrl.startsWith('/') ? `${BASE}${actionUrl}` : `${BASE}/${actionUrl}`
  }

  const codeInputName = extractAuthCodeInputName(formInfo.html)

  const body = new URLSearchParams()
  for (const inp of formInfo.hiddenInputs) {
    body.append(inp.name, inp.value)
  }
  body.append(codeInputName, authCode)
  body.append('csrf_token', csrfToken)

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    Origin: BASE,
    Referer: `${BASE}/index.php`,
    Cookie: cookies,
    Accept: 'application/json, text/plain, */*',
  }

  LOG(`授权提交: POST ${actionUrl}`)
  LOG(`授权提交 body: ${body.toString()}`)

  const resp = await fetch(actionUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  })

  LOG(`授权提交响应: HTTP ${resp.status}`)

  const setCookieHeaders = resp.headers.getSetCookie?.() ?? []
  let updatedCookies = null

  if (setCookieHeaders.length > 0) {
    updatedCookies = mergeCookieStrings(cookies, setCookieHeaders)
    LOG(`授权提交 Set-Cookie: ${setCookieHeaders.join('; ')}`)
    LOG(`更新后 cookies: ${updatedCookies.slice(0, 80)}...`)
  }

  const text = await resp.text()
  LOG(`授权提交响应体: ${text}`)

  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    // HTML response
  }

  const isSuccess =
    (resp.ok && (data?.success || text.includes('成功') || text.includes('success'))) ||
    (resp.status >= 200 && resp.status < 300) ||
    [301, 302, 303, 307, 308].includes(resp.status)

  if (isSuccess) {
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      const location = resp.headers.get('location') || ''
      LOG(`授权提交成功（HTTP ${resp.status} 重定向 -> ${location}）`)
    } else {
      LOG('授权提交成功')
    }
    return { success: true, cookies: updatedCookies }
  }

  LOG(`授权提交失败: HTTP ${resp.status}, message="${data?.message || text.slice(0, 200)}"`)
  throw new Error(data?.message || `授权提交失败: HTTP ${resp.status}`)
}

function mergeCookieStrings(oldCookieStr, setCookieHeaders) {
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

// ---- 在 sotxt8 index.php 上提交授权（HTTP 方式，需 cookies/csrf） ----
async function applyAuthCode(cookies, csrfToken, authCode, html) {
  return submitAuthCodeViaHttp(cookies, csrfToken, authCode, html)
}

// ---- 完整自动授权流程 ----
let authInProgress = false
let authLock = null

function acquireAuthLock() {
  if (authInProgress) {
    return authLock
  }
  authInProgress = true
  let resolveLock
  authLock = new Promise((resolve) => {
    resolveLock = resolve
  })
  authLock._resolver = resolveLock
  return null
}

function releaseAuthLock() {
  authInProgress = false
  if (authLock?._resolver) {
    authLock._resolver()
    authLock = null
  }
}

export async function performQuarkAuth(userId, htmlProvider, options = {}) {
  const onComplete = typeof options.onComplete === 'function' ? options.onComplete : null
  const sotxt8Cookies = options.sotxt8Cookies || ''
  const sotxt8CsrfToken = options.sotxt8CsrfToken || ''

  const pendingLock = acquireAuthLock()
  if (pendingLock) {
    LOG('已有授权流程在进行中，等待完成...')
    await pendingLock
    LOG('等待的授权流程已完成')
    return true
  }

  quarkAuthState.status = 'in_progress'
  quarkAuthState.error = ''

  try {
    LOG('========== 开始夸克网盘自动授权流程 ==========')

    let html
    if (typeof htmlProvider === 'function') {
      html = await htmlProvider()
    } else if (typeof htmlProvider === 'string') {
      html = htmlProvider
    } else {
      throw new Error('需要提供 index.php 的 HTML 内容')
    }

    const quarkLink = extractQuarkLink(html)
    if (!quarkLink) {
      LOG('未能从页面中提取夸克分享链接')

      const fallbackUrl = (process.env.QUARK_SHARE_URL || '').trim()
      if (fallbackUrl) {
        LOG(`使用环境变量 QUARK_SHARE_URL 作为后备: ${fallbackUrl}`)
      } else {
        throw new Error('未找到夸克分享链接，且未配置 QUARK_SHARE_URL')
      }
    }

    const targetUrl = quarkLink || (process.env.QUARK_SHARE_URL || '').trim()
    if (!targetUrl) {
      throw new Error('无法获取夸克分享链接')
    }

    const puppeteerModule = await getPuppeteer()
    LOG('启动浏览器（headed 模式，可手动登录）...')

    await fs.mkdir(QUARK_USER_DATA_DIR, { recursive: true })

    const browser = await puppeteerModule.launch({
      headless: false,
      userDataDir: QUARK_USER_DATA_DIR,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
      ],
      defaultViewport: { width: 1280, height: 800 },
    })

    const context = browser.defaultBrowserContext()
    await fs.mkdir(QUARK_DOWNLOADS_DIR, { recursive: true })

    const page = await context.newPage()

    const client = await page.target().createCDPSession()
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: QUARK_DOWNLOADS_DIR,
    })

    page.setDefaultTimeout(30000)
    page.setDefaultNavigationTimeout(60000)

    let success = false
    let updatedSotxt8Cookies = null

    try {
      const savedCookies = await loadQuarkCookies()
      if (savedCookies) {
        await page.setCookie(...savedCookies)
        LOG('已恢复夸克 cookies')
      }

      const zipPath = await downloadFromQuarkShare(page, targetUrl)

      if (!zipPath) {
        throw new Error('未能从夸克网盘下载到文件')
      }

      const newCookies = await page.cookies()
      await saveQuarkCookies(newCookies)

      const authCode = await extractAuthCodeFromZip(zipPath)

      if (!authCode) {
        throw new Error('未能从下载文件中提取到授权口令')
      }

      const authResult = await applyAuthCode(sotxt8Cookies, sotxt8CsrfToken, authCode, html)
      updatedSotxt8Cookies = authResult.cookies

      LOG('========== 夸克网盘自动授权流程完成 ==========')
      success = true
      quarkAuthState.status = 'completed'
      quarkAuthState.completedAt = Date.now()
      return true
    } catch (innerErr) {
      LOG(`自动授权步骤失败: ${innerErr.message}`)
      LOG('浏览器保持打开 60 秒，可手动完成操作...')
      await new Promise((r) => setTimeout(r, 60000))
      throw innerErr
    } finally {
      await page.close()
      await browser.close()
      LOG('浏览器已关闭')
    }
  } catch (e) {
    LOG(`自动授权流程失败: ${e.message}`)
    console.error('[sotxt8:quark] 授权异常:', e)
    quarkAuthState.status = 'failed'
    quarkAuthState.error = e.message
    return false
  } finally {
    releaseAuthLock()
    if (onComplete) {
      try {
        await onComplete(quarkAuthState.status === 'completed', updatedSotxt8Cookies)
      } catch (cbErr) {
        LOG(`onComplete 回调异常: ${cbErr.message}`)
      }
    }
  }
}

export { extractAuthCodeFromZip as extractCode }
