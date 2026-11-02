import { useEffect, useMemo, useRef, useState } from 'react'
import '../../App.css'
import { recordModuleActivity } from '../../learning-paths/module-bridge'
import type { ActivityRequest, ActivityResult } from '../../learning-paths/types'

/*
 * Bate-olho (一眼): see a word and pick the picture that matches it.
 * The game knows nothing about a specific language: an experience hands it a
 * PictureGameSource with terms that already have an emoji or an image.
 * The module id stays "scene-certa" so recorded activity keeps working.
 */

export const pictureGameName = 'Bate-olho'

type VisualKind = 'emoji' | 'svg' | 'image'
export type PictureTerm = {
  id: string
  /** Word shown to the learner, in the language being studied. */
  prompt: string
  /** Pronunciation aid shown under the word (pinyin, IPA…). */
  reading: string
  /** Meaning revealed after answering. */
  meaning: string
  visual_kind: VisualKind | null
  visual_value: string | null
}
export type PictureGameSource = {
  /** BCP-47 language of the studied terms, reported with the activity result. */
  language: string
  /** Shown in the session header when no trail objective is available. */
  label: string
  /** Setup screen description. */
  intro: string
  loadTerms: () => Promise<PictureTerm[]>
  speak?: (term: PictureTerm) => void
}
type Question = { term: PictureTerm; options: PictureTerm[] }
type Attempt = { termId: string; correct: boolean; responseMs: number }

const counts = [5, 10]
const optionCount = 4
/** After an answer the game moves on by itself, leaving time to see the result (longer after a mistake, to see the right picture). */
const advanceDelayMs = { correct: 1200, incorrect: 2600 }

function shuffle<T>(items: T[]) { const next = [...items]; for (let index = next.length - 1; index > 0; index -= 1) { const swap = Math.floor(Math.random() * (index + 1)); [next[index], next[swap]] = [next[swap], next[index]] } return next }
export function hasVisual(term: PictureTerm) { return Boolean(term.visual_kind && term.visual_value?.trim()) }
function visualKey(term: PictureTerm) { return `${term.visual_kind}:${term.visual_value}` }

function buildQuestions(pool: PictureTerm[], answers: PictureTerm[], count: number): Question[] {
  return shuffle(answers).slice(0, count).map((term) => {
    // Distractors never share the answer's picture, so every option is distinguishable.
    const seen = new Set([visualKey(term)])
    const distractors = shuffle(pool.filter((other) => other.id !== term.id)).filter((other) => {
      if (seen.has(visualKey(other))) return false
      seen.add(visualKey(other)); return true
    }).slice(0, optionCount - 1)
    return { term, options: shuffle([term, ...distractors]) }
  })
}

function Visual({ term }: { term: PictureTerm }) {
  const value = term.visual_value ?? ''
  if (term.visual_kind === 'emoji') return <span className="picture-game-emoji" aria-hidden="true">{value}</span>
  const src = term.visual_kind === 'svg' ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}` : value
  return <img src={src} alt="" loading="lazy" decoding="async" />
}

function SceneCertaModule({ source, embedded = false, activity, sessionMode = false, onComplete, onExit, onUnavailable }: {
  source: PictureGameSource
  embedded?: boolean
  activity?: ActivityRequest | null
  /** Played as one step of the daily session: starts at once and hands control back at the end. */
  sessionMode?: boolean
  onComplete?: (result: ActivityResult) => void | Promise<void>
  onExit?: () => void | Promise<void>
  /** Session mode only: there is nothing to play. Defaults to onExit. */
  onUnavailable?: () => void | Promise<void>
}) {
  const [terms, setTerms] = useState<PictureTerm[] | null>(null)
  const [count, setCount] = useState(5)
  const [questions, setQuestions] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState('')
  const startedAt = useRef(0)
  const autoStarted = useRef(false)
  const advanceTimer = useRef<number | undefined>(undefined)
  const completed = useRef(false)

  useEffect(() => { void source.loadTerms().then((items) => setTerms(items.filter(hasVisual))).catch((cause: unknown) => { setTerms([]); setError(cause instanceof Error ? cause.message : 'Não foi possível preparar o jogo.') }) }, [source])

  const answers = useMemo(() => {
    if (!terms) return []
    if (!activity) return terms
    const ids = new Set(activity.content.map((content) => content.id))
    return terms.filter((term) => ids.has(term.id))
  }, [activity, terms])
  const playable = Boolean(terms && terms.length >= 2 && answers.length)
  const current = questions[index]
  const correct = Boolean(current && selected === current.term.id)
  const hits = attempts.filter((attempt) => attempt.correct).length
  const seconds = attempts.length ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.responseMs, 0) / attempts.length / 1000) : 0

  function start(amount = count) {
    if (!terms || !playable) { setError('Ainda não há vocabulário com imagem ou emoji suficiente para jogar.'); return }
    setError(''); setQuestions(buildQuestions(terms, answers, amount)); setIndex(0); setSelected(null); setAttempts([]); setFinished(false); completed.current = false; startedAt.current = performance.now()
  }

  useEffect(() => {
    if (!sessionMode || !terms || autoStarted.current) return
    autoStarted.current = true
    if (playable) start(5)
    else void (onUnavailable ?? onExit)?.()
  }, [sessionMode, terms])

  function choose(termId: string) {
    if (!current || selected) return
    setSelected(termId)
    setAttempts((items) => [...items, { termId: current.term.id, correct: termId === current.term.id, responseMs: Math.round(performance.now() - startedAt.current) }])
  }

  // The button still skips the wait; whichever comes first advances, only once.
  useEffect(() => {
    if (!selected) return
    advanceTimer.current = window.setTimeout(next, correct ? advanceDelayMs.correct : advanceDelayMs.incorrect)
    return () => window.clearTimeout(advanceTimer.current)
  }, [selected, index])

  function next() {
    window.clearTimeout(advanceTimer.current)
    if (!current || !selected || completed.current) return
    if (index + 1 < questions.length) { setIndex((value) => value + 1); setSelected(null); startedAt.current = performance.now(); return }
    completed.current = true
    const result: ActivityResult = {
      requestId: activity?.id,
      moduleId: 'scene-certa',
      language: activity?.language ?? source.language,
      completedAt: Date.now(),
      assessments: attempts.map((attempt) => ({ contentId: attempt.termId, skill: 'recognition', correct: attempt.correct, score: attempt.correct ? 1 : 0, usedHint: false })),
    }
    if (activity || sessionMode) void onComplete?.(result)
    else void recordModuleActivity(result)
    if (!sessionMode) setFinished(true)
  }

  function speak() {
    if (current) source.speak?.(current.term)
  }

  if (current && !finished) return <main className="scene-certa-session picture-game" aria-label={`Jogo ${pictureGameName}`}>
    <header><div><span>{pictureGameName.toUpperCase()}</span><strong>{sessionMode ? 'Sessão de hoje' : activity?.objective ?? source.label}</strong></div><button type="button" className="secondary" onClick={() => { setQuestions([]); void onExit?.() }}>Sair</button></header>
    <section className="scene-certa-content">
      <p className="session-counter">{index + 1} de {questions.length} · {hits} {hits === 1 ? 'acerto' : 'acertos'}</p>
      <article className="scene-certa-prompt">
        {source.speak && <button type="button" className="scene-certa-audio" onClick={speak} aria-label="Ouvir pronúncia">◁</button>}
        <p lang={source.language}>{current.term.prompt}</p>
        <small>{current.term.reading}</small>
      </article>
      <div className="scene-certa-grid">
        {current.options.map((option) => <button
          type="button"
          key={option.id}
          aria-label={selected ? option.meaning : `Opção ${current.options.indexOf(option) + 1}`}
          className={`scene-certa-option ${selected ? option.id === current.term.id ? 'correct' : option.id === selected ? 'incorrect' : '' : ''}`}
          onClick={() => choose(option.id)}
          disabled={Boolean(selected)}
        >
          <Visual term={option} />
          {selected && <small>{option.meaning}</small>}
        </button>)}
      </div>
      {selected && <div className={correct ? 'scene-certa-feedback correct' : 'scene-certa-feedback incorrect'}>
        <span>{correct ? 'Correto.' : `Era: ${current.term.meaning}.`}</span>
        <button type="button" onClick={next}>{index + 1 === questions.length ? (sessionMode ? 'Continuar' : 'Ver resultado') : 'Próxima'}</button>
      </div>}
    </section>
  </main>

  if (finished) return <main className="scene-certa-session picture-game"><section className="scene-certa-content"><div className="scene-certa-complete">
    <p className="eyebrow">{pictureGameName.toUpperCase()}</p>
    <h1>{hits} de {questions.length}</h1>
    <p>{questions.length - hits} {questions.length - hits === 1 ? 'erro' : 'erros'} · {seconds}s por resposta, em média</p>
    <button type="button" onClick={() => start()}>Jogar novamente</button>
    {onExit && <button type="button" className="secondary" onClick={() => { setQuestions([]); setFinished(false); void onExit() }}>Voltar</button>}
  </div></section></main>

  if (sessionMode) return <main className="study-session session-game-session" aria-busy="true"><section className="study-session-content"><div className="session-game-loading" /></section></main>

  return <main className={embedded ? 'workspace-view' : 'app-shell'}><section className="welcome scene-certa-setup">
    <p className="eyebrow">JOGO</p>
    <h1>{pictureGameName}</h1>
    <p className="intro">{source.intro}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {terms && <p className="picture-game-pool">{terms.length} {terms.length === 1 ? 'palavra com imagem' : 'palavras com imagem'} disponíveis</p>}
    <label className="quiz-picker">Quantidade<select value={count} onChange={(event) => setCount(Number(event.target.value))}>{counts.map((value) => <option key={value} value={value}>{value} palavras</option>)}</select></label>
    <div className="picture-game-actions">
      <button type="button" onClick={() => start()} disabled={!playable}>Jogar</button>
      {onExit && <button type="button" className="secondary" onClick={() => void onExit()}>Voltar</button>}
    </div>
  </section></main>
}

export default SceneCertaModule
