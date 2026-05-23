import { reactive } from 'vue'

function loadToken() {
  try {
    return localStorage.getItem('auth_token') || ''
  } catch {
    return ''
  }
}

export const auth = reactive({
  token: loadToken(),
  user: null,
  authDisabled: false,
  platforms: [],
  loading: false,
  error: '',

  setSession(token, user) {
    this.token = token || ''
    this.user = user || null
    try {
      if (token) localStorage.setItem('auth_token', token)
      else localStorage.removeItem('auth_token')
    } catch {
      /* ignore */
    }
  },

  clearSession() {
    this.setSession('', null)
  },

  async loadMe() {
    this.loading = true
    this.error = ''
    try {
      const headers = {}
      if (this.token) headers.Authorization = `Bearer ${this.token}`
      const r = await fetch('/api/auth/me', { headers })
      const data = await r.json().catch(() => ({}))
      if (data.auth_disabled) {
        this.authDisabled = true
        this.user = null
        return
      }
      this.authDisabled = false
      if (data.user) {
        this.user = data.user
        if (data.token) {
          this.setSession(data.token, data.user)
        }
      } else {
        this.user = null
        if (this.token) this.clearSession()
      }
    } catch (e) {
      this.error = e.message || '加载账号失败'
    } finally {
      this.loading = false
    }
  },

  async loadPlatforms() {
    try {
      const r = await fetch('/api/platforms')
      const data = await r.json().catch(() => ({}))
      this.platforms = Array.isArray(data.items) ? data.items : []
    } catch {
      this.platforms = []
    }
  },

  async login(username, password) {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.message || data.error || `HTTP ${r.status}`)
    this.setSession(data.token, data.user)
    return data
  },

  async register(username, password, platform_slug = 'tomato', card_code = '') {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, platform_slug, card_code }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.message || data.error || `HTTP ${r.status}`)
    this.setSession(data.token, data.user)
    return data
  },

  async logout() {
    try {
      if (this.token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.token}` },
        })
      }
    } catch {
      /* ignore */
    }
    this.clearSession()
  },

  async savePlatform(slug) {
    const r = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ platform_slug: slug }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.message || data.error || `HTTP ${r.status}`)
    if (data.user) this.user = data.user
    return data
  },

  async getCardInfo(code) {
    const r = await fetch(`/api/cards/info/${encodeURIComponent(code)}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.message || data.error || `HTTP ${r.status}`)
    return data
  },

  async redeem(code) {
    const r = await fetch('/api/cards/redeem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ code }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.message || data.error || `HTTP ${r.status}`)
    if (data.user) this.user = data.user
    return data
  },

  async loadPools() {
    const r = await fetch('/api/user/pools', {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.message || data.error || `HTTP ${r.status}`)
    return data.pools || []
  },

  async loadShareToday() {
    const r = await fetch('/api/user/shares/today', {
      headers: { Authorization: `Bearer ${this.token}` },
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.message || data.error || `HTTP ${r.status}`)
    return data
  },

  async claimShareToday() {
    const r = await fetch('/api/user/shares/today/claim', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.message || data.error || `HTTP ${r.status}`)
    return data
  },

  membershipActive() {
    const u = this.user
    if (!u || u.membership_expires_at == null) return false
    return u.membership_expires_at > Date.now()
  },
})
