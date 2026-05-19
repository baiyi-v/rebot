/** save_phase → 简短说明（用于副标题）；reference-backend 另有 Audiobook */
export const PHASE_LABEL = {
  TextSave: '写入文件中',
  Fetch: '获取章节中',
  Parse: '解析内容中',
  Audiobook: '有声生成中',
}

/**
 * reference-backend：`failed` / `canceled`；旧接口可能为 `error`
 * @param {string | undefined} state
 */
export function normalizeUiState(state) {
  const s = state || ''
  if (s === 'failed' || s === 'error') return 'failed'
  return s
}

/**
 * @param {{ state: string, progress?: object, message?: string | null }} job
 */
export function getJobDisplay(job) {
  const prog = job.progress || {}
  const total = Number(prog.chapter_total) || 0
  const saved = Number(prog.saved_chapters) || 0
  const phase = prog.save_phase
  const phaseLabel = phase && PHASE_LABEL[phase] ? PHASE_LABEL[phase] : null

  let percent = 0
  let partial = false
  const state = job.state
  const uiState = normalizeUiState(state)

  if (uiState === 'failed') {
    percent = total > 0 ? Math.min(100, (saved / total) * 100) : 0
  } else if (state === 'done') {
    percent = 100
    if (total > 0 && saved < total) partial = true
  } else if (state === 'queued') {
    percent = 0
  } else if (state === 'running') {
    percent = total > 0 ? (saved / total) * 100 : 0
  } else if (state === 'canceled') {
    percent = total > 0 ? Math.min(100, (saved / total) * 100) : 0
  }

  const statusMap = {
    queued: '排队中',
    running: '下载中',
    done: partial ? '部分完成' : '已完成',
    failed: '失败',
    canceled: '已取消',
  }
  let statusLabel = statusMap[state] || statusMap[uiState] || state

  const parts = []
  if (saved > 0 || total > 0) parts.push(`${saved} / ${total} 章`)
  if (phaseLabel && state === 'running') parts.push(phaseLabel)

  const pendingBookName = Array.isArray(job.book_name_options) && job.book_name_options.length > 0
  const pendingFormat = Array.isArray(job.format_options) && job.format_options.length > 0
  if (pendingBookName) parts.push('待选书名')
  else if (pendingFormat) parts.push('待选格式')
  const subLine = parts.join(' · ')

  return {
    percent,
    partial,
    saved,
    total,
    phaseLabel,
    statusLabel,
    subLine,
  }
}
