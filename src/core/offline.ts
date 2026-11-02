export type CachedUser = { email: string; role: 'admin' | 'user' }

const userKey = 'niorb:offline-user:v1'

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

const ownerKey = 'niorb:storage-owner:v1'
// Not account data: who is signed in and which workspace the device opened last.
const deviceKeys = new Set([ownerKey, userKey, 'niorb:last-workspace:v1'])
const isAccountKey = (key: string) => key.startsWith('niorb:') && !deviceKeys.has(key)
const knowledgeDatabase = 'niorb-learning'
type AccountArchive = { localStorage: Record<string, string>; knowledge: unknown }

function idb<T>(request: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) }) }
function openDatabase(name: string, store: string) {
  const request = indexedDB.open(name, 1)
  request.onupgradeneeded = () => request.result.createObjectStore(store)
  return idb(request)
}
async function withStore<T>(name: string, store: string, mode: IDBTransactionMode, run: (objects: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDatabase(name, store)
  try { return await idb(run(db.transaction(store, mode).objectStore(store))) } finally { db.close() }
}
const archives = <T>(mode: IDBTransactionMode, run: (objects: IDBObjectStore) => IDBRequest<T>) => withStore('niorb-accounts', 'archives', mode, run)
const knowledge = <T>(mode: IDBTransactionMode, run: (objects: IDBObjectStore) => IDBRequest<T>) => withStore(knowledgeDatabase, 'knowledge', mode, run)

async function clearCachedApiResponses() {
  if (typeof caches === 'undefined') return
  for (const name of (await caches.keys()).filter((cacheName) => cacheName.startsWith('niorb-shell-'))) {
    const cache = await caches.open(name)
    for (const request of await cache.keys()) if (new URL(request.url).pathname.startsWith('/api/')) await cache.delete(request)
  }
}

/** Removes every account's progress kept in this browser; the server copy is untouched. */
export async function clearLocalAccountData() {
  for (const key of Object.keys(window.localStorage)) if (isAccountKey(key)) window.localStorage.removeItem(key)
  if ('indexedDB' in window) await knowledge('readwrite', (objects) => objects.clear()).catch(() => undefined)
  await clearCachedApiResponses().catch(() => undefined)
}

/** Erases the signed-in learner's history on the server first, then on this device. */
export async function clearAccountHistory() {
  const response = await fetch('/api/study/progress', { method: 'DELETE' }).catch(() => null)
  if (!response?.ok) throw new Error(((await response?.json().catch(() => null)) as { error?: string } | null)?.error)
  await clearLocalAccountData()
}

async function archiveAccount(email: string) {
  const localStorage = Object.fromEntries(Object.keys(window.localStorage).filter(isAccountKey).map((key) => [key, window.localStorage.getItem(key) ?? '']))
  const archive: AccountArchive = { localStorage, knowledge: await knowledge('readonly', (objects) => objects.get('global')) }
  await archives('readwrite', (objects) => objects.put(archive, email))
}

async function restoreAccount(email: string) {
  const archive = await archives<AccountArchive | undefined>('readonly', (objects) => objects.get(email))
  if (!archive) return
  for (const [key, value] of Object.entries(archive.localStorage)) window.localStorage.setItem(key, value)
  if (archive.knowledge) await knowledge('readwrite', (objects) => objects.put(archive.knowledge, 'global'))
  await archives('readwrite', (objects) => objects.delete(email))
}

/**
 * Progress lives in this browser and part of it never reaches the server, so
 * switching accounts sets the previous account's data aside under its e-mail
 * and brings back whatever the incoming account left on this device.
 * Data saved before ownership was tracked belongs to the cached user or, when
 * none is known, to whoever signs in first.
 */
export async function claimDeviceStorage(email: string) {
  const owner = window.localStorage.getItem(ownerKey) ?? loadCachedUser()?.email ?? email
  if (owner !== email) {
    if (!('indexedDB' in window)) return // nowhere safe to set the data aside: keep it rather than lose it
    try { await archiveAccount(owner) } catch { return }
    await clearLocalAccountData()
    await restoreAccount(email).catch(() => undefined)
  }
  window.localStorage.setItem(ownerKey, email)
}

export function saveCachedJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function loadCachedJson<T>(key: string): T | null {
  try { return JSON.parse(window.localStorage.getItem(key) ?? '') as T } catch { return null }
}
