import { reactive } from 'vue'

let nextId = 1
const DEFAULT_DURATION = 3500
const MAX_TOASTS = 5

export const toasts = reactive([])

export function toast(msg, kind = 'error', duration = DEFAULT_DURATION) {
  const id = nextId++
  toasts.push({ id, msg, kind })
  if (toasts.length > MAX_TOASTS) toasts.shift()

  if (duration > 0) {
    setTimeout(() => {
      const idx = toasts.findIndex((t) => t.id === id)
      if (idx !== -1) toasts.splice(idx, 1)
    }, duration)
  }
}

export function toastError(msg, duration) {
  toast(msg, 'error', duration)
}

export function toastSuccess(msg, duration) {
  toast(msg, 'success', duration)
}

export function toastInfo(msg, duration) {
  toast(msg, 'info', duration)
}
