import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import Database from 'better-sqlite3'

const require = createRequire(import.meta.url)
const dotenv = require('dotenv')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const dbPath = path.join(dataDir, 'app.db')
export const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS platforms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  platform_slug TEXT NOT NULL DEFAULT 'tomato',
  membership_expires_at INTEGER,
  downloads_remaining INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS card_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  days INTEGER NOT NULL,
  downloads INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL REFERENCES card_keys(id),
  days_added INTEGER NOT NULL,
  downloads_added INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_jobs_user_id ON user_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_jobs_job_id ON user_jobs(job_id);

CREATE TABLE IF NOT EXISTS user_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT NOT NULL,
  book_id TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(account, book_id)
);

CREATE INDEX IF NOT EXISTS idx_user_books_account ON user_books(account);
CREATE INDEX IF NOT EXISTS idx_user_books_book_id ON user_books(book_id);

CREATE TABLE IF NOT EXISTS user_job_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT NOT NULL,
  job_id TEXT NOT NULL,
  book_id TEXT,
  title TEXT,
  author TEXT,
  state TEXT NOT NULL DEFAULT 'done',
  message TEXT,
  progress_json TEXT,
  job_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(account, job_id)
);

CREATE INDEX IF NOT EXISTS idx_user_job_records_account_created ON user_job_records(account, created_at);
CREATE INDEX IF NOT EXISTS idx_user_job_records_book_id ON user_job_records(book_id);

CREATE TABLE IF NOT EXISTS download_urls (
  batch_id TEXT NOT NULL,
  dl_index INTEGER NOT NULL,
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (batch_id, dl_index)
);

CREATE INDEX IF NOT EXISTS idx_download_urls_batch_id ON download_urls(batch_id);
CREATE INDEX IF NOT EXISTS idx_download_urls_created_at ON download_urls(created_at);
`)

const userJobColumns = db.prepare(`PRAGMA table_info(user_jobs)`).all()
if (!userJobColumns.some((c) => c.name === 'book_id')) {
  db.exec(`ALTER TABLE user_jobs ADD COLUMN book_id TEXT`)
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_user_jobs_book_id ON user_jobs(book_id);`)

const userJobRecordColumns = db.prepare(`PRAGMA table_info(user_job_records)`).all()
if (!userJobRecordColumns.some((c) => c.name === 'engine_job_id')) {
  db.exec(`ALTER TABLE user_job_records ADD COLUMN engine_job_id TEXT`)
}
if (!userJobRecordColumns.some((c) => c.name === 'engine_url')) {
  db.exec(`ALTER TABLE user_job_records ADD COLUMN engine_url TEXT`)
}
if (!userJobRecordColumns.some((c) => c.name === 'download_status')) {
  db.exec(`ALTER TABLE user_job_records ADD COLUMN download_status TEXT`)
}
if (!userJobRecordColumns.some((c) => c.name === 'files_json')) {
  db.exec(`ALTER TABLE user_job_records ADD COLUMN files_json TEXT`)
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_user_job_records_engine_job_id ON user_job_records(engine_job_id);`)
db.exec(`CREATE INDEX IF NOT EXISTS idx_user_job_records_engine_url ON user_job_records(engine_url);`)

db.exec(`
INSERT OR IGNORE INTO user_books (account, book_id, title, created_at, updated_at)
SELECT u.username, uj.book_id, NULL, MIN(uj.created_at), MAX(uj.created_at)
FROM user_jobs uj
INNER JOIN users u ON u.id = uj.user_id
WHERE uj.book_id IS NOT NULL AND uj.book_id != ''
GROUP BY u.username, uj.book_id;

INSERT OR IGNORE INTO user_job_records (
  account, job_id, book_id, title, author, state, message, progress_json, job_json, created_at, updated_at
)
SELECT
  u.username,
  uj.job_id,
  uj.book_id,
  uj.book_id,
  '',
  'done',
  NULL,
  '{}',
  json_object('id', uj.job_id, 'book_id', uj.book_id, 'title', COALESCE(uj.book_id, '历史任务'), 'author', '', 'state', 'done', 'progress', json_object()),
  uj.created_at,
  uj.created_at
FROM user_jobs uj
INNER JOIN users u ON u.id = uj.user_id
WHERE uj.job_id IS NOT NULL AND uj.job_id != '';
`)

const seedPlatforms = db.prepare(
  `INSERT OR IGNORE INTO platforms (slug, name, sort_order) VALUES (@slug, @name, @sort_order)`
)
for (const p of [
  { slug: 'tomato', name: '番茄小说', sort_order: 10 },
  { slug: 'sotxt8', name: '搜TXT吧', sort_order: 15 },
  { slug: 'fanqie', name: '（预留）', sort_order: 20 },
  { slug: 'qidian', name: '（预留）', sort_order: 30 },
]) {
  seedPlatforms.run(p)
}

db.exec(`UPDATE OR IGNORE platforms SET slug = 'txtsearch', name = 'TXT搜索' WHERE slug = 'sotxt8'`)

export const q = {
  userByUsername: db.prepare(`SELECT * FROM users WHERE username = ?`),
  userById: db.prepare(`SELECT * FROM users WHERE id = ?`),
  insertUser: db.prepare(`
    INSERT INTO users (username, password_hash, password_salt, platform_slug, membership_expires_at, downloads_remaining, created_at)
    VALUES (@username, @password_hash, @password_salt, @platform_slug, NULL, 0, @created_at)
  `),
  updateUserPlatform: db.prepare(`UPDATE users SET platform_slug = ? WHERE id = ?`),
  insertSession: db.prepare(`
    INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)
  `),
  deleteSession: db.prepare(`DELETE FROM sessions WHERE token = ?`),
  deleteExpiredSessions: db.prepare(`DELETE FROM sessions WHERE expires_at < ?`),
  userFromToken: db.prepare(`
    SELECT u.* FROM users u
    INNER JOIN sessions s ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
  `),
  cardByCode: db.prepare(`SELECT * FROM card_keys WHERE code = ?`),
  insertCard: db.prepare(`
    INSERT INTO card_keys (code, days, downloads, max_uses, uses, created_at, note)
    VALUES (@code, @days, @downloads, @max_uses, 0, @created_at, @note)
  `),
  redeemCard: db.prepare(`
    UPDATE card_keys SET uses = uses + 1 WHERE id = ? AND uses < max_uses
  `),
  insertRedemption: db.prepare(`
    INSERT INTO redemptions (user_id, card_id, days_added, downloads_added, created_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  consumeDownload: db.prepare(`
    UPDATE users SET downloads_remaining = downloads_remaining - 1
    WHERE id = ? AND downloads_remaining > 0
  `),
  refundDownload: db.prepare(`
    UPDATE users SET downloads_remaining = downloads_remaining + 1
    WHERE id = ?
  `),
  listPlatforms: db.prepare(`SELECT slug, name, sort_order FROM platforms ORDER BY sort_order ASC, id ASC`),
  platformExists: db.prepare(`SELECT slug FROM platforms WHERE slug = ?`),
  insertUserJob: db.prepare(`
    INSERT INTO user_jobs (user_id, job_id, book_id, created_at) VALUES (?, ?, ?, ?)
  `),
  getUserJobsSince: db.prepare(`SELECT job_id, book_id, created_at FROM user_jobs WHERE user_id = ? AND created_at >= ?`),
  userHasJob: db.prepare(`SELECT 1 FROM user_jobs WHERE user_id = ? AND job_id = ? LIMIT 1`),
  upsertUserJobRecord: db.prepare(`
    INSERT INTO user_job_records (
      account, job_id, engine_job_id, engine_url, book_id, title, author, state, message, progress_json, job_json, download_status, files_json, created_at, updated_at
    )
    VALUES (@account, @job_id, @engine_job_id, @engine_url, @book_id, @title, @author, @state, @message, @progress_json, @job_json, @download_status, @files_json, @created_at, @updated_at)
    ON CONFLICT(account, job_id) DO UPDATE SET
      engine_job_id = COALESCE(excluded.engine_job_id, user_job_records.engine_job_id),
      engine_url = COALESCE(excluded.engine_url, user_job_records.engine_url),
      book_id = COALESCE(excluded.book_id, user_job_records.book_id),
      title = COALESCE(excluded.title, user_job_records.title),
      author = COALESCE(excluded.author, user_job_records.author),
      state = excluded.state,
      message = excluded.message,
      progress_json = excluded.progress_json,
      job_json = excluded.job_json,
      download_status = COALESCE(excluded.download_status, user_job_records.download_status),
      files_json = COALESCE(excluded.files_json, user_job_records.files_json),
      updated_at = excluded.updated_at
  `),
  getUserJobRecordsSince: db.prepare(`
    SELECT ujr.*, uj.user_id AS user_id
    FROM user_job_records ujr
    LEFT JOIN user_jobs uj ON uj.job_id = ujr.job_id
    WHERE ujr.account = ? AND ujr.created_at >= ?
    ORDER BY ujr.created_at DESC, ujr.updated_at DESC
  `),
  getActiveEngineJobRecords: db.prepare(`
    SELECT ujr.*, uj.user_id AS user_id
    FROM user_job_records ujr
    LEFT JOIN user_jobs uj ON uj.job_id = ujr.job_id
    WHERE ujr.engine_job_id IS NOT NULL
      AND ujr.engine_job_id != ''
      AND ujr.state IN ('queued', 'running')
    ORDER BY ujr.updated_at ASC
  `),
  getQueuedUnsubmittedJobRecords: db.prepare(`
    SELECT ujr.*, uj.user_id AS user_id
    FROM user_job_records ujr
    LEFT JOIN user_jobs uj ON uj.job_id = ujr.job_id
    WHERE ujr.state = 'queued'
      AND (ujr.engine_job_id IS NULL OR ujr.engine_job_id = '')
    ORDER BY ujr.created_at ASC
  `),
  getUserJobRecordByJobId: db.prepare(`
    SELECT * FROM user_job_records
    WHERE account = ? AND job_id = ?
    LIMIT 1
  `),
  getUserJobRecordsByBookId: db.prepare(`
    SELECT * FROM user_job_records
    WHERE account = ? AND book_id = ?
    ORDER BY updated_at DESC, created_at DESC
  `),
  upsertUserBook: db.prepare(`
    INSERT INTO user_books (account, book_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(account, book_id) DO UPDATE SET
      title = COALESCE(excluded.title, user_books.title),
      updated_at = excluded.updated_at
  `),
  getUserBookIdsByAccount: db.prepare(`SELECT book_id FROM user_books WHERE account = ?`),
  userOwnsBookByAccount: db.prepare(`SELECT 1 FROM user_books WHERE account = ? AND book_id = ? LIMIT 1`),
  deleteUserJob: db.prepare(`DELETE FROM user_jobs WHERE job_id = ?`),
  deleteUserJobForUser: db.prepare(`DELETE FROM user_jobs WHERE user_id = ? AND job_id = ?`),
  deleteUserJobRecord: db.prepare(`DELETE FROM user_job_records WHERE account = ? AND job_id = ?`),
  insertDownloadUrl: db.prepare(`
    INSERT OR REPLACE INTO download_urls (batch_id, dl_index, url, created_at)
    VALUES (?, ?, ?, ?)
  `),
  getDownloadUrl: db.prepare(`
    SELECT url FROM download_urls WHERE batch_id = ? AND dl_index = ?
  `),
  getDownloadUrlBatch: db.prepare(`
    SELECT dl_index, url FROM download_urls WHERE batch_id = ?
  `),
  deleteDownloadUrlBatch: db.prepare(`DELETE FROM download_urls WHERE batch_id = ?`),
  cleanExpiredDownloadUrls: db.prepare(`
    DELETE FROM download_urls WHERE created_at < ?
  `),
}

export function dbNow() {
  return Date.now()
}

