const ACCESS_KEY = 'signbridge.access_token'
const REFRESH_KEY = 'signbridge.refresh_token'
const USER_KEY = 'signbridge.user'

let memory = {
  access: read(ACCESS_KEY),
  refresh: read(REFRESH_KEY),
}

function read(key) {
  try {
    return window.localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function write(key, value) {
  try {
    if (value) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch {
    /* storage may be disabled — tokens stay in memory for this tab */
  }
}

export const tokenStore = {
  get access() {
    return memory.access || read(ACCESS_KEY)
  },
  get refresh() {
    return memory.refresh || read(REFRESH_KEY)
  },
  set({ access_token, refresh_token }) {
    memory.access = access_token || ''
    memory.refresh = refresh_token || memory.refresh
    write(ACCESS_KEY, memory.access)
    write(REFRESH_KEY, memory.refresh)
  },
  clear() {
    memory = { access: '', refresh: '' }
    write(ACCESS_KEY, '')
    write(REFRESH_KEY, '')
    write(USER_KEY, '')
  },
}

export function readCachedUser() {
  try {
    const raw = window.localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function cacheUser(user) {
  try {
    if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user))
    else window.localStorage.removeItem(USER_KEY)
  } catch {
    /* ignore */
  }
}
