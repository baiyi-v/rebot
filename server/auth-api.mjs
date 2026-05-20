import crypto from 'node:crypto'
import { q, dbNow } from './db.mjs'
import {
  hashPassword,
  verifyPassword,
  createSession,
  deleteSession,
  getUserFromToken,
  userPublic,
  membershipActive,
  redeemCardForUser,
  registerUserWithCard,
} from './auth-core.mjs'

export function authDisabled() {
  return process.env.AUTH_DISABLED === '1'
}

export function bearerToken(req) {
  const h = req.headers.authorization || ''
  const m = String(h).match(/^Bearer\s+(.+)$/i)
  if (m) return m[1].trim()

  const queryToken = String(req.query?.auth_token || '').trim()
  if (queryToken) return queryToken
  
  const cookieHeader = req.headers.cookie || ''
  const cookieMatch = cookieHeader.match(/auth_token=([^;]+)/)
  if (cookieMatch) return cookieMatch[1].trim()
  
  return ''
}

export function attachUser(req, res, next) {
  if (authDisabled()) {
    req.user = null
    req.authToken = null
    return next()
  }
  const token = bearerToken(req)
  req.authToken = token || null
  req.user = token ? getUserFromToken(token) : null
  next()
}

export function setAuthCookie(res, token) {
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: 'strict',
  })
}

export function requireUser(req, res, next) {
  if (authDisabled()) return next()
  if (!req.user) {
    return res.status(401).json({ error: 'unauthorized', message: '请先登录' })
  }
  next()
}

export function requireJobQuota(req, res, next) {
  if (authDisabled()) return next()
  if (!req.user) {
    return res.status(401).json({ error: 'unauthorized', message: '请先登录' })
  }
  if (!membershipActive(req.user)) {
    return res.status(403).json({
      error: 'no_downloads',
      message: '下载次数已用完或已过期，请使用卡密充值',
    })
  }
  next()
}

function randomCardCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const buf = crypto.randomBytes(16)
  let s = ''
  for (let i = 0; i < 16; i++) {
    s += chars[buf[i] % chars.length]
    if (i === 7) s += '-'
  }
  return s
}

function adminIpAllowed(req) {
  const raw = String(process.env.ADMIN_ALLOWED_IPS || '').trim()
  if (!raw) return true
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const ip = String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '')
  return allowed.includes(ip)
}

function verifyAdminSecret(req, res) {
  const ADMIN_SECRET = (process.env.ADMIN_SECRET || '').trim()
  if (!ADMIN_SECRET) {
    res.status(503).json({ error: 'no_admin', message: '未配置环境变量 ADMIN_SECRET' })
    return false
  }
  if (!adminIpAllowed(req)) {
    res.status(403).json({ error: 'forbidden', message: '当前 IP 不允许访问管理接口' })
    return false
  }
  const secret = String(req.headers['x-admin-secret'] || '')
  if (secret !== ADMIN_SECRET) {
    res.status(403).json({ error: 'forbidden', message: '管理密钥错误' })
    return false
  }
  return true
}

/**
 * @param {import('express').Express} app
 */
export function mountAuthRoutes(app) {
  app.use(attachUser)

  app.get('/api/platforms', (_req, res) => {
    const items = q.listPlatforms.all()
    res.json({ items })
  })

  app.post('/api/auth/register', (req, res) => {
    if (authDisabled()) {
      return res.status(503).json({ error: 'auth_disabled', message: '服务器未启用账号体系（AUTH_DISABLED）' })
    }
    const username = String(req.body?.username || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const platform_slug = String(req.body?.platform_slug || 'tomato').trim().toLowerCase()

    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
      return res.status(400).json({
        error: 'bad_username',
        message: '用户名为 3–32 位小写字母、数字或下划线',
      })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'bad_password', message: '密码至少 6 位' })
    }
    if (!q.platformExists.get(platform_slug)) {
      return res.status(400).json({ error: 'bad_platform', message: '未知平台' })
    }

    const cardCode = String(req.body?.card_code || req.body?.code || '').trim()

    if (q.userByUsername.get(username)) {
      return res.status(409).json({ error: 'exists', message: '用户名已被注册' })
    }

    if (cardCode) {
      const result = registerUserWithCard({ username, password, platform_slug, rawCode: cardCode })
      if (!result.ok) {
        const map = {
          empty_code: [400, '请输入卡密'],
          invalid_code: [404, '卡密无效'],
          code_used_up: [409, '卡密已用尽'],
          exists: [409, '用户名已被注册'],
          register_failed: [500, '注册失败，请重试'],
          redeem_failed: [409, '充值失败，请重试'],
          create_failed: [500, '注册失败，请重试'],
        }
        const [status, msg] = map[result.error] || [400, '注册失败']
        return res.status(status).json({ error: result.error, message: msg })
      }

      const user = q.userByUsername.get(username)
      const sess = createSession(user.id)
      setAuthCookie(res, sess.token)
      return res.json({
        token: sess.token,
        expires_at: sess.expires_at,
        user: result.user,
      })
    }

    const { hash, salt } = hashPassword(password)
    const created_at = dbNow()
    try {
      q.insertUser.run({
        username,
        password_hash: hash,
        password_salt: salt,
        platform_slug,
        created_at,
      })
    } catch {
      return res.status(409).json({ error: 'exists', message: '用户名已被注册' })
    }

    const user = q.userByUsername.get(username)
    const sess = createSession(user.id)
    setAuthCookie(res, sess.token)
    res.json({
      token: sess.token,
      expires_at: sess.expires_at,
      user: userPublic(user),
    })
  })

  app.post('/api/auth/login', (req, res) => {
    if (authDisabled()) {
      return res.status(503).json({ error: 'auth_disabled', message: '服务器未启用账号体系（AUTH_DISABLED）' })
    }
    const username = String(req.body?.username || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const user = q.userByUsername.get(username)
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      return res.status(401).json({ error: 'bad_credentials', message: '用户名或密码错误' })
    }
    const sess = createSession(user.id)
    const fresh = q.userById.get(user.id)
    setAuthCookie(res, sess.token)
    res.json({
      token: sess.token,
      expires_at: sess.expires_at,
      user: userPublic(fresh),
    })
  })

  app.post('/api/auth/logout', requireUser, (req, res) => {
    if (req.authToken) deleteSession(req.authToken)
    res.clearCookie('auth_token')
    res.json({ ok: true })
  })

  app.get('/api/auth/me', (req, res) => {
    if (authDisabled()) {
      return res.json({ auth_disabled: true, user: null })
    }
    if (!req.user) return res.json({ user: null })
    res.json({ 
      user: userPublic(q.userById.get(req.user.id)),
      token: req.authToken || null 
    })
  })

  app.patch('/api/auth/me', requireUser, (req, res) => {
    const platform_slug = String(req.body?.platform_slug || '').trim().toLowerCase()
    if (!platform_slug) {
      return res.status(400).json({ error: 'bad_platform', message: '缺少 platform_slug' })
    }
    if (!q.platformExists.get(platform_slug)) {
      return res.status(400).json({ error: 'bad_platform', message: '未知平台' })
    }
    q.updateUserPlatform.run(platform_slug, req.user.id)
    res.json({ user: userPublic(q.userById.get(req.user.id)) })
  })

  app.post('/api/cards/redeem', requireUser, (req, res) => {
    const result = redeemCardForUser(req.user.id, req.body?.code)
    if (!result.ok) {
      const map = {
        empty_code: [400, '请输入卡密'],
        invalid_code: [404, '卡密无效'],
        code_used_up: [409, '卡密已用尽'],
        redeem_failed: [409, '充值失败，请重试'],
        no_user: [401, '请重新登录'],
      }
      const [status, msg] = map[result.error] || [400, '充值失败']
      return res.status(status).json({ error: result.error, message: msg })
    }
    res.json({ ok: true, user: result.user })
  })

  app.get('/api/cards/info/:code', requireUser, (req, res) => {
    const code = String(req.params.code || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
    if (!code) return res.status(400).json({ error: 'empty_code', message: '请输入卡密' })

    const row = q.cardByCode.get(code)
    if (!row) return res.status(404).json({ error: 'invalid_code', message: '卡密无效' })
    if (row.uses >= row.max_uses) return res.status(409).json({ error: 'code_used_up', message: '卡密已用尽' })

    res.json({
      code,
      days: row.days,
      downloads: row.downloads,
      max_uses: row.max_uses,
      uses: row.uses,
    })
  })

  app.get('/api/user/pools', requireUser, (req, res) => {
    const now = dbNow()
    q.cleanExpiredPools.run(now)
    const pools = q.getUserPools.all(req.user.id, now)
    res.json({ pools })
  })

  app.post('/api/admin/cards/validate', (req, res) => {
    if (!verifyAdminSecret(req, res)) return
    res.json({ ok: true })
  })

  app.post('/api/admin/cards', (req, res) => {
    if (!verifyAdminSecret(req, res)) return
    const days = Number(req.body?.days)
    const downloads = Number(req.body?.downloads)
    const count = Math.min(100, Math.max(1, Number(req.body?.count) || 1))
    const max_uses = Math.min(1000, Math.max(1, Number(req.body?.max_uses) || 1))
    const note = String(req.body?.note || '').slice(0, 200)

    if (!Number.isFinite(days) || days < 0 || days > 36500) {
      return res.status(400).json({ error: 'bad_days', message: '天数无效（0–36500）' })
    }
    if (!Number.isFinite(downloads) || downloads < 0 || downloads > 1_000_000) {
      return res.status(400).json({ error: 'bad_downloads', message: '下载次数无效' })
    }

    const codes = []
    const created_at = dbNow()
    for (let i = 0; i < count; i++) {
      let inserted = false
      for (let t = 0; t < 40 && !inserted; t++) {
        const code = randomCardCode()
        try {
          q.insertCard.run({ code, days, downloads, max_uses, created_at, note })
          codes.push(code)
          inserted = true
        } catch {
          /* unique */
        }
      }
      if (!inserted) {
        return res.status(500).json({ error: 'generate_failed', message: '生成卡密失败' })
      }
    }
    res.json({ codes, days, downloads, max_uses, count: codes.length })
  })
}
