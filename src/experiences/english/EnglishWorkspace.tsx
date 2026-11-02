import { Suspense, lazy, useEffect, useState } from 'react'
import { BookOpen, ChartNoAxesCombined, CircleHelp, Gamepad2, House, Layers3, LayoutGrid, Menu, Moon, PenLine, Settings, Sun, type LucideIcon } from 'lucide-react'
import '../../App.css'
import EnglishHome, { type EnglishStudyDifficulty } from './EnglishHome'
import LevelOnboarding from './LevelOnboarding'
import { cefrLevels } from './cefr-levels'
import AnkiDecks, { type EnglishDeck } from './AnkiDecks'
import { parseCatalogCsv } from './catalog-csv'
import { englishPictureSource } from './picture-source'
import GamesHome, { type EnglishGame } from './GamesHome'
import { speakEnglish } from './speech'
import { englishProgressStore, englishStudySync, loadLegacyProgress, migrateLegacyEnglishProgress, saveLegacyProgress, type LegacyEnglishProgress } from './english-progress'
import type { FlashcardFace, FlashcardSource } from '../../modules/study/flashcard-source'
import type { DeviceProgress } from '../../modules/study/engine/progress-store'

const SceneCertaModule = lazy(() => import('../../modules/scene-certa/SceneCertaModule'))
const StudyModule = lazy(() => import('../../modules/study/StudyModule'))

type Vocabulary = { id: string; term: string; pronunciation: string | null; portuguese: string; part_of_speech: string | null; cefr_level: string | null; visual_kind?: 'emoji' | 'svg' | 'image' | null; visual_value?: string | null }
type Reading = { id: string; title: string; category: string | null; cover_url: string | null }
type ReadingDetail = Reading & { chapters: Array<{ id: string; position: number; title: string; content: string; lines: Array<{ id: string; position: number; text: string; portuguese: string | null }> }> }
type Section = 'home' | 'flashcards' | 'writing' | 'readings' | 'quiz' | 'games' | 'progress' | 'admin'
/** Writing and quiz counters (the flashcards live in the shared engine). */
type Progress = LegacyEnglishProgress
const navigation: Array<{ id: Section; label: string; Icon: LucideIcon }> = [
  { id: 'home', label: 'Início', Icon: House },
  { id: 'flashcards', label: 'Flashcards', Icon: Layers3 },
  { id: 'writing', label: 'Escrita', Icon: PenLine },
  { id: 'readings', label: 'Leituras', Icon: BookOpen },
  { id: 'quiz', label: 'Quiz', Icon: CircleHelp },
  { id: 'games', label: 'Jogar', Icon: Gamepad2 },
  { id: 'progress', label: 'Progresso', Icon: ChartNoAxesCombined },
]

function normalized(value: string) { return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase().trim() }

/** A catalogue word, or a card of an Anki deck (`deck`), as the shared flashcard engine shows it. */
function englishFace(item: Vocabulary, deck: boolean): FlashcardFace {
  return deck
    ? { front: item.term, meaning: item.portuguese, frontClassName: 'english-term english-deck-text', meaningClassName: 'english-deck-text' }
    : { front: item.term, reading: item.pronunciation, meaning: item.portuguese, detail: `${item.part_of_speech ?? '—'} · ${item.cefr_level ?? 'Sem nível'}`, speech: item.term, visual: item.visual_kind && item.visual_value ? { kind: item.visual_kind, value: item.visual_value } : null, frontClassName: 'english-term' }
}

// Pick a level or one of your Anki decks, then study it on the shared flashcard engine.
// Starts on the learner's own level (remounted once it loads).
function EnglishFlashcards({ vocabulary, cefrLevel }: { vocabulary: Vocabulary[]; cefrLevel: string | null }) {
  const [choice, setChoice] = useState(cefrLevel ?? 'A1')
  const [decks, setDecks] = useState<EnglishDeck[]>([])
  // Cards of the chosen deck, keyed by deck id; a deck card reads like a catalogue word without pronunciation or level.
  const [deckCards, setDeckCards] = useState<{ deckId: string; cards: Vocabulary[] } | null>(null)
  const [error, setError] = useState('')
  const deckId = choice.startsWith('deck:') ? choice.slice(5) : null
  useEffect(() => { void fetch('/api/english/decks').then(async (response) => response.ok ? response.json() as Promise<EnglishDeck[]> : []).then(setDecks).catch(() => setDecks([])) }, [])
  useEffect(() => {
    if (!deckId || deckCards?.deckId === deckId) return
    let active = true
    void fetch(`/api/english/decks/${deckId}/cards`).then(async (response) => { if (!response.ok) throw new Error('Nenhuma palavra encontrada.'); return response.json() as Promise<{ id: string; front: string; back: string }[]> })
      .then((cards) => { if (active) { setError(''); setDeckCards({ deckId, cards: cards.map((card) => ({ id: card.id, term: card.front, portuguese: card.back, pronunciation: null, part_of_speech: null, cefr_level: null })) }) } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Nenhuma palavra encontrada.') })
    return () => { active = false }
  }, [deckId, deckCards?.deckId])
  const poolReady = !deckId || deckCards?.deckId === deckId
  const pool = deckId ? (poolReady ? deckCards!.cards : []) : vocabulary.filter((item) => item.cefr_level === choice)
  const changeDecks = (next: EnglishDeck[]) => { setDecks(next); if (deckId && !next.some((deck) => deck.id === deckId)) setChoice(cefrLevel ?? 'A1') }
  const source: FlashcardSource<Vocabulary> = {
    language: 'en',
    store: englishProgressStore,
    loadVocabulary: async () => pool,
    cachedVocabulary: () => pool,
    face: (item) => englishFace(item, Boolean(deckId)),
    speak: (text) => speakEnglish(text),
    dashboardTop: () => <label className="quiz-picker">Estudar<select value={choice} onChange={(event) => setChoice(event.target.value)}>{cefrLevels.map(({ level: value, name }) => <option key={value} value={value}>{value} · {name}</option>)}{decks.length > 0 && <optgroup label="Seus baralhos">{decks.map((deck) => <option key={deck.id} value={`deck:${deck.id}`}>{deck.name}</option>)}</optgroup>}</select></label>,
    dashboardBottom: () => <>{error ? <p className="error" role="alert">{error}</p> : !pool.length && poolReady && <p className="empty">Nenhuma palavra encontrada.</p>}<AnkiDecks decks={decks} onDecksChange={changeDecks} /></>,
  }
  // Every word of the level or deck can be introduced; its card joins the deck when it is.
  return <Suspense fallback={null}><StudyModule key={choice} source={source} vocabulary={pool} offerVocabulary embedded /></Suspense>
}

function CatalogList({ vocabulary }: { vocabulary: Vocabulary[] }) {
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(0)
  const matching = vocabulary.filter((item) => !filter || [item.term, item.pronunciation ?? '', item.portuguese, item.cefr_level ?? ''].some((value) => normalized(value).includes(normalized(filter))))
  const pageSize = 20
  const pages = Math.max(1, Math.ceil(matching.length / pageSize))
  const activePage = Math.min(page, pages - 1)
  const visible = matching.slice(activePage * pageSize, (activePage + 1) * pageSize)
  return <><label className="learned-words-filter">Buscar palavra, pronúncia, tradução ou nível<input value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0) }} /></label>{visible.length ? <ul className="learned-words-list">{visible.map((item) => <li key={item.id}><div><strong>{item.term}</strong><span>{item.pronunciation ?? '—'} · {item.portuguese}</span><small>{item.cefr_level ?? 'Sem nível'}</small></div></li>)}</ul> : <p className="empty">Nenhuma palavra encontrada.</p>}{pages > 1 && <nav className="list-pagination"><button type="button" className="secondary" disabled={!activePage} onClick={() => setPage(activePage - 1)}>Anterior</button><span>{activePage + 1} de {pages}</span><button type="button" className="secondary" disabled={activePage + 1 === pages} onClick={() => setPage(activePage + 1)}>Próxima</button></nav>}</>
}

function EnglishWriting({ vocabulary, deckIds, progress, onProgress }: { vocabulary: Vocabulary[]; deckIds: Set<string>; progress: Progress; onProgress: (next: Progress) => void }) {
  const [index, setIndex] = useState(0)
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('')
  const terms = vocabulary.filter((item) => deckIds.has(item.id))
  const current = terms[index % Math.max(1, terms.length)]
  if (!current) return <section className="welcome writing-page"><p className="eyebrow">ESCRITA</p><h1>Adicione palavras ao baralho.</h1><p className="intro">A escrita guiada em inglês pratica a grafia das palavras que você está estudando.</p></section>
  const submit = () => { const correct = normalized(value) === normalized(current.term); onProgress({ ...progress, spelling: progress.spelling + 1 }); setMessage(correct ? 'Correto.' : `A palavra é “${current.term}”.`); setValue(''); setIndex((currentIndex) => currentIndex + 1) }
  return <section className="welcome writing-page"><p className="eyebrow">ESCRITA GUIADA</p><h1>{current.portuguese}</h1><p className="intro">Digite a palavra em inglês.</p><label className="english-writing-input">Resposta<input value={value} autoCapitalize="none" autoCorrect="off" onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit() }} /></label><button type="button" onClick={submit}>Conferir</button>{message && <p className="writing-message" role="status">{message}</p>}</section>
}

function EnglishQuiz({ vocabulary, deckIds, progress, onProgress }: { vocabulary: Vocabulary[]; deckIds: Set<string>; progress: Progress; onProgress: (next: Progress) => void }) {
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answer, setAnswer] = useState<string | null>(null)
  const terms = vocabulary.filter((item) => deckIds.has(item.id))
  const question = terms[questionIndex % Math.max(1, terms.length)]
  const choices = question ? [question, ...terms.filter((item) => item.id !== question.id).slice(0, 3)].sort((left, right) => left.id.localeCompare(right.id)) : []
  if (!question || terms.length < 4) return <section className="welcome quiz-setup"><p className="eyebrow">QUIZ</p><h1>Prepare quatro palavras.</h1><p className="intro">Adicione pelo menos quatro palavras ao baralho para iniciar o quiz.</p></section>
  const choose = (id: string) => { if (answer) return; const correct = id === question.id; setAnswer(id); onProgress({ ...progress, quizAttempts: progress.quizAttempts + 1, quizCorrect: progress.quizCorrect + (correct ? 1 : 0) }) }
  return <section className="quiz-session"><div className="quiz-session-content"><article className="quiz-card"><p className="session-counter">Questão {questionIndex + 1}</p><p className="quiz-instruction">Escolha a tradução correta.</p><h1 className="quiz-prompt-compact">{question.term}</h1><div className="quiz-choices">{choices.map((choice) => <button type="button" key={choice.id} className={answer ? choice.id === question.id ? 'correct' : choice.id === answer ? 'incorrect' : 'secondary' : 'secondary'} onClick={() => choose(choice.id)}>{choice.portuguese}</button>)}</div>{answer && <button type="button" className="quiz-next" onClick={() => { setQuestionIndex((value) => value + 1); setAnswer(null) }}>Próxima</button>}</article></div></section>
}

function EnglishReadings() {
  const [readings, setReadings] = useState<Reading[]>([])
  const [selected, setSelected] = useState<ReadingDetail | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void fetch('/api/english/readings').then(async (response) => {
      if (!response.ok) throw new Error('Não foi possível carregar as leituras.')
      return response.json() as Promise<Reading[]>
    }).then(setReadings).catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : 'Não foi possível carregar as leituras.'))
  }, [])

  const openReading = (id: string) => {
    void fetch(`/api/english/readings/${encodeURIComponent(id)}`).then(async (response) => {
      if (!response.ok) throw new Error('Não foi possível abrir a leitura.')
      return response.json() as Promise<ReadingDetail>
    }).then(setSelected).catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : 'Não foi possível abrir a leitura.'))
  }

  if (selected) return <section className="welcome reading-page"><button type="button" className="secondary" onClick={() => setSelected(null)}>Voltar para leituras</button><p className="eyebrow">{selected.category ?? 'LEITURA'}</p><h1>{selected.title}</h1>{selected.chapters.map((chapter) => <article className="english-reading-chapter" key={chapter.id}><h2>{chapter.title}</h2>{chapter.lines.length ? chapter.lines.map((line) => <div className="english-reading-line" key={line.id}><p>{line.text}</p>{line.portuguese && <small>{line.portuguese}</small>}</div>) : <p>{chapter.content}</p>}</article>)}</section>
  return <section className="welcome reading-page"><p className="eyebrow">LEITURAS</p><h1>Biblioteca em inglês.</h1>{message && <p className="error">{message}</p>}{readings.length ? <ul className="learned-words-list">{readings.map((reading) => <li key={reading.id}><div><strong>{reading.title}</strong><span>{reading.category ?? 'Leitura'}</span></div><button type="button" onClick={() => openReading(reading.id)}>Abrir</button></li>)}</ul> : <p className="intro">Ainda não há leituras cadastradas para este workspace.</p>}</section>
}

const csvPrompt = `Converta a lista de vocabulário abaixo em CSV separado por vírgula, com este cabeçalho exato:
term,portuguese,pronunciation,part_of_speech,cefr_level

- term: palavra em inglês (obrigatório)
- portuguese: tradução em português (obrigatório)
- pronunciation: pronúncia (opcional)
- part_of_speech: classe gramatical em inglês, ex.: noun, verb, adjective (opcional)
- cefr_level: A1, A2, B1, B2, C1 ou C2 (opcional)

Coloque entre aspas os campos que tiverem vírgula. Responda só com o CSV.

Lista:
`

function EnglishAdmin({ vocabulary, onVocabulary }: { vocabulary: Vocabulary[]; onVocabulary: (vocabulary: Vocabulary[]) => void }) {
  const [catalog, setCatalog] = useState('')
  const [notice, setNotice] = useState('')
  const [promptCopied, setPromptCopied] = useState(false)
  const sendCatalog = async (payload: unknown) => {
    const response = await fetch('/api/english/vocabulary/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); const body = await response.json() as Vocabulary[] | { error?: string }; if (!response.ok) throw new Error('error' in body ? body.error : 'Não foi possível importar o catálogo.'); onVocabulary(body as Vocabulary[]); setNotice('Catálogo importado.')
  }
  const importCatalog = async () => {
    try { await sendCatalog(JSON.parse(catalog)) } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Não foi possível importar o catálogo.') }
  }
  const importFile = async (file: File | undefined) => {
    if (!file) return
    try { const content = await file.text(); await sendCatalog(file.name.toLocaleLowerCase().endsWith('.json') ? JSON.parse(content) : { entries: parseCatalogCsv(content) }) } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Não foi possível importar o catálogo.') }
  }
  return <section className="welcome curation-page"><p className="eyebrow">ADMINISTRAÇÃO</p><h1>Catálogo de inglês.</h1><p className="intro">{vocabulary.length} {vocabulary.length === 1 ? 'palavra cadastrada' : 'palavras cadastradas'}.</p><div className="english-import-row"><label>Importar arquivo CSV<input type="file" accept=".csv,.tsv,.txt,.json" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = '' }} /></label><button type="button" className="secondary" onClick={() => { void navigator.clipboard.writeText(csvPrompt).then(() => setPromptCopied(true)) }}>{promptCopied ? 'Copiado' : 'Copiar prompt'}</button></div><label>Importar catálogo em JSON<textarea value={catalog} onChange={(event) => setCatalog(event.target.value)} placeholder={'{"entries":[{"term":"water","pronunciation":"uóter","portuguese":"água","cefr_level":"A1"}]}'}/></label><button type="button" onClick={() => void importCatalog()}>Importar</button>{notice && <p className="save-notice" role="status">{notice}</p>}<CatalogList vocabulary={vocabulary} /></section>
}

export default function EnglishWorkspace({ onChooseWorkspace = () => {}, onLogout = () => {} }: { onChooseWorkspace?: () => void; onLogout?: () => void }) {
  const [section, setSection] = useState<Section>('home')
  const [menuVisible, setMenuVisible] = useState(false)
  const [vocabulary, setVocabulary] = useState<Vocabulary[]>([])
  const [progress, setProgress] = useState<Progress>(loadLegacyProgress)
  // The old English flashcards move into the shared engine on first open (once per device).
  const [studyProgress, setStudyProgress] = useState<DeviceProgress>(() => { migrateLegacyEnglishProgress(); return englishProgressStore.load() })
  const [error, setError] = useState('')
  // undefined while the preference loads, null until the learner chooses a level.
  const [cefrLevel, setCefrLevel] = useState<string | null | undefined>(undefined)
  const [choosingLevel, setChoosingLevel] = useState(false)
  const [studyDifficulty, setStudyDifficulty] = useState<EnglishStudyDifficulty>('easy')
  const [savingSettings, setSavingSettings] = useState(false)
  const [activeGame, setActiveGame] = useState<EnglishGame | null>(null)
  // Same key as the Chinese workspace, so the chosen theme follows the learner across workspaces.
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('niorb-theme') === 'dark' ? 'dark' : 'light')
  const toggleTheme = () => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); localStorage.setItem('niorb-theme', next) }
  const updateProgress = (next: Progress) => { saveLegacyProgress(next); setProgress(next) }
  useEffect(() => {
    const refresh = () => setStudyProgress(englishProgressStore.load())
    window.addEventListener(englishProgressStore.changeEvent, refresh)
    const stopSync = englishStudySync.start()
    return () => { window.removeEventListener(englishProgressStore.changeEvent, refresh); stopSync() }
  }, [])
  const deckIds = new Set(studyProgress.cards.map((card) => card.vocabularyId))
  const learnedCount = Object.values(studyProgress.vocabulary).filter((status) => status === 'learned').length
  // Reviews from before the engine, plus the engine's daily reviews.
  const reviewCount = progress.reviews + Object.values(studyProgress.activity).reduce((total, day) => total + day.reviews, 0)
  const saveLevel = async (level: string) => {
    const response = await fetch('/api/english/preferences', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cefrLevel: level }) })
    const body = await response.json() as { cefr_level?: string; error?: string }
    if (!response.ok || !body.cefr_level) throw new Error(body.error ?? 'Não foi possível salvar o nível.')
    setCefrLevel(body.cefr_level)
    setChoosingLevel(false)
  }
  // Session card: level and difficulty, saved one click at a time.
  const saveStudySettings = async (settings: { cefrLevel?: string; difficulty?: EnglishStudyDifficulty }) => {
    setSavingSettings(true)
    try {
      const response = await fetch('/api/english/preferences', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) })
      const body = await response.json() as { cefr_level?: string | null; study_difficulty?: EnglishStudyDifficulty; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Não foi possível salvar o nível.')
      setCefrLevel(body.cefr_level ?? null)
      if (body.study_difficulty) setStudyDifficulty(body.study_difficulty)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o nível.')
    } finally {
      setSavingSettings(false)
    }
  }
  useEffect(() => { void fetch('/api/english/preferences').then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ cefr_level: string | null; study_difficulty?: EnglishStudyDifficulty }> }).then((preferences) => { setCefrLevel(preferences.cefr_level); if (preferences.study_difficulty) setStudyDifficulty(preferences.study_difficulty) }).catch(() => undefined) }, [])
  useEffect(() => { void fetch('/api/english/vocabulary').then(async (response) => { if (!response.ok) throw new Error('Não foi possível carregar o catálogo de inglês.'); return response.json() as Promise<Vocabulary[]> }).then(setVocabulary).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o catálogo de inglês.')) }, [])
  const content = section === 'flashcards' ? <EnglishFlashcards key={cefrLevel ?? ''} vocabulary={vocabulary} cefrLevel={cefrLevel ?? null} /> : section === 'writing' ? <EnglishWriting vocabulary={vocabulary} deckIds={deckIds} progress={progress} onProgress={updateProgress} /> : section === 'quiz' ? <EnglishQuiz vocabulary={vocabulary} deckIds={deckIds} progress={progress} onProgress={updateProgress} /> : section === 'admin' ? <EnglishAdmin vocabulary={vocabulary} onVocabulary={setVocabulary} /> : section === 'readings' ? <EnglishReadings /> : section === 'games' ? activeGame === 'bate-olho' ? <Suspense fallback={null}><SceneCertaModule source={englishPictureSource} embedded onExit={() => setActiveGame(null)} /></Suspense> : <GamesHome onOpenGame={setActiveGame} /> : section === 'progress' ? <section className="welcome progress-dashboard"><p className="eyebrow">PROGRESSO</p><h1>Seu inglês.</h1><div className="study-dashboard-metrics"><article><strong>{learnedCount}</strong><p>palavras aprendidas</p></article><article><strong>{reviewCount}</strong><p>revisões</p></article><article><strong>{progress.spelling}</strong><p>práticas de escrita</p></article><article><strong>{progress.quizAttempts ? Math.round(progress.quizCorrect / progress.quizAttempts * 100) : 0}%</strong><p>acerto no quiz</p></article></div></section> : <EnglishHome cefrLevel={cefrLevel ?? null} difficulty={studyDifficulty} onChangeLevel={() => setChoosingLevel(true)} onChangeStudySettings={(settings) => void saveStudySettings(settings)} onOpenSection={setSection} savingSettings={savingSettings} />
  const selectSection = (next: Section) => {
    setSection(next)
    setActiveGame(null)
    setMenuVisible(false)
  }

  return <div className={theme === 'dark' ? 'workspace-layout english-workspace theme-dark' : 'workspace-layout english-workspace'}>
    <aside className={menuVisible ? 'workspace-sidebar is-open' : 'workspace-sidebar'}>
      <a className="workspace-brand" href="/app">niorb</a>
      <div className="workspace-identity"><small>WORKSPACE</small><strong>Inglês</strong></div>
      <nav>
        {navigation.map((item) => <button type="button" key={item.id} className={section === item.id ? 'active' : ''} onClick={() => selectSection(item.id)}><span aria-hidden="true"><item.Icon size={18} strokeWidth={2} /></span><b>{item.label}</b></button>)}
        <button type="button" className={section === 'admin' ? 'active' : ''} onClick={() => selectSection('admin')}><span aria-hidden="true"><Settings size={18} strokeWidth={2} /></span><b>Administração</b></button>
        <button type="button" onClick={() => { onChooseWorkspace(); setMenuVisible(false) }}><span aria-hidden="true"><LayoutGrid size={18} strokeWidth={2} /></span><b>Escolher workspace</b></button>
      </nav>
      <button type="button" className="workspace-note" onClick={onLogout}>Sair</button>
    </aside>
    <main className="workspace-main">
      <header className="workspace-mobile-header">
        <button type="button" className="workspace-menu-toggle" aria-label="Abrir menu" aria-expanded={menuVisible} onClick={() => setMenuVisible((visible) => !visible)}><Menu aria-hidden="true" size={22} strokeWidth={2.25} /></button>
        <div className="workspace-mobile-title"><strong>Inglês</strong></div>
        <div className="workspace-mobile-actions">
          <button type="button" className="workspace-theme-toggle" aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'} onClick={toggleTheme}>{theme === 'dark' ? <Sun aria-hidden="true" size={19} strokeWidth={2.1} /> : <Moon aria-hidden="true" size={19} strokeWidth={2.1} />}</button>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="workspace-view">{content}</div>
    </main>
    {(cefrLevel === null || choosingLevel) && <LevelOnboarding initialLevel={cefrLevel ?? null} onSave={saveLevel} />}
  </div>
}
