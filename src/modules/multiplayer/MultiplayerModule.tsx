import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import '../../App.css'
import { recordModuleActivity } from '../../learning-paths/module-bridge'

type OnlineUser = { id: string; email: string }
type Invite = { code: string; from: string }
type Player = { id: string; email: string; score: number; online: boolean; answered: boolean }
export type VocabularyHint = { hanzi: string; pinyin: string; portuguese: string; hsk_level?: string }
type Sentence = { mode: 'free' | 'mission'; round: number; total: number; mission?: string; form: string | null; opportunity: string | null; tokens: string[]; passCount: number; options: string[]; punctuationOptions: string[]; characterLimit: number; turnId: string | null; phase: 'intro' | 'building' | 'reviewing'; introEndsAt: number | null; turnEndsAt: number | null; teamScore: number; result: 'valid' | 'invalid' | 'unknown' | null; lastPoints: number; scoreBreakdown: { speed: number; length: number; difficulty: number; expansion: number; opportunity: number } | null; review: { grammatical: boolean; natural: boolean; coherent: boolean; meetsMission: boolean | null; translationPt: string | null; reasonPt: string; suggestion: string | null } | null; reviewUnavailable: 'daily-limit' | 'unavailable' | null }
type Room = { code: string; title: string; game: 'flash' | 'sentence'; status: 'lobby' | 'playing' | 'finished'; index: number; total: number; roundEndsAt: number | null; prompt: { id: string; text: string; choices: { id: string; text: string }[] } | null; sentence: Sentence | null; players: Player[] }
type Lobby = { users: OnlineUser[]; invite: (code: string, userId: string) => Promise<void> }

const LobbyContext = createContext<Lobby>({ users: [], invite: async () => {} })
const socketUrl = (path: string) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`
const inviteMuteKey = 'niorb:multiplayer:invite-mute:v1'
function invitesMuted() { const value = localStorage.getItem(inviteMuteKey); if (value === 'always') return true; if (value && value > new Date().toISOString()) return true; localStorage.removeItem(inviteMuteKey); return false }

export function MultiplayerPresence({ children, onAcceptInvite }: { children: ReactNode; onAcceptInvite: (code: string) => void }) {
  const [users, setUsers] = useState<OnlineUser[]>([])
  const [invite, setInvite] = useState<Invite | null>(null)
  const [silenceOpen, setSilenceOpen] = useState(false)
  useEffect(() => {
    let retry: number | undefined
    let closed = false
    const connect = () => {
      const socket = new WebSocket(socketUrl('/api/multiplayer/lobby'))
      socket.onmessage = (event) => { const payload = JSON.parse(event.data) as { type: string; users?: OnlineUser[]; code?: string; from?: string }; if (payload.type === 'online') setUsers(payload.users ?? []); if (payload.type === 'invite' && payload.code && payload.from && !invitesMuted()) setInvite({ code: payload.code, from: payload.from }) }
      socket.onclose = () => { if (!closed) retry = window.setTimeout(connect, 3000) }
    }
    connect()
    return () => { closed = true; if (retry) window.clearTimeout(retry) }
  }, [])
  const value = useMemo<Lobby>(() => ({ users, invite: async (code, userId) => { const response = await fetch(`/api/multiplayer/rooms/${code}/invite`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) }); if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? 'Não foi possível enviar o convite.') } }), [users])
  function silence(mute: 'day' | 'week' | 'always') { localStorage.setItem(inviteMuteKey, mute === 'always' ? mute : new Date(Date.now() + (mute === 'day' ? 86_400_000 : 604_800_000)).toISOString()); setInvite(null); setSilenceOpen(false) }
  return <LobbyContext.Provider value={value}>{children}{invite && <aside className="game-invite" role="alert"><p>CONVITE PARA JOGAR</p><strong>{invite.from} convidou você para uma sala.</strong><div className="game-invite-actions"><button type="button" className="secondary" onClick={() => setInvite(null)}>Agora não</button><div className="invite-silence"><button type="button" className="secondary" aria-expanded={silenceOpen} onClick={() => setSilenceOpen((open) => !open)}>Silenciar ▾</button>{silenceOpen && <div className="invite-silence-menu"><button type="button" onClick={() => silence('day')}>24 h</button><button type="button" onClick={() => silence('week')}>7 dias</button><button type="button" onClick={() => silence('always')}>Sempre</button></div>}</div><button type="button" className="invite-enter" onClick={() => { onAcceptInvite(invite.code); setInvite(null) }}>Entrar</button></div></aside>}</LobbyContext.Provider>
}

function useLobby() { return useContext(LobbyContext) }

function MultiplayerModule({ vocabulary = {}, initialRoomCode = '', userId: initialUserId = '', isAdmin: initialIsAdmin = false, sessionRoundIds, sessionDifficulty, sessionLevel, sessionKnownWords, onSessionComplete, startSentenceSetup = false, embeddedSession = false }: { /** Word hints shown on the cards, supplied by the experience. */ vocabulary?: Record<string, VocabularyHint>; initialRoomCode?: string; userId?: string; isAdmin?: boolean; sessionRoundIds?: string[]; /** Difficulty and HSK level of the learner's daily session (word choices per turn). */ sessionDifficulty?: 'easy' | 'medium' | 'hard' | 'brutal'; sessionLevel?: string; /** Session: the words the learner has learned; the hand holds no other word. */ sessionKnownWords?: string[]; onSessionComplete?: () => void; startSentenceSetup?: boolean; embeddedSession?: boolean }) {
  const lobby = useLobby()
  const [level, setLevel] = useState('1')
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy')
  const [room, setRoom] = useState<Room | null>(null)
  const [roomCode, setRoomCode] = useState(initialRoomCode)
  const [showSentenceSetup, setShowSentenceSetup] = useState(Boolean(initialRoomCode) || startSentenceSetup)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState('')
  const [now, setNow] = useState(0)
  const [pendingChoice, setPendingChoice] = useState<string | null>(null)
  const [sentenceImageUrl, setSentenceImageUrl] = useState<string | null>(null)
  const [sentenceImageFailed, setSentenceImageFailed] = useState(false)
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false)
  const [imageDraft, setImageDraft] = useState('')
  const [imageSaving, setImageSaving] = useState(false)
  const [imageError, setImageError] = useState('')
  const socket = useRef<WebSocket | null>(null)
  const sessionFinished = useRef(false)
  const sessionStarted = useRef(false)
  // Rounds whose verdict was already recorded, so each sentence counts once.
  const recordedRounds = useRef(new Set<string>())
  const sessionRoomCreated = useRef(false)

  useEffect(() => { void fetch('/api/multiplayer/catalog/sentence-image').then(async (response) => response.ok ? response.json() as Promise<{ imageUrl?: string | null }> : { imageUrl: null }).then(({ imageUrl }) => { setSentenceImageUrl(imageUrl ?? null); setSentenceImageFailed(false) }).catch(() => setSentenceImageUrl(null)) }, [])
  useEffect(() => { if (!room || room.status !== 'playing') return; setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer) }, [room?.code, room?.status])
  // A sentence built together counts for the "Falar" column: each of its words is a production
  // attempt, right when the sentence is approved. A verdict that could not be reached does not count.
  useEffect(() => {
    const sentence = room?.sentence
    if (!room || !sentence || (sentence.result !== 'valid' && sentence.result !== 'invalid')) return
    const key = `${room.code}:${sentence.round}`
    if (recordedRounds.current.has(key)) return
    recordedRounds.current.add(key)
    const words = [...new Set(sentence.tokens.filter((token) => !/^[。？！，、]$/.test(token)))]
    if (words.length) void recordModuleActivity({ moduleId: 'multiplayer', language: 'zh-Hans', completedAt: Date.now(), assessments: words.map((contentId) => ({ contentId, skill: 'production' as const, correct: sentence.result === 'valid', usedHint: false })) })
  }, [room])
  useEffect(() => {
    if (!room?.code) return
    const live = new WebSocket(socketUrl(`/api/multiplayer/rooms/${room.code}/live`))
    live.onmessage = (event) => { const payload = JSON.parse(event.data) as { type: string; room?: Room; correct?: boolean; points?: number; reason?: string }; if (payload.type === 'room' && payload.room) { setPendingChoice(null); setRoom((current) => { if (current?.index !== payload.room?.index) { setAnswer(''); setFeedback('') } return payload.room ?? current }); if (sessionRoundIds?.length && embeddedSession && payload.room.status === 'lobby' && payload.room.players.length === 1 && !sessionStarted.current) { sessionStarted.current = true; live.send(JSON.stringify({ type: 'start' })) } if (sessionRoundIds?.length && !embeddedSession && payload.room.status === 'lobby' && payload.room.players.length === 1) live.send(JSON.stringify({ type: 'add-bot' })); if (sessionRoundIds?.length && !embeddedSession && payload.room.status === 'lobby' && payload.room.players.length >= 2 && !sessionStarted.current) { sessionStarted.current = true; live.send(JSON.stringify({ type: 'start' })) } if (sessionRoundIds?.length && payload.room.status === 'finished' && !sessionFinished.current) { sessionFinished.current = true; onSessionComplete?.() } }; if (payload.type === 'answer-result') setFeedback(payload.correct ? `Correto: +${payload.points} pontos.` : 'Não foi dessa vez: 0 ponto nesta rodada.'); if (payload.type === 'room-closed') { setRoom(null); setError(payload.reason ?? 'A sala foi fechada.') } }
    live.onclose = () => { if (socket.current === live) socket.current = null }
    socket.current = live
    return () => { live.close(); if (socket.current === live) socket.current = null }
  }, [room?.code])

  async function createRoom() {
    setError(''); setLoading(true)
    try { const response = await fetch('/api/multiplayer/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level: sessionLevel ?? level, game: 'sentence', difficulty: sessionDifficulty ?? difficulty, roundIds: sessionRoundIds, soloSession: embeddedSession, knownWords: sessionKnownWords }) }); const payload = await response.json() as { room?: Room; error?: string }; if (!response.ok || !payload.room) throw new Error(payload.error ?? 'Não foi possível criar a sala.'); setRoom(payload.room); setRoomCode(payload.room.code) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível criar a sala.') } finally { setLoading(false) }
  }
  useEffect(() => { if (!sessionRoundIds?.length || room || loading || sessionRoomCreated.current) return; sessionRoomCreated.current = true; void createRoom() }, [loading, room, sessionRoundIds])
  async function joinRoom() {
    const code = roomCode.trim().toUpperCase(); if (!/^[A-Z]{5}$/.test(code)) { setError('Digite o código de 5 letras da sala.'); return }
    setError(''); setLoading(true)
    try { const response = await fetch(`/api/multiplayer/rooms/${code}/join`, { method: 'POST' }); const payload = await response.json() as { room?: Room; error?: string }; if (!response.ok || !payload.room) throw new Error(payload.error ?? 'Não foi possível entrar na sala.'); setRoom(payload.room); setRoomCode(code) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível entrar na sala.') } finally { setLoading(false) }
  }
  const send = (message: object) => { if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message)) }
  async function leaveRoom(code: string) { socket.current?.close(); await fetch(`/api/multiplayer/rooms/${code}/leave`, { method: 'POST' }); setRoom(null); setRoomCode(''); setAnswer(''); setFeedback('') }
  function openImageEditor() { setImageDraft(sentenceImageUrl ?? ''); setImageError(''); setIsImageEditorOpen(true) }
  async function saveSentenceImage() {
    setImageError('')
    const imageUrl = imageDraft.trim()
    if (imageUrl) {
      try {
        // A path of this site ("/images/...") works from any address the app is opened at.
        const sitePath = imageUrl.startsWith('/') && !imageUrl.startsWith('//')
        const parsed = new URL(imageUrl, window.location.origin)
        if (!sitePath && parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error()
        if (!sitePath && !/^https?:/i.test(imageUrl)) throw new Error()
      } catch { setImageError('Use um link de imagem válido do ImgBB.'); return }
    }
    setImageSaving(true)
    try {
      const response = await fetch('/api/multiplayer/catalog/sentence-image', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageUrl }) })
      const payload = await response.json() as { imageUrl?: string | null; error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível salvar a imagem.')
      setSentenceImageUrl(payload.imageUrl ?? null); setSentenceImageFailed(false); setIsImageEditorOpen(false)
    } catch (cause) { setImageError(cause instanceof Error ? cause.message : 'Não foi possível salvar a imagem.') } finally { setImageSaving(false) }
  }

  if (!room && embeddedSession) return <main className="study-session session-game-session" aria-busy="true"><section className="study-session-content"><div className="session-game-loading" /></section></main>

  if (!room && !showSentenceSetup) return <main className="workspace-view"><section className="welcome multiplayer-catalog"><div className="game-catalog"><article className="game-catalog-entry"><button type="button" className="game-catalog-card" onClick={() => setShowSentenceSetup(true)}>{sentenceImageUrl && !sentenceImageFailed ? <img className="game-catalog-image game-catalog-image-upload" src={sentenceImageUrl} alt="Construam uma frase juntos" onError={() => setSentenceImageFailed(true)} /> : <span className="game-catalog-image" aria-hidden="true">造句</span>}<strong>Construam uma frase juntos</strong></button>{initialIsAdmin && <button type="button" className="secondary game-catalog-image-editor" onClick={openImageEditor}>Alterar imagem</button>}</article></div>{isImageEditorOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsImageEditorOpen(false)}><section className="new-reading module-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="game-image-editor-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><h2 id="game-image-editor-title">Imagem do jogo</h2><button type="button" className="modal-close" aria-label="Fechar" onClick={() => setIsImageEditorOpen(false)}>×</button></div><label>Link direto do ImgBB<input type="url" value={imageDraft} placeholder="https://i.ibb.co/.../imagem.jpg" onChange={(event) => setImageDraft(event.target.value)} /></label><p className="form-note">Se apagar o link, o desenho vermelho com 造句 volta a ser usado.</p>{imageError && <p className="error" role="alert">{imageError}</p>}<div className="form-actions"><button type="button" className="secondary" onClick={() => setIsImageEditorOpen(false)}>Cancelar</button><button type="button" disabled={imageSaving} onClick={() => void saveSentenceImage()}>{imageSaving ? 'Salvando…' : 'Salvar imagem'}</button></div></section></div>}</section></main>

  if (!room) return <main className="workspace-view"><section className="welcome multiplayer-setup"><button type="button" className="back" onClick={() => { setShowSentenceSetup(false); setError('') }}>← Jogos</button><h1>Construam uma frase juntos.</h1>{error && <p className="error" role="alert">{error}</p>}<div className="multiplayer-actions"><section><h2>Abra uma sala cooperativa</h2><label>Nível HSK<select value={level} onChange={(event) => setLevel(event.target.value)}>{['1', '2'].map((item) => <option key={item} value={item}>HSK {item}</option>)}</select></label><label>Dificuldade<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}><option value="easy">Fácil</option><option value="medium">Médio</option><option value="hard">Difícil</option></select></label><button type="button" disabled={loading || !level} onClick={() => void createRoom()}>{loading ? 'Criando…' : 'Criar sala'}</button></section><section><h2>Entre com um código</h2><label>Código da sala<input value={roomCode} maxLength={5} placeholder="ABCDE" onChange={(event) => setRoomCode(event.target.value.toUpperCase())} /></label><button type="button" className="secondary" disabled={loading} onClick={() => void joinRoom()}>Entrar na sala</button></section></div></section></main>

  // A session room starts by itself: its lobby is never shown in between.
  if (embeddedSession && room.status === 'lobby' && !error) return <main className="study-session session-game-session" aria-busy="true"><section className="study-session-content"><div className="session-game-loading" /></section></main>
  if (room.game === 'sentence' && room.sentence) return <SentenceRoom room={room} userId={initialUserId} isAdmin={initialIsAdmin} vocabulary={vocabulary} now={now} error={error} pendingChoice={pendingChoice} embeddedSession={embeddedSession} onStart={() => send({ type: 'start' })} onAddBot={() => send({ type: 'add-bot' })} onChoice={(choice) => { setPendingChoice(choice); send({ type: 'sentence-choice', choice }) }} onPass={() => { setPendingChoice('…'); send({ type: 'sentence-pass' }) }} onNext={() => send({ type: 'sentence-next' })} onLeave={() => void leaveRoom(room.code)} />

  const onlineOthers = lobby.users.filter((user) => !room.players.some((player) => player.id === user.id))
  const secondsLeft = room.roundEndsAt ? Math.max(0, Math.ceil((room.roundEndsAt - now) / 1_000)) : 0
  return <main className="workspace-view"><section className="welcome multiplayer-room"><div className="room-heading"><div><p className="eyebrow">SALA {room.code}</p><h1>{room.title}</h1></div><div><span>{room.players.filter((player) => player.online).length} online</span><button type="button" className="secondary room-leave" onClick={() => void leaveRoom(room.code)}>Sair</button></div></div>{error && <p className="error">{error}</p>}<div className="game-layout"><aside className="game-sidebar"><h2>Ranking</h2><ol>{[...room.players].sort((a, b) => b.score - a.score).map((player, index) => <li key={player.id}><span>{index + 1}. {player.email}{player.online ? ' · online' : ''}</span><strong>{player.score}</strong></li>)}</ol>{room.status === 'lobby' && <><h2>Convidar quem está online</h2>{onlineOthers.length ? <ul className="online-invitees">{onlineOthers.map((user) => <li key={user.id}><span>{user.email}</span><button type="button" className="secondary" onClick={() => void lobby.invite(room.code, user.id).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o convite.'))}>Convidar</button></li>)}</ul> : <p className="empty">Ninguém mais está online agora.</p>}</>}</aside><section className="game-stage">{room.status === 'lobby' && <><p className="eyebrow">À ESPERA</p><h2>Convide alguém ou compartilhe o código <strong>{room.code}</strong>.</h2><p>Quando houver duas pessoas na sala, qualquer pessoa pode começar.</p><button type="button" disabled={room.players.length < 2} onClick={() => send({ type: 'start' })}>Começar partida</button></>}{room.status === 'playing' && room.prompt && <><div className="game-timer" aria-label={`${secondsLeft} segundos restantes`}><strong>{secondsLeft}</strong><span>segundos</span></div><p className="session-counter">Rodada {room.index + 1} de {room.total}</p><h2 className="game-prompt">{room.prompt.text}</h2><div className="quiz-choices">{room.prompt.choices.map((choice) => <button key={choice.id} type="button" className={answer === choice.id ? '' : 'secondary'} disabled={Boolean(answer) || secondsLeft === 0} onClick={() => { setAnswer(choice.id); send({ type: 'answer', answer: choice.id }) }}>{choice.text}</button>)}</div>{feedback && <p className="game-feedback">{feedback}</p>}<p className="game-answer-status">{room.players.filter((player) => player.answered).length} de {room.players.length} responderam.</p></>}{room.status === 'finished' && <><p className="eyebrow">PARTIDA CONCLUÍDA</p><h2>Placar final</h2><p>{[...room.players].sort((a, b) => b.score - a.score)[0]?.email ?? 'Ninguém'} terminou na frente.</p></>}</section></div></section></main>
}

function SentenceOption({ option, hint, isAdmin, disabled, onChoose, onInspect }: { option: string; hint?: VocabularyHint; isAdmin: boolean; disabled: boolean; onChoose: () => void; onInspect: () => void }) {
  const holdTimer = useRef<number | null>(null)
  const held = useRef(false)
  function clearHold() { if (holdTimer.current !== null) { window.clearTimeout(holdTimer.current); holdTimer.current = null } }
  return <button type="button" className={disabled ? 'secondary sentence-option-disabled' : 'secondary'} aria-disabled={disabled} onPointerDown={(event) => { if (!isAdmin || !hint) return; held.current = false; event.currentTarget.setPointerCapture(event.pointerId); holdTimer.current = window.setTimeout(() => { holdTimer.current = null; held.current = true; onInspect() }, 550) }} onPointerUp={(event) => { clearHold(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }} onPointerCancel={clearHold} onContextMenu={(event) => { if (isAdmin) event.preventDefault() }} onClick={(event) => { if (held.current) { event.preventDefault(); event.stopPropagation(); held.current = false; return } if (disabled) { event.preventDefault(); return } onChoose() }}>{option}</button>
}

function SentenceRoom({ room, userId, isAdmin, vocabulary, now, error, pendingChoice, embeddedSession = false, onStart, onAddBot, onChoice, onPass, onNext, onLeave }: { room: Room; userId: string; isAdmin: boolean; vocabulary: Record<string, VocabularyHint>; now: number; error: string; pendingChoice: string | null; embeddedSession?: boolean; onStart: () => void; onAddBot: () => void; onChoice: (choice: string) => void; onPass: () => void; onNext: () => void; onLeave: () => void }) {
  const sentence = room.sentence!
  const [selectedTerm, setSelectedTerm] = useState<VocabularyHint | null>(null)
  const characterCount = [...sentence.tokens.join('')].length
  const usedLimit = characterCount + sentence.passCount
  const current = room.players.find((player) => player.id === sentence.turnId)
  const myTurn = sentence.turnId === userId
  const introSeconds = sentence.introEndsAt ? Math.max(0, Math.ceil((sentence.introEndsAt - now) / 1_000)) : 0
  const turnSeconds = sentence.turnEndsAt ? Math.max(0, Math.ceil((sentence.turnEndsAt - now) / 1_000)) : 0
  const result = sentence.result === 'valid' ? <><strong>✦ Frase aprovada!</strong>{!embeddedSession && <span>+{sentence.lastPoints} pontos para a dupla</span>}{!embeddedSession && sentence.scoreBreakdown && <p className="sentence-score-breakdown">{sentence.scoreBreakdown.speed} velocidade · {sentence.scoreBreakdown.length} tamanho · {sentence.scoreBreakdown.difficulty} dificuldade{sentence.scoreBreakdown.expansion ? ` · +${sentence.scoreBreakdown.expansion} expansão` : ''}{sentence.scoreBreakdown.opportunity ? ` · +${sentence.scoreBreakdown.opportunity} oportunidade` : ''}</p>}<p>{sentence.mode === 'mission' ? (embeddedSession ? 'Você cumpriu o enunciado da rodada.' : 'Vocês cumpriram o enunciado da rodada.') : 'Boa construção.'}</p></> : sentence.result === 'invalid' ? <><strong>Construção inválida nesta rodada</strong><p>Essa combinação não forma uma frase correta no contexto da rodada.</p></> : sentence.mode === 'free' ? <><strong>Revisão pendente</strong><p>Esta frase não recebeu uma revisão agora e não valeu pontos.</p></> : <><strong>A missão não foi cumprida</strong><p>A frase é válida, mas não responde ao enunciado desta rodada.</p></>
  return <main className={embeddedSession ? "study-session session-game-session" : "workspace-view"}><section className={embeddedSession ? "study-session-content sentence-room session-game-content" : "welcome sentence-room"} onContextMenu={(event) => event.preventDefault()}>
    <header className="room-heading"><div>{!embeddedSession && <p className="eyebrow">SALA {room.code}</p>}<h1>{embeddedSession ? 'Construção de frases' : 'Construção cooperativa'}</h1></div><button type="button" className="secondary room-leave" onClick={onLeave}>Sair</button></header>
    {error && <p className="error">{error}</p>}
    <div className="sentence-summary"><span>Rodada {sentence.round} de {sentence.total}</span><span>{usedLimit}/{sentence.characterLimit} limite{sentence.passCount ? ` · ${sentence.passCount} ${sentence.passCount === 1 ? 'passe' : 'passes'}` : ''}</span>{!embeddedSession && <strong>{sentence.teamScore} pontos da equipe</strong>}</div>
    <section className="sentence-board">
      {room.status === 'playing' && !sentence.result && sentence.phase === 'intro' ? <div className="sentence-round-card"><p>PRÓXIMA RODADA</p><strong>{sentence.mode === 'mission' ? 'MISSÃO' : 'MODO LIVRE'}</strong><h2>{sentence.mode === 'mission' ? sentence.mission : 'Construam qualquer frase que quiserem.'}</h2>{sentence.form && <small>{sentence.form}</small>}{sentence.opportunity && <small className="sentence-opportunity-note">✦ {sentence.opportunity}</small>}<span>As cartas viram em {introSeconds}s</span></div> : <><div className="sentence-challenge"><p className={sentence.mode === 'mission' ? 'sentence-mission' : 'sentence-free'}>{sentence.mode === 'mission' ? sentence.mission : 'Modo livre — construam qualquer frase que quiserem.'}</p>{sentence.form && <small>{sentence.form}</small>}{sentence.opportunity && <small className="sentence-opportunity-note">✦ {sentence.opportunity}</small>}</div><p className={(sentence.tokens.length || pendingChoice) ? 'sentence-tokens' : 'sentence-prompt'}>{(sentence.tokens.length || pendingChoice) ? [...sentence.tokens, ...(pendingChoice && pendingChoice !== '…' ? [pendingChoice] : [])].map((token, index) => <span key={`${token}-${index}`}>{token}</span>) : 'A frase começa na próxima escolha.'}</p></>}
      {room.status === 'lobby' ? <><p>Partida mista: rodadas livres e missões. Até 4 pessoas podem jogar; cada frase tem no máximo {sentence.characterLimit} caracteres.</p><ul className="sentence-players">{room.players.map((player) => <li key={player.id}>{player.email}</li>)}</ul>{room.players.length === 1 && <button type="button" className="secondary" onClick={onAddBot}>Jogar com niorb</button>}{isAdmin && room.players.length === 1 && <p className="sentence-admin-note">Como administrador, você também pode começar sozinho.</p>}<button type="button" disabled={room.players.length < 2 && !isAdmin} onClick={onStart}>Começar</button></> : room.status === 'finished' ? <><p className="eyebrow">PARTIDA CONCLUÍDA</p>{!embeddedSession && <h2>{sentence.teamScore} pontos em conjunto.</h2>}<p>{embeddedSession ? `Você concluiu as ${sentence.total} construções.` : `Vocês concluíram as ${sentence.total} construções.`}</p></> : sentence.result ? <><div className={sentence.result === 'valid' ? 'sentence-result valid' : sentence.result === 'invalid' ? 'sentence-result invalid' : 'sentence-result unknown'}>{result}</div>{sentence.review && <div className="sentence-review"><strong>Revisão do niorb</strong><p>{sentence.review.reasonPt}</p>{sentence.review.translationPt && <p>“{sentence.review.translationPt}”</p>}{sentence.review.suggestion && <p>Experimente: {sentence.review.suggestion}</p>}</div>}{sentence.reviewUnavailable === 'daily-limit' && <p className="sentence-ai-unavailable">O limite diário de revisões foi atingido. Tente de novo amanhã.</p>}{sentence.reviewUnavailable === 'unavailable' && <p className="sentence-ai-unavailable">{embeddedSession ? 'As revisões estão indisponíveis agora. Tente novamente mais tarde.' : 'As revisões estão indisponíveis agora. Tentem novamente mais tarde.'}</p>}<button type="button" onClick={onNext}>{sentence.round === sentence.total ? 'Ver resultado' : 'Próxima frase'}</button></> : sentence.phase === 'reviewing' ? <p className="sentence-ai-unavailable">niorb está avaliando a frase…</p> : sentence.phase === 'building' ? <><p className="sentence-turn">{embeddedSession ? `${turnSeconds}s` : myTurn ? `Sua vez — ${turnSeconds}s.` : `Vez de ${current?.email ?? 'sua equipe'} — ${turnSeconds}s.`}</p>{pendingChoice && <p className="sentence-ai-unavailable">Jogada enviada…</p>}{isAdmin && <p className="sentence-admin-hint">Segure uma carta para ver pinyin e tradução.</p>}<div className="sentence-options">{sentence.options.map((option) => <SentenceOption key={option} option={option} hint={vocabulary[option]} isAdmin={isAdmin} disabled={!myTurn || Boolean(pendingChoice)} onChoose={() => onChoice(option)} onInspect={() => setSelectedTerm(vocabulary[option])} />)}</div>{sentence.tokens.length > 0 && <div className="sentence-turn-tools">{sentence.punctuationOptions.map((option) => <button type="button" key={option} className="secondary" disabled={!myTurn || Boolean(pendingChoice)} onClick={() => onChoice(option)}>{option}</button>)}<button type="button" className="secondary" disabled={!myTurn || Boolean(pendingChoice)} onClick={onPass}>{embeddedSession ? 'Passar' : 'Passar vez'}</button></div>}</> : null}
    </section>
    {selectedTerm && <div className="term-overlay" role="presentation" onPointerDown={() => setSelectedTerm(null)}><aside className="term-details" aria-label="Detalhes do vocabulário" onPointerDown={(event) => event.stopPropagation()}><button type="button" className="term-details-close" onClick={() => setSelectedTerm(null)} aria-label="Fechar detalhes">×</button><strong>{selectedTerm.hanzi}</strong><span>{selectedTerm.pinyin}</span><p>{selectedTerm.portuguese}</p>{selectedTerm.hsk_level && <small>HSK {selectedTerm.hsk_level}</small>}</aside></div>}
  </section></main>
}

export default MultiplayerModule
