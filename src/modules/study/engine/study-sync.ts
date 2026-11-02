import { mergeRemoteStudyProgress, pendingStudyChanges, pendingVocabularyChanges, queueCompleteStudyState, type ProgressStore, type RemoteStudyProgress } from './progress-store'

/**
 * Keeps one progress store in step with its server endpoint. Every endpoint
 * speaks the same protocol: GET returns RemoteStudyProgress (`?meta=1` only the
 * revisions), PUT takes `{ changes, vocabularyChanges }` from the outbox.
 */
const outboxChunk = 500

export function createStudySync(store: ProgressStore, endpoint: string) {
  let running = false
  let syncing = false

  async function sendPending(keepalive = false) {
    const progress = store.load()
    const changes = pendingStudyChanges(progress)
    const vocabularyChanges = pendingVocabularyChanges(progress)
    if ((!changes.length && !vocabularyChanges.length) || !navigator.onLine) return false
    const body = JSON.stringify({ changes, vocabularyChanges })
    // Browsers generally cap keepalive bodies around 64 KB. A later normal sync
    // handles a larger outbox; it is never discarded merely because exit failed.
    if (keepalive) {
      if (body.length > 60_000) return false
      void fetch(endpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body, keepalive: true })
      return true
    }
    // Servers take at most 1,000 changes of each kind per request: a large
    // outbox (a whole level added at once) goes in several requests.
    for (let index = 0; index < Math.max(changes.length, vocabularyChanges.length); index += outboxChunk) {
      const cardChunk = changes.slice(index, index + outboxChunk)
      const vocabularyChunk = vocabularyChanges.slice(index, index + outboxChunk)
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ changes: cardChunk, vocabularyChanges: vocabularyChunk }) })
      if (!response.ok) return false
      store.acknowledgeStudyChanges(store.load(), cardChunk)
      store.acknowledgeVocabularyChanges(store.load(), vocabularyChunk)
    }
    return true
  }

  async function sync() {
    if (syncing || !navigator.onLine) return
    syncing = true
    try {
      await sendPending()
      const metaResponse = await fetch(`${endpoint}?meta=1`)
      if (!metaResponse.ok) return
      await metaResponse.json()
      const response = await fetch(endpoint)
      if (!response.ok) return
      const remote = await response.json() as RemoteStudyProgress
      const latest = store.load()
      mergeRemoteStudyProgress(latest, remote)
      if (!Object.keys(remote.revisions).length && !pendingStudyChanges(latest).length && (latest.cards.length || Object.keys(latest.studyTombstones).length)) queueCompleteStudyState(latest)
      store.save(latest)
      if (pendingStudyChanges(latest).length) await sendPending()
    } catch {
      // The local outbox remains durable and is retried by the next lifecycle event.
    } finally { syncing = false }
  }

  function start() {
    if (running) return () => {}
    running = true
    const onChange = () => { void sync() }
    const onVisibility = () => { if (document.visibilityState === 'hidden') { void sendPending(true) } else onChange() }
    const onPageHide = () => { void sendPending(true) }
    window.addEventListener('online', onChange)
    window.addEventListener('focus', onChange)
    window.addEventListener(store.changeEvent, onChange)
    window.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    onChange()
    return () => {
      running = false
      window.removeEventListener('online', onChange)
      window.removeEventListener('focus', onChange)
      window.removeEventListener(store.changeEvent, onChange)
      window.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }

  return { sync, start }
}
