import { useEffect, useRef, useState } from 'react'
import { Mic, Play, Square } from 'lucide-react'
import '../../App.css'
import { recordModuleActivity } from '../../learning-paths/module-bridge'
import type { ActivityResult } from '../../learning-paths/types'
import { bestComparison, pickSpeakingItems, speakingScore, type SpeakingComparison, type SpeakingItem, type SpeakingSegmentation } from './speak-aloud'
import { recognitionErrors } from './messages'
import type { SpeechRecognitionEngine } from './speech-engine'
import { useSpeechRecognition } from './useSpeechRecognition'

/*
 * Solte a Voz: read a word or a sentence aloud and see what was recognized.
 * It trains oral production; the module knows nothing about a specific
 * language: an experience hands it a SpeakingSource with items, the language
 * of the recognizer and, optionally, a voice to hear the model.
 */

export const speakingGameName = 'Solte a Voz'
export type { SpeakingItem } from './speak-aloud'

/**
 * A choice of the setup screen; shown only while another choice has the given value, when set.
 * An option with `visibleWhen` is offered only while another choice has one of the given values.
 */
export type SpeakingFilter = { id: string; label: string; options: { value: string; label: string; visibleWhen?: { id: string; values: string[] } }[]; initial: string; visibleWhen?: { id: string; value: string } }

function visibleOptions(filter: SpeakingFilter, selection: Record<string, string>) { return filter.options.filter((option) => !option.visibleWhen || option.visibleWhen.values.includes(selection[option.visibleWhen.id])) }
/** A choice whose option is no longer offered falls back to the last one offered (Brutal → Difícil). */
function offeredSelection(filters: SpeakingFilter[], selection: Record<string, string>) {
  return Object.fromEntries(filters.map((filter) => { const options = visibleOptions(filter, selection); const value = selection[filter.id] ?? filter.initial; return [filter.id, options.some((option) => option.value === value) ? value : options.at(-1)?.value ?? value] }))
}

export type SpeakingSource = {
  /** BCP-47 language of the items, reported with the activity result. */
  language: string
  /** Language given to the recognizer (zh-CN, en-US…): the studied language, never the interface one. */
  recognitionLanguage: string
  segmentation: SpeakingSegmentation
  /** Shown in the game header. */
  label: string
  /** Setup screen description. */
  intro: string
  filters?: SpeakingFilter[]
  loadItems: (selection: Record<string, string>) => Promise<SpeakingItem[]>
  speak?: (text: string) => void
}

type ItemResult = { item: SpeakingItem; attempts: number; correct: boolean; responseMs: number | null }

const counts = [5, 10]

function SpeakAloudModule({ source, engine, embedded = false, onExit }: {
  source: SpeakingSource
  /** Replaces the browser recognizer (tests, an on-device engine…). */
  engine?: SpeechRecognitionEngine
  embedded?: boolean
  onExit?: () => void | Promise<void>
}) {
  const recognition = useSpeechRecognition({ language: source.recognitionLanguage, engine, onResult: compare })
  const [selection, setSelection] = useState<Record<string, string>>(() => offeredSelection(source.filters ?? [], Object.fromEntries((source.filters ?? []).map((filter) => [filter.id, filter.initial]))))
  const [items, setItems] = useState<SpeakingItem[] | null>(null)
  const [count, setCount] = useState(5)
  const [rounds, setRounds] = useState<SpeakingItem[]>([])
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<ItemResult[]>([])
  const [comparison, setComparison] = useState<SpeakingComparison | null>(null)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState('')
  const shownAt = useRef(0)

  useEffect(() => {
    let active = true
    void source.loadItems(selection)
      .then((loaded) => { if (active) setItems(loaded) })
      .catch((cause: unknown) => { if (active) { setItems([]); setError(cause instanceof Error ? cause.message : 'Não foi possível preparar o jogo.') } })
    return () => { active = false }
  }, [source, selection])

  const current = rounds[index]
  const playable = Boolean(items?.length && recognition.supported)
  const hits = results.filter((item) => item.correct).length

  // Each transcript is compared once, as soon as it arrives; every transcript is one attempt.
  function compare(alternatives: string[]) {
    if (!current) return
    const compared = bestComparison(current.text, alternatives, source.segmentation)
    if (!compared) return
    setComparison(compared)
    setResults((all) => all.map((entry, position) => position !== index ? entry : { ...entry, attempts: entry.attempts + 1, correct: entry.correct || compared.correct, responseMs: entry.responseMs ?? Math.round(performance.now() - shownAt.current) }))
  }

  function start(amount = count) {
    if (!items?.length) { setError('Ainda não há frases suficientes para jogar.'); return }
    const picked = pickSpeakingItems(items, amount)
    recognition.reset()
    setError(''); setRounds(picked); setResults(picked.map((item) => ({ item, attempts: 0, correct: false, responseMs: null }))); setIndex(0); setComparison(null); setFinished(false); shownAt.current = performance.now()
  }

  function retry() { setComparison(null); recognition.reset() }

  function next() {
    recognition.reset(); setComparison(null)
    if (index + 1 < rounds.length) { setIndex((value) => value + 1); shownAt.current = performance.now(); return }
    // An item never attempted does not count: only what was actually said is evidence.
    const spoken = results.filter((entry) => entry.attempts > 0)
    const activity: ActivityResult = {
      moduleId: 'speak-aloud',
      language: source.language,
      completedAt: Date.now(),
      assessments: spoken.flatMap((entry) => entry.item.contentIds.map((contentId) => ({ contentId, skill: 'production' as const, correct: entry.correct, score: speakingScore(entry.correct, entry.attempts), usedHint: false }))),
    }
    if (activity.assessments.length) void recordModuleActivity(activity)
    setFinished(true)
  }

  function leave() { recognition.reset(); setRounds([]); setFinished(false); void onExit?.() }

  if (current && !finished) {
    const listening = recognition.status === 'listening'
    const busy = listening || recognition.status === 'processing'
    const status = listening ? 'Ouvindo…' : recognition.status === 'processing' ? 'Reconhecendo…' : recognition.status === 'error' && recognition.error ? recognitionErrors[recognition.error] : !comparison ? 'Toque no microfone e fale.' : ''
    return <main className="scene-certa-session speak-aloud" aria-label={`Jogo ${speakingGameName}`}>
      <header><div><span>{speakingGameName.toUpperCase()}</span><strong>{source.label}</strong></div><button type="button" className="secondary" onClick={leave}>Sair</button></header>
      <section className="scene-certa-content">
        <p className="session-counter">{index + 1} de {rounds.length} · {hits} {hits === 1 ? 'acerto' : 'acertos'}</p>
        <article className="scene-certa-prompt speak-aloud-prompt">
          {source.speak && <button type="button" className="scene-certa-audio" onClick={() => source.speak?.(current.text)} aria-label="Ouvir pronúncia"><Play aria-hidden="true" size={20} strokeWidth={2} fill="currentColor" /></button>}
          <p lang={source.language}>{comparison
            ? comparison.expected.map((unit, position) => <span key={position} className={unit.matched ? 'speak-aloud-hit' : 'speak-aloud-miss'}>{unit.text}{source.segmentation === 'words' ? ' ' : ''}</span>)
            : current.text}</p>
          {current.reading && <small>{current.reading}</small>}
          {comparison && current.meaning && <small>{current.meaning}</small>}
        </article>
        <div className="speak-aloud-mic">
          <button type="button" className={listening ? 'speak-aloud-mic-button listening' : 'speak-aloud-mic-button'} aria-label={listening ? 'Parar' : 'Falar'} aria-pressed={listening} disabled={!recognition.supported || recognition.status === 'processing' || Boolean(comparison)} onClick={() => listening ? recognition.stop() : recognition.start()}>
            {listening ? <Square aria-hidden="true" size={28} fill="currentColor" /> : <Mic aria-hidden="true" size={34} strokeWidth={2} />}
          </button>
          {status && <p className={recognition.status === 'error' ? 'speak-aloud-status error' : 'speak-aloud-status'} role={recognition.status === 'error' ? 'alert' : 'status'}>{status}</p>}
          {busy && recognition.interim && <p className="speak-aloud-interim" lang={source.language}>{recognition.interim}</p>}
        </div>
        {comparison && <div className="speak-aloud-recognized">
          <span>Reconhecido:</span>
          <p lang={source.language}>{comparison.recognized.length ? comparison.recognized.map((unit, position) => <span key={position} className={unit.matched ? 'speak-aloud-hit' : 'speak-aloud-extra'}>{unit.text}{source.segmentation === 'words' ? ' ' : ''}</span>) : comparison.transcript}</p>
        </div>}
        {comparison && <div className={comparison.correct ? 'scene-certa-feedback correct' : 'scene-certa-feedback incorrect'}>
          <span>{comparison.correct ? 'Correto.' : 'Não reconhecemos tudo. Tente de novo.'}</span>
          <div className="speak-aloud-actions">
            {!comparison.correct && <button type="button" className="secondary" onClick={retry}>Tentar de novo</button>}
            <button type="button" onClick={next}>{index + 1 === rounds.length ? 'Ver resultado' : 'Próxima'}</button>
          </div>
        </div>}
        {!comparison && recognition.status === 'error' && <div className="speak-aloud-actions skip"><button type="button" className="secondary" onClick={next}>{index + 1 === rounds.length ? 'Ver resultado' : 'Próxima'}</button></div>}
      </section>
    </main>
  }

  if (finished) {
    const attempts = results.reduce((sum, entry) => sum + entry.attempts, 0)
    const timed = results.filter((entry) => entry.responseMs !== null)
    const seconds = timed.length ? Math.round(timed.reduce((sum, entry) => sum + entry.responseMs!, 0) / timed.length / 1000) : 0
    return <main className="scene-certa-session speak-aloud"><section className="scene-certa-content"><div className="scene-certa-complete">
      <p className="eyebrow">{speakingGameName.toUpperCase()}</p>
      <h1>{hits} de {rounds.length}</h1>
      <p>{rounds.length - hits} {rounds.length - hits === 1 ? 'erro' : 'erros'} · {seconds}s por resposta, em média · {attempts} {attempts === 1 ? 'tentativa' : 'tentativas'}</p>
      <button type="button" onClick={() => start()}>Jogar novamente</button>
      {onExit && <button type="button" className="secondary" onClick={leave}>Voltar</button>}
    </div></section></main>
  }

  const message = error || (!recognition.supported ? recognitionErrors.unsupported : '')
  const visible = (filter: SpeakingFilter) => !filter.visibleWhen || selection[filter.visibleWhen.id] === filter.visibleWhen.value
  return <main className={embedded ? 'workspace-view' : 'app-shell'}><section className="welcome scene-certa-setup">
    <p className="eyebrow">JOGO</p>
    <h1>{speakingGameName}</h1>
    <p className="intro">{source.intro}</p>
    {message && <p className="error" role="alert">{message}</p>}
    {source.filters?.filter(visible).map((filter) => <label key={filter.id} className="quiz-picker">{filter.label}<select value={selection[filter.id] ?? filter.initial} onChange={(event) => { setError(''); setSelection((currentSelection) => offeredSelection(source.filters ?? [], { ...currentSelection, [filter.id]: event.target.value })) }}>{visibleOptions(filter, selection).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
    <label className="quiz-picker">Quantidade<select value={count} onChange={(event) => setCount(Number(event.target.value))}>{counts.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    <p className="speak-aloud-note">O jogo compara o texto reconhecido pelo navegador com a resposta. Ele não avalia sua pronúncia nem os tons.</p>
    <p className="speak-aloud-note">Dependendo do navegador, o áudio pode ser processado por um serviço externo. O Niorb não grava nem envia seu áudio.</p>
    <div className="picture-game-actions">
      <button type="button" onClick={() => start()} disabled={!playable}>Jogar</button>
      {onExit && <button type="button" className="secondary" onClick={() => void onExit()}>Voltar</button>}
    </div>
  </section></main>
}

export default SpeakAloudModule
