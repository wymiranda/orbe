import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import HanziWriter from 'hanzi-writer'
import '../../App.css'
import { recordModuleActivity } from '../../learning-paths/module-bridge'
import PageHeader from '../../core/PageHeader'

export type WritingPracticeItem = { id: string; glyph: string; label: string; detail?: string; hskLevel: string }
type WritingProgress = { attempts: number; guidedCompletions: number; mistakes: number; lastPracticedAt: string; nextDueAt: string; intervalDays: number }

const progressStorageKey = 'niorb:writing:progress:v2'
const legacyAttemptStorageKey = 'niorb:writing:attempts:v1'

function loadProgress(): Record<string, WritingProgress> {
  try {
    const stored = JSON.parse(localStorage.getItem(progressStorageKey) ?? '{}') as Record<string, Partial<WritingProgress>>
    const progress = Object.fromEntries(Object.entries(stored).flatMap(([id, value]) => !value || typeof value.attempts !== 'number' ? [] : [[id, { attempts: value.attempts, guidedCompletions: value.guidedCompletions ?? 0, mistakes: value.mistakes ?? 0, lastPracticedAt: value.lastPracticedAt ?? '', nextDueAt: value.nextDueAt ?? '', intervalDays: value.intervalDays ?? 0 }]])) as Record<string, WritingProgress>
    if (Object.keys(progress).length) return progress
    const legacy = JSON.parse(localStorage.getItem(legacyAttemptStorageKey) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(legacy).flatMap(([id, attempts]) => typeof attempts === 'number' ? [[id, { attempts, guidedCompletions: 0, mistakes: 0, lastPracticedAt: '', nextDueAt: '', intervalDays: 0 }]] : []))
  } catch { return {} }
}
function saveProgress(progress: Record<string, WritingProgress>) { localStorage.setItem(progressStorageKey, JSON.stringify(progress)) }
function chooseRandom<T>(items: T[]) { return items[Math.floor(Math.random() * items.length)] }
function dueRank(progress?: WritingProgress) { if (!progress?.attempts) return 1; return progress.nextDueAt && Date.parse(progress.nextDueAt) <= Date.now() ? 0 : 2 }
function choosePracticeItem(items: WritingPracticeItem[], progress: Record<string, WritingProgress>, except?: WritingPracticeItem, completed = new Set<string>()) {
  const available = items.filter((item) => item !== except && !completed.has(item.id))
  const pool = available.length ? available : items.filter((item) => item !== except)
  if (!pool.length) return undefined
  const ranked = [...pool].sort((left, right) => dueRank(progress[left.id]) - dueRank(progress[right.id]) || (progress[left.id]?.lastPracticedAt || '').localeCompare(progress[right.id]?.lastPracticedAt || ''))
  return chooseRandom(ranked.slice(0, Math.min(3, ranked.length)))
}
async function loadCharacterData(character: string) {
  const url = `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(character)}.json`
const cache = typeof caches === 'undefined' ? null : await caches.open('niorb-hanzi-writer-v1')
  const cached = cache ? await cache.match(url) : undefined
  if (cached) return cached.json()
  const response = await fetch(url)
  if (!response.ok) throw new Error('Dados do caractere indisponíveis.')
  void cache?.put(url, response.clone())
  return response.json()
}

function WritingSetupDashboard({ embedded, levels, level, itemCount, mode, onModeChange, onLevelChange, onStart }: { embedded: boolean; levels: string[]; level: string; itemCount: number; mode: 'free' | 'guided'; onModeChange: (mode: 'free' | 'guided') => void; onLevelChange: (level: string) => void; onStart: () => void }) {
  return <main className={embedded ? 'workspace-view' : 'app-shell'}>{!embedded && <header className="app-header"><a className="brand" href="/">orb<span>e</span></a></header>}<section className="welcome writing-setup writing-dashboard"><header className="writing-dashboard-hero"><h1>Escrita</h1><p>Pratique a escrita de caracteres e fortaleça sua memorização.</p></header><section className="writing-benefits"><article><span>✎</span><div><strong>Treina memória</strong><p>Escrever ajuda a fixar o significado.</p></div></article><article><span>◉</span><div><strong>Reconhece padrões</strong><p>Você internaliza a estrutura dos caracteres.</p></div></article><article><span>♧</span><div><strong>Melhora a retenção</strong><p>Combina visão, motor e significado.</p></div></article><article><span>◎</span><div><strong>Ideal para HSK</strong><p>Foca nos caracteres mais relevantes.</p></div></article></section><section className="writing-configuration"><div className="writing-main-options"><h2>Modo de prática</h2><div className="writing-mode writing-dashboard-mode" role="group" aria-label="Modo de prática"><button type="button" className={mode === 'free' ? '' : 'secondary'} onClick={() => onModeChange('free')}><span>✎</span><strong>Livre</strong><small>Desenhe sem correção. Pratique no seu ritmo.</small></button><button type="button" className={mode === 'guided' ? '' : 'secondary'} onClick={() => onModeChange('guided')}><span>☷</span><strong>Guiado</strong><small>Treine a ordem dos traços com orientação passo a passo.</small></button></div><h2 className="writing-content-title">Escolha o conteúdo</h2><label className="writing-picker">Nível HSK<select value={level} onChange={(event) => onLevelChange(event.target.value)}>{levels.map((itemLevel) => <option value={itemLevel} key={itemLevel}>HSK {itemLevel} · {itemLevel === level ? itemCount : ''} caracteres</option>)}</select></label><div className="writing-start-row"><button type="button" className="writing-start" onClick={onStart} disabled={!itemCount}>Iniciar prática →</button><span>{itemCount} caracteres disponíveis</span></div></div><aside className="writing-practice-options"><h2>Opções de prática</h2><p><b>✎ Mostrar pinyin</b><small>Exibe a pronúncia do caractere</small></p><p><b>▣ Mostrar significado</b><small>Exibe a tradução em português</small></p><p><b>▦ Grade de escrita</b><small>Ajuda no alinhamento dos traços</small></p><p><b>◷ Limite de tempo</b><small>Adiciona um desafio extra</small></p><p><b>♬ Áudio automático</b><small>Reproduz a pronúncia ao avançar</small></p></aside></section></section></main>
}

function WritingModule({ items, embedded = false, guidedOnly = false, onComplete, onExit }: { items: WritingPracticeItem[]; embedded?: boolean; guidedOnly?: boolean; onComplete?: () => void | Promise<void>; onExit?: () => void | Promise<void> }) {
  const validItems = useMemo(() => items.filter((item) => /^[\p{Script=Han}]+$/u.test(item.glyph)), [items])
  const levels = useMemo(() => [...new Set(validItems.map((item) => item.hskLevel))].sort((a, b) => Number(a) - Number(b)), [validItems])
  const [requestedLevel, setRequestedLevel] = useState('')
  const [mode, setMode] = useState<'free' | 'guided'>('free')
  const [itemId, setItemId] = useState('')
  const [glyphIndex, setGlyphIndex] = useState(0)
  const [isPracticing, setIsPracticing] = useState(false)
  const [progress, setProgress] = useState<Record<string, WritingProgress>>(loadProgress)
  const [sessionCompleted, setSessionCompleted] = useState<Set<string>>(() => new Set())
  const [strokeCount, setStrokeCount] = useState(0)
  const [undoCount, setUndoCount] = useState(0)
  const [message, setMessage] = useState('')
  const [guidedStatus, setGuidedStatus] = useState('Carregando guia…')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const guidedTargetRef = useRef<HTMLDivElement>(null)
  const nextGuidedTargetRef = useRef<HTMLDivElement>(null)
  const guidedWriterRef = useRef<ReturnType<typeof HanziWriter.create> | null>(null)
  const nextGuidedWriterRef = useRef<ReturnType<typeof HanziWriter.create> | null>(null)
  const hintTimeoutRef = useRef<number | null>(null)
  const drawing = useRef(false)
  const previousPoint = useRef<{ x: number; y: number } | null>(null)
  const previousMidpoint = useRef<{ x: number; y: number } | null>(null)
  const canvasHistory = useRef<ImageData[]>([])
  const continueGuidedPractice = useRef(false)
  const startGuidedPracticeRef = useRef<() => void>(() => {})
  const startedGuidedStepRef = useRef('')
  const completedRun = useRef(false)
  const level = levels.includes(requestedLevel) ? requestedLevel : levels[0] ?? ''
  const filteredItems = guidedOnly ? validItems : validItems.filter((item) => item.hskLevel === level)
  const current = filteredItems.find((item) => item.id === itemId) ?? validItems.find((item) => item.id === itemId) ?? filteredItems[0]
  const currentGlyphs = useMemo(() => Array.from(current?.glyph ?? '').filter((glyph) => /^\p{Script=Han}$/u.test(glyph)), [current?.glyph])
  const firstGlyph = currentGlyphs[0] ?? ''
  const secondGlyph = currentGlyphs[1] ?? ''
  const sessionGoal = guidedOnly ? filteredItems.length : Math.min(10, filteredItems.length)

  useEffect(() => {
    if (!guidedOnly || isPracticing || !validItems.length) return
    const first = validItems[0]
    completedRun.current = false
    setMode('guided')
    setSessionCompleted(new Set())
    setItemId(first.id)
    setIsPracticing(true)
  }, [guidedOnly, isPracticing, validItems])
  useEffect(() => { setGlyphIndex(0) }, [current?.id])

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !current) return
    const size = Math.max(280, Math.min(560, Math.floor(canvas.getBoundingClientRect().width)))
    const ratio = window.devicePixelRatio || 1
    canvas.width = size * ratio; canvas.height = size * ratio
    const context = canvas.getContext('2d'); if (!context) return
    const darkTheme = canvas.closest('.theme-dark') !== null
    context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, size, size)
    context.strokeStyle = darkTheme ? '#4b423c' : '#e1d6c7'; context.lineWidth = 1; context.setLineDash([5, 5]); context.beginPath()
    context.moveTo(size / 2, 16); context.lineTo(size / 2, size - 16); context.moveTo(16, size / 2); context.lineTo(size - 16, size / 2); context.stroke(); context.setLineDash([])
    context.fillStyle = darkTheme ? 'rgb(255 222 98 / .14)' : 'rgb(113 62 53 / .10)'; context.font = `${Math.floor(size * .6)}px serif`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(current.glyph, size / 2, size / 2)
    canvasHistory.current = []; setStrokeCount(0); setUndoCount(0); setMessage('')
  }, [current])
  useEffect(() => { if (isPracticing && mode === 'free') clearCanvas() }, [clearCanvas, isPracticing, mode])

  useEffect(() => {
    if (!isPracticing || mode !== 'guided' || !firstGlyph || !guidedTargetRef.current) return
    const target = guidedTargetRef.current; let active = true
    const createWriter = () => {
      const writerSize = Math.floor(Math.min(target.clientWidth, target.clientHeight)); if (!writerSize) return
      const darkTheme = target.closest('.theme-dark') !== null
      guidedWriterRef.current?.cancelQuiz(); target.replaceChildren(); startedGuidedStepRef.current = ''
      guidedWriterRef.current = HanziWriter.create(target, firstGlyph, {
        width: writerSize, height: writerSize, padding: 24, showCharacter: false, showOutline: true, drawingWidth: 10,
        strokeColor: darkTheme ? '#f2efeb' : '#713e35', outlineColor: darkTheme ? '#4b423c' : '#e1d6c7', drawingColor: darkTheme ? '#FFDE62' : '#DB0F00', highlightColor: darkTheme ? '#FFDE62' : '#c48755', highlightCompleteColor: darkTheme ? '#FFDE62' : '#6d8a69', charDataLoader: loadCharacterData,
        onLoadCharDataSuccess: () => { if (!active) return; setGuidedStatus('Guia pronto. O primeiro traço já está indicado.'); void guidedWriterRef.current?.highlightStroke(0); window.setTimeout(() => { if (!active || !guidedWriterRef.current) return; const stepKey = `${current?.id ?? ''}:0`; if ((guidedOnly || continueGuidedPractice.current) && startedGuidedStepRef.current !== stepKey) { continueGuidedPractice.current = false; startedGuidedStepRef.current = stepKey; startGuidedPracticeRef.current() } }, 0) },
        onLoadCharDataError: () => { if (active) setGuidedStatus('Não foi possível carregar os traços deste caractere.') },
      })
    }
    const observer = new ResizeObserver(createWriter); observer.observe(target); createWriter(); setGuidedStatus('Carregando guia…')
    return () => { active = false; observer.disconnect(); guidedWriterRef.current?.cancelQuiz(); if (hintTimeoutRef.current !== null) window.clearTimeout(hintTimeoutRef.current); guidedWriterRef.current = null }
  }, [current?.id, firstGlyph, guidedOnly, isPracticing, mode])

  useEffect(() => {
    if (!isPracticing || mode !== 'guided' || !secondGlyph || !nextGuidedTargetRef.current) return
    const target = nextGuidedTargetRef.current
    let active = true
    const createPreview = () => {
      const writerSize = Math.floor(Math.min(target.clientWidth, target.clientHeight)); if (!writerSize) return
      const darkTheme = target.closest('.theme-dark') !== null
      nextGuidedWriterRef.current?.cancelQuiz(); target.replaceChildren()
      nextGuidedWriterRef.current = HanziWriter.create(target, secondGlyph, {
        width: writerSize, height: writerSize, padding: 24, showCharacter: false, showOutline: true, drawingWidth: 10,
        strokeColor: darkTheme ? '#f2efeb' : '#713e35', outlineColor: darkTheme ? '#4b423c' : '#e1d6c7', drawingColor: darkTheme ? '#FFDE62' : '#DB0F00', highlightColor: darkTheme ? '#FFDE62' : '#c48755', highlightCompleteColor: darkTheme ? '#FFDE62' : '#6d8a69', charDataLoader: loadCharacterData,
        onLoadCharDataError: () => { if (active) target.replaceChildren() },
      })
    }
    const observer = new ResizeObserver(createPreview); observer.observe(target); createPreview()
    return () => { active = false; observer.disconnect(); nextGuidedWriterRef.current?.cancelQuiz(); nextGuidedWriterRef.current = null }
  }, [isPracticing, mode, secondGlyph])

  const nextItem = useCallback((completed = sessionCompleted) => { const next = choosePracticeItem(filteredItems, progress, current, completed); if (next) { setGlyphIndex(0); setItemId(next.id) } }, [current, filteredItems, progress, sessionCompleted])
  function beginPractice() { const first = choosePracticeItem(filteredItems, progress); if (!first) return; if (guidedOnly) setMode('guided'); setSessionCompleted(new Set()); setItemId(first.id); setIsPracticing(true) }
  function point(event: React.PointerEvent<HTMLCanvasElement>) { const canvas = event.currentTarget; const bounds = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1; return { x: (event.clientX - bounds.left) * ((canvas.width / ratio) / bounds.width), y: (event.clientY - bounds.top) * ((canvas.height / ratio) / bounds.height) } }
  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) { const canvas = event.currentTarget; const context = canvas.getContext('2d'); if (context) { canvasHistory.current.push(context.getImageData(0, 0, canvas.width, canvas.height)); setUndoCount((count) => count + 1) }; const start = point(event); canvas.setPointerCapture(event.pointerId); drawing.current = true; previousPoint.current = start; previousMidpoint.current = null; setStrokeCount((count) => count + 1); setMessage('') }
  function draw(event: React.PointerEvent<HTMLCanvasElement>) { if (!drawing.current || !previousPoint.current) return; const context = canvasRef.current?.getContext('2d'); if (!context) return; const next = point(event); const previous = previousPoint.current; const midpoint = { x: (previous.x + next.x) / 2, y: (previous.y + next.y) / 2 }; context.strokeStyle = canvasRef.current?.closest('.theme-dark') ? '#FFDE62' : '#DB0F00'; context.globalAlpha = .92; context.lineCap = 'butt'; context.lineJoin = 'round'; context.lineWidth = 10 + Math.min(3, Math.max(0, event.pressure || .5) * 3); context.beginPath(); if (previousMidpoint.current) { context.moveTo(previousMidpoint.current.x, previousMidpoint.current.y); context.quadraticCurveTo(previous.x, previous.y, midpoint.x, midpoint.y) } else { context.moveTo(previous.x, previous.y); context.lineTo(midpoint.x, midpoint.y) }; context.stroke(); context.globalAlpha = 1; previousPoint.current = next; previousMidpoint.current = midpoint }
  function stopDrawing(event: React.PointerEvent<HTMLCanvasElement>) { draw(event); drawing.current = false; previousPoint.current = null; previousMidpoint.current = null }
  function undoStroke() { const canvas = canvasRef.current; const image = canvasHistory.current.pop(); const context = canvas?.getContext('2d'); if (!canvas || !image || !context) return; context.putImageData(image, 0, 0); setUndoCount((count) => Math.max(0, count - 1)); setStrokeCount((count) => Math.max(0, count - 1)) }
  const recordAttempt = useCallback((mistakes = 0, guided = false) => { if (!current) return; void recordModuleActivity({ moduleId: 'writing', language: 'zh-Hans', completedAt: Date.now(), assessments: [{ contentId: current.id, skill: guided ? 'production' : 'exposure', score: guided ? Math.max(0, 1 - mistakes * .12) : undefined, usedHint: !guided }] }); setProgress((all) => { const now = new Date(); const previous = all[current.id]; const intervalDays = guided ? Math.min(21, previous?.intervalDays ? previous.intervalDays + 1 : 1) : previous?.intervalDays ?? 0; const next = { attempts: (previous?.attempts ?? 0) + 1, guidedCompletions: (previous?.guidedCompletions ?? 0) + (guided ? 1 : 0), mistakes: (previous?.mistakes ?? 0) + mistakes, lastPracticedAt: now.toISOString(), nextDueAt: new Date(now.getTime() + (guided ? intervalDays : 1) * 86_400_000).toISOString(), intervalDays }; const updated = { ...all, [current.id]: next }; saveProgress(updated); return updated }); setSessionCompleted((completed) => new Set([...completed, current.id])) }, [current])
  function registerAttempt() { if (!current || strokeCount === 0) { setMessage('Faça ao menos um traço antes de registrar.'); return }; recordAttempt(); setMessage('Tentativa registrada neste dispositivo.'); const completed = new Set([...sessionCompleted, current.id]); if (completed.size < sessionGoal) nextItem(completed) }
  const startGuidedPractice = useCallback(() => { const activeWriter = glyphIndex === 0 ? guidedWriterRef.current : nextGuidedWriterRef.current; if (!current || !activeWriter) return; setGuidedStatus('Prática em andamento. O próximo traço será indicado automaticamente.'); void activeWriter.highlightStroke(0); void activeWriter.quiz({ showHintAfterMisses: 1, onMistake: ({ totalMistakes }) => setGuidedStatus(`${totalMistakes} ${totalMistakes === 1 ? 'tentativa fora do traço' : 'tentativas fora do traço'}. Continue.`), onCorrectStroke: ({ strokeNum, strokesRemaining }: { strokeNum: number; strokesRemaining: number }) => { if (strokesRemaining <= 0) return; if (hintTimeoutRef.current !== null) window.clearTimeout(hintTimeoutRef.current); hintTimeoutRef.current = window.setTimeout(() => { void activeWriter.highlightStroke(strokeNum + 1) }, 1000) }, onComplete: ({ totalMistakes }) => { if (glyphIndex < currentGlyphs.length - 1) { setGlyphIndex((index) => index + 1); window.setTimeout(() => startGuidedPracticeRef.current(), 120); return }; recordAttempt(totalMistakes, true); setGuidedStatus(totalMistakes ? `Concluído com ${totalMistakes} correções. Tentativa registrada.` : 'Perfeito. Tentativa registrada.'); const completed = new Set([...sessionCompleted, current.id]); if (completed.size < sessionGoal) { continueGuidedPractice.current = true; nextItem(completed) } else if (guidedOnly && !completedRun.current) { completedRun.current = true; void onComplete?.() } } }) }, [current, currentGlyphs.length, glyphIndex, guidedOnly, nextItem, onComplete, recordAttempt, sessionCompleted, sessionGoal])
  useEffect(() => { startGuidedPracticeRef.current = startGuidedPractice }, [startGuidedPractice])

  if (!isPracticing && items.length && validItems.length) return <WritingSetupDashboard embedded={embedded} levels={levels} level={level} itemCount={filteredItems.length} mode={mode} onModeChange={setMode} onLevelChange={setRequestedLevel} onStart={beginPractice} />

  if (!items.length) return <main className={embedded ? 'workspace-view' : 'app-shell'}><section className="welcome writing-page"><p className="eyebrow">ESCRITA</p><h1>Seu caderno está pronto.</h1><p className="intro">Adicione caracteres à experiência para começar a praticar.</p></section></main>
  if (!validItems.length) return <main className={embedded ? 'workspace-view' : 'app-shell'}><section className="welcome writing-page"><p className="eyebrow">ESCRITA</p><h1>Nenhum caractere válido disponível.</h1><p className="intro">A prática aceita apenas hanzi individuais do catálogo.</p></section></main>
  if (!isPracticing) return <main className={embedded ? 'workspace-view' : 'app-shell'}>{!embedded && <header className="app-header"><a className="brand" href="/">orb<span>e</span></a></header>}<section className="welcome writing-setup"><PageHeader title="Escrita" /><fieldset className="writing-setup-group"><legend>Modo</legend><div className="writing-mode" role="group" aria-label="Modo de prática"><button type="button" className={mode === 'free' ? '' : 'secondary'} onClick={() => setMode('free')}><strong>Livre</strong><span>Desenhe sem correção.</span></button><button type="button" className={mode === 'guided' ? '' : 'secondary'} onClick={() => setMode('guided')}><strong>Guiado</strong><span>Treine a ordem dos traços.</span></button></div></fieldset><label className="writing-picker">Nível HSK<select value={level} onChange={(event) => setRequestedLevel(event.target.value)}>{levels.map((itemLevel) => <option value={itemLevel} key={itemLevel}>HSK {itemLevel} · {validItems.filter((item) => item.hskLevel === itemLevel).length} caracteres</option>)}</select></label><button type="button" className="writing-start" onClick={beginPractice} disabled={!filteredItems.length}>Iniciar prática</button></section></main>
  const currentProgress = progress[current.id]; const complete = sessionCompleted.size >= sessionGoal
  return <main className="writing-session" aria-label="Sessão de prática de escrita">
    <header><div><span>ESCRITA · HSK {current.hskLevel}</span><strong>{mode === 'guided' ? 'Modo guiado' : 'Modo livre'}</strong></div><div className="writing-session-header-actions">{!guidedOnly && <><details><summary>Configuração</summary><div className="writing-session-settings"><label>Nível HSK<select value={level} onChange={(event) => setRequestedLevel(event.target.value)}>{levels.map((itemLevel) => <option value={itemLevel} key={itemLevel}>HSK {itemLevel}</option>)}</select></label><button type="button" onClick={() => nextItem()}>Aplicar e sortear</button></div></details><button type="button" className="secondary writing-next" onClick={() => nextItem()} title="Próximo caractere priorizado" aria-label="Próximo caractere priorizado">⤨</button></>}<button type="button" className="secondary" onClick={() => { setIsPracticing(false); void onExit?.() }}>Sair</button></div></header>
    <section className="writing-session-content"><p className="session-counter">{complete ? 'Sessão concluída.' : `${sessionCompleted.size} de ${sessionGoal} caracteres praticados`} {currentProgress?.attempts ? `· ${currentProgress.attempts} tentativas neste caractere` : ''}</p><section className="writing-board" aria-label={`Área de prática para ${current.glyph}`}><header><div><strong>{current.glyph}</strong><span>{current.label}{current.detail ? ` · ${current.detail}` : ''}</span></div></header>
      {mode === 'free' ? <><canvas ref={canvasRef} className="writing-canvas" aria-label={`Desenhe ${current.glyph}`} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={stopDrawing} onPointerCancel={stopDrawing} /><div className="writing-actions"><button type="button" className="secondary" onClick={undoStroke} disabled={!undoCount}>Desfazer traço</button><button type="button" className="secondary" onClick={clearCanvas}>Limpar</button><button type="button" onClick={registerAttempt} disabled={complete}>Registrar tentativa</button></div>{message && <p className="writing-message" role="status">{message}</p>}</> : <><div className={secondGlyph ? 'guided-writer-pair' : 'guided-writer-single'}><div ref={guidedTargetRef} className={`guided-writer ${glyphIndex === 0 ? 'guided-writer-active' : ''}`} aria-label={`Prática guiada de ${firstGlyph}`} />{secondGlyph && <div ref={nextGuidedTargetRef} className={`guided-writer guided-writer-preview ${glyphIndex === 1 ? 'guided-writer-active' : ''}`} aria-label={`Próximo caractere: ${secondGlyph}`} />}</div>{!guidedOnly && <div className="writing-actions"><button type="button" onClick={startGuidedPractice} disabled={complete || guidedStatus === 'Carregando guia…' || guidedStatus.startsWith('Não foi possível')}>Começar prática guiada</button></div>}<p className="writing-message" role="status">{guidedStatus}</p></>}
    </section><aside className="writing-reference-card" aria-label="Referência do caractere"><strong>{current.glyph}</strong><span>{current.detail || '—'}</span><span>{current.label}</span></aside></section>
  </main>
}

export default WritingModule
