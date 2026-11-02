import { readFile, writeFile } from 'node:fs/promises'

const [inputPath, outputPath] = process.argv.slice(2)
if (!inputPath || !outputPath) throw new Error('Usage: node scripts/prepare-d1-restore.mjs <input.sql> <output.sql>')

const keep = new Set([
  'users',
  'readings',
  'tags',
  'reading_tags',
  'chapters',
  'chapter_lines',
  'chinese_vocabulary_catalog',
  'chinese_chapter_line_terms',
  'study_decks',
  'chinese_quiz_questions',
  'workspace_settings',
  'user_study_cards',
])

function statements(sql) {
  const result = []
  let start = 0
  let quote = false
  for (let index = 0; index < sql.length; index += 1) {
    if (sql[index] !== "'") continue
    if (quote && sql[index + 1] === "'") { index += 1; continue }
    quote = !quote
    continue
  }
  for (let index = 0; index < sql.length; index += 1) {
    if (sql[index] === "'") {
      if (quote && sql[index + 1] === "'") { index += 1; continue }
      quote = !quote
    }
    if (!quote && sql[index] === ';') {
      const statement = sql.slice(start, index + 1).trim()
      if (statement) result.push(statement)
      start = index + 1
    }
  }
  return result
}

function splitTopLevel(value) {
  const result = []
  let start = 0
  let depth = 0
  let quote = false
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "'") {
      if (quote && value[index + 1] === "'") { index += 1; continue }
      quote = !quote
    } else if (!quote && value[index] === '(') depth += 1
    else if (!quote && value[index] === ')') depth -= 1
    else if (!quote && depth === 0 && value[index] === ',') {
      result.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  result.push(value.slice(start).trim())
  return result
}

function reformat(statement, table, wantedColumns) {
  const match = statement.match(/^INSERT INTO\s+"?([\w]+)"?\s*\(([^]+)\)\s*VALUES\s*\(([^]+)\);$/i)
  if (!match) throw new Error(`Unsupported INSERT for ${table}`)
  const columns = splitTopLevel(match[2]).map((column) => column.replaceAll('"', '').trim())
  const values = splitTopLevel(match[3])
  if (columns.length !== values.length) throw new Error(`Column/value mismatch for ${table}`)
  const byColumn = new Map(columns.map((column, index) => [column, values[index]]))
  const missing = wantedColumns.filter((column) => !byColumn.has(column))
  if (missing.length) throw new Error(`Missing ${table} columns: ${missing.join(', ')}`)
  return `INSERT INTO ${table} (${wantedColumns.join(', ')}) VALUES (${wantedColumns.map((column) => byColumn.get(column)).join(', ')});`
}

const source = await readFile(inputPath, 'utf8')
const output = ['PRAGMA defer_foreign_keys=TRUE;']
const counts = new Map()

for (const statement of statements(source)) {
  const match = statement.match(/^INSERT INTO\s+"?([\w]+)"?/i)
  if (!match) continue
  const table = match[1]
  if (!keep.has(table)) continue
  let formatted = statement
  if (table === 'readings') formatted = reformat(statement, table, ['id', 'title', 'category', 'created_at', 'updated_at', 'cover_url'])
  if (table === 'chinese_quiz_questions') formatted = reformat(statement, table, ['id', 'hsk_level', 'mode', 'prompt', 'choices_json', 'answer_id', 'created_at', 'updated_at', 'question_type'])
  output.push(formatted)
  counts.set(table, (counts.get(table) ?? 0) + 1)
}

await writeFile(outputPath, `${output.join('\n')}\n`, 'utf8')
console.log(JSON.stringify(Object.fromEntries(counts), null, 2))
