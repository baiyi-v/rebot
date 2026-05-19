/** 与 reference app.js parseBookId 一致：短链交给上游 resolve_book_id 跟随跳转 */
const SHORT_HOSTS = new Set([
  'changdunovel.com',
  'www.changdunovel.com',
  'fanqienovel.com',
  'www.fanqienovel.com',
  'fqnovel.com',
  'www.fqnovel.com',
])

/**
 * 从粘贴文本中提取 book_id、详情 URL 或番茄短链（整段 URL 需交给服务端解析）
 * @param {string} raw
 */
export function extractBookInput(raw) {
  const trimmed = (raw ?? '').toString().trim()
  if (!trimmed) return ''
  if (/^[0-9]+$/.test(trimmed)) return trimmed

  const urlMatch = trimmed.match(/https?:\/\/[^\s]+/i)
  const target = urlMatch ? urlMatch[0] : trimmed

  const qs = target.match(/(?:^|[?&#])(?:book_id|bookId)=([0-9]+)/i)
  if (qs?.[1]) return qs[1]

  const page = target.match(/\/page\/([0-9]+)/i)
  if (page?.[1]) return page[1]

  try {
    const parsed = new URL(target)
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      SHORT_HOSTS.has(parsed.hostname.toLowerCase()) &&
      /^\/t\/[A-Za-z0-9_-]+\/?$/.test(parsed.pathname)
    ) {
      return target
    }
  } catch {
    /* ignore */
  }

  return target
}
