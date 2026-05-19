import { auth } from './auth.js'

/** 与 Node 代理 / Tomato 上游通信时的可选鉴权头 */
export function apiHeaders(json = false) {
  /** @type {Record<string, string>} */
  const h = {}
  if (json) h['Content-Type'] = 'application/json'
  const pwd = import.meta.env.VITE_TOMATO_PASSWORD
  if (typeof pwd === 'string' && pwd.length) h['x-tomato-password'] = pwd
  if (auth.token) h.Authorization = `Bearer ${auth.token}`
  return h
}
