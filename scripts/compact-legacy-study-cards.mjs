import { constants, brotliCompressSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'

const outputPath = process.argv[2]
if (!outputPath) throw new Error('Usage: node scripts/compact-legacy-study-cards.mjs <output.sql>')

const query = `SELECT cards.user_id, cards.vocabulary_id, cards.due_at, cards.interval_days, cards.ease, cards.review_count, cards.is_learned, cards.updated_at, ids.numeric_id, catalog.hsk_level
  FROM user_study_cards cards
  LEFT JOIN chinese_vocabulary_study_ids ids ON ids.vocabulary_id = cards.vocabulary_id
  LEFT JOIN chinese_vocabulary_catalog catalog ON catalog.id = cards.vocabulary_id
  ORDER BY cards.user_id, cards.vocabulary_id`
const catalogQuery = 'SELECT catalog.id, catalog.pinyin, catalog.hsk_level, ids.numeric_id FROM chinese_vocabulary_catalog catalog JOIN chinese_vocabulary_study_ids ids ON ids.vocabulary_id = catalog.id ORDER BY catalog.id'
const raw = execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--remote', '--json', '--command', `${query}; ${catalogQuery};`], { encoding: 'utf8', cwd: process.cwd() })
const response = JSON.parse(raw)
const rows = response[0]?.results ?? []
if (!rows.length) throw new Error('No legacy cards found to compact.')

const foldPinyin = (value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z]/gi, '').toLowerCase()
const catalogByLegacySlug = new Map()
for (const item of response[1]?.results ?? []) {
  const key = `${item.hsk_level}:${foldPinyin(item.pinyin)}`
  const list = catalogByLegacySlug.get(key) ?? []
  list.push(item)
  catalogByLegacySlug.set(key, list)
}
for (const list of catalogByLegacySlug.values()) list.sort((first, second) => first.id.localeCompare(second.id, 'zh'))
let remappedLegacyIds = 0
for (const row of rows) {
  if (row.numeric_id !== null) continue
  const match = row.vocabulary_id.match(/^hsk-(\d+)-(.+)-(\d+)$/)
  if (!match) throw new Error(`Unmapped legacy vocabulary id: ${row.vocabulary_id}`)
  const key = `${match[1]}:${match[2].replaceAll('v', 'u')}`
  const candidate = catalogByLegacySlug.get(key)?.[Number(match[3]) - 1]
  if (!candidate) throw new Error(`No catalog match for legacy vocabulary id: ${row.vocabulary_id}`)
  row.numeric_id = candidate.numeric_id
  row.hsk_level = candidate.hsk_level
  remappedLegacyIds += 1
}

const users = new Map()
for (const row of rows) {
  const user = users.get(row.user_id) ?? { selected: new Map(), learned: new Set(), latest: row.updated_at }
  const current = user.selected.get(row.numeric_id)
  if (!current || row.review_count > current.review_count || (row.review_count === current.review_count && row.updated_at > current.updated_at)) user.selected.set(row.numeric_id, row)
  if (row.is_learned) user.learned.add(row.numeric_id)
  if (row.updated_at > user.latest) user.latest = row.updated_at
  users.set(row.user_id, user)
}

const sql = ['PRAGMA defer_foreign_keys=TRUE;']
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
for (const [userId, user] of users) {
  const byLevel = new Map()
  for (const row of user.selected.values()) {
    const state = [Math.floor(Date.parse(row.due_at) / 60_000), row.interval_days, Math.round(row.ease * 20), (row.review_count === 0 ? 1 : 0) | (user.learned.has(row.numeric_id) ? 2 : 0), Date.parse(row.updated_at)]
    const group = byLevel.get(row.hsk_level) ?? new Map()
    const key = state.join(',')
    const entry = group.get(key) ?? { state, ids: [] }
    entry.ids.push(row.numeric_id)
    group.set(key, entry)
    byLevel.set(row.hsk_level, group)
  }
  for (const [level, groups] of byLevel) {
    const payload = { v: 2, g: [...groups.values()].map(({ state, ids }) => [state, ids.sort((a, b) => a - b)]) }
    const blob = brotliCompressSync(Buffer.from(JSON.stringify(payload)), { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }).toString('hex')
    sql.push(`INSERT INTO user_study_snapshots (user_id, hsk_level, payload, updated_at, last_studied_at, revision) VALUES (${quote(userId)}, ${quote(level)}, X'${blob}', ${quote(user.latest)}, ${quote(user.latest)}, 1);`)
  }
  sql.push(`DELETE FROM user_study_cards WHERE user_id = ${quote(userId)};`)
}

await writeFile(outputPath, `${sql.join('\n')}\n`, 'utf8')
console.log(JSON.stringify({ legacyCards: rows.length, remappedLegacyIds, compactedVocabularyStates: [...users.values()].reduce((total, user) => total + user.selected.size, 0), users: users.size, snapshots: sql.filter((statement) => statement.startsWith('INSERT INTO user_study_snapshots')).length }, null, 2))
