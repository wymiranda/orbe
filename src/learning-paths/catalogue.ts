/**
 * The engine refers to these stable IDs only. The Chinese vocabulary API remains
 * the owner of lexical data; this adapter deliberately does not copy it.
 */
export type CatalogueEntry = { id: string; language: string; kind: 'lexeme' | 'sentence' | 'grammar'; label: string; parts?: string[] }
export type ChineseVocabularyEntry = { id: string; hanzi: string }

const starterSentences: CatalogueEntry[] = [
  { id: 'zh-hans:sentence:我吃苹果', language: 'zh-Hans', kind: 'sentence', label: '我吃苹果', parts: ['我', '吃', '苹果'] },
  { id: 'zh-hans:sentence:我喝茶', language: 'zh-Hans', kind: 'sentence', label: '我喝茶', parts: ['我', '喝', '茶'] },
]

export function chineseCatalogue(vocabulary: ChineseVocabularyEntry[]) {
  const entries = new Map<string, CatalogueEntry>(vocabulary.map((item) => [item.id, { id: item.id, language: 'zh-Hans', kind: 'lexeme', label: item.hanzi }]))
  for (const sentence of starterSentences) entries.set(sentence.id, sentence)
  return { get: (id: string) => entries.get(id), has: (id: string) => entries.has(id) }
}
