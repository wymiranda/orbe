import { createKnowledgeSnapshot } from './knowledge'
import type { KnowledgeSnapshot } from './types'

const databaseName = 'niorb-learning'
const storeName = 'knowledge'
const key = 'global'
const fallbackKey = 'niorb:learning:knowledge:v1'

function valid(value: unknown): value is KnowledgeSnapshot { return Boolean(value) && typeof value === 'object' && (value as KnowledgeSnapshot).version === 1 && typeof (value as KnowledgeSnapshot).contents === 'object' }
function fallbackLoad() { try { const value = JSON.parse(localStorage.getItem(fallbackKey) ?? ''); return valid(value) ? value : createKnowledgeSnapshot() } catch { return createKnowledgeSnapshot() } }

/** IndexedDB store with a localStorage fallback for restrictive/private browsers. */
export class KnowledgeRepository {
  private async database() {
    if (!('indexedDB' in window)) return null
    return new Promise<IDBDatabase | null>((resolve) => {
      const request = indexedDB.open(databaseName, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(storeName)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    })
  }
  async load() {
    const db = await this.database()
    if (!db) return fallbackLoad()
    return new Promise<KnowledgeSnapshot>((resolve) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key)
      request.onsuccess = () => { db.close(); resolve(valid(request.result) ? request.result : createKnowledgeSnapshot()) }
      request.onerror = () => { db.close(); resolve(fallbackLoad()) }
    })
  }
  async save(snapshot: KnowledgeSnapshot) {
    const db = await this.database()
    if (!db) { localStorage.setItem(fallbackKey, JSON.stringify(snapshot)); return }
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).put(snapshot, key)
      transaction.oncomplete = () => { db.close(); resolve() }
      transaction.onerror = () => { db.close(); reject(transaction.error) }
    }).catch(() => localStorage.setItem(fallbackKey, JSON.stringify(snapshot)))
  }
}
