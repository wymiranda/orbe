import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import '../../App.css'
import PageHeader from '../../core/PageHeader'
import { createCard, loadDeviceProgress, saveDeviceProgress, setVocabularyLearned } from '../../experiences/chinese/device-progress'
import catWalkSprite from './assets/stories/craftpix-animals/3 Cat/Walk.png'
import catIdleSprite from './assets/stories/craftpix-animals/3 Cat/Idle.png'

type Reading = { id: string; title: string; category: string | null; cover_url: string | null; tags: string[]; created_at: string; chapter_count: number }
type VocabularyTerm = { vocabulary_id: string; start_index: number; length: number; hanzi: string; pinyin: string; english: string; portuguese: string; hsk_level: string }
type SelectedTerm = VocabularyTerm & { source_line_id: string }
type ChapterLine = { id: string; position: number; top_text: string | null; text: string; bottom_text: string | null; terms: VocabularyTerm[]; kind?: 'reading' | 'curiosity'; curiosity_title?: string | null; curiosity_text?: string | null; curiosity_image_url?: string | null }
type Chapter = { id: string; position: number; title: string; content: string; layout: 'plain' | 'layered'; lines: ChapterLine[] }
type ChapterSummary = Pick<Chapter, 'id' | 'position' | 'title' | 'layout'>
type ReadingDetail = { id: string; title: string; category: string | null; cover_url: string | null; tags: string[]; chapters: ChapterSummary[] }
type CreationMode = 'new-reading' | 'new-chapter'
type ContentLayout = 'plain' | 'layered'
type DraftLine = Omit<ChapterLine, 'id' | 'position'>
type VocabularyEntry = { id: string; type: 'character' | 'word'; hanzi: string; pinyin: string; english: string; portuguese: string; hsk_level: string }
type ReaderLine = { line: ChapterLine; curiosities: ChapterLine[] }
type ReadingCollection = 'all' | 'in-progress' | 'not-started' | 'completed'

const vocabularyHeaders = ['id', 'type', 'hanzi', 'pinyin', 'english', 'portuguese', 'hsk_level']
const catStoryReadingTitle = '雨后有太阳 : O Sol Depois da Chuva'
const catStoryTriggerText = '猫去外边了。'
const vocabularyTemplate = `Organize a lista de vocabulário abaixo em CSV UTF-8 para importar no meu app.

Retorne somente o CSV, sem explicações, Markdown ou bloco de código.

Use exatamente este cabeçalho:
id,type,hanzi,pinyin,english,portuguese,hsk_level

Regras:
- type deve ser apenas character ou word.
- hanzi deve usar chinês simplificado.
- pinyin deve ter marcas de tom.
- id deve ser exatamente igual ao hanzi da entrada. Exemplo: 我. O nível HSK é informado somente na coluna hsk_level.
- Não use vírgulas dentro dos campos; para separar sentidos, use ponto e vírgula.
- Preencha todas as sete colunas.

Lista para organizar:
[COLE A LISTA AQUI]`

const layeredTextTemplate = `Converta o texto abaixo para o formato de leitura do meu app.

Retorne somente o conteúdo formatado, sem título, explicação, Markdown ou bloco de código.

Use blocos separados por uma linha vazia. Cada bloco deve representar uma frase ou unidade curta e seguir este formato:

above: [pinyin completo da frase, com marcas de tom]
text: [frase original em chinês simplificado]
below: [tradução natural para português do Brasil]

Regras:
- Use exatamente os rótulos em inglês e minúsculos: above:, text: e below:.
- text: é obrigatório em todo bloco.
- above: e below: são independentes e podem ser omitidos separadamente.
- Preserve ordem, sentido e pontuação do texto original.
- Não numere os blocos e não misture duas frases no mesmo bloco.
- Use pinyin com tons, como: Wǒ zài xuéxí Zhōngwén.
- Escreva um chinês natural, gramaticalmente correto e coerente entre as frases, como um falante nativo. Não produza frases soltas, artificiais ou sem contexto.
- Escreva text: normalmente, apenas em chinês simplificado. O app identifica o vocabulário do catálogo automaticamente.
- Use {{palavra composta}} somente quando quiser forçar que aqueles caracteres sejam tratados como uma única palavra composta do catálogo. Não marque pontuação.

Para inserir uma curiosidade expansível no ponto exato do texto, use um bloco separado:

curiosity-title: Título curto (opcional; padrão: Você sabia?)
curiosity-text: Texto da curiosidade
curiosity-image: https://exemplo.com/imagem.jpg (opcional)

Não misture campos curiosity-* com above:, text: ou below: no mesmo bloco.

Exemplo:
above: Wǒ zài xuéxí Zhōngwén.
text: 我在学习中文。
below: Eu estou estudando chinês.

curiosity-title: Você sabia?
curiosity-text: O baozi é um pão cozido no vapor, muito comum no café da manhã na China.
curiosity-image: https://exemplo.com/baozi.jpg

Texto para converter:
[COLE O TEXTO AQUI]`

function parseVocabularyCsv(content: string): VocabularyEntry[] | null {
  const rows: string[][] = []
  const normalized = content.replace(/^\uFEFF/, '')
  let row: string[] = [], cell = '', quoted = false
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]
    if (quoted && character === '"' && normalized[index + 1] === '"') { cell += '"'; index += 1; continue }
    if (character === '"') { quoted = !quoted; continue }
    if (!quoted && character === ',') { row.push(cell.trim()); cell = ''; continue }
    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && normalized[index + 1] === '\n') index += 1
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; continue
    }
    cell += character
  }
  if (quoted) return null
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row)
  if (rows.length < 2 || rows[0].join(',') !== vocabularyHeaders.join(',')) return null
  const entries = rows.slice(1).map((row) => Object.fromEntries(vocabularyHeaders.map((header, index) => [header, row[index] ?? ''])) as VocabularyEntry)
  return entries.every((entry) => entry.id === entry.hanzi && (entry.type === 'character' || entry.type === 'word') && entry.hanzi && entry.pinyin && entry.english && entry.portuguese && entry.hsk_level) ? entries : null
}

function parseLayeredContent(content: string): DraftLine[] | null {
  const blocks = content.trim().split(/\n\s*\n/).filter(Boolean)
  if (blocks.length === 0) return null
  const lines: Array<DraftLine | null> = blocks.map((block) => {
    const fields: { top_text: string | null; text: string | null; bottom_text: string | null; curiosity_title: string | null; curiosity_text: string | null; curiosity_image_url: string | null } = { top_text: null, text: null, bottom_text: null, curiosity_title: null, curiosity_text: null, curiosity_image_url: null }
    for (const sourceLine of block.split('\n')) {
      const match = sourceLine.match(/^\s*(above|text|below|curiosity-title|curiosity-text|curiosity-image)\s*:\s*(.+?)\s*$/i)
      if (!match) return null
      const field = match[1].toLocaleLowerCase()
      const key = field === 'above' ? 'top_text' : field === 'below' ? 'bottom_text' : field === 'curiosity-title' ? 'curiosity_title' : field === 'curiosity-text' ? 'curiosity_text' : field === 'curiosity-image' ? 'curiosity_image_url' : 'text'
      if (fields[key] !== null) return null
      fields[key] = match[2]
    }
    if (fields.curiosity_text !== null || fields.curiosity_title !== null || fields.curiosity_image_url !== null) return fields.text || fields.top_text || fields.bottom_text || !fields.curiosity_text ? null : { kind: 'curiosity' as const, top_text: null, text: '', bottom_text: null, terms: [], curiosity_title: fields.curiosity_title || 'Você sabia?', curiosity_text: fields.curiosity_text, curiosity_image_url: fields.curiosity_image_url }
    return fields.text ? { kind: 'reading' as const, top_text: fields.top_text, text: fields.text, bottom_text: fields.bottom_text, terms: [] } : null
  })
  return lines.every((line): line is DraftLine => line !== null) ? lines : null
}

function displayAnnotatedText(text: string) {
  return text.replace(/\{\{([^{}|]+)(?:\|[^{}|]+)?\}\}/g, '$1')
}

function LibraryReadingCard({ reading, progress, onOpen, onEdit, isAdmin }: { reading: Reading; progress: number; onOpen: () => void; onEdit: () => void; isAdmin: boolean }) {
  const estimatedMinutes = Math.max(2, reading.chapter_count * 3)
  return <li className="reading-card"><button type="button" className="reading-link" onClick={onOpen}>{reading.cover_url ? <img className="reading-cover" src={reading.cover_url} alt={`Capa de ${reading.title}`} /> : <span className="reading-cover reading-cover-placeholder" aria-hidden="true">文</span>}<span className="reading-main"><strong>{reading.title}</strong><span>{reading.category && <em>{reading.category} · </em>}{reading.chapter_count} {reading.chapter_count === 1 ? 'capítulo' : 'capítulos'} · {estimatedMinutes} min</span>{progress > 0 && <span className="reading-progress"><i><b style={{ width: `${progress}%` }} /></i>{progress}% lido</span>}</span></button>{isAdmin && <button type="button" className="reading-edit" aria-label={`Editar ${reading.title}`} onClick={onEdit}>✎</button>}</li>
}

function paginateReader(lines: ChapterLine[]) {
  const items: ReaderLine[] = []
  let pendingCuriosities: ChapterLine[] = []
  for (const line of lines) {
    if (line.kind === 'curiosity') {
      const previousItem = items.at(-1)
      if (previousItem) previousItem.curiosities.push(line)
      else pendingCuriosities.push(line)
      continue
    }
    items.push({ line, curiosities: pendingCuriosities })
    pendingCuriosities = []
  }
  if (pendingCuriosities.length && items.length) items[items.length - 1].curiosities.push(...pendingCuriosities)
  const pageCapacity = 5
  const pages: ReaderLine[][] = []
  let page: ReaderLine[] = []
  let occupiedLines = 0
  for (const item of items) {
    const itemLines = 1 + item.curiosities.length
    if (page.length && occupiedLines + itemLines > pageCapacity) {
      pages.push(page)
      page = []
      occupiedLines = 0
    }
    page.push(item)
    occupiedLines += itemLines
  }
  if (page.length) pages.push(page)
  return pages.length ? pages : [[]]
}

function ReadingsModule({ embedded = false, isAdmin = false, onReaderOpen, onReadingChapterChange }: { embedded?: boolean; isAdmin?: boolean; onReaderOpen?: () => void; onReadingChapterChange?: (isOpen: boolean) => void }) {
  const [isCreating, setIsCreating] = useState(false)
  const [isEditingChapter, setIsEditingChapter] = useState(false)
  const [isEditingReading, setIsEditingReading] = useState(false)
  const [mode, setMode] = useState<CreationMode>('new-reading')
  const [readingId, setReadingId] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [chapterTitle, setChapterTitle] = useState('')
  const [content, setContent] = useState('')
  const [layout, setLayout] = useState<ContentLayout>('plain')
  const [editingChapterTitle, setEditingChapterTitle] = useState('')
  const [editingChapterContent, setEditingChapterContent] = useState('')
  const [editingChapterLayout, setEditingChapterLayout] = useState<ContentLayout>('plain')
  const [editingReadingTitle, setEditingReadingTitle] = useState('')
  const [editingReadingCategory, setEditingReadingCategory] = useState('')
  const [editingReadingCoverUrl, setEditingReadingCoverUrl] = useState('')
  const [editingReadingTags, setEditingReadingTags] = useState<string[]>([])
  const [editingReadingTagInput, setEditingReadingTagInput] = useState('')
  const [readings, setReadings] = useState<Reading[]>([])
  const [activeReading, setActiveReading] = useState<ReadingDetail | null>(null)
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null)
  const [readingPage, setReadingPage] = useState(0)
  const [showTopNotes, setShowTopNotes] = useState(false)
  const [showBottomNotes, setShowBottomNotes] = useState(false)
  const [speakingLineId, setSpeakingLineId] = useState<string | null>(null)
  const [selectedTerm, setSelectedTerm] = useState<SelectedTerm | null>(null)
  const [unregisteredHanzi, setUnregisteredHanzi] = useState<string | null>(null)
  const [studyMessage, setStudyMessage] = useState('')
  const [learnedVocabularyIds, setLearnedVocabularyIds] = useState<string[]>([])
  const [isReaderLoading, setIsReaderLoading] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isModuleSettingsOpen, setIsModuleSettingsOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [lengthFilter, setLengthFilter] = useState('')
  const [collection, setCollection] = useState<ReadingCollection>('all')
  const [readingProgress, setReadingProgress] = useState<Record<string, number>>(() => loadDeviceProgress().readingProgress)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveNotice, setSaveNotice] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const [downloadNotice, setDownloadNotice] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  const [previewEditingContent, setPreviewEditingContent] = useState('')
  const [catJourneyStarted, setCatJourneyStarted] = useState(false)
  const activeUtterance = useRef<SpeechSynthesisUtterance | null>(null)
  const catStoryTriggerRef = useRef<HTMLDivElement | null>(null)
  const vocabularyFileInput = useRef<HTMLInputElement | null>(null)
  const chapterCache = useRef(new Map<string, Chapter>())
  const readerRequest = useRef<AbortController | null>(null)
  const requestSequence = useRef(0)

  const selectedReading = readings.find((reading) => reading.id === readingId)
  const defaultChapterTitle = `Capítulo ${mode === 'new-chapter' && selectedReading ? selectedReading.chapter_count + 1 : 1}`
  const learnedVocabularyIdSet = useMemo(() => new Set(learnedVocabularyIds), [learnedVocabularyIds])
  const categories = [...new Set(readings.flatMap((reading) => reading.category ? [reading.category] : []))].sort()
  const allTags = [...new Set(readings.flatMap((reading) => reading.tags))].sort()
  const categoryReadings = categoryFilter === '__none__' ? readings.filter((reading) => !reading.category) : categoryFilter ? readings.filter((reading) => reading.category === categoryFilter) : readings
  const withTags = tagFilter ? categoryReadings.filter((reading) => reading.tags.includes(tagFilter)) : categoryReadings
  const withLength = lengthFilter === 'short' ? withTags.filter((reading) => reading.chapter_count <= 2) : lengthFilter === 'medium' ? withTags.filter((reading) => reading.chapter_count >= 3 && reading.chapter_count <= 5) : lengthFilter === 'long' ? withTags.filter((reading) => reading.chapter_count >= 6) : withTags
  const readingPercent = (reading: Reading) => readingProgress[reading.id] ?? (loadDeviceProgress().readingChapter[reading.id] ? Math.max(1, Math.round(100 / reading.chapter_count)) : 0)
  const visibleReadings = withLength.filter((reading) => collection === 'all' || (collection === 'completed' ? readingPercent(reading) >= 100 : collection === 'in-progress' ? readingPercent(reading) > 0 && readingPercent(reading) < 100 : readingPercent(reading) === 0))
  const continuingReadings = readings.filter((reading) => readingPercent(reading) > 0 && readingPercent(reading) < 100)
  const draftLines = layout === 'layered' && content ? parseLayeredContent(content) : null
  const editDraftLines = editingChapterLayout === 'layered' && editingChapterContent ? parseLayeredContent(editingChapterContent) : null
  const previewDraftLines = layout === 'layered' && previewContent ? parseLayeredContent(previewContent) : null
  const previewEditDraftLines = editingChapterLayout === 'layered' && previewEditingContent ? parseLayeredContent(previewEditingContent) : null

  useEffect(() => {
    setCatJourneyStarted(false)
  }, [activeReading?.id, activeChapter?.id])

  useEffect(() => {
    const trigger = catStoryTriggerRef.current
    if (activeReading?.title !== catStoryReadingTitle || !trigger || catJourneyStarted) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setCatJourneyStarted(true)
        observer.disconnect()
      }
    }, { rootMargin: '0px 0px -50% 0px' })
    observer.observe(trigger)
    return () => observer.disconnect()
  }, [activeReading?.id, activeChapter?.id, readingPage, catJourneyStarted])

  useEffect(() => { const timer = window.setTimeout(() => setPreviewContent(content), 200); return () => window.clearTimeout(timer) }, [content])
  useEffect(() => { const timer = window.setTimeout(() => setPreviewEditingContent(editingChapterContent), 200); return () => window.clearTimeout(timer) }, [editingChapterContent])

  useEffect(() => {
    async function loadReadings() {
      try {
        const response = await fetch('/api/readings')
        if (!response.ok) throw new Error('Não foi possível carregar suas leituras.')
        setReadings((await response.json()) as Reading[])
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Não foi possível carregar suas leituras.')
      } finally {
        setIsLoading(false)
      }
    }
    void loadReadings()
  }, [])

  useEffect(() => () => {
    window.speechSynthesis?.cancel()
  }, [])

  useEffect(() => {
    if (!activeChapter || activeChapter.layout !== 'layered') return
    const lastPage = Math.max(0, paginateReader(activeChapter.lines).length - 1)
    setReadingPage((current) => Math.min(current, lastPage))
  }, [activeChapter])

  useEffect(() => {
    if (!isCreating) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsCreating(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isCreating])

  function resetForm() {
    setReadingId(''); setTitle(''); setCategory(''); setCoverUrl(''); setTags([]); setTagInput(''); setChapterTitle(''); setContent(''); setLayout('plain')
  }

  function openNewReading() {
    resetForm()
    setMode('new-reading')
    setIsCreating(true)
  }

  function openChapterEditor(chapter: Chapter) {
    setError('')
    setEditingChapterTitle(chapter.title)
    setEditingChapterContent(chapter.content)
    setEditingChapterLayout(chapter.layout)
    setIsEditingChapter(true)
  }

  function openReadingEditor(reading: ReadingDetail) {
    setError('')
    setEditingReadingTitle(reading.title)
    setEditingReadingCategory(reading.category ?? '')
    setEditingReadingCoverUrl(reading.cover_url ?? '')
    setEditingReadingTags(reading.tags)
    setEditingReadingTagInput('')
    setIsEditingReading(true)
  }

  function addEditingReadingTags(value = editingReadingTagInput) {
    const newTags = value.split(',').map((tag) => tag.trim().replace(/\s+/g, ' ').toLocaleLowerCase()).filter(Boolean)
    if (newTags.length) setEditingReadingTags((current) => [...new Set([...current, ...newTags])])
    setEditingReadingTagInput('')
  }

  function updateEditingReadingTagInput(value: string) {
    if (!value.includes(',')) return setEditingReadingTagInput(value)
    const parts = value.split(',')
    const pendingTag = parts.pop() ?? ''
    addEditingReadingTags(parts.join(','))
    setEditingReadingTagInput(pendingTag.trimStart())
  }

  function addTag(value = tagInput) {
    const newTags = value.split(',').map((tag) => tag.trim().replace(/\s+/g, ' ').toLocaleLowerCase()).filter(Boolean)
    if (newTags.length) setTags((current) => [...new Set([...current, ...newTags])])
    setTagInput('')
  }

  function updateTagInput(value: string) {
    if (!value.includes(',')) return setTagInput(value)
    const parts = value.split(',')
    const pendingTag = parts.pop() ?? ''
    addTag(parts.join(','))
    setTagInput(pendingTag.trimStart())
  }

  async function copyTemplate(template: string, name: string) {
    try {
      await navigator.clipboard.writeText(template)
      setCopyMessage(`${name} copiado.`)
    } catch {
      setCopyMessage('Não foi possível copiar. Tente novamente.')
    }
  }

  async function importVocabulary(file?: File) {
    if (!file) return
    setError(''); setImportMessage('')
    const entries = parseVocabularyCsv(await file.text())
    if (!entries) {
      setError('Use o CSV com as colunas: id, type, hanzi, pinyin, english, portuguese, hsk_level.')
      return
    }
    try {
      const response = await fetch('/api/chinese/vocabulary/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entries }) })
      const payload = await response.json() as { received?: number; imported?: number; created?: number; updated?: number; skipped_duplicates?: number; error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível importar o vocabulário.')
      const duplicateNote = payload.skipped_duplicates ? ` ${payload.skipped_duplicates} duplicata${payload.skipped_duplicates === 1 ? '' : 's'} ignorada${payload.skipped_duplicates === 1 ? '' : 's'}.` : ''
      setImportMessage(`${payload.received ?? payload.imported ?? 0} linhas recebidas: ${payload.created ?? payload.imported ?? 0} novos e ${payload.updated ?? 0} atualizados.${duplicateNote}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível importar o vocabulário.')
    } finally {
      if (vocabularyFileInput.current) vocabularyFileInput.current.value = ''
    }
  }

  function speakLine(line: ChapterLine) {
    if (!('speechSynthesis' in window)) {
      setError('Este navegador não oferece leitura em voz alta.')
      return
    }

    if (speakingLineId === line.id) {
      window.speechSynthesis.cancel()
      activeUtterance.current = null
      setSpeakingLineId(null)
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(line.text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.8
    utterance.onend = () => {
      if (activeUtterance.current === utterance) setSpeakingLineId(null)
    }
    utterance.onerror = () => {
      if (activeUtterance.current === utterance) {
        setSpeakingLineId(null)
        setError('Não foi possível ler este texto em voz alta neste aparelho.')
      }
    }
    activeUtterance.current = utterance
    setSpeakingLineId(line.id)
    window.speechSynthesis.speak(utterance)
  }

  function renderLineText(line: ChapterLine, showPinyin: boolean) {
    const pieces: ReactNode[] = []
    let cursor = 0
    const renderUnregisteredText = (text: string, keyPrefix: string) => {
      const characters = [...text]
      return characters.map((character, index) => /[\u3400-\u4dbf\u4e00-\u9fff]/.test(character)
        ? <button type="button" className="term-button" key={`${keyPrefix}-${index}`} onClick={() => { setSelectedTerm(null); setUnregisteredHanzi(character); setStudyMessage('') }}>{character}</button>
        : <span key={`${keyPrefix}-${index}`}>{character}</span>)
    }
    for (const [index, term] of [...line.terms].sort((first, second) => first.start_index - second.start_index).entries()) {
      if (term.start_index > cursor) pieces.push(...renderUnregisteredText(line.text.slice(cursor, term.start_index), `text-${cursor}`))
      pieces.push(<button type="button" className={learnedVocabularyIdSet.has(term.vocabulary_id) ? 'term-button learned-term' : 'term-button'} key={`${term.vocabulary_id}-${index}`} onClick={() => void openTerm(term, line.id)}><small className={showPinyin ? 'term-pinyin' : 'term-pinyin is-hidden'}>{term.pinyin}</small><span>{line.text.slice(term.start_index, term.start_index + term.length)}</span></button>)
      cursor = term.start_index + term.length
    }
    if (cursor < line.text.length) pieces.push(...renderUnregisteredText(line.text.slice(cursor), `text-${cursor}`))
    return pieces
  }

  function openTerm(term: VocabularyTerm, sourceLineId: string) {
    setUnregisteredHanzi(null)
    setSelectedTerm({ ...term, source_line_id: sourceLineId })
    setStudyMessage('')
  }

  async function createCardFromTerm() {
    if (!selectedTerm) return
    setStudyMessage('')
    const created = createCard(loadDeviceProgress(), selectedTerm.vocabulary_id)
    setStudyMessage(created ? 'Card criado neste dispositivo.' : 'Este card já existe neste dispositivo.')
  }

  async function markTermAsLearned() {
    if (!selectedTerm) return
    setStudyMessage('')
    const progress = loadDeviceProgress()
    setVocabularyLearned(progress, selectedTerm.vocabulary_id)
    saveDeviceProgress(progress)
    setLearnedVocabularyIds((current) => current.includes(selectedTerm.vocabulary_id) ? current : [...current, selectedTerm.vocabulary_id])
    setStudyMessage('Marcada como aprendida neste dispositivo.')
  }

  async function openReading(id: string, openEditor = false) {
    readerRequest.current?.abort()
    const controller = new AbortController()
    readerRequest.current = controller
    const sequence = ++requestSequence.current
    setError(''); setIsReaderLoading(true); setActiveChapter(null); setReadingPage(0); onReadingChapterChange?.(false)
    try {
      const response = await fetch(`/api/readings/${id}/summary`, { signal: controller.signal })
      if (!response.ok) throw new Error('Não foi possível abrir esta leitura.')
      const reading = (await response.json()) as ReadingDetail
      if (sequence !== requestSequence.current) return
      setActiveReading(reading)
      onReaderOpen?.()
      if (openEditor) openReadingEditor(reading)
      setLearnedVocabularyIds(Object.entries(loadDeviceProgress().vocabulary).filter(([, status]) => status === 'learned').map(([vocabularyId]) => vocabularyId))
      setShowTopNotes(false); setShowBottomNotes(false); setSelectedTerm(null)
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir esta leitura.')
    } finally {
      if (sequence === requestSequence.current) setIsReaderLoading(false)
    }
  }

  function saveReadingPosition(reading: ReadingDetail, chapterId: string) {
    const progress = loadDeviceProgress()
    const position = reading.chapters.findIndex((chapter) => chapter.id === chapterId)
    progress.readingChapter[reading.id] = chapterId
    progress.readingProgress[reading.id] = Math.round(((Math.max(position, 0) + 1) / reading.chapters.length) * 100)
    saveDeviceProgress(progress)
    setReadingProgress(progress.readingProgress)
  }

  async function selectChapter(chapterId: string) {
    if (!activeReading || activeChapter?.id === chapterId) return
    const reading = activeReading
    const cached = chapterCache.current.get(chapterId)
    if (cached) {
      setActiveChapter(cached); setReadingPage(0); setShowTopNotes(false); setShowBottomNotes(false); setSelectedTerm(null)
      saveReadingPosition(reading, chapterId)
      onReadingChapterChange?.(true)
      return
    }
    readerRequest.current?.abort()
    const controller = new AbortController()
    readerRequest.current = controller
    const sequence = ++requestSequence.current
    setError(''); setIsReaderLoading(true)
    try {
      const response = await fetch(`/api/readings/${reading.id}/chapters/${chapterId}`, { signal: controller.signal })
      if (!response.ok) throw new Error('Não foi possível carregar o capítulo.')
      const chapter = (await response.json()) as Chapter
      if (sequence !== requestSequence.current) return
      chapterCache.current.set(chapter.id, chapter)
      setActiveChapter(chapter); setReadingPage(0)
      setShowTopNotes(false); setShowBottomNotes(false); setSelectedTerm(null)
      saveReadingPosition(reading, chapterId)
      onReadingChapterChange?.(true)
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o capítulo.')
    } finally {
      if (sequence === requestSequence.current) setIsReaderLoading(false)
    }
  }

  async function downloadReading() {
    if (!activeReading || !navigator.onLine) { setDownloadNotice('Conecte-se à internet para baixar esta leitura.'); return }
    setIsDownloading(true); setDownloadNotice('')
    try {
      const urls = [`/api/readings/${activeReading.id}/summary`, ...activeReading.chapters.map((chapter) => `/api/readings/${activeReading.id}/chapters/${chapter.id}`)]
      await Promise.all(urls.map(async (url) => {
        const response = await fetch(url, { headers: { 'X-Niorb-Offline-Download': '1' } })
        if (!response.ok) throw new Error()
      }))
      setDownloadNotice('Leitura baixada. Ela ficará disponível offline por 30 dias.')
    } catch { setDownloadNotice('Não foi possível baixar esta leitura agora.')
    } finally { setIsDownloading(false) }
  }

  async function deleteChapter(chapter: ChapterSummary) {
    if (!activeReading || !window.confirm(`Excluir “${chapter.title}”?`)) return
    setError('')
    try {
      const response = await fetch(`/api/chapters/${chapter.id}`, { method: 'DELETE' })
      if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error ?? 'Não foi possível excluir o capítulo.') }
      chapterCache.current.delete(chapter.id)
      await openReading(activeReading.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir o capítulo.') }
  }

  async function editChapterFromList(chapter: ChapterSummary) {
    await selectChapter(chapter.id)
    const loaded = chapterCache.current.get(chapter.id)
    if (loaded) openChapterEditor(loaded)
  }

  async function changeReaderPage(direction: -1 | 1) {
    if (!activeReading || !activeChapter) return
    const pageCount = activeChapter.layout === 'layered' ? paginateReader(activeChapter.lines).length : Math.ceil(activeChapter.lines.length / 5)
    const nextPage = readingPage + direction
    if (nextPage >= 0 && nextPage < pageCount) { setReadingPage(nextPage); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    const chapterIndex = activeReading.chapters.findIndex((chapter) => chapter.id === activeChapter.id)
    const adjacent = activeReading.chapters[chapterIndex + direction]
    if (!adjacent) return
    await selectChapter(adjacent.id)
    if (direction < 0) {
      const adjacentLoaded = chapterCache.current.get(adjacent.id)
      if (adjacentLoaded) setReadingPage(Math.max(0, Math.ceil(adjacentLoaded.lines.length / 5) - 1))
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveChapter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const chapter = activeChapter
    if (!activeReading || !chapter) return
    setError(''); setSaveNotice('')
    if (editingChapterLayout === 'layered' && !editDraftLines) {
      setError('Revise o formato e as marcações de vocabulário antes de salvar.')
      return
    }
    try {
      const response = await fetch(`/api/chapters/${chapter.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: editingChapterTitle, content: editingChapterContent, layout: editingChapterLayout }),
      })
      const payload = await response.json() as { error?: string; warnings?: string[] }
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível salvar o capítulo.')
      setSaveNotice(payload.warnings?.join(' ') ?? '')
      setIsEditingChapter(false)
      await openReading(activeReading.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o capítulo.')
    }
  }

  async function saveReading(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeReading) return
    setError('')
    try {
      const response = await fetch(`/api/readings/${activeReading.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: editingReadingTitle, category: editingReadingCategory, coverUrl: editingReadingCoverUrl, tags: editingReadingTags }),
      })
      const payload = await response.json() as Reading | { error: string }
      if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error : 'Não foi possível salvar a leitura.')
      setActiveReading((current) => current ? { ...current, title: payload.title, category: payload.category, cover_url: payload.cover_url, tags: payload.tags } : current)
      setReadings((current) => current.map((reading) => reading.id === payload.id ? payload : reading))
      setIsEditingReading(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a leitura.')
    }
  }

  async function deleteReading() {
    if (!activeReading || !window.confirm(`Excluir “${activeReading.title}”? Os capítulos e anotações desta leitura serão apagados. Os flashcards já criados serão mantidos.`)) return
    setError('')
    try {
      const response = await fetch(`/api/readings/${activeReading.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const payload = await response.json() as { error?: string }
        throw new Error(payload.error ?? 'Não foi possível excluir a leitura.')
      }
      setReadings((current) => current.filter((reading) => reading.id !== activeReading.id))
      setActiveReading(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível excluir a leitura.')
    }
  }

  async function createReading(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSaveNotice('')
    if (mode === 'new-chapter' && !readingId) return setError('Escolha uma leitura para adicionar o capítulo.')
    if (layout === 'layered' && !draftLines) return setError('Revise o formato das camadas antes de salvar.')
    try {
      const response = await fetch('/api/readings', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ readingId: mode === 'new-chapter' ? readingId : undefined, title, category, coverUrl, tags, chapterTitle: chapterTitle || defaultChapterTitle, content, layout }),
      })
      const payload = (await response.json()) as (Reading & { warnings?: string[] }) | { error: string }
      if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error : 'Não foi possível salvar o capítulo.')
      setReadings((current) => current.some((reading) => reading.id === payload.id) ? current.map((reading) => reading.id === payload.id ? payload : reading) : [payload, ...current])
      setSaveNotice(payload.warnings?.join(' ') ?? '')
      resetForm(); setIsCreating(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o capítulo.')
    }
  }

  if (activeReading) {
    const chapter = activeChapter
    const chapterPages = chapter?.layout === 'layered' ? paginateReader(chapter.lines) : []
    const chapterPageCount = chapter ? Math.max(1, chapter.layout === 'layered' ? chapterPages.length : Math.ceil(chapter.lines.length / 5)) : 0
    const visibleChapterLines = chapter?.layout === 'layered' ? chapterPages[readingPage] ?? [] : []
    const chapterIndex = chapter ? activeReading.chapters.findIndex((item) => item.id === chapter.id) : -1
    const hasTopNotes = chapter?.lines.some((line) => line.top_text) ?? false
    const hasBottomNotes = chapter?.lines.some((line) => line.bottom_text) ?? false
    const [originalTitle, translatedTitle] = activeReading.title.split(/\s*:\s*/, 2)
    const firstChapter = activeReading.chapters[0]
    const estimatedMinutes = Math.max(2, activeReading.chapters.length * 3)
    const activeReadingProgress = readingProgress[activeReading.id] ?? (loadDeviceProgress().readingChapter[activeReading.id] ? Math.max(1, Math.round(100 / Math.max(1, activeReading.chapters.length))) : 0)
    return <main className="reader-shell">
      {!chapter && <header className="app-header reader-header">
        <button type="button" className="back" onClick={() => { setActiveReading(null); onReadingChapterChange?.(false) }}>← Biblioteca</button>
      </header>}
      <section className="reader" aria-labelledby="reading-title">
        {chapter && <header className="reading-title reading-title-in-reader"><button type="button" className="reader-back-icon" aria-label="Voltar aos capítulos" onClick={() => { setActiveChapter(null); onReadingChapterChange?.(false) }}>←</button><div><h1 id="reading-title">{activeReading.title}</h1>{activeReading.category && <p>Nível recomendado {activeReading.category}</p>}</div></header>}
        {error && <p className="error" role="alert">{error}</p>}
        {isAdmin && saveNotice && <p className="save-notice" role="status">{saveNotice}</p>}
        {!chapter && <>
          <header className="book-overview">
            {activeReading.cover_url ? <img className="book-overview-cover" src={activeReading.cover_url} alt={`Capa de ${activeReading.title}`} /> : <span className="book-overview-cover reading-cover-placeholder" aria-hidden="true">文</span>}
            <div className="book-overview-details"><h1 id="reading-title">{translatedTitle || originalTitle}</h1>{translatedTitle && <p className="book-original-title">{originalTitle}</p>}<div className="book-overview-meta">{activeReading.category && <span>HSK {activeReading.category.replace(/^HSK\s*/i, '')}</span>}<small>{activeReading.chapters.length} {activeReading.chapters.length === 1 ? 'capítulo' : 'capítulos'} · Leitura graduada · {estimatedMinutes} min</small></div>{firstChapter && <button type="button" className="book-start-reading" onClick={() => void selectChapter(firstChapter.id)}>{activeReadingProgress > 0 ? 'Continuar leitura' : 'Começar leitura'} <span aria-hidden="true">→</span></button>}<div className="book-overview-actions"><button type="button" className="book-offline-action" onClick={() => void downloadReading()} disabled={isDownloading}>⇩ {isDownloading ? 'Baixando...' : 'Disponibilizar offline'}</button>{isAdmin && <><button type="button" className="secondary reader-edit" onClick={() => openReadingEditor(activeReading)}>✎ Editar leitura</button><button type="button" className="danger reader-edit" onClick={() => void deleteReading()}>Excluir leitura</button></>}</div></div>
          </header>
          <section className="book-about"><h2>Sobre esta história</h2><p>Uma leitura graduada em chinês para praticar no seu ritmo.</p></section>
          <section className="chapter-list book-chapter-list" aria-label="Capítulos">
            <div className="book-section-heading"><h2>Capítulos</h2><small>{activeReading.chapters.length} {activeReading.chapters.length === 1 ? 'disponível' : 'disponíveis'}</small></div>
            <div className="chapter-buttons">{activeReading.chapters.map((item) => <div key={item.id} className="chapter-button-row"><button type="button" className="book-chapter-entry" onClick={() => void selectChapter(item.id)}><b>{String(item.position).padStart(2, '0')}</b><span><strong>{item.title}</strong><small>{activeReadingProgress > 0 ? 'Continuar leitura' : 'Iniciar leitura'}</small></span><i aria-hidden="true">›</i></button>{isAdmin && <span><button type="button" className="secondary reader-edit" onClick={() => void editChapterFromList(item)}>Editar capítulo</button><button type="button" className="danger reader-edit" onClick={() => void deleteChapter(item)}>Excluir capítulo</button></span>}</div>)}</div>
            {downloadNotice && <p className="save-notice" role="status">{downloadNotice}</p>}
          </section>
        </>}
        {chapter && <>
          <div className="reader-toolbar">
            <div className="chapter-navigation chapter-navigation-top"><button type="button" className="secondary reader-page-button" aria-label="Página anterior" disabled={(readingPage === 0 && chapterIndex === 0) || isReaderLoading} onClick={() => void changeReaderPage(-1)}><span className="reader-page-label">← Anterior</span><span className="reader-page-icon" aria-hidden="true">←</span></button><span className="reader-page-count">{readingPage + 1}/{chapterPageCount}</span><button type="button" className="secondary reader-page-button" aria-label="Próxima página" disabled={(readingPage === chapterPageCount - 1 && chapterIndex === activeReading.chapters.length - 1) || isReaderLoading} onClick={() => void changeReaderPage(1)}><span className="reader-page-label">Próximo →</span><span className="reader-page-icon" aria-hidden="true">→</span></button></div>
            {chapter.layout === 'layered' && <div className="reader-controls" aria-label="Camadas visíveis">
              {hasTopNotes && <button type="button" className="secondary" aria-label={showTopNotes ? 'Ocultar pinyin' : 'Mostrar pinyin'} aria-pressed={showTopNotes} onClick={() => setShowTopNotes((current) => !current)}><span aria-hidden="true">拼</span><span className="reader-control-label">Pinyin</span></button>}
              {hasBottomNotes && <button type="button" className="secondary" aria-label={showBottomNotes ? 'Ocultar tradução' : 'Mostrar tradução'} aria-pressed={showBottomNotes} onClick={() => setShowBottomNotes((current) => !current)}><span aria-hidden="true">译</span><span className="reader-control-label">Tradução</span></button>}
            </div>}
          </div>
          <article className={chapter.layout === 'layered' ? 'chapter layered-chapter' : 'chapter'}>
            {chapter.layout === 'layered'
              ? visibleChapterLines.map(({ line, curiosities }) => <div className="reading-line" key={line.id} ref={line.text === catStoryTriggerText ? catStoryTriggerRef : undefined}>
                {line.terms.length === 0 && <p className={showTopNotes ? 'line-top' : 'line-top is-hidden'}>{line.top_text ?? ' '}</p>}
                <div className="line-main-row"><p className="line-main">{renderLineText(line, showTopNotes)}</p><span className="line-actions"><button type="button" className="speak-button" onClick={() => speakLine(line)} aria-label={speakingLineId === line.id ? 'Parar leitura' : 'Ouvir texto principal'}>{speakingLineId === line.id ? '■' : '▶'}</button></span></div>
                {curiosities.map((item) => <details className="curiosity-block" key={item.id}><summary><span>?</span>{item.curiosity_title || 'Você sabia?'}</summary><div className="curiosity-content"><p>{item.curiosity_text}</p>{item.curiosity_image_url && <img src={item.curiosity_image_url} alt="" />}</div></details>)}
                <p className={showBottomNotes ? 'line-bottom' : 'line-bottom is-hidden'}>{line.bottom_text ?? ' '}</p>
              </div>)
              : chapter.content.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            {(selectedTerm || unregisteredHanzi) && <div className="term-overlay" role="presentation" onMouseDown={() => { setSelectedTerm(null); setUnregisteredHanzi(null) }}><aside className="term-details" aria-label="Detalhes do vocabulário" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="term-details-close" onClick={() => { setSelectedTerm(null); setUnregisteredHanzi(null) }} aria-label="Fechar detalhes">×</button>{selectedTerm ? <><strong>{selectedTerm.hanzi}</strong><span>{selectedTerm.pinyin}</span><p>{selectedTerm.portuguese}</p><small>{selectedTerm.english} · HSK {selectedTerm.hsk_level}</small><div className="term-study-actions"><button type="button" onClick={() => void createCardFromTerm()}>Criar card</button><button type="button" className="secondary" onClick={() => void markTermAsLearned()}>Marcar aprendida</button></div>{studyMessage && <p className="term-study-message" role="status">{studyMessage}</p>}</> : <><strong>{unregisteredHanzi}</strong><p>Hanzi ainda não cadastrado pelo administrador.</p></>}</aside></div>}
          </article>
          <div className="chapter-navigation chapter-navigation-bottom"><button type="button" className="secondary" disabled={(readingPage === 0 && chapterIndex === 0) || isReaderLoading} onClick={() => void changeReaderPage(-1)}>← Anterior</button><span>{readingPage + 1} de {chapterPageCount}</span><button type="button" className="secondary" disabled={(readingPage === chapterPageCount - 1 && chapterIndex === activeReading.chapters.length - 1) || isReaderLoading} onClick={() => void changeReaderPage(1)}>Próximo →</button></div>
        </>}
      </section>
      {activeReading.title === catStoryReadingTitle && catJourneyStarted && <span className="cat-story-walker" aria-hidden="true"><span className="cat-story-speech">天啊，得离那只狗远点儿。</span><span className="cat-story-sprite cat-story-walk" style={{ backgroundImage: `url(${catWalkSprite})` }} /><span className="cat-story-sprite cat-story-idle" style={{ backgroundImage: `url(${catIdleSprite})` }} /></span>}
      {isEditingChapter && <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsEditingChapter(false)}><form className="new-reading" role="dialog" aria-modal="true" aria-labelledby="edit-chapter-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveChapter}>
        <div className="modal-header"><h2 id="edit-chapter-title">Editar capítulo</h2><button type="button" className="modal-close" aria-label="Fechar" onClick={() => setIsEditingChapter(false)}>×</button></div>
        <label>Título do capítulo<input value={editingChapterTitle} onChange={(event) => setEditingChapterTitle(event.target.value)} required autoFocus /></label>
        <label>Formato da leitura<select value={editingChapterLayout} onChange={(event) => setEditingChapterLayout(event.target.value as ContentLayout)}><option value="plain">Texto simples</option><option value="layered">Texto com camadas</option></select></label>
        {editingChapterLayout === 'layered' && <p className="format-help">Cada bloco de leitura usa <code>text:</code>; <code>above:</code> e <code>below:</code> são opcionais. Para uma curiosidade expansível, use <code>curiosity-text:</code>, com <code>curiosity-title:</code> e <code>curiosity-image:</code> opcionais.</p>}
        <label>{editingChapterLayout === 'layered' ? 'Blocos de leitura' : 'Texto'}<textarea value={editingChapterContent} onChange={(event) => setEditingChapterContent(event.target.value)} rows={editingChapterLayout === 'layered' ? 12 : 8} required /></label>
        {editingChapterLayout === 'layered' && editingChapterContent && <div className="layered-preview"><strong>Prévia</strong>{previewEditDraftLines ? previewEditDraftLines.map((line, index) => line.kind === 'curiosity' ? <div className="preview-line curiosity-preview" key={index}><strong>? {line.curiosity_title}</strong><span>{line.curiosity_text}</span></div> : <div className="preview-line" key={index}>{line.top_text && <small>{line.top_text}</small>}<span>{displayAnnotatedText(line.text)}</span>{line.bottom_text && <small>{line.bottom_text}</small>}</div>) : <p>Revise os blocos e as marcações antes de salvar.</p>}</div>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions"><button type="submit">Salvar alterações</button><button type="button" className="secondary" onClick={() => setIsEditingChapter(false)}>Cancelar</button></div>
      </form></div>}
      {isEditingReading && <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsEditingReading(false)}><form className="new-reading" role="dialog" aria-modal="true" aria-labelledby="edit-reading-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveReading}>
        <div className="modal-header"><h2 id="edit-reading-title">Editar leitura</h2><button type="button" className="modal-close" aria-label="Fechar" onClick={() => setIsEditingReading(false)}>×</button></div>
        <label>Título da leitura<input value={editingReadingTitle} onChange={(event) => setEditingReadingTitle(event.target.value)} required autoFocus /></label>
        <label>Categoria ou tema <span className="optional">(opcional)</span><input value={editingReadingCategory} onChange={(event) => setEditingReadingCategory(event.target.value)} placeholder="Ex.: Idiomas" /></label>
        <label>Link público da capa <span className="optional">(opcional; ex.: imgbb)</span><input type="url" value={editingReadingCoverUrl} onChange={(event) => setEditingReadingCoverUrl(event.target.value)} placeholder="https://i.ibb.co/.../capa.jpg" /></label>
        <label>Tags <span className="optional">(opcional)</span><div className="tag-editor">
          {editingReadingTags.map((tag) => <button type="button" key={tag} onClick={() => setEditingReadingTags((current) => current.filter((item) => item !== tag))}>{tag} ×</button>)}
          <input value={editingReadingTagInput} onChange={(event) => updateEditingReadingTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addEditingReadingTags() } }} onBlur={() => addEditingReadingTags()} placeholder={editingReadingTags.length === 0 ? 'Digite tags separadas por vírgula' : 'Adicionar tags'} />
        </div></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions"><button type="submit">Salvar alterações</button><button type="button" className="secondary" onClick={() => setIsEditingReading(false)}>Cancelar</button></div>
      </form></div>}
    </main>
  }

  return <main className={embedded ? 'workspace-view readings-view' : 'app-shell readings-view'}>
    {!embedded && <header className="app-header"><a className="brand" href="/" aria-label="niorb, início">niorb</a></header>}
    <section className="welcome readings-library" aria-labelledby="library-title">
      {isModuleSettingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsModuleSettingsOpen(false)}><section className="new-reading module-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="reading-settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header"><h2 id="reading-settings-title">Configurar Leituras</h2><button type="button" className="modal-close" aria-label="Fechar" onClick={() => setIsModuleSettingsOpen(false)}>×</button></div>
        <div className="actions"><button type="button" onClick={() => { setIsModuleSettingsOpen(false); openNewReading() }}>Nova leitura</button><button type="button" className="secondary" onClick={() => vocabularyFileInput.current?.click()}>Importar vocabulário</button></div>
        <input ref={vocabularyFileInput} className="visually-hidden" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => void importVocabulary(event.currentTarget.files?.[0])} />
        {importMessage && <p className="import-message" role="status">{importMessage}</p>}
        <section className="ai-templates" aria-labelledby="ai-templates-title"><div><p className="eyebrow">ATALHOS DE ADMINISTRAÇÃO</p><h2 id="ai-templates-title">Modelos para IA</h2><p>Copie um modelo e complete-o com o conteúdo que deseja importar.</p></div><div className="template-actions"><button type="button" className="secondary" onClick={() => void copyTemplate(layeredTextTemplate, 'Instrução de texto')}>Copiar formato de texto</button><button type="button" className="secondary" onClick={() => void copyTemplate(vocabularyTemplate, 'Instrução de vocabulário')}>Copiar formato de vocabulário</button></div>{copyMessage && <p className="import-message" role="status">{copyMessage}</p>}</section>
      </section></div>}
      {isCreating && <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsCreating(false)}><form className="new-reading" role="dialog" aria-modal="true" aria-labelledby="new-reading-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={createReading}>
        <div className="modal-header"><h2 id="new-reading-title">Adicionar texto</h2><button type="button" className="modal-close" aria-label="Fechar" onClick={() => setIsCreating(false)}>×</button></div>
        <fieldset className="creation-mode"><legend>Onde este texto entra?</legend>
          <label><input type="radio" name="creation-mode" checked={mode === 'new-reading'} onChange={() => { setMode('new-reading'); setChapterTitle('') }} /> Nova leitura</label>
          <label><input type="radio" name="creation-mode" checked={mode === 'new-chapter'} onChange={() => { setMode('new-chapter'); setChapterTitle('') }} disabled={readings.length === 0} /> Novo capítulo de uma leitura existente</label>
        </fieldset>
        {mode === 'new-reading' ? <>
          <label>Título da leitura<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Ideias sobre aprendizado" autoFocus /></label>
          <label>Categoria ou tema <span className="optional">(opcional)</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ex.: Filosofia, Finanças, Ficção" /></label>
          <label>Link público da capa <span className="optional">(opcional; ex.: imgbb)</span><input type="url" value={coverUrl} onChange={(event) => setCoverUrl(event.target.value)} placeholder="https://i.ibb.co/.../capa.jpg" /></label>
          <label>Tags <span className="optional">(opcional)</span><div className="tag-editor">
            {tags.map((tag) => <button type="button" key={tag} onClick={() => setTags((current) => current.filter((item) => item !== tag))}>{tag} ×</button>)}
            <input value={tagInput} onChange={(event) => updateTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addTag() } }} onBlur={() => addTag()} placeholder={tags.length === 0 ? 'Digite tags separadas por vírgula' : 'Adicionar tags'} />
          </div></label>
        </> : <label>Leitura<select value={readingId} onChange={(event) => { setReadingId(event.target.value); setChapterTitle('') }} required><option value="">Escolha uma leitura</option>{readings.map((reading) => <option key={reading.id} value={reading.id}>{reading.title}</option>)}</select></label>}
        <label>Título do capítulo<input value={chapterTitle || defaultChapterTitle} onChange={(event) => setChapterTitle(event.target.value)} required /></label>
        <label>Formato da leitura<select value={layout} onChange={(event) => setLayout(event.target.value as ContentLayout)}><option value="plain">Texto simples</option><option value="layered">Texto com camadas</option></select></label>
        {layout === 'layered' && <p className="format-help">Cada bloco de leitura usa <code>text:</code>; <code>above:</code> e <code>below:</code> são opcionais. Para uma curiosidade expansível, use <code>curiosity-text:</code>, com <code>curiosity-title:</code> e <code>curiosity-image:</code> opcionais. Separe os blocos por uma linha vazia.</p>}
        <label>{layout === 'layered' ? 'Blocos de leitura' : 'Texto'}<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder={layout === 'layered' ? 'above: Wǒ xiǎng xué Zhōngwén.\ntext: 我想学中文。\nbelow: Eu quero aprender chinês.' : 'Escreva ou cole algo que deseja ler...'} rows={layout === 'layered' ? 12 : 8} required /></label>
        {layout === 'layered' && content && <div className="layered-preview"><strong>Prévia</strong>{previewDraftLines ? previewDraftLines.map((line, index) => line.kind === 'curiosity' ? <div className="preview-line curiosity-preview" key={index}><strong>? {line.curiosity_title}</strong><span>{line.curiosity_text}</span></div> : <div className="preview-line" key={index}>{line.top_text && <small>{line.top_text}</small>}<span>{displayAnnotatedText(line.text)}</span>{line.bottom_text && <small>{line.bottom_text}</small>}</div>) : <p>Use blocos de leitura com <code>text:</code> ou blocos de curiosidade com <code>curiosity-text:</code>.</p>}</div>}
        <div className="form-actions"><button type="submit">Salvar capítulo</button><button type="button" className="secondary" onClick={() => setIsCreating(false)}>Cancelar</button></div>
      </form></div>}
      {error && <p className="error" role="alert">{error}</p>}
      {isAdmin && saveNotice && <p className="save-notice" role="status">{saveNotice}</p>}
      <PageHeader
        title="Leituras"
        actions={<div className="library-actions">{isAdmin && <button type="button" className="secondary filter-button" onClick={() => void copyTemplate(layeredTextTemplate, 'Estrutura de texto')}>Copiar estrutura</button>}{isAdmin && <button type="button" className="secondary module-settings library-settings" onClick={() => setIsModuleSettingsOpen(true)} aria-label="Configurar Leituras">⚙</button>}<button type="button" className="secondary filter-button" onClick={() => setIsFilterOpen((current) => !current)}>Filtros</button></div>}
      />
      <section className="library" aria-label="Biblioteca de leituras">
        {copyMessage && <p className="library-copy-message" role="status">{copyMessage}</p>}
        {continuingReadings.length > 0 && <section className="continue-reading" aria-labelledby="continue-reading-title"><div><p className="eyebrow">SUA BIBLIOTECA</p><h2 id="continue-reading-title">Continue lendo</h2></div><ul>{continuingReadings.slice(0, 3).map((reading) => <LibraryReadingCard key={reading.id} reading={reading} progress={readingPercent(reading)} onOpen={() => void openReading(reading.id)} onEdit={() => void openReading(reading.id, true)} isAdmin={isAdmin} />)}</ul></section>}
        <nav className="library-collections" aria-label="Coleções"><button type="button" className={collection === 'all' ? 'active' : ''} onClick={() => setCollection('all')}>Todas</button><button type="button" className={collection === 'in-progress' ? 'active' : ''} onClick={() => setCollection('in-progress')}>Em andamento</button><button type="button" className={collection === 'not-started' ? 'active' : ''} onClick={() => setCollection('not-started')}>Não iniciadas</button><button type="button" className={collection === 'completed' ? 'active' : ''} onClick={() => setCollection('completed')}>Concluídas</button></nav>
        {isFilterOpen && <div className="filter-controls"><label className="filter-control">Gênero<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">Todos os gêneros</option><option value="__none__">Sem gênero</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="filter-control">HSK ou tag<select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">Todos os níveis e tags</option>{allTags.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="filter-control">Extensão<select value={lengthFilter} onChange={(event) => setLengthFilter(event.target.value)}><option value="">Todos os tamanhos</option><option value="short">Curta · até 2 capítulos</option><option value="medium">Média · 3 a 5 capítulos</option><option value="long">Longa · 6+ capítulos</option></select></label></div>}
        <div className="library-catalog-head"><h2>Catálogo</h2><span>{visibleReadings.length} {visibleReadings.length === 1 ? 'leitura' : 'leituras'}</span></div>
        {isLoading ? <p className="empty">Carregando leituras...</p> : visibleReadings.length === 0 ? <p className="empty">Nenhuma leitura nesta coleção.</p> : <ul className="reading-grid">{visibleReadings.map((reading) => <LibraryReadingCard key={reading.id} reading={reading} progress={readingPercent(reading)} onOpen={() => void openReading(reading.id)} onEdit={() => void openReading(reading.id, true)} isAdmin={isAdmin} />)}</ul>}
      </section>
      {isReaderLoading && <p className="empty">Abrindo leitura...</p>}
    </section>
  </main>
}

export default ReadingsModule
