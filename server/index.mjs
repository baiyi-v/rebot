/**
 * 环境变量（可配置在 .env 文件中）：
 * - TOMATO_SERVER_URL — 单个 Tomato 下载引擎地址，默认 http://127.0.0.1:18423
 * - TOMATO_SERVER_URLS — 多个 Tomato 下载引擎地址，用逗号分隔；设置后优先于 TOMATO_SERVER_URL
 * - PORT — 代理端口，默认 3000
 * - TOMATO_PASSWORD — 上游锁屏密码（可选）
 * - LOCAL_LIBRARY_ROOT — Tomato 保存目录（本机绝对路径），例如 D:\\临时下载\\tomato
 *   任务完成后由本代理直接读盘列出 epub/txt 并提供下载，不依赖 Tomato 的 /api/library 路径是否一致。
 * - DATA_DIR — SQLite 数据目录，默认 ./server/data
 * - AUTH_DISABLED=1 — 关闭登录与配额校验（默认需登录；注册后须卡密激活会员与次数）
 * - ADMIN_SECRET — 管理员密钥，用于生成卡密（POST /api/admin/cards）
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'

const require = createRequire(import.meta.url)
const dotenv = require('dotenv')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

function getEnv(key, defaultValue) {
  return process.env[key] || defaultValue
}

import { statSync, createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import express from 'express'
import cors from 'cors'
import { Readable } from 'node:stream'
import {
  getLocalLibraryRoot,
  findBookFolder,
  collectBookFiles,
  safeResolveUnderLibraryRoot,
  ensureLibraryRootExists,
} from './local-library.mjs'
import './db.mjs'
import { mountAuthRoutes, requireJobQuota, requireUser, authDisabled } from './auth-api.mjs'
import { consumeJobCredit } from './auth-core.mjs'
import { q, dbNow } from './db.mjs'
import { mountRoutes as mountSotxt8 } from './platforms/sotxt8.mjs'

function parseArgs() {
  const args = process.argv.slice(2)
  let host = '127.0.0.1'
  let port = Number(process.env.PORT) || 3000

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host' && i + 1 < args.length) {
      host = args[i + 1]
      i++
    } else if (args[i] === '--port' && i + 1 < args.length) {
      port = Number(args[i + 1]) || port
      i++
    } else if (args[i] === '-h' && i + 1 < args.length) {
      host = args[i + 1]
      i++
    } else if (args[i] === '-p' && i + 1 < args.length) {
      port = Number(args[i + 1]) || port
      i++
    }
  }

  return { host, port }
}

const { host, port } = parseArgs()
const PORT = port
function parseEngineTargets() {
  const raw = (process.env.TOMATO_SERVER_URLS || process.env.TOMATO_SERVER_URL || 'http://127.0.0.1:18423')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
  return [...new Set(raw)]
}

const ENGINE_TARGETS = parseEngineTargets()
const TARGET = ENGINE_TARGETS[0]
const UPSTREAM_PASSWORD = (process.env.TOMATO_PASSWORD || '').trim()

let lastUpstreamLog = 0
const UPSTREAM_LOG_INTERVAL_MS = 15000

function logUpstreamError(e, target = TARGET) {
  const now = Date.now()
  if (now - lastUpstreamLog >= UPSTREAM_LOG_INTERVAL_MS) {
    lastUpstreamLog = now
    console.error(
      `[proxy] 无法连接下载服务 ${target}（${e.message}）。请启动 TomatoNovelDownloader 或设置 TOMATO_SERVER_URLS。`
    )
  }
}

const MAX_GLOBAL_CONCURRENT = Number(process.env.MAX_GLOBAL_CONCURRENT) || ENGINE_TARGETS.length
const FILE_TOKEN_TTL_MS = Number(process.env.FILE_TOKEN_TTL_MS) || 30 * 60 * 1000
const FILE_TOKEN_SECRET =
  process.env.FILE_TOKEN_SECRET ||
  process.env.ADMIN_SECRET ||
  'tomato-local-file-dev-secret'
const NODE_ENV = process.env.NODE_ENV || 'development'
const IS_PRODUCTION = NODE_ENV === 'production'
const CORS_ORIGIN = (process.env.CORS_ORIGIN || '').trim()
const ACTIVE_ENGINE_SYNC_MS = Number(process.env.ACTIVE_ENGINE_SYNC_MS) || 5000
const TERMINAL_JOB_STATES = new Set(['done', 'failed', 'canceled'])

function normalizeJobState(state) {
  const raw = String(state || '').trim().toLowerCase()
  if (raw === 'error') return 'failed'
  if (raw === 'cancelled') return 'canceled'
  return raw || 'queued'
}

function isTerminalJobState(state) {
  return TERMINAL_JOB_STATES.has(normalizeJobState(state))
}

function sanitizeJobId(raw) {
  return String(raw || '').trim()
}

function validateProductionConfig() {
  if (!IS_PRODUCTION) return
  const required = ['LOCAL_LIBRARY_ROOT', 'DATA_DIR', 'FILE_TOKEN_SECRET', 'ADMIN_SECRET']
  const missing = required.filter((key) => !String(process.env[key] || '').trim())
  if (!String(process.env.TOMATO_SERVER_URLS || process.env.TOMATO_SERVER_URL || '').trim()) {
    missing.push('TOMATO_SERVER_URLS 或 TOMATO_SERVER_URL')
  }
  if (missing.length) {
    throw new Error(`生产环境缺少必要环境变量: ${missing.join(', ')}`)
  }
  if (process.env.AUTH_DISABLED === '1') {
    throw new Error('生产环境不能设置 AUTH_DISABLED=1')
  }
  if (!CORS_ORIGIN) {
    throw new Error('生产环境必须设置 CORS_ORIGIN')
  }
}

function localFileSignature(userId, relPath, expiresAt) {
  const payload = `${userId}:${expiresAt}:${relPath}`
  return crypto.createHmac('sha256', FILE_TOKEN_SECRET).update(payload).digest('base64url')
}

function signLocalFileToken(userId, relPath) {
  const expiresAt = Date.now() + FILE_TOKEN_TTL_MS
  const sig = localFileSignature(userId, relPath, expiresAt)
  return `${expiresAt}.${sig}`
}

function verifyLocalFileToken(userId, relPath, token) {
  const [expiresAtRaw, sig = ''] = String(token || '').split('.')
  const expiresAt = Number(expiresAtRaw)
  if (!expiresAt || expiresAt < Date.now() || !sig) return false
  const expected = localFileSignature(userId, relPath, expiresAt)
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)
}

function attachLocalFileTokens(req, files) {
  if (authDisabled()) return files
  const userId = req.user?.id
  if (!userId) return []
  return files.map((f) => ({
    ...f,
    token: signLocalFileToken(userId, f.relPath),
  }))
}

function userOwnsBook(req, bookId) {
  if (authDisabled()) return true
  if (!req.user?.username || !bookId) return false
  return Boolean(q.userOwnsBookByAccount.get(req.user.username, String(bookId)))
}

function userOwnsLibraryPath(req, relPath) {
  if (authDisabled()) return true
  if (!req.user?.username || !relPath) return false
  const normalized = String(relPath).replace(/\\/g, '/').replace(/^\/+/, '')
  let firstSegment = ''
  try {
    firstSegment = decodeURIComponent(normalized.split('/')[0] || '')
  } catch {
    return false
  }
  const ownedBookIds = q.getUserBookIdsByAccount.all(req.user.username).map((row) => String(row.book_id))
  return ownedBookIds.some((bookId) => firstSegment === bookId || firstSegment.startsWith(`${bookId}_`))
}

function startOfTodayMs() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function jobRecordToItem(row) {
  try {
    const parsed = row.job_json ? JSON.parse(row.job_json) : null
    if (parsed && typeof parsed === 'object') {
      return {
        ...parsed,
        id: parsed.id ?? row.job_id,
        engine_job_id: parsed.engine_job_id ?? row.engine_job_id ?? null,
        engine_url: parsed.engine_url ?? row.engine_url ?? null,
        book_id: parsed.book_id ?? row.book_id,
        title: parsed.title ?? row.title,
        author: parsed.author ?? row.author,
        state: normalizeJobState(parsed.state ?? row.state),
        message: parsed.message ?? row.message,
        progress: parsed.progress ?? JSON.parse(row.progress_json || '{}'),
        download_status: parsed.download_status ?? row.download_status ?? null,
        files: parsed.files ?? JSON.parse(row.files_json || '[]'),
        created_at: parsed.created_at ?? row.created_at,
        updated_at: parsed.updated_at ?? row.updated_at,
      }
    }
  } catch {
    /* fall through */
  }
  return {
    id: row.job_id,
    engine_job_id: row.engine_job_id || null,
    engine_url: row.engine_url || null,
    book_id: row.book_id,
    title: row.title || row.book_id || '历史任务',
    author: row.author || '',
    state: normalizeJobState(row.state || 'done'),
    message: row.message || null,
    progress: {},
    download_status: row.download_status || null,
    files: [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function saveUserJobRecord(account, job, createdAt = dbNow()) {
  if (!account || !job?.id) return
  const now = dbNow()
  const bookId = String(job.book_id || '').trim() || null
  const title = String(job.title || job.book_name || bookId || '').trim() || null
  const author = String(job.author || '').trim() || ''
  const state = normalizeJobState(job.state || 'queued')
  const message = job.message == null ? null : String(job.message)
  const engineJobId = sanitizeJobId(job.engine_job_id || job.upstream_job_id || '')
  const engineUrl = String(job.engine_url || '').trim() || null
  const files = Array.isArray(job.files) ? job.files : []
  const normalized = {
    ...job,
    id: String(job.id),
    engine_job_id: engineJobId || null,
    engine_url: engineUrl,
    book_id: bookId,
    title,
    author,
    state,
    message,
    progress: job.progress || {},
    download_status: job.download_status || null,
    files,
    created_at: job.created_at || createdAt,
    updated_at: now,
  }
  q.upsertUserJobRecord.run({
    account,
    job_id: normalized.id,
    engine_job_id: engineJobId || null,
    engine_url: engineUrl,
    book_id: bookId,
    title,
    author,
    state,
    message,
    progress_json: JSON.stringify(normalized.progress || {}),
    job_json: JSON.stringify(normalized),
    download_status: normalized.download_status,
    files_json: JSON.stringify(files),
    created_at: createdAt,
    updated_at: now,
  })
}

function createLocalJobRecord(task, state = 'queued', message = '正在等待下载引擎接收任务') {
  if (!task?.account || !task?.authUserId || !task.localId) return
  const now = task.createdAt || dbNow()
  try {
    if (!q.userHasJob.get(task.authUserId, task.localId)) {
      q.insertUserJob.run(task.authUserId, task.localId, task.bookId || null, now)
    }
    saveUserJobRecord(task.account, {
      id: task.localId,
      book_id: task.bookId,
      title: task.title || task.bookId,
      author: '',
      state,
      message,
      progress: {},
    }, now)
    if (task.bookId) {
      q.upsertUserBook.run(task.account, task.bookId, task.title || null, now, now)
    }
  } catch (e) {
    console.error(`[job] 本地任务记录失败: ${e.message}`)
  }
}

class DownloadQueue {
  constructor() {
    this.queues = new Map()
    this.activeUserCounts = new Map()
    this.engineActiveJobs = new Map()
    this.activeEngineTargets = new Set()
    this.globalActiveCount = 0
    this.nextLocalId = 1
  }

  getQueueLength(userId) {
    const queue = this.queues.get(userId)
    return queue ? queue.length : 0
  }

  isUserActive(userId) {
    return (this.activeUserCounts.get(userId) || 0) > 0
  }

  getGlobalActiveCount() {
    return this.globalActiveCount
  }

  canStartNewTask() {
    return this.globalActiveCount < MAX_GLOBAL_CONCURRENT && this.getAvailableEngineTarget() != null
  }

  getAvailableEngineTarget() {
    return ENGINE_TARGETS.find((target) => !this.activeEngineTargets.has(target)) || null
  }

  queuedJobs(userId) {
    const queue = this.queues.get(userId) || []
    return queue.map((task) => ({
      id: task.localId,
      local_queue_id: task.localId,
      book_id: task.bookId,
      title: task.title || (task.bookId ? `等待创建任务 ${task.bookId}` : '等待创建任务'),
      author: '',
      state: 'queued',
      message: '正在本地队列中等待，稍后自动提交到下载服务',
      progress: {},
      created_at: task.createdAt,
    }))
  }

  hasQueuedLocalJob(localJobId) {
    const key = sanitizeJobId(localJobId)
    if (!key) return false
    for (const queue of this.queues.values()) {
      if (queue.some((task) => sanitizeJobId(task.localId) === key)) return true
    }
    return false
  }

  incrementUserActive(userId) {
    if (!userId) return
    this.activeUserCounts.set(userId, (this.activeUserCounts.get(userId) || 0) + 1)
  }

  decrementUserActive(userId) {
    if (!userId) return
    const next = (this.activeUserCounts.get(userId) || 0) - 1
    if (next > 0) this.activeUserCounts.set(userId, next)
    else this.activeUserCounts.delete(userId)
  }

  addToQueue(userId, task) {
    if (!this.queues.has(userId)) {
      this.queues.set(userId, [])
    }
    if (!task.localId) task.localId = `node-${Date.now()}-${this.nextLocalId++}`
    if (!task.createdAt) task.createdAt = Date.now()
    this.queues.get(userId).push(task)
    this.processNext(userId)
    return task
  }

  releaseEngineJob(localJobId, fallback = {}) {
    const key = sanitizeJobId(localJobId)
    const active = this.engineActiveJobs.get(key)
    const engineUrl = active?.engineUrl || fallback.engineUrl || ''
    const userId = active?.userId || fallback.userId || ''

    if (active) this.engineActiveJobs.delete(key)
    if (engineUrl) this.activeEngineTargets.delete(engineUrl)
    this.decrementUserActive(userId)
    this.globalActiveCount = this.activeEngineTargets.size
    this.processAllQueues()
    return Boolean(active || engineUrl || userId)
  }

  markEngineJobActive(localJobId, userId, engineJobId, engineUrl) {
    const key = sanitizeJobId(localJobId)
    if (!key || !engineUrl) return
    const alreadyActive = this.engineActiveJobs.has(key)
    this.engineActiveJobs.set(key, { userId, engineJobId: sanitizeJobId(engineJobId), engineUrl })
    this.activeEngineTargets.add(engineUrl)
    if (!alreadyActive) this.incrementUserActive(userId)
    this.globalActiveCount = this.activeEngineTargets.size
  }

  async processNext(userId) {
    if (this.isUserActive(userId)) {
      return
    }

    if (!this.canStartNewTask()) {
      return
    }

    const engineUrl = this.getAvailableEngineTarget()
    if (!engineUrl) {
      return
    }

    const queue = this.queues.get(userId)
    if (!queue || queue.length === 0) {
      return
    }

    this.incrementUserActive(userId)
    this.activeEngineTargets.add(engineUrl)
    this.globalActiveCount++
    const task = queue.shift()

    let engineAccepted = false
    try {
      const upstream = `${engineUrl}/api/jobs`
      const r = await fetch(upstream, {
        method: 'POST',
        headers: task.headers,
        body: JSON.stringify(task.body),
      })
      const data = await readUpstreamJson(r)
      const failed =
        data &&
        typeof data === 'object' &&
        (data.error != null ||
          (typeof data.ok === 'boolean' && data.ok === false))
      const ok = r.ok && !failed
      if (!authDisabled() && task.authUserId && ok) {
        consumeJobCredit(task.authUserId)
      }
      if (ok && data.id && task.authUserId) {
        try {
          const engineJobId = String(data.id)
          const jobId = String(task.localId || engineJobId)
          const bookId = String(data.book_id || task.bookId || '').trim()
          const title = String(data.title || data.book_name || task.title || '').trim() || null
          const now = dbNow()
          saveUserJobRecord(task.account, {
            ...data,
            id: jobId,
            engine_job_id: engineJobId,
            engine_url: engineUrl,
            book_id: bookId || data.book_id,
            title,
            state: data.state || 'running',
            message: data.message || '下载引擎已接收任务',
          }, task.createdAt || now)
          if (task.account && bookId) {
            q.upsertUserBook.run(task.account, bookId, title, now, now)
          }
          this.engineActiveJobs.set(jobId, { userId, engineJobId, engineUrl })
          engineAccepted = true
          console.log(`[job] 任务关联成功: userId=${task.authUserId}, jobId=${jobId}, engineJobId=${engineJobId}, engine=${engineUrl}, bookId=${bookId || '-'}`)
        } catch (e) {
          console.error(`[job] 任务关联失败: ${e.message}`)
        }
      }
      if (!ok && task.account) {
        saveUserJobRecord(task.account, {
          id: task.localId,
          book_id: task.bookId,
          title: task.title,
          state: 'failed',
          message: data.message || data.error || `下载引擎拒绝任务: HTTP ${r.status}`,
        }, task.createdAt || dbNow())
      }
      if (task.res && !task.res.headersSent) {
        task.res.status(r.status).json({
          ...data,
          id: task.localId || data.id,
          engine_job_id: data.id ? String(data.id) : null,
          engine_url: ok ? engineUrl : null,
          book_id: data.book_id || task.bookId,
          state: ok ? normalizeJobState(data.state || 'running') : 'failed',
        })
      }
    } catch (e) {
      logUpstreamError(e, engineUrl)
      if (task.account) {
        saveUserJobRecord(task.account, {
          id: task.localId,
          book_id: task.bookId,
          title: task.title,
          state: 'failed',
          message: `无法连接下载服务: ${engineUrl}`,
        }, task.createdAt || dbNow())
      }
      if (task.res && !task.res.headersSent) {
        task.res.status(502).json({
          error: 'upstream_unreachable',
          message: `无法连接下载服务: ${engineUrl}`,
        })
      }
    } finally {
      if (!engineAccepted) {
        this.activeEngineTargets.delete(engineUrl)
        this.decrementUserActive(userId)
        this.globalActiveCount = Math.max(0, this.globalActiveCount - 1)
        this.processAllQueues()
      }
    }
  }

  async processAllQueues() {
    for (const [userId, queue] of this.queues) {
      if (queue.length > 0 && !this.isUserActive(userId) && this.canStartNewTask()) {
        await this.processNext(userId)
      }
    }
  }
}

const downloadQueue = new DownloadQueue()

function failOrphanQueuedJobs() {
  const rows = q.getQueuedUnsubmittedJobRecords.all()
  for (const row of rows) {
    if (downloadQueue.hasQueuedLocalJob(row.job_id)) continue
    saveUserJobRecord(row.account, {
      ...jobRecordToItem(row),
      state: 'failed',
      message: '服务重启后本地排队任务已丢失，请重新创建下载任务',
    }, row.created_at)
  }
}

/**
 * @param {import('express').Request} req
 * @param {{ jsonBody?: boolean, accept?: string }} [opts]
 */
function forwardHeaders(req, opts = {}) {
  const accept = opts.accept ?? 'application/json'
  /** @type {Record<string, string>} */
  const h = { Accept: accept }
  if (opts.jsonBody) h['Content-Type'] = 'application/json'
  const pwd = req.headers['x-tomato-password'] || UPSTREAM_PASSWORD
  if (pwd) h['x-tomato-password'] = pwd
  if (req.headers.cookie) h['Cookie'] = req.headers.cookie
  if (req.headers.authorization) h['Authorization'] = req.headers.authorization
  return h
}

async function readUpstreamJson(r) {
  const text = await r.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function engineUrlForRow(row) {
  const item = jobRecordToItem(row)
  return String(item.engine_url || row.engine_url || TARGET).trim().replace(/\/$/, '') || TARGET
}

async function fetchEngineJobs(engineUrl = TARGET) {
  const r = await fetch(`${engineUrl}/api/jobs`, { headers: forwardHeaders({ headers: {}, query: {} }) })
  const data = await readUpstreamJson(r)
  if (!r.ok) {
    throw new Error(data.message || data.error || `HTTP ${r.status}`)
  }
  return Array.isArray(data.items) ? data.items : []
}

function mergeEngineJobRecord(account, row, engineJob) {
  const item = jobRecordToItem(row)
  const state = normalizeJobState(engineJob.state || item.state)
  const now = dbNow()
  saveUserJobRecord(account, {
    ...engineJob,
    id: item.id,
    engine_job_id: item.engine_job_id || String(engineJob.id || ''),
    engine_url: item.engine_url || engineUrlForRow(row),
    book_id: engineJob.book_id || item.book_id,
    title: engineJob.title || engineJob.book_name || item.title,
    author: engineJob.author || item.author,
    state,
    message: engineJob.message ?? item.message,
    progress: engineJob.progress || item.progress || {},
    download_status: item.download_status,
    files: item.files || [],
  }, row.created_at || now)
  if (isTerminalJobState(state)) {
    downloadQueue.releaseEngineJob(item.id, {
      userId: row.user_id || null,
      engineUrl: item.engine_url || engineUrlForRow(row),
    })
  } else {
    downloadQueue.markEngineJobActive(item.id, row.user_id || null, item.engine_job_id || engineJob.id, item.engine_url || engineUrlForRow(row))
  }
}

async function syncEngineJobsForRows(rows, upstreamItems = null) {
  if (upstreamItems) {
    const byEngineId = new Map(upstreamItems.map((job) => [String(job.id), job]))
    for (const row of rows) {
      const engineId = String(row.engine_job_id || '')
      if (!engineId) continue
      const engineJob = byEngineId.get(engineId)
      if (engineJob) mergeEngineJobRecord(row.account, row, engineJob)
    }
    return false
  }

  let unreachable = false
  const rowsByEngineUrl = new Map()
  for (const row of rows) {
    const engineUrl = engineUrlForRow(row)
    if (!rowsByEngineUrl.has(engineUrl)) rowsByEngineUrl.set(engineUrl, [])
    rowsByEngineUrl.get(engineUrl).push(row)
  }

  for (const [engineUrl, engineRows] of rowsByEngineUrl) {
    let items = []
    try {
      items = await fetchEngineJobs(engineUrl)
    } catch (e) {
      unreachable = true
      logUpstreamError(e, engineUrl)
      continue
    }
    const byEngineId = new Map(items.map((job) => [String(job.id), job]))
    for (const row of engineRows) {
      const engineId = String(row.engine_job_id || '')
      if (!engineId) continue
      const engineJob = byEngineId.get(engineId)
      if (engineJob) {
        mergeEngineJobRecord(row.account, row, engineJob)
      } else if (normalizeJobState(row.state) === 'running') {
        saveUserJobRecord(row.account, {
          ...jobRecordToItem(row),
          state: 'failed',
          message: '下载引擎任务已不存在，可能是下载器重启或任务被清理',
        }, row.created_at)
        downloadQueue.releaseEngineJob(row.job_id, {
          userId: row.user_id || null,
          engineUrl,
        })
      }
    }
  }
  return unreachable
}

async function syncActiveEngineJobs() {
  const rows = q.getActiveEngineJobRecords.all()
  if (!rows.length) return
  try {
    await syncEngineJobsForRows(rows)
  } catch (e) {
    logUpstreamError(e)
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} upstreamUrl
 */
async function proxyUpstreamStream(req, res, upstreamUrl) {
  try {
    const r = await fetch(upstreamUrl, { headers: forwardHeaders(req, { accept: '*/*' }) })
    res.status(r.status)
    const hopByHop = new Set(['connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer'])
    r.headers.forEach((value, key) => {
      if (!hopByHop.has(key.toLowerCase())) res.setHeader(key, value)
    })
    if (!r.body) {
      const buf = Buffer.from(await r.arrayBuffer())
      res.end(buf)
      return
    }
    const nodeReadable = Readable.fromWeb(r.body)
    nodeReadable.on('error', () => {
      if (!res.writableEnded) res.destroy()
    })
    nodeReadable.pipe(res)
  } catch (e) {
    logUpstreamError(e)
    if (!res.writableEnded) res.status(502).end()
  }
}

const app = express()
app.use(cors(CORS_ORIGIN ? { origin: CORS_ORIGIN, credentials: true } : undefined))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

mountAuthRoutes(app)
mountSotxt8(app, { requireUser, requireJobQuota, consumeJobCredit, getLocalLibraryRoot })

async function buildDownloadResources(req, bookId, title = '', jobId = '') {
  const lr = getLocalLibraryRoot()
  if (!lr) {
    return {
      enabled: false,
      status: 'missing',
      reason: 'local_library_disabled',
      files: [],
      folderName: '',
    }
  }

  const bookFolder = await findBookFolder(bookId, lr)
  const files = attachLocalFileTokens(req, await collectBookFiles(bookFolder, lr, bookId, title))
  const folderName = bookFolder ? path.basename(bookFolder) : ''
  if (files.length > 0) {
    return {
      enabled: true,
      status: 'ready',
      kind: 'local',
      reason: null,
      files,
      folderName,
    }
  }

  const account = req.user?.username || ''
  const rows = account && bookId ? q.getUserJobRecordsByBookId.all(account, String(bookId)) : []
  const row = jobId ? rows.find((r) => String(r.job_id) === String(jobId)) : rows[0]
  const state = row ? normalizeJobState(row.state) : ''
  if (state === 'queued' || state === 'running') {
    return {
      enabled: true,
      status: 'pending',
      kind: 'local',
      reason: 'job_not_finished',
      files: [],
      folderName,
    }
  }

  if (state === 'failed' || state === 'canceled') {
    return {
      enabled: true,
      status: 'failed',
      kind: 'local',
      reason: state,
      message: row?.message || '下载任务未成功完成',
      files: [],
      folderName,
    }
  }

  return {
    enabled: true,
    status: 'missing',
    kind: 'local',
    reason: 'local_empty',
    files: [],
    folderName,
  }
}

app.get('/api/download-resources/:bookId', requireUser, async (req, res) => {
  const bookId = req.params.bookId
  if (!userOwnsBook(req, bookId)) {
    return res.status(403).json({ error: 'forbidden', message: '无权访问该书籍文件' })
  }

  try {
    const title = String(req.query.title || '').trim()
    const jobId = String(req.query.jobId || '').trim()
    res.json(await buildDownloadResources(req, bookId, title, jobId))
  } catch (e) {
    console.error('[download-resources]', e)
    res.json({ enabled: true, status: 'failed', reason: 'error', files: [], folderName: '' })
  }
})

app.get('/api/local-books/:bookId', requireUser, async (req, res) => {
  const bookId = req.params.bookId
  if (!userOwnsBook(req, bookId)) {
    return res.status(403).json({ error: 'forbidden', message: '无权访问该书籍文件' })
  }

  try {
    const title = String(req.query.title || '').trim()
    const data = await buildDownloadResources(req, bookId, title, String(req.query.jobId || '').trim())
    res.json(data)
  } catch (e) {
    console.error('[local-books]', e)
    res.json({ enabled: true, status: 'failed', reason: 'error', files: [], folderName: '' })
  }
})

app.get('/api/local-file/*', requireUser, async (req, res) => {
  const lr = getLocalLibraryRoot()
  if (!lr) {
    return res.status(404).json({ error: 'local_library_disabled', message: '未配置 LOCAL_LIBRARY_ROOT' })
  }

  const tail = String(req.params[0] || '').replace(/^\/+/, '').split(path.sep).join('/')
  if (!tail) {
    return res.status(400).json({ error: 'bad_path', message: '缺少文件路径' })
  }
  if (!authDisabled() && !verifyLocalFileToken(req.user?.id, tail, req.query.token)) {
    return res.status(403).json({ error: 'forbidden', message: '文件链接无效或已过期，请刷新任务列表' })
  }

  try {
    const full = safeResolveUnderLibraryRoot(lr, tail)
    const st = await fs.stat(full)
    if (!st.isFile()) {
      return res.status(404).json({ error: 'not_found', message: '文件不存在' })
    }
    const ext = path.extname(full).slice(1).toLowerCase()
    const ct =
      ext === 'epub'
        ? 'application/epub+zip'
        : ext === 'txt'
        ? 'text/plain; charset=utf-8'
        : ext === 'pdf'
        ? 'application/pdf'
        : ext === 'mp3'
        ? 'audio/mpeg'
        : ext === 'wav'
        ? 'audio/wav'
        : 'application/octet-stream'
    res.setHeader('Content-Type', ct)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(full))}"`)
    res.sendFile(full)
  } catch (e) {
    console.error('[local-file]', e)
    res.status(404).json({ error: 'not_found', message: '文件不存在或访问被拒绝' })
  }
})

app.get('/api/library', requireUser, async (req, res) => {
  const name = String(req.query.name || '').trim()
  const libraryPath = String(req.query.path || '').trim()
  if (name && !userOwnsBook(req, name)) {
    return res.status(403).json({ error: 'forbidden', message: '无权访问该书库条目' })
  }
  if (libraryPath && !userOwnsLibraryPath(req, libraryPath)) {
    return res.status(403).json({ error: 'forbidden', message: '无权访问该书库路径' })
  }

  const upstream = `${TARGET}${req.originalUrl}`
  try {
    const r = await fetch(upstream, { headers: forwardHeaders(req) })
    const data = await readUpstreamJson(r)
    res.status(r.status).json(data)
  } catch (e) {
    logUpstreamError(e)
    const account = req.user?.username || ''
    if (account) {
      const page = Number(req.query.page) || 1
      const limit = Number(req.query.limit) || 5
      const localItems = q.getUserJobRecordsSince.all(account, startOfTodayMs()).map(jobRecordToItem)
      const total = localItems.length
      const offset = (page - 1) * limit
      return res.status(200).json({
        items: localItems.slice(offset, offset + limit),
        total,
        page,
        limit,
        hasMore: offset + limit < total,
        queueLength: downloadQueue.getQueueLength(req.user?.id || 'anonymous'),
        isActive: downloadQueue.isUserActive(req.user?.id || 'anonymous'),
        upstream_unreachable: true,
      })
    }
    res.status(502).json({
      error: 'upstream_unreachable',
      message: `无法连接下载服务: ${TARGET}`,
    })
  }
})

app.get('/api/preview/:bookId', requireUser, async (req, res) => {
  const upstream = `${TARGET}/api/preview/${encodeURIComponent(req.params.bookId)}`
  try {
    const r = await fetch(upstream, { headers: forwardHeaders(req) })
    const data = await readUpstreamJson(r)
    res.status(r.status).json(data)
  } catch (e) {
    logUpstreamError(e)
    res.status(502).json({
      error: 'upstream_unreachable',
      message: `无法连接下载服务: ${TARGET}`,
    })
  }
})

app.post('/api/preview/:bookId/cleanup', requireUser, async (req, res) => {
  const upstream = `${TARGET}/api/preview/${encodeURIComponent(req.params.bookId)}/cleanup`
  try {
    const r = await fetch(upstream, { method: 'POST', headers: forwardHeaders(req) })
    const text = await r.text()
    res.status(r.status).send(text || '')
  } catch (e) {
    logUpstreamError(e)
    res.status(200).send('cleanup skipped (upstream unavailable)')
  }
})

async function proxyBinary(req, res, relativePath) {
  const upstream = `${TARGET}${relativePath}`
  try {
    const r = await fetch(upstream, { headers: forwardHeaders(req, { accept: '*/*' }) })
    const ct = r.headers.get('content-type')
    if (ct) res.setHeader('Content-Type', ct)
    for (const name of ['cache-control', 'pragma', 'expires']) {
      const v = r.headers.get(name)
      if (v) res.setHeader(name, v)
    }
    res.status(r.status)
    const buf = Buffer.from(await r.arrayBuffer())
    res.send(buf)
  } catch (e) {
    logUpstreamError(e)
    res.status(502).end()
  }
}

app.get('/api/preview-cover/:key', (req, res) => {
  proxyBinary(req, res, `/api/preview-cover/${encodeURIComponent(req.params.key)}`)
})

app.get('/api/preview-cover-by-book/:bookId', (req, res) => {
  proxyBinary(req, res, `/api/preview-cover-by-book/${encodeURIComponent(req.params.bookId)}`)
})

app.get('/api/jobs', requireUser, async (req, res) => {
  const userId = req.user?.id
  const account = req.user?.username || ''
  const queueUserId = userId || 'anonymous'
  const todayStart = startOfTodayMs()
  failOrphanQueuedJobs()
  const localRecords = account ? q.getUserJobRecordsSince.all(account, todayStart) : []
  let upstreamUnreachable = false

  if (account && localRecords.some((row) => row.engine_job_id && !isTerminalJobState(row.state))) {
    try {
      upstreamUnreachable = await syncEngineJobsForRows(localRecords.filter((row) => row.engine_job_id && !isTerminalJobState(row.state)))
    } catch (e) {
      upstreamUnreachable = true
      logUpstreamError(e)
    }
  }

  const freshRecords = account ? q.getUserJobRecordsSince.all(account, todayStart) : []
  let itemsToReturn = freshRecords.map(jobRecordToItem)
  const queuedItems = downloadQueue.queuedJobs(queueUserId)
  const queuedIds = new Set(queuedItems.map((item) => String(item.id)))
  itemsToReturn = [
    ...queuedItems,
    ...itemsToReturn.filter((item) => !queuedIds.has(String(item.id))),
  ]

  const page = Number(req.query.page) || 1
  const limit = Number(req.query.limit) || 5
  const total = itemsToReturn.length
  const offset = (page - 1) * limit
  const paginatedItems = itemsToReturn.slice(offset, offset + limit)
  const hasMore = offset + limit < total
  const queueLength = downloadQueue.getQueueLength(queueUserId)

  console.log(`[jobs] 用户${userId || '-'}查询任务列表: total=${total}, page=${page}, limit=${limit}, upstreamUnreachable=${upstreamUnreachable}`)

  res.status(200).json({
    items: paginatedItems,
    total,
    page,
    limit,
    hasMore,
    queueLength,
    isActive: downloadQueue.isUserActive(queueUserId),
    upstream_unreachable: upstreamUnreachable,
  })
})

app.delete('/api/jobs/:jobId', requireUser, async (req, res) => {
  const jobId = String(req.params.jobId || '').trim()
  if (!jobId) {
    return res.status(400).json({ error: 'bad_job_id', message: '缺少任务 ID' })
  }
  if (!authDisabled() && !q.userHasJob.get(req.user?.id, jobId)) {
    return res.status(403).json({ error: 'forbidden', message: '无权操作该任务' })
  }

  const row = req.user?.username ? q.getUserJobRecordByJobId.get(req.user.username, jobId) : null
  const engineJobId = row?.engine_job_id || jobId
  const engineUrl = row ? engineUrlForRow(row) : TARGET
  const upstream = `${engineUrl}/api/jobs/${encodeURIComponent(engineJobId)}`
  try {
    const r = await fetch(upstream, { method: 'DELETE', headers: forwardHeaders(req) })
    const data = await readUpstreamJson(r)
    if (row) {
      saveUserJobRecord(req.user.username, {
        ...jobRecordToItem(row),
        state: 'canceled',
        message: '任务已从下载引擎清理',
      }, row.created_at)
      downloadQueue.releaseEngineJob(jobId)
    }
    res.status(r.status).json(data)
  } catch (e) {
    logUpstreamError(e, engineUrl)
    if (row && isTerminalJobState(row.state)) {
      return res.status(200).json({ ok: true, upstream_unreachable: true })
    }
    res.status(502).json({
      error: 'upstream_unreachable',
      message: `无法连接下载服务: ${engineUrl}`,
    })
  }
})

app.get('/api/queue-status', requireUser, async (req, res) => {
  const userId = req.user?.id
  const queueUserId = userId || 'anonymous'
  const queueLength = downloadQueue.getQueueLength(queueUserId)
  res.json({
    queueLength,
    isActive: downloadQueue.isUserActive(queueUserId),
    globalActiveCount: downloadQueue.getGlobalActiveCount(),
    maxGlobalConcurrent: MAX_GLOBAL_CONCURRENT,
  })
})

async function handleCreateJob(req, res) {
  const userId = req.user?.id
  const queueUserId = userId || 'anonymous'
  const localJobId = `node-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`

  const task = {
    authUserId: userId || null,
    account: req.user?.username || null,
    localId: localJobId,
    createdAt: dbNow(),
    bookId: String(req.body?.book_id || '').trim(),
    title: String(req.body?.title || req.body?.book_name || '').trim(),
    body: req.body ?? {},
    headers: forwardHeaders(req, { jsonBody: true }),
    res: null,
  }

  createLocalJobRecord(task)

  if (downloadQueue.isUserActive(queueUserId) || !downloadQueue.canStartNewTask()) {
    downloadQueue.addToQueue(queueUserId, task)
    const queueLength = downloadQueue.getQueueLength(queueUserId)
    res.status(202).json({
      ok: true,
      queued: true,
      id: task.localId,
      local_queue_id: task.localId,
      book_id: task.bookId,
      title: task.title || task.bookId,
      state: 'queued',
      message: `已加入队列，当前排队人数: ${queueLength}`,
      queueLength,
    })
  } else {
    task.res = res
    downloadQueue.addToQueue(queueUserId, task)
  }
}

app.post('/api/jobs', requireJobQuota, handleCreateJob)
app.post('/api/download', requireJobQuota, handleCreateJob)

app.use('/download', requireUser, (req, res) => {
  const tail = req.originalUrl.split('?')[0].slice('/download'.length).replace(/^\/+/, '')
  if (!userOwnsLibraryPath(req, tail)) {
    return res.status(403).json({ error: 'forbidden', message: '无权下载该文件' })
  }
  const upstream = `${TARGET}/download/${tail}`
  proxyUpstreamStream(req, res, upstream)
})

app.use('/download-zip', requireUser, (req, res) => {
  const tail = req.originalUrl.split('?')[0].slice('/download-zip'.length).replace(/^\/+/, '')
  if (!userOwnsLibraryPath(req, tail)) {
    return res.status(403).json({ error: 'forbidden', message: '无权下载该文件' })
  }
  const upstream = `${TARGET}/download-zip/${tail}`
  proxyUpstreamStream(req, res, upstream)
})

const clientDist = path.resolve(__dirname, '..', 'client', 'dist')
if (IS_PRODUCTION) {
  app.use(express.static(clientDist))
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'not_found', message: '接口不存在' })
    }
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

async function startServer() {
  try {
    validateProductionConfig()
    await ensureLibraryRootExists()
    failOrphanQueuedJobs()
    setInterval(() => {
      void syncActiveEngineJobs()
    }, ACTIVE_ENGINE_SYNC_MS).unref()
    app.listen(PORT, host, () => {
      console.log(`[proxy] http://${host}:${PORT} -> ${TARGET}`)
      if (ENGINE_TARGETS.length > 1) {
        console.log(`[proxy] 引擎池(${ENGINE_TARGETS.length}): ${ENGINE_TARGETS.join(', ')}`)
      }
      const lr = getLocalLibraryRoot()
      if (lr) console.log(`[proxy] LOCAL_LIBRARY_ROOT -> ${lr}`)
    })
  } catch (e) {
    console.error('[server] 启动失败:', e.message)
    process.exit(1)
  }
}

startServer()
