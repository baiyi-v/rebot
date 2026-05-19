import path from 'node:path'
import fs from 'node:fs/promises'

const ALLOWED_EXT = new Set(['txt'])

export function getLocalLibraryRoot() {
  const raw = process.env.LOCAL_LIBRARY_ROOT?.trim()
  if (!raw) return null
  const resolved = path.resolve(raw)
  return resolved
}

export async function ensureLibraryRootExists() {
  const root = getLocalLibraryRoot()
  if (!root) return
  
  try {
    await fs.access(root)
  } catch {
    await fs.mkdir(root, { recursive: true })
    console.log(`[library] 已创建目录: ${root}`)
  }
}

export async function findBookFolder(bookId, libraryRoot) {
  return null
}

function safeFileBaseName(name) {
  return String(name || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/[. ]+$/g, '')
}

/**
 * 当前保存目录结构：LOCAL_LIBRARY_ROOT 根目录下直接是成品「书名.txt」。
 *
 * @param {string | null} _folderAbs 兼容旧调用，当前不使用
 * @param {string} libraryRoot 书库根（LOCAL_LIBRARY_ROOT）
 * @param {string} [_bookId] 兼容旧调用，当前不使用
 * @param {string} [titleHint] 任务标题，用于匹配根目录成品
 */
export async function collectBookFiles(_folderAbs, libraryRoot, _bookId, titleHint = '') {
  const rootR = path.resolve(libraryRoot)
  /** @type {{ name: string, relPath: string, ext: string, size: number }[]} */
  const out = []
  const seenRel = new Set()

  async function addFile(full) {
    const ext = path.extname(full).slice(1).toLowerCase()
    if (!ALLOWED_EXT.has(ext)) return false
    const rel = path.relative(rootR, full).split(path.sep).join('/')
    if (seenRel.has(rel)) return false
    seenRel.add(rel)
    const st = await fs.stat(full)
    if (!st.isFile()) return false
    out.push({
      name: path.basename(full),
      relPath: rel,
      ext,
      size: st.size,
    })
    return true
  }

  const titleSuffix = safeFileBaseName(titleHint)
  
  if (titleSuffix) {
    const full = path.join(rootR, `${titleSuffix}.txt`)
    try {
      const st = await fs.stat(full)
      if (st.isFile()) await addFile(full)
    } catch {
      /* absent */
    }
  }

  out.sort((a, b) => a.relPath.localeCompare(b.relPath))
  return out
}

/** relPath 使用 / 分隔，必须在 libraryRoot 之下 */
export function safeResolveUnderLibraryRoot(libraryRoot, relPath) {
  const rootR = path.resolve(libraryRoot)
  const segments = relPath.split('/').filter((s) => s && s !== '.' && s !== '..').map(decodeURIComponent)
  const joined = path.resolve(rootR, ...segments)
  const rel = path.relative(rootR, joined)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('path_traversal')
  }
  return joined
}
