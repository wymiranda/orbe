import { useEffect, useState } from 'react'
import '../../App.css'
import type { ActivityResult } from '../../learning-paths/types'

export type QuizImage = { src: string; alt: string }
export type QuizPrompt = { text?: string; image?: QuizImage; audio?: { src: string; label?: string } }
export type QuizOption = { id: string; text?: string; image?: QuizImage }
export type QuizPair = { id: string; text?: string; image?: QuizImage }
export type QuizQuestionType = 'true_false' | 'single_choice' | 'match' | 'fill_blank' | 'ordering' | 'written_answer'
type QuestionBase = { id: string; prompt: QuizPrompt; contentIds?: string[] }
export type QuizQuestion =
  | (QuestionBase & { type: 'true_false'; answer: boolean })
  | (QuestionBase & { type: 'single_choice' | 'fill_blank'; answer: string; choices: QuizOption[] })
  | (QuestionBase & { type: 'match'; answer: Record<string, string>; pairs: QuizPair[]; choices: QuizOption[] })
  | (QuestionBase & { type: 'ordering'; answer: string[]; tokens: Required<Pick<QuizOption, 'id' | 'text'>>[] })
  | (QuestionBase & { type: 'written_answer'; answer: string; placeholder?: string })
export type QuizSet = { id: string; label: string; description?: string }
export type QuizMode = { id: string; label: string; description: string }
export type QuizSessionContent = { id: string; title: string; description?: string; questions: QuizQuestion[] }
export type QuizSource = { id: string; title: string; description: string; modes?: QuizMode[]; loadSets: () => Promise<QuizSet[]>; createSession: (setId: string, count: number, modeId?: string) => Promise<QuizSessionContent>; onActivityResult?: (result: ActivityResult) => void; onComplete?: () => void | Promise<void> }

type Answer = boolean | string | string[] | Record<string, string> | null
type QuizSession = { content: QuizSessionContent; index: number; correct: number; answer: Answer; submitted: boolean }
type QuizResult = { sourceId: string; correct: number; total: number; completedAt: string }

const resultsStorageKey = 'niorb:quiz:results:v1'
const questionCounts = [5, 10, 20]

function loadResults(): QuizResult[] { try { return JSON.parse(localStorage.getItem(resultsStorageKey) ?? '[]') as QuizResult[] } catch { return [] } }
function saveResult(result: QuizResult) { localStorage.setItem(resultsStorageKey, JSON.stringify([...loadResults().filter((item) => item.sourceId !== result.sourceId).slice(-19), result])) }
function normalized(value: string) { return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase() }
function hasVisibleContent(content: Pick<QuizPrompt, 'text' | 'image'>) { return Boolean(content.text?.trim() || content.image?.src) }
function validateSession(content: QuizSessionContent) {
  if (!content.id || !content.title || !content.questions.length) return 'A sessão não possui identificação, título ou questões.'
  const ids = new Set<string>()
  for (const question of content.questions) {
    if (!question.id || ids.has(question.id)) return 'A sessão possui questões sem ID único.'
    ids.add(question.id)
    if (!hasVisibleContent(question.prompt) && !question.prompt.audio?.src) return `A questão "${question.id}" não possui prompt.`
    if (question.type === 'single_choice' || question.type === 'fill_blank') {
      if (question.choices.length < 2 || !question.choices.some((choice) => choice.id === question.answer) || question.choices.some((choice) => !hasVisibleContent(choice))) return `As alternativas da questão "${question.id}" são inválidas.`
    }
    if (question.type === 'match') {
      if (!question.pairs.length || !question.choices.length || question.pairs.some((pair) => !hasVisibleContent(pair)) || question.choices.some((choice) => !choice.text?.trim()) || question.pairs.some((pair) => question.answer[pair.id] === undefined || !question.choices.some((choice) => choice.id === question.answer[pair.id]))) return `A associação da questão "${question.id}" é inválida.`
    }
    if (question.type === 'ordering' && (!question.tokens.length || question.answer.length !== question.tokens.length || new Set(question.answer).size !== question.answer.length || question.answer.some((id) => !question.tokens.some((token) => token.id === id)))) return `A ordenação da questão "${question.id}" é inválida.`
    if (question.type === 'written_answer' && !question.answer.trim()) return `A resposta escrita da questão "${question.id}" está vazia.`
  }
  return ''
}
function answerIsCorrect(question: QuizQuestion, answer: Answer) {
  if (answer === null) return false
  if (typeof question.answer === 'string' && typeof answer === 'string') return normalized(question.answer) === normalized(answer)
  if (typeof question.answer === 'boolean' && typeof answer === 'boolean') return question.answer === answer
  if (Array.isArray(question.answer) && Array.isArray(answer)) return question.answer.length === answer.length && question.answer.every((item, index) => item === answer[index])
  if (!Array.isArray(question.answer) && typeof question.answer === 'object' && !Array.isArray(answer) && typeof answer === 'object') return Object.entries(question.answer).every(([key, value]) => answer[key] === value)
  return false
}

function questionInstruction(type: QuizQuestionType) {
  const instructions: Record<QuizQuestionType, string> = {
    true_false: 'Marque se a afirmação é verdadeira ou falsa.',
    single_choice: 'Selecione a alternativa correta.',
    match: 'Associe cada item à opção correspondente.',
    fill_blank: 'Selecione a opção que completa a frase.',
    ordering: 'Organize os itens na ordem correta.',
    written_answer: 'Digite sua resposta no campo abaixo.',
  }
  return instructions[type]
}

function Prompt({ prompt, compact = false }: { prompt: QuizPrompt; compact?: boolean }) {
  return <div className="quiz-prompt-content">{prompt.image && <img className="quiz-image" src={prompt.image.src} alt={prompt.image.alt} />}{prompt.audio && <audio controls preload="metadata" src={prompt.audio.src} aria-label={prompt.audio.label ?? 'Áudio da questão'} />}{prompt.text && <p className={compact ? 'quiz-prompt quiz-prompt-compact' : 'quiz-prompt'}>{prompt.text}</p>}</div>
}

function OptionContent({ option }: { option: QuizOption | QuizPair }) {
  return <>{option.image && <img className="quiz-option-image" src={option.image.src} alt={option.image.alt} />}{option.text && <span>{option.text}</span>}</>
}

function QuestionInput({ question, answer, onChange, disabled }: { question: QuizQuestion; answer: Answer; onChange: (answer: Answer) => void; disabled: boolean }) {
  if (question.type === 'true_false') return <div className="quiz-choices quiz-binary"><button type="button" className={answer === true ? '' : 'secondary'} disabled={disabled} onClick={() => onChange(true)}>Verdadeiro</button><button type="button" className={answer === false ? '' : 'secondary'} disabled={disabled} onClick={() => onChange(false)}>Falso</button></div>
  if (question.type === 'single_choice' || question.type === 'fill_blank') return <div className="quiz-choices">{question.choices.map((choice) => <button type="button" key={choice.id} className={answer === choice.id ? '' : 'secondary'} disabled={disabled} onClick={() => onChange(choice.id)}><OptionContent option={choice} /></button>)}</div>
  if (question.type === 'match') {
    const matches = typeof answer === 'object' && answer !== null && !Array.isArray(answer) ? answer : {}
    return <div className="quiz-match">{question.pairs.map((pair) => <label key={pair.id}><span className="quiz-match-pair"><OptionContent option={pair} /></span><select value={matches[pair.id] ?? ''} disabled={disabled} onChange={(event) => onChange({ ...matches, [pair.id]: event.target.value })}><option value="">Escolha…</option>{question.choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.text}</option>)}</select></label>)}</div>
  }
  if (question.type === 'ordering') {
    const ordered = Array.isArray(answer) ? answer : []
    const available = question.tokens.filter((token) => !ordered.includes(token.id))
    return <div className="quiz-ordering"><div className="quiz-order-answer">{ordered.length ? ordered.map((id) => { const token = question.tokens.find((item) => item.id === id); return <button type="button" key={id} disabled={disabled} onClick={() => onChange(ordered.filter((item) => item !== id))}>{token?.text}</button> }) : <span>Monte a resposta abaixo.</span>}</div><div className="quiz-choices">{available.map((token) => <button type="button" key={token.id} className="secondary" disabled={disabled} onClick={() => onChange([...ordered, token.id])}>{token.text}</button>)}</div></div>
  }
  if (question.type === 'written_answer') return <label className="quiz-written"><span>Resposta</span><input value={typeof answer === 'string' ? answer : ''} placeholder={question.placeholder ?? 'Digite sua resposta'} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>
  return null
}

function QuizModule({ source, embedded = false }: { source: QuizSource; embedded?: boolean }) {
  const [sets, setSets] = useState<QuizSet[]>([])
  const [setId, setSetId] = useState('')
  const modes = source.modes ?? []
  const [modeId, setModeId] = useState('')
  const [count, setCount] = useState(10)
  const [session, setSession] = useState<QuizSession | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void source.loadSets().then((nextSets) => { if (active) { setSets(nextSets); setSetId((current) => nextSets.some((item) => item.id === current) ? current : nextSets[0]?.id ?? '') } }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível preparar o quiz.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [source])

  async function begin() {
    if (!setId || (modes.length > 0 && !modeId)) return
    setError(''); setLoading(true)
    try {
      const content = await source.createSession(setId, count, modeId)
      const validationError = validateSession(content)
      if (validationError) throw new Error(validationError)
      setSession({ content, index: 0, correct: 0, answer: null, submitted: false })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível iniciar o quiz.') } finally { setLoading(false) }
  }
  function submit() {
    if (!session || session.answer === null) return
    const question = session.content.questions[session.index]
    const correct = answerIsCorrect(question, session.answer)
    if (question.contentIds?.length) source.onActivityResult?.({ moduleId: 'quiz', language: source.id.startsWith('chinese-') ? 'zh-Hans' : 'und', completedAt: Date.now(), assessments: question.contentIds.map((contentId) => ({ contentId, skill: question.type === 'ordering' || question.type === 'written_answer' ? 'production' : 'recognition', correct })) })
    setSession({ ...session, correct: session.correct + Number(correct), submitted: true })
  }
  function advance() {
    if (!session || !session.submitted) return
    if (session.index + 1 < session.content.questions.length) { setSession({ ...session, index: session.index + 1, answer: null, submitted: false }); return }
    saveResult({ sourceId: source.id, correct: session.correct, total: session.content.questions.length, completedAt: new Date().toISOString() })
    setSession({ ...session, index: session.content.questions.length, answer: null, submitted: false })
    void source.onComplete?.()
  }

  if (session) {
    const complete = session.index >= session.content.questions.length
    const question = session.content.questions[session.index]
    const correct = !complete && answerIsCorrect(question, session.answer)
    return <main className="quiz-session" aria-label="Sessão de quiz"><header><div><span>QUIZ</span><strong>{session.content.title}</strong></div><button type="button" className="secondary" onClick={() => setSession(null)}>Encerrar</button></header><section className="quiz-session-content">{complete ? <div className="quiz-complete"><p className="eyebrow">SESSÃO CONCLUÍDA</p><h1>{session.correct} de {session.content.questions.length}</h1><p>{session.correct === session.content.questions.length ? 'Perfeito.' : 'Resultado salvo neste dispositivo.'}</p><button type="button" onClick={() => setSession(null)}>Voltar ao quiz</button></div> : <article className="quiz-card"><p className="session-counter">Questão {session.index + 1} de {session.content.questions.length}</p><p className="quiz-instruction">{questionInstruction(question.type)}</p><Prompt prompt={question.prompt} compact={question.type === 'fill_blank'} /><QuestionInput question={question} answer={session.answer} onChange={(answer) => setSession({ ...session, answer })} disabled={session.submitted} />{session.submitted ? <><p className={correct ? 'quiz-feedback correct' : 'quiz-feedback incorrect'}>{correct ? 'Correto.' : 'Resposta incorreta.'}</p><button type="button" className="quiz-next" onClick={advance}>{session.index + 1 === session.content.questions.length ? 'Ver resultado' : 'Próxima questão'}</button></> : <button type="button" className="quiz-next" disabled={session.answer === null} onClick={submit}>Confirmar resposta</button>}</article>}</section></main>
  }
  const hasSelectedMode = modes.length === 0 || Boolean(modeId)
  return <main className={embedded ? 'workspace-view' : 'app-shell'}>{!embedded && <header className="app-header"><a className="brand" href="/">orb<span>e</span></a></header>}<section className="welcome quiz-setup"><p className="eyebrow">QUIZ</p><h1>{source.title}</h1><p className="intro">{source.description}</p>{error && <p className="error" role="alert">{error}</p>}{modes.length > 0 && <fieldset className="quiz-mode-group"><legend>Escolha o tipo de prática</legend><div className="quiz-mode" role="group" aria-label="Tipo de prática">{modes.map((mode) => <button type="button" key={mode.id} className={mode.id === modeId ? 'active' : 'secondary'} onClick={() => setModeId(mode.id)}><strong>{mode.label}</strong><span>{mode.description}</span></button>)}</div></fieldset>}{hasSelectedMode && <><div className="quiz-settings"><label className="quiz-picker">Nível HSK<select value={setId} disabled={loading || !sets.length} onChange={(event) => setSetId(event.target.value)}>{sets.map((item) => <option key={item.id} value={item.id}>{item.label}{item.description ? ` · ${item.description}` : ''}</option>)}</select></label><label className="quiz-picker">Quantidade de questões<select value={count} disabled={loading} onChange={(event) => setCount(Number(event.target.value))}>{questionCounts.map((item) => <option key={item} value={item}>{item} questões</option>)}</select></label></div><button type="button" onClick={() => void begin()} disabled={loading || !setId}>{loading ? 'Preparando…' : 'Iniciar quiz'}</button></>}</section></main>
}

export default QuizModule
