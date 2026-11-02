import { acknowledgeStudyChanges, acknowledgeVocabularyChanges, loadDeviceProgress, mergeRemoteStudyProgress, pendingStudyChanges, pendingVocabularyChanges, queueCompleteStudyState, saveDeviceProgress, type RemoteStudyProgress } from './device-progress'

let running = false
let syncing = false

async function sendPending(keepalive = false) {
  const progress = loadDeviceProgress()
  const changes = pendingStudyChanges(progress)
  const vocabularyChanges = pendingVocabularyChanges(progress)
  if ((!changes.length && !vocabularyChanges.length) || !navigator.onLine) return false
  const body = JSON.stringify({ changes, vocabularyChanges })
  // Browsers generally cap keepalive bodies around 64 KB. A later normal sync
  // handles a larger outbox; it is never discarded merely because exit failed.
  if (keepalive) {
    if (body.length > 60_000) return false
    void fetch('/api/study/progress', { method: 'PUT', headers: { 'content-type': 'application/json' }, body, keepalive: true })
    return true
  }
  const response = await fetch('/api/study/progress', { method: 'PUT', headers: { 'content-type': 'application/json' }, body })
  if (!response.ok) return false
  const latest = loadDeviceProgress()
  acknowledgeStudyChanges(latest, changes)
  acknowledgeVocabularyChanges(loadDeviceProgress(), vocabularyChanges)
  return true
}

export async function syncStudyProgress() {
  if (syncing || !navigator.onLine) return
  syncing = true
  try {
    await sendPending()
    const metaResponse = await fetch('/api/study/progress?meta=1')
    if (!metaResponse.ok) return
    await metaResponse.json()
    const response = await fetch('/api/study/progress')
    if (!response.ok) return
    const remote = await response.json() as RemoteStudyProgress
    const latest = loadDeviceProgress()
    mergeRemoteStudyProgress(latest, remote)
    if (!Object.keys(remote.revisions).length && !pendingStudyChanges(latest).length && (latest.cards.length || Object.keys(latest.studyTombstones).length)) queueCompleteStudyState(latest)
    saveDeviceProgress(latest)
    if (pendingStudyChanges(latest).length) await sendPending()
  } catch {
    // The local outbox remains durable and is retried by the next lifecycle event.
  } finally { syncing = false }
}

export function startStudySync() {
  if (running) return () => {}
  running = true
  const sync = () => { void syncStudyProgress() }
  const onVisibility = () => { if (document.visibilityState === 'hidden') { void sendPending(true) } else sync() }
  const onPageHide = () => { void sendPending(true) }
  window.addEventListener('online', sync)
  window.addEventListener('focus', sync)
  window.addEventListener('niorb:chinese-progress', sync)
  window.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPageHide)
  sync()
  return () => {
    running = false
    window.removeEventListener('online', sync)
    window.removeEventListener('focus', sync)
    window.removeEventListener('niorb:chinese-progress', sync)
    window.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
  }
}
