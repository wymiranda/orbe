/** Reads a vocabulary CSV into the import payload. Cleaning and merging happen on the server. */

type CatalogField = 'term' | 'portuguese' | 'pronunciation' | 'part_of_speech' | 'cefr_level'

const headerAliases: Record<string, CatalogField> = {
  term: 'term', headword: 'term', word: 'term', palavra: 'term', english: 'term', ingles: 'term',
  portuguese: 'portuguese', portugues: 'portuguese', translation: 'portuguese', traducao: 'portuguese',
  pronunciation: 'pronunciation', pronuncia: 'pronunciation', ipa: 'pronunciation',
  part_of_speech: 'part_of_speech', pos: 'part_of_speech', classe: 'part_of_speech',
  cefr_level: 'cefr_level', cefr: 'cefr_level', level: 'cefr_level', nivel: 'cefr_level',
}

function headerKey(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase().trim().replace(/[\s-]+/g, '_')
}

function detectDelimiter(firstLine: string) {
  const counts = [';', '\t', ','].map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
  return counts.sort((left, right) => right.count - left.count)[0].delimiter
}

function parseRows(source: string, delimiter: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1 }
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"' && !field) quoted = true
    else if (char === delimiter) { row.push(field); field = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(field); rows.push(row); row = []; field = ''
    } else field += char
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((cells) => cells.some((cell) => cell.trim()))
}

export function parseCatalogCsv(source: string): Array<Partial<Record<CatalogField, string>>> {
  const content = source.replace(/^﻿/, '')
  const [header, ...rows] = parseRows(content, detectDelimiter(content.split(/\r?\n/, 1)[0] ?? ''))
  if (!header) return []
  const fields = header.map((name) => headerAliases[headerKey(name)])
  return rows.map((cells) => Object.fromEntries(fields.flatMap((field, index) => field ? [[field, cells[index] ?? '']] : [])))
}
