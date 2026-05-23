import crypto from 'node:crypto'
import { q, dbNow, db } from './db.mjs'

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const SESSION_MS = 30 * 24 * 60 * 60 * 1000

function calcExpiresAt(days, fromTs) {
  const d = new Date(fromTs)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export function hashPassword(password, saltBuf = crypto.randomBytes(16)) {
  const salt = saltBuf
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT_PARAMS)
  return {
    hash: hash.toString('base64'),
    salt: salt.toString('base64'),
  }
}

export function verifyPassword(password, saltB64, hashB64) {
  try {
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(hashB64, 'base64')
    const hash = crypto.scryptSync(password, salt, 64, SCRYPT_PARAMS)
    return crypto.timingSafeEqual(hash, expected)
  } catch {
    return false
  }
}

export function randomToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function createSession(userId) {
  q.deleteExpiredSessions.run(dbNow())
  const token = randomToken()
  const expiresAt = dbNow() + SESSION_MS
  q.insertSession.run(userId, token, expiresAt)
  return { token, expires_at: expiresAt }
}

export function deleteSession(token) {
  q.deleteSession.run(token)
}

export function getUserFromToken(token) {
  if (!token || typeof token !== 'string') return null
  q.deleteExpiredSessions.run(dbNow())
  return q.userFromToken.get(token, dbNow()) ?? null
}

export function userPublic(u) {
  if (!u) return null
  const now = dbNow()
  const total = q.sumActiveDownloads.get(u.id, now)?.total || 0
  const maxExp = q.maxPoolExpiresAt.get(u.id, now)?.max_exp || null
  return {
    id: u.id,
    username: u.username,
    platform_slug: u.platform_slug,
    membership_expires_at: maxExp,
    downloads_remaining: total,
  }
}

export function membershipActive(u) {
  if (!u) return false
  const now = dbNow()
  const row = q.sumActiveDownloads.get(u.id, now)
  return (row?.total || 0) > 0
}

export function canCreateJob(u) {
  return membershipActive(u)
}

function activePools(userId) {
  const now = dbNow()
  q.cleanExpiredPools.run(now)
  return q.getActivePools.all(userId, now)
}

function syncUserCache(userId) {
  const now = dbNow()
  const total = q.sumActiveDownloads.get(userId, now)?.total || 0
  const maxExp = q.maxPoolExpiresAt.get(userId, now)?.max_exp || null
  db.prepare(
    `UPDATE users SET downloads_remaining = ?, membership_expires_at = ? WHERE id = ?`
  ).run(total, maxExp, userId)
}

export function consumeJobCredit(userId) {
  const now = dbNow()
  const pools = q.getActivePools.all(userId, now)
  if (pools.length === 0) return false

  const pool = pools[0]
  const info = q.consumeFromPool.run(pool.id)
  if (info.changes !== 1) return false

  syncUserCache(userId)
  return true
}

export function refundJobCredit(userId) {
  const pools = db.prepare(`
    SELECT * FROM download_pools
    WHERE user_id = ? AND remaining < downloads
    ORDER BY expires_at DESC
  `).all(userId)

  if (pools.length === 0) return false

  const pool = pools[0]
  const info = q.refundToPool.run(pool.id)
  if (info.changes !== 1) return false

  syncUserCache(userId)
  return true
}

export function redeemCardForUser(userId, rawCode) {
  const code = String(rawCode || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (!code) return { ok: false, error: 'empty_code' }

  const row = q.cardByCode.get(code)
  if (!row) return { ok: false, error: 'invalid_code' }
  if (row.uses >= row.max_uses) return { ok: false, error: 'code_used_up' }

  const u = q.userById.get(userId)
  if (!u) return { ok: false, error: 'no_user' }

  if (row.is_event && q.userRedeemedCard.get(userId, row.id)) {
    return { ok: false, error: 'event_redeemed' }
  }

  const now = dbNow()
  const expiresAt = calcExpiresAt(row.days, now)

  const tx = db.transaction(() => {
    const r2 = q.cardByCode.get(code)
    if (!r2 || r2.uses >= r2.max_uses) throw new Error('race')

    const updUses = q.redeemCard.run(r2.id)
    if (updUses.changes !== 1) throw new Error('race')

    q.insertDownloadPool.run(userId, r2.id, r2.downloads, r2.downloads, expiresAt, now)
    q.insertRedemption.run(userId, r2.id, r2.days, r2.downloads, now)
  })

  try {
    tx()
  } catch {
    return { ok: false, error: 'redeem_failed' }
  }

  syncUserCache(userId)

  const fresh = q.userById.get(userId)
  return { ok: true, user: userPublic(fresh) }
}

export function registerUserWithCard({ username, password, platform_slug, rawCode }) {
  const code = String(rawCode || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (!code) return { ok: false, error: 'empty_code' }
  if (q.userByUsername.get(username)) return { ok: false, error: 'exists' }

  const { hash, salt } = hashPassword(password)
  const created_at = dbNow()

  const tx = db.transaction(() => {
    const card = q.cardByCode.get(code)
    if (!card) throw new Error('invalid_code')
    if (card.uses >= card.max_uses) throw new Error('code_used_up')

    q.insertUser.run({
      username,
      password_hash: hash,
      password_salt: salt,
      platform_slug,
      created_at,
    })

    const user = q.userByUsername.get(username)
    if (!user) throw new Error('create_failed')

    const freshCard = q.cardByCode.get(code)
    if (!freshCard || freshCard.uses >= freshCard.max_uses) throw new Error('code_used_up')

    const updUses = q.redeemCard.run(freshCard.id)
    if (updUses.changes !== 1) throw new Error('redeem_failed')

    const expiresAt = calcExpiresAt(freshCard.days, created_at)
    q.insertDownloadPool.run(user.id, freshCard.id, freshCard.downloads, freshCard.downloads, expiresAt, created_at)
    q.insertRedemption.run(user.id, freshCard.id, freshCard.days, freshCard.downloads, created_at)

    db.prepare(
      `UPDATE users SET downloads_remaining = ?, membership_expires_at = ? WHERE id = ?`
    ).run(freshCard.downloads, expiresAt, user.id)
  })

  try {
    tx()
  } catch (e) {
    const known = new Set(['invalid_code', 'code_used_up', 'redeem_failed', 'create_failed'])
    if (known.has(e.message)) return { ok: false, error: e.message }
    if (String(e.message || '').includes('UNIQUE')) return { ok: false, error: 'exists' }
    return { ok: false, error: 'register_failed' }
  }

  return { ok: true, user: userPublic(q.userByUsername.get(username)) }
}
