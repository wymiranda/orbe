import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import '../../App.css'
import { createCard, loadDeviceProgress, saveDeviceProgress } from '../../experiences/chinese/device-progress'

type Reading = { id: string; title: string; category: string | null; tags: string[]; created_at: string; chapter_count: number }
type VocabularyTerm = { vocabulary_id: string; start_index: number; length: number; hanzi: string; pinyin: string; english: string; portuguese: string; hsk_level: string }
type SelectedTerm = VocabularyTerm & { source_line_id: string }
type ChapterLine = { id: string; position: number; top_text: string | null; text: string; bottom_text: string | null; terms: VocabularyTerm[] }
type Chapter = { id: string; position: number; title: string; content: string; layout: 'plain' | 'layered'; lines: ChapterLine[] }
type ReadingDetail = { id: string; title: string; category: string | null; tags: string[]; chapters: Chapter[] }
type CreationMode = 'new-reading' | 'new-chapter'
type ContentLayout = 'plain' | 'layered'
type DraftLine = Omit<ChapterLine, 'id' | 'position'>
type VocabularyEntry = { id: string; type: 'character' | 'word'; hanzi: string; pinyin: string; english: string; portuguese: string; hsk_level: string }

const vocabularyHeaders = ['id', 'type', 'hanzi', 'pinyin', 'english', 'portuguese', 'hsk_level']

const vocabularyTemplate = `Organize a lista de vocabulário abaixo em CSV UTF-8 para importar no meu app.

Retorne somente o CSV, sem explicações, Markdown ou bloco de código.

Use exatamente este cabeçalho:
id,type,hanzi,pinyin,english,portuguese,hsk_level

Regras:
- type deve ser apenas character ou word.
- hanzi deve usar chinês simplificado.
- pinyin deve ter marcas de tom.
- id deve ser estável e único, no formato hsk-[nível]-[nome-em-latim]-[número], por exemplo hsk-1-wo-01.
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
- Dentro de text:, marque toda palavra ou caractere chinês usando exatamente {{hanzi|id-do-catálogo}}.
- Para palavras compostas, use um único marcador para a palavra inteira. Exemplo: {{学习|hsk-1-xuexi-01}}, nunca caracteres separados se o catálogo possui a palavra composta.
- O hanzi e o id devem corresponder exatamente a uma entrada do catálogo que eu fornecer. Não invente IDs e não marque pontuação.

Exemplo:
above: Wǒ zài xuéxí Zhōngwén.
text: {{我|hsk-1-wo-01}}{{在|hsk-1-zai-02}}{{学习|hsk-1-xuexi-01}}{{中文|hsk-1-zhongwen-01}}。
below: Eu estou estudando chinês.

Texto para converter:
[COLE O TEXTO AQUI]`

function parseVocabularyCsv(content: string): VocabularyEntry[] | null {
  const rows = content.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean).map((row) => row.split(',').map((cell) => cell.trim()))
  if (rows.length < 2 || rows[0].join(',') !== vocabularyHeaders.join(',')) return null
  const entries = rows.slice(1).map((row) => Object.fromEntries(vocabularyHeaders.map((header, index) => [header, row[index] ?? ''])) as VocabularyEntry)
  return entries.every((entry) => entry.id && (entry.type === 'character' || entry.type === 'word') && entry.hanzi && entry.pinyin && entry.english && entry.portuguese && entry.hsk_level) ? entries : null
}

function parseLayeredContent(content: string): DraftLine[] | null {
  const blocks = content.trim().split(/\n\s*\n/).filter(Boolean)
  if (blocks.length === 0) return null
  const lines = blocks.map((block) => {
    const fields: { top_text: string | null; text: string | null; bottom_text: string | null } = { top_text: null, text: null, bottom_text: null }
    for (const sourceLine of block.split('\n')) {
      const match = sourceLine.match(/^\s*(above|text|below)\s*:\s*(.+?)\s*$/i)
      if (!match) return null
      const key = match[1].toLocaleLowerCase() === 'above' ? 'top_text' : match[1].toLocaleLowerCase() === 'below' ? 'bottom_text' : 'text'
      if (fields[key] !== null) return null
      fields[key] = match[2]
    }
    return fields.text ? { top_text: fields.top_text, text: fields.text, bottom_text: fields.bottom_text } : null
  })
  return lines.every((line): line is DraftLine => line !== null) ? lines : null
}

function displayAnnotatedText(text: string) {
  return text.replace(/\{\{([^{}|]+)\|[a-zA-Z0-9][a-zA-Z0-9_-]*\}\}/g, '$1')
}

function ReadingsModule({ embedded = false }: { embedded?: boolean }) {
  const [isCreating, setIsCreating] = useState(false)
  const [isEditingChapter, setIsEditingChapter] = useState(false)
  const [isEditingReading, setIsEditingReading] = useState(false)
  const [mode, setMode] = useState<CreationMode>('new-reading')
  const [readingId, setReadingId] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
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
  const [editingReadingTags, setEditingReadingTags] = useState<string[]>([])
  const [editingReadingTagInput, setEditingReadingTagInput] = useState('')
  const [readings, setReadings] = useState<Reading[]>([])
  const [activeReading, setActiveReading] = useState<ReadingDetail | null>(null)
  const [activeChapterIndex, setActiveChapterIndex] = useState(0)
  const [showTopNotes, setShowTopNotes] = useState(true)
  const [showBottomNotes, setShowBottomNotes] = useState(true)
  const [speakingLineId, setSpeakingLineId] = useState<string | null>(null)
  const [selectedTerm, setSelectedTerm] = useState<SelectedTerm | null>(null)
  const [studyMessage, setStudyMessage] = useState('')
  const [learnedVocabularyIds, setLearnedVocabularyIds] = useState<string[]>([])
  const [isReaderLoading, setIsReaderLoading] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const activeUtterance = useRef<SpeechSynthesisUtterance | null>(null)
  const vocabularyFileInput = useRef<HTMLInputElement | null>(null)

  const selectedReading = readings.find((reading) => reading.id === readingId)
  const defaultChapterTitle = `Capítulo ${mode === 'new-chapter' && selectedReading ? selectedReading.chapter_count + 1 : 1}`
  const categories = [...new Set(readings.flatMap((reading) => reading.category ? [reading.category] : []))].sort()
  const allTags = [...new Set(readings.flatMap((reading) => reading.tags))].sort()
  const categoryReadings = categoryFilter === '__none__' ? readings.filter((reading) => !reading.category) : categoryFilter ? readings.filter((reading) => reading.category === categoryFilter) : readings
  const visibleReadings = tagFilter ? categoryReadings.filter((reading) => reading.tags.includes(tagFilter)) : categoryReadings
  const draftLines = layout === 'layered' && content ? parseLayeredContent(content) : null
  const editDraftLines = editingChapterLayout === 'layered' && editingChapterContent ? parseLayeredContent(editingChapterContent) : null

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
    if (!isCreating) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsCreating(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isCreating])

  function resetForm() {
    setReadingId(''); setTitle(''); setCategory(''); setTags([]); setTagInput(''); setChapterTitle(''); setContent(''); setLayout('plain')
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

  function renderLineText(line: ChapterLine) {
    const pieces: ReactNode[] = []
    let cursor = 0
    for (const [index, term] of [...line.terms].sort((first, second) => first.start_index - second.start_index).entries()) {
      if (term.start_index > cursor) pieces.push(<span key={`text-${cursor}`}>{line.text.slice(cursor, term.start_index)}</span>)
      pieces.push(<button type="button" className={learnedVocabularyIds.includes(term.vocabulary_id) ? 'term-button learned-term' : 'term-button'} key={`${term.vocabulary_id}-${index}`} onClick={() => void openTerm(term, line.id)}>{line.text.slice(term.start_index, term.start_index + term.length)}</button>)
      cursor = term.start_index + term.length
    }
    if (cursor < line.text.length) pieces.push(<span key={`text-${cursor}`}>{line.text.slice(cursor)}</span>)
    return pieces
  }

  function openTerm(term: VocabularyTerm, sourceLineId: string) {
    setSelectedTerm({ ...term, source_line_id: sourceLineId })
    setStudyMessage('')
  }

  async function createCardFromTerm() {
    if (!selectedTerm) return
    setStudyMessage('')
    const created = createCard(loadDeviceProgress(), selectedTerm.vocabulary_id, selectedTerm.source_line_id)
    setStudyMessage(created ? 'Card criado neste dispositivo.' : 'Este card já existe neste dispositivo.')
  }

  async function markTermAsLearned() {
    if (!selectedTerm) return
    setStudyMessage('')
    const progress = loadDeviceProgress()
    progress.vocabulary[selectedTerm.vocabulary_id] = 'learned'
    saveDeviceProgress(progress)
    setLearnedVocabularyIds((current) => current.includes(selectedTerm.vocabulary_id) ? current : [...current, selectedTerm.vocabulary_id])
    setStudyMessage('Marcada como aprendida neste dispositivo.')
  }

  async function openReading(id: string) {
    setError(''); setIsReaderLoading(true)
    try {
      const response = await fetch(`/api/readings/${id}`)
      if (!response.ok) throw new Error('Não foi possível abrir esta leitura.')
      setActiveReading((await response.json()) as ReadingDetail)
      setLearnedVocabularyIds(Object.entries(loadDeviceProgress().vocabulary).filter(([, status]) => status === 'learned').map(([vocabularyId]) => vocabularyId))
      setActiveChapterIndex(0); setShowTopNotes(true); setShowBottomNotes(true); setSelectedTerm(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir esta leitura.')
    } finally {
      setIsReaderLoading(false)
    }
  }

  async function saveChapter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const chapter = activeReading?.chapters[activeChapterIndex]
    if (!activeReading || !chapter) return
    setError('')
    if (editingChapterLayout === 'layered' && !editDraftLines) {
      setError('Revise o formato e as marcações de vocabulário antes de salvar.')
      return
    }
    try {
      const response = await fetch(`/api/chapters/${chapter.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: editingChapterTitle, content: editingChapterContent, layout: editingChapterLayout }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível salvar o capítulo.')
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
        body: JSON.stringify({ title: editingReadingTitle, category: editingReadingCategory, tags: editingReadingTags }),
      })
      const payload = await response.json() as Reading | { error: string }
      if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error : 'Não foi possível salvar a leitura.')
      setActiveReading((current) => current ? { ...current, title: payload.title, category: payload.category, tags: payload.tags } : current)
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
    event.preventDefault(); setError('')
    if (mode === 'new-chapter' && !readingId) return setError('Escolha uma leitura para adicionar o capítulo.')
    if (layout === 'layered' && !draftLines) return setError('Revise o formato das camadas antes de salvar.')
    try {
      const response = await fetch('/api/readings', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ readingId: mode === 'new-chapter' ? readingId : undefined, title, category, tags, chapterTitle: chapterTitle || defaultChapterTitle, content, layout }),
      })
      const payload = (await response.json()) as Reading | { error: string }
      if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error : 'Não foi possível salvar o capítulo.')
      setReadings((current) => current.some((reading) => reading.id === payload.id) ? current.map((reading) => reading.id === payload.id ? payload : reading) : [payload, ...current])
      resetForm(); setIsCreating(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o capítulo.')
    }
  }

  if (activeReading) {
    const chapter = activeReading.chapters[activeChapterIndex]
    const hasTopNotes = chapter?.lines.some((line) => line.top_text) ?? false
    const hasBottomNotes = chapter?.lines.some((line) => line.bottom_text) ?? false
    return <main className="reader-shell">
      <header className="app-header reader-header">
        <button type="button" className="back" onClick={() => setActiveReading(null)}>← Biblioteca</button>
        <a className="brand" href="/" aria-label="Orbe, início">orb<span>e</span></a>
        <div className="reader-header-actions"><button type="button" className="secondary reader-edit" onClick={() => openReadingEditor(activeReading)}>Editar leitura</button><button type="button" className="danger reader-edit" onClick={() => void deleteReading()}>Excluir</button></div>
      </header>
      <section className="reader" aria-labelledby="reading-title">
        <p className="eyebrow">LEITURA</p>
        <h1 id="reading-title">{activeReading.title}</h1>
        {chapter && <>
          <label className="chapter-picker">Capítulo
            <select value={activeChapterIndex} onChange={(event) => { setActiveChapterIndex(Number(event.target.value)); setShowTopNotes(true); setShowBottomNotes(true); setSelectedTerm(null) }}>
              {activeReading.chapters.map((item, index) => <option key={item.id} value={index}>{item.position}. {item.title}</option>)}
            </select>
          </label>
          {chapter.layout === 'layered' && <div className="reader-controls" aria-label="Camadas visíveis">
            {hasTopNotes && <button type="button" className="secondary" aria-pressed={showTopNotes} onClick={() => setShowTopNotes((current) => !current)}>{showTopNotes ? 'Ocultar acima' : 'Mostrar acima'}</button>}
            {hasBottomNotes && <button type="button" className="secondary" aria-pressed={showBottomNotes} onClick={() => setShowBottomNotes((current) => !current)}>{showBottomNotes ? 'Ocultar abaixo' : 'Mostrar abaixo'}</button>}
          </div>}
          <div className="reader-actions"><button type="button" className="secondary" onClick={() => openChapterEditor(chapter)}>Editar capítulo</button></div>
          <article className={chapter.layout === 'layered' ? 'chapter layered-chapter' : 'chapter'}>
            <h2>{chapter.title}</h2>
            {chapter.layout === 'layered'
              ? chapter.lines.map((line) => <div className="reading-line" key={line.id}>
                {showTopNotes && line.top_text && <p className="line-top">{line.top_text}</p>}
                <div className="line-main-row"><p className="line-main">{renderLineText(line)}</p><button type="button" className="speak-button" onClick={() => speakLine(line)} aria-label={speakingLineId === line.id ? 'Parar leitura' : 'Ouvir texto principal'}>{speakingLineId === line.id ? '■' : '▶'}</button></div>
                {showBottomNotes && line.bottom_text && <p className="line-bottom">{line.bottom_text}</p>}
              </div>)
              : chapter.content.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            {selectedTerm && <div className="term-overlay" role="presentation" onMouseDown={() => setSelectedTerm(null)}><aside className="term-details" aria-label="Detalhes do vocabulário" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="term-details-close" onClick={() => setSelectedTerm(null)} aria-label="Fechar detalhes">×</button><strong>{selectedTerm.hanzi}</strong><span>{selectedTerm.pinyin}</span><p>{selectedTerm.portuguese}</p><small>{selectedTerm.english} · HSK {selectedTerm.hsk_level}</small><div className="term-study-actions"><button type="button" onClick={() => void createCardFromTerm()}>Criar card</button><button type="button" className="secondary" onClick={() => void markTermAsLearned()}>Marcar aprendida</button></div>{studyMessage && <p className="term-study-message" role="status">{studyMessage}</p>}</aside></div>}
          </article>
        </>}
      </section>
      {isEditingChapter && <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsEditingChapter(false)}><form className="new-reading" role="dialog" aria-modal="true" aria-labelledby="edit-chapter-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveChapter}>
        <div className="modal-header"><h2 id="edit-chapter-title">Editar capítulo</h2><button type="button" className="modal-close" aria-label="Fechar" onClick={() => setIsEditingChapter(false)}>×</button></div>
        <label>Título do capítulo<input value={editingChapterTitle} onChange={(event) => setEditingChapterTitle(event.target.value)} required autoFocus /></label>
        <label>Formato da leitura<select value={editingChapterLayout} onChange={(event) => setEditingChapterLayout(event.target.value as ContentLayout)}><option value="plain">Texto simples</option><option value="layered">Texto com camadas</option></select></label>
        {editingChapterLayout === 'layered' && <p className="format-help">Cada bloco precisa de <code>text:</code>; <code>above:</code> e <code>below:</code> são opcionais. Todo hanzi em <code>text:</code> usa <code>{'{{palavra|id-do-catálogo}}'}</code>.</p>}
        <label>{editingChapterLayout === 'layered' ? 'Blocos de leitura' : 'Texto'}<textarea value={editingChapterContent} onChange={(event) => setEditingChapterContent(event.target.value)} rows={editingChapterLayout === 'layered' ? 12 : 8} required /></label>
        {editingChapterLayout === 'layered' && editingChapterContent && <div className="layered-preview"><strong>Prévia</strong>{editDraftLines ? editDraftLines.map((line, index) => <div className="preview-line" key={index}>{line.top_text && <small>{line.top_text}</small>}<span>{displayAnnotatedText(line.text)}</span>{line.bottom_text && <small>{line.bottom_text}</small>}</div>) : <p>Revise os blocos e as marcações antes de salvar.</p>}</div>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions"><button type="submit">Salvar alterações</button><button type="button" className="secondary" onClick={() => setIsEditingChapter(false)}>Cancelar</button></div>
      </form></div>}
      {isEditingReading && <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsEditingReading(false)}><form className="new-reading" role="dialog" aria-modal="true" aria-labelledby="edit-reading-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveReading}>
        <div className="modal-header"><h2 id="edit-reading-title">Editar leitura</h2><button type="button" className="modal-close" aria-label="Fechar" onClick={() => setIsEditingReading(false)}>×</button></div>
        <label>Título da leitura<input value={editingReadingTitle} onChange={(event) => setEditingReadingTitle(event.target.value)} required autoFocus /></label>
        <label>Categoria ou tema <span className="optional">(opcional)</span><input value={editingReadingCategory} onChange={(event) => setEditingReadingCategory(event.target.value)} placeholder="Ex.: Idiomas" /></label>
        <label>Tags <span className="optional">(opcional)</span><div className="tag-editor">
          {editingReadingTags.map((tag) => <button type="button" key={tag} onClick={() => setEditingReadingTags((current) => current.filter((item) => item !== tag))}>{tag} ×</button>)}
          <input value={editingReadingTagInput} onChange={(event) => updateEditingReadingTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addEditingReadingTags() } }} onBlur={() => addEditingReadingTags()} placeholder={editingReadingTags.length === 0 ? 'Digite tags separadas por vírgula' : 'Adicionar tags'} />
        </div></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions"><button type="submit">Salvar alterações</button><button type="button" className="secondary" onClick={() => setIsEditingReading(false)}>Cancelar</button></div>
      </form></div>}
    </main>
  }

  return <main className={embedded ? 'workspace-view' : 'app-shell'}>
    {!embedded && <header className="app-header"><a className="brand" href="/" aria-label="Orbe, início">orb<span>e</span></a></header>}
    <section className="welcome" aria-labelledby="welcome-title">
      <p className="eyebrow">LEITURAS</p>
      <h1 id="welcome-title">Seu espaço para ler e lembrar.</h1>
      <p className="intro">Guarde um texto, retome uma leitura e crie cards quando uma ideia merecer ficar.</p>
      <div className="actions"><button type="button" onClick={openNewReading}>Novo texto</button><button type="button" className="secondary" onClick={() => vocabularyFileInput.current?.click()}>Importar vocabulário</button><button type="button" className="secondary" disabled>Salvar link para depois</button></div>
      <input ref={vocabularyFileInput} className="visually-hidden" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => void importVocabulary(event.currentTarget.files?.[0])} />
      {importMessage && <p className="import-message" role="status">{importMessage}</p>}
      <section className="ai-templates" aria-labelledby="ai-templates-title">
        <div><p className="eyebrow">ATALHO</p><h2 id="ai-templates-title">Modelos para IA</h2><p>Copie um modelo, cole na sua IA e complete com o conteúdo.</p></div>
        <div className="template-actions"><button type="button" className="secondary" onClick={() => void copyTemplate(layeredTextTemplate, 'Instrução de texto')}>Copiar formato de texto</button><button type="button" className="secondary" onClick={() => void copyTemplate(vocabularyTemplate, 'Instrução de vocabulário')}>Copiar formato de vocabulário</button></div>
        {copyMessage && <p className="import-message" role="status">{copyMessage}</p>}
      </section>
      {isCreating && <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsCreating(false)}><form className="new-reading" role="dialog" aria-modal="true" aria-labelledby="new-reading-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={createReading}>
        <div className="modal-header"><h2 id="new-reading-title">Adicionar texto</h2><button type="button" className="modal-close" aria-label="Fechar" onClick={() => setIsCreating(false)}>×</button></div>
        <fieldset className="creation-mode"><legend>Onde este texto entra?</legend>
          <label><input type="radio" name="creation-mode" checked={mode === 'new-reading'} onChange={() => { setMode('new-reading'); setChapterTitle('') }} /> Nova leitura</label>
          <label><input type="radio" name="creation-mode" checked={mode === 'new-chapter'} onChange={() => { setMode('new-chapter'); setChapterTitle('') }} disabled={readings.length === 0} /> Novo capítulo de uma leitura existente</label>
        </fieldset>
        {mode === 'new-reading' ? <>
          <label>Título da leitura<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Ideias sobre aprendizado" autoFocus /></label>
          <label>Categoria ou tema <span className="optional">(opcional)</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ex.: Filosofia, Finanças, Ficção" /></label>
          <label>Tags <span className="optional">(opcional)</span><div className="tag-editor">
            {tags.map((tag) => <button type="button" key={tag} onClick={() => setTags((current) => current.filter((item) => item !== tag))}>{tag} ×</button>)}
            <input value={tagInput} onChange={(event) => updateTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addTag() } }} onBlur={() => addTag()} placeholder={tags.length === 0 ? 'Digite tags separadas por vírgula' : 'Adicionar tags'} />
          </div></label>
        </> : <label>Leitura<select value={readingId} onChange={(event) => { setReadingId(event.target.value); setChapterTitle('') }} required><option value="">Escolha uma leitura</option>{readings.map((reading) => <option key={reading.id} value={reading.id}>{reading.title}</option>)}</select></label>}
        <label>Título do capítulo<input value={chapterTitle || defaultChapterTitle} onChange={(event) => setChapterTitle(event.target.value)} required /></label>
        <label>Formato da leitura<select value={layout} onChange={(event) => setLayout(event.target.value as ContentLayout)}><option value="plain">Texto simples</option><option value="layered">Texto com camadas</option></select></label>
        {layout === 'layered' && <p className="format-help">Cada bloco precisa de <code>text:</code>; <code>above:</code> e <code>below:</code> são opcionais. Use <code>{'{{学习|hsk-1-xuexi-01}}'}</code> para marcar uma palavra do catálogo. Separe os blocos por uma linha vazia.</p>}
        <label>{layout === 'layered' ? 'Blocos de leitura' : 'Texto'}<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder={layout === 'layered' ? 'above: Wǒ xiǎng xué Zhōngwén.\ntext: {{我|hsk-1-wo-01}}{{想|hsk-1-xiang-01}}{{学|hsk-1-xue-01}}{{中文|hsk-1-zhongwen-01}}。\nbelow: Eu quero aprender chinês.' : 'Escreva ou cole algo que deseja ler...'} rows={layout === 'layered' ? 12 : 8} required /></label>
        {layout === 'layered' && content && <div className="layered-preview"><strong>Prévia</strong>{draftLines ? draftLines.map((line, index) => <div className="preview-line" key={index}>{line.top_text && <small>{line.top_text}</small>}<span>{displayAnnotatedText(line.text)}</span>{line.bottom_text && <small>{line.bottom_text}</small>}</div>) : <p>Use somente linhas iniciadas por <code>above:</code>, <code>text:</code> ou <code>below:</code>; todo bloco precisa de <code>text:</code>.</p>}</div>}
        <div className="form-actions"><button type="submit">Salvar capítulo</button><button type="button" className="secondary" onClick={() => setIsCreating(false)}>Cancelar</button></div>
      </form></div>}
      {error && <p className="error" role="alert">{error}</p>}
      <section className="library" aria-labelledby="library-title"><div className="library-head"><h2 id="library-title">Sua biblioteca</h2><button type="button" className="secondary filter-button" onClick={() => setIsFilterOpen((current) => !current)}>Filtrar</button></div>
        {isFilterOpen && <div className="filter-controls"><label className="filter-control">Categoria<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">Todas as categorias</option><option value="__none__">Sem categoria</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="filter-control">Tag<select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">Todas as tags</option>{allTags.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>}
        {isLoading ? <p className="empty">Carregando leituras...</p> : visibleReadings.length === 0 ? <p className="empty">Nenhuma leitura salva ainda.</p> : <ul>{visibleReadings.map((reading) => <li key={reading.id}><button type="button" className="reading-link" onClick={() => void openReading(reading.id)}><span className="reading-main"><strong>{reading.title}</strong><span>{reading.category && <em>{reading.category} · </em>}{reading.chapter_count} {reading.chapter_count === 1 ? 'capítulo' : 'capítulos'} →</span></span></button></li>)}</ul>}
      </section>
      {isReaderLoading && <p className="empty">Abrindo leitura...</p>}
    </section>
  </main>
}

export default ReadingsModule
