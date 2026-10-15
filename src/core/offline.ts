export type CachedUser = { email: string; role: 'admin' | 'user' }

const userKey = 'orbe:offline-user:v1'

export function saveCachedUser(user: CachedUser) {
  window.localStorage.setItem(userKey, JSON.stringify(user))
}

export function loadCachedUser(): CachedUser | null {
  try {
    const user = JSON.parse(window.localStorage.getItem(userKey) ?? '') as CachedUser
    return user?.email && (user.role === 'admin' || user.role === 'user') ? user : null
  } catch { return null }
}

export function clearCachedUser() {
  window.localStorage.removeItem(userKey)
}

export function saveCachedJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function loadCachedJson<T>(key: string): T | null {
  try { return JSON.parse(window.localStorage.getItem(key) ?? '') as T } catch { return null }
}
