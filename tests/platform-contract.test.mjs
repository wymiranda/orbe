import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const source = async (path) => readFile(new URL(path, root), 'utf8')

test('platform schema keeps personal study state out of D1', async () => {
  const schema = await source('migrations/0001_create_platform.sql')
  assert.match(schema, /CREATE TABLE study_decks/)
  assert.doesNotMatch(schema, /study_cards|study_reviews|learned_vocabulary/)
})

test('unknown API routes cannot fall back to the SPA asset handler', async () => {
  const worker = await source('worker/index.ts')
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\).*status: 404/s)
})

test('Chinese device progress is explicitly local-only', async () => {
  const progress = await source('src/experiences/chinese/device-progress.ts')
  assert.match(progress, /localStorage/)
  assert.doesNotMatch(progress, /fetch\(/)
})

test('offline mode caches only shared read-only content and the local access shell', async () => {
  const worker = await source('public/sw.js')
  const auth = await source('src/core/AuthGate.tsx')
  assert.match(worker, /\/api\/readings/)
  assert.match(worker, /\/api\/chinese\/vocabulary/)
  assert.doesNotMatch(worker, /\/api\/auth\/me/)
  assert.match(auth, /loadCachedUser\(\)/)
})
