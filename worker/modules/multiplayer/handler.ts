import { currentUser } from '../../auth.js'
import { coherentNextOptions, expansionScore, formMatches, missionMatches, opportunityOptions, requiredMissionOptions, roundsForDifficulty, roundsFromSentences, sentenceOptionCount, sentenceOptions, sentenceVocabulary, tokenizeSentenceReference, type ApprovedSentenceRound, type SentenceDifficulty, type SentenceForm } from './sentence-rounds.js'
import { reviewChineseSentence, type SentenceReview } from './sentence-review.js'
import { loadChineseSentences } from '../chinese/sentence-corpus.js'

export type MultiplayerEnv = {
  DB: D1Database
  CHINESE_DB: D1Database
	AI: Ai
  MULTIPLAYER_ROOM: DurableObjectNamespace
  MULTIPLAYER_LOBBY: DurableObjectNamespace
}

const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const sentenceCharacterLimit = 12
const roomCode = () => Array.from({ length: 5 }, () => codeAlphabet[Math.floor(Math.random() * codeAlphabet.length)]).join('')
function shuffle<T>(items: T[]) { const result = [...items]; for (let index = result.length - 1; index > 0; index -= 1) { const other = Math.floor(Math.random() * (index + 1)); [result[index], result[other]] = [result[other], result[index]] } return result }

function roomStub(env: MultiplayerEnv, code: string) {
  return env.MULTIPLAYER_ROOM.get(env.MULTIPLAYER_ROOM.idFromName(code))
}
function nextPlayerId(room: Room, currentId: string | null) { const current = room.players.findIndex((player) => player.id === currentId); return room.players[(current + 1 + room.players.length) % room.players.length]?.id ?? null }
function sentenceLength(tokens: string[]) { return [...tokens.join('')].length }
function sentenceCost(tokens: string[], passes = 0) { return sentenceLength(tokens) + passes }
const punctuation = ['。', '？']
function currentSentenceRound(sentence: SentenceState) { return sentence.rounds[sentence.roundIndex] }
function roundForOptions(sentence: SentenceState) { return sentenceMode(sentence) === 'mission' ? currentSentenceRound(sentence) : undefined }
function wordOptions(tokens: string[], difficulty: SentenceDifficulty, round: ApprovedSentenceRound | undefined, references: string[][], shown: string[] = []) {
  const required = requiredMissionOptions(round, tokens).filter((option) => !punctuation.includes(option))
  const opportunities = opportunityOptions(round, tokens).filter((option) => !punctuation.includes(option))
  // Validated continuations are an addition to the hand, never a replacement
  // for the other choices. This prevents a narrow continuation from leaving a
  // player with only one card.
  const coherent = round ? [] : shuffle(coherentNextOptions(tokens, references).filter((option) => !punctuation.includes(option)))
  const candidates = shuffle(sentenceOptions(tokens, references).filter((option) => !punctuation.includes(option)))
  const fresh = candidates.filter((option) => !shown.includes(option))
  const repeated = candidates.filter((option) => shown.includes(option))
  const filler = shuffle(sentenceVocabulary.filter((option) => !tokens.includes(option)))
  // The required cards are picked first so they always fit in the hand, but the
  // hand itself is shuffled: the answer must not sit in a predictable position.
  return shuffle([...new Set([...required, ...opportunities, ...coherent, ...fresh, ...repeated, ...filler])].slice(0, sentenceOptionCount[difficulty]))
}
function refreshSentenceOptions(sentence: SentenceState) {
  const shown = sentence.shownOptions ?? []
  const next = wordOptions(sentence.tokens, sentence.difficulty, roundForOptions(sentence), sentence.referenceSentences, shown)
  sentence.wordOptions = next
  sentence.shownOptions = [...new Set([...shown, ...next])].slice(-72)
}
function availablePunctuation(tokens: string[], passes = 0) { return tokens.length ? punctuation.filter((option) => sentenceCost([...tokens, option], passes) <= sentenceCharacterLimit) : [] }
function sentenceMode(sentence: SentenceState) { return sentence.roundModes[sentence.roundIndex] }

function forwarded(request: Request, url: string, init: RequestInit = {}) {
  const headers = new Headers(request.headers)
  headers.delete('host')
  return new Request(url, { ...init, headers })
}

export async function handleMultiplayerRequest(request: Request, env: MultiplayerEnv): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/multiplayer/')) return null

  if (url.pathname === '/api/multiplayer/catalog/sentence-image') {
    if (request.method === 'GET') {
      try {
        const setting = await env.DB.prepare("SELECT setting_value FROM workspace_settings WHERE setting_key = 'multiplayer.sentence.image_url'").first<{ setting_value: string }>()
        return Response.json({ imageUrl: setting?.setting_value ?? null })
      } catch (error) {
        // Keeps the catalogue usable while an older database is awaiting the new migration.
        console.error('Unable to load multiplayer catalogue image.', error)
        return Response.json({ imageUrl: null })
      }
    }

    if (request.method === 'PUT') {
      const user = await currentUser(request, env)
      if (!user || user.role !== 'admin') return Response.json({ error: 'Acesso restrito a administradores.' }, { status: 403 })
      const body = await request.json().catch(() => null) as { imageUrl?: unknown } | null
      const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : ''
      // A path of this site ("/images/...") works from any address the app is opened at.
      const sitePath = imageUrl.startsWith('/') && !imageUrl.startsWith('//')
      if (imageUrl && !sitePath) {
        try {
          const parsed = new URL(imageUrl)
          if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('protocol')
        } catch {
          return Response.json({ error: 'Informe um link válido de imagem (http ou https).' }, { status: 400 })
        }
      }
      try {
        if (imageUrl) await env.DB.prepare("INSERT INTO workspace_settings (setting_key, setting_value, updated_at) VALUES ('multiplayer.sentence.image_url', ?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at").bind(imageUrl, new Date().toISOString()).run()
        else await env.DB.prepare("DELETE FROM workspace_settings WHERE setting_key = 'multiplayer.sentence.image_url'").run()
        return Response.json({ imageUrl: imageUrl || null })
      } catch (error) {
        console.error('Unable to save multiplayer catalogue image.', error)
        return Response.json({ error: 'Não foi possível salvar a imagem agora.' }, { status: 500 })
      }
    }

    return Response.json({ error: 'Método não permitido.' }, { status: 405 })
  }

  if (url.pathname === '/api/multiplayer/lobby/online' && request.method === 'GET') {
    const user = await currentUser(request, env)
    if (!user || user.role !== 'admin') return Response.json({ error: 'Acesso restrito a administradores.' }, { status: 403 })
    return env.MULTIPLAYER_LOBBY.get(env.MULTIPLAYER_LOBBY.idFromName('online')).fetch(forwarded(request, 'https://lobby/online'))
  }

  if (url.pathname === '/api/multiplayer/lobby') {
    return env.MULTIPLAYER_LOBBY.get(env.MULTIPLAYER_LOBBY.idFromName('online')).fetch(forwarded(request, 'https://lobby/connect'))
  }

  if (url.pathname === '/api/multiplayer/rooms' && request.method === 'POST') {
    const user = await currentUser(request, env)
    if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
    const body = await request.json().catch(() => null)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = roomCode()
      const response = await roomStub(env, code).fetch(forwarded(request, 'https://room/create', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', cookie: request.headers.get('cookie') ?? '' } }))
      if (response.status !== 409) return response
    }
    return Response.json({ error: 'Não foi possível criar uma sala agora. Tente novamente.' }, { status: 503 })
  }

  const match = url.pathname.match(/^\/api\/multiplayer\/rooms\/([A-Z]{5})(?:\/(join|leave|invite|live))?$/)
  if (!match) return Response.json({ error: 'Rota não encontrada.' }, { status: 404 })
  const [, code, action] = match
  const endpoint = action ?? 'snapshot'
  const init: RequestInit = { method: request.method }
  if (action === 'join' || action === 'invite') init.body = await request.text()
  return roomStub(env, code).fetch(forwarded(request, `https://room/${endpoint}`, init))
}

type Choice = { id: string; text: string }
type StoredQuestion = { id: string; prompt: string; choices_json: string; answer_id: string }
type Vocabulary = { id: string; hanzi: string; portuguese: string }
type Round = { id: string; prompt: string; choices: Choice[]; answer: string }
type Player = { id: string; email: string; score: number }
type ScoreBreakdown = { speed: number; length: number; difficulty: number; expansion: number; opportunity: number }
type SentenceState = { roundModes: ('free' | 'mission')[]; difficulty: SentenceDifficulty; level: string; rounds: ApprovedSentenceRound[]; referenceSentences: string[][]; roundIndex: number; nodeId: string; tokens: string[]; passes: number; wordOptions: string[]; shownOptions: string[]; turnId: string | null; phase: 'intro' | 'building' | 'reviewing'; introEndsAt: number | null; roundStartedAt: number | null; turnStartedAt: number | null; speedPenalty: number; turnEndsAt: number | null; teamScore: number; result: 'valid' | 'invalid' | 'unknown' | null; lastPoints: number; scoreBreakdown: ScoreBreakdown | null; botActionAt: number | null; reviewAt: number | null; review: SentenceReview | null; reviewUnavailable: 'daily-limit' | 'unavailable' | null }
type Room = { code: string; hostId: string; title: string; game: 'flash' | 'sentence'; rounds: Round[]; players: Player[]; status: 'lobby' | 'playing' | 'finished'; index: number; answeredIds: string[]; roundEndsAt: number | null; advanceAt: number | null; lobbyExpiresAt: number | null; soloSession?: boolean; sentence?: SentenceState }
function botChoice(sentence: SentenceState, choices: string[]) {
  const target = requiredMissionOptions(roundForOptions(sentence), sentence.tokens)[0]
  if (target && choices.includes(target)) return target
  const matchingPlan = shuffle(sentence.referenceSentences)
    .find((plan) => sentence.tokens.every((token, index) => plan[index] === token) && choices.includes(plan[sentence.tokens.length] ?? ''))
  if (matchingPlan) return matchingPlan[sentence.tokens.length]
  const last = sentence.tokens.at(-1)
  const sensibleFallback: Record<string, string[]> = {
    '我': ['想', '喝', '看', '在'], '你': ['想', '喝', '看', '在'], '他': ['在', '想', '喝'], '她': ['很', '在', '想'], '我们': ['去', '看'], '妈妈': ['在'], '今天': ['我'],
    '想': ['喝', '看', '去'], '喜欢': ['吃', '看'], '喝': ['水', '茶'], '看': ['书', '电影'], '在': ['学校', '家'], '去': ['中国', '学校'], '吃': ['米饭'], '不': ['看', '喝'], '很': ['好'],
  }
  return sensibleFallback[last ?? '']?.find((option) => choices.includes(option)) ?? choices.find((option) => !punctuation.includes(option)) ?? choices[0]
}

function publicRoom(room: Room, onlineIds: Set<string>) {
  const round = room.status === 'playing' ? room.rounds[room.index] : undefined
  const sentence = room.sentence
  const mode = sentence ? sentenceMode(sentence) : undefined
  const sentenceRound = sentence ? roundForOptions(sentence) : undefined
  const availableOptions = sentence && !sentence.result && sentence.phase === 'building' ? sentence.wordOptions.filter((option) => sentenceCost([...sentence.tokens, option], sentence.passes ?? 0) <= sentenceCharacterLimit) : []
  const opportunity = sentenceRound?.opportunity
  const visibleOpportunity = opportunity && availableOptions.includes(opportunity.card) ? opportunity.label : null
  return { code: room.code, title: room.title, game: room.game, status: room.status, index: room.index, total: room.rounds.length, roundEndsAt: room.roundEndsAt, lobbyExpiresAt: room.lobbyExpiresAt, prompt: round ? { id: round.id, text: round.prompt, choices: round.choices } : null, sentence: sentence ? { mode, mission: mode === 'mission' ? sentenceRound?.mission : undefined, form: sentenceRound ? formLabel(sentenceRound.form) : null, opportunity: visibleOpportunity, round: sentence.roundIndex + 1, total: sentence.rounds.length, tokens: sentence.tokens, passCount: sentence.passes ?? 0, options: availableOptions, punctuationOptions: sentence.result || sentence.phase !== 'building' ? [] : availablePunctuation(sentence.tokens, sentence.passes ?? 0), characterLimit: sentenceCharacterLimit, turnId: sentence.turnId, phase: sentence.phase, introEndsAt: sentence.introEndsAt, turnEndsAt: sentence.turnEndsAt, teamScore: sentence.teamScore, result: sentence.result, lastPoints: sentence.lastPoints, scoreBreakdown: sentence.scoreBreakdown, review: sentence.review, reviewUnavailable: sentence.reviewUnavailable } : null, players: room.players.map((player) => ({ ...player, online: onlineIds.has(player.id), answered: room.answeredIds.includes(player.id) })) }
}

function safeEmail(email: string) { return email.split('@')[0] || 'Jogador' }
function formLabel(form: SentenceForm | undefined) {
  if (form === 'question') return 'Forma: façam uma pergunta.'
  if (form === 'negative') return 'Forma: usem negação.'
  if (form === 'time-place') return 'Expansão: incluam tempo ou lugar.'
  if (form === 'expansion') return 'Expansão: deixem a frase maior.'
  return null
}

export class MultiplayerRoom {
  private state: DurableObjectState
  private env: MultiplayerEnv
  constructor(state: DurableObjectState, env: MultiplayerEnv) { this.state = state; this.env = env }

  private async user(request: Request) { return currentUser(request, this.env) }
  private async room() { return this.state.storage.get<Room>('room') }
  private sockets() { return this.state.getWebSockets() }
  private onlineIds() { return new Set(this.sockets().map((socket) => (socket.deserializeAttachment() as { id?: string } | null)?.id).filter((id): id is string => Boolean(id))) }
  private broadcast(room: Room) { const message = JSON.stringify({ type: 'room', room: publicRoom(room, this.onlineIds()) }); for (const socket of this.sockets()) socket.send(message) }
  private async save(room: Room) { await this.state.storage.put('room', room); this.broadcast(room) }
  private async scheduleAdvance(room: Room, at: number) { room.advanceAt = at; await this.state.storage.setAlarm(at) }
  private async nextRound(room: Room) {
    room.advanceAt = null
    if (room.index + 1 >= room.rounds.length) { room.status = 'finished'; room.roundEndsAt = null }
    else { room.index += 1; room.answeredIds = []; room.roundEndsAt = Date.now() + 30_000; await this.state.storage.setAlarm(room.roundEndsAt) }
    await this.save(room)
  }
  private async extendLobby(room: Room) { room.lobbyExpiresAt = Date.now() + 300_000; await this.state.storage.setAlarm(room.lobbyExpiresAt) }
  private async scheduleSentence(room: Room) {
    const sentence = room.sentence
    if (!sentence) return
    const due = [sentence.introEndsAt, sentence.turnEndsAt, sentence.botActionAt, sentence.reviewAt ?? null].filter((time): time is number => time !== null)
    if (due.length) await this.state.storage.setAlarm(Math.max(Date.now() + 50, Math.min(...due)))
  }
  private beginSentenceTurn(room: Room) {
    const sentence = room.sentence!
    sentence.phase = 'building'; sentence.introEndsAt = null; sentence.roundStartedAt ??= Date.now(); sentence.turnStartedAt = Date.now(); sentence.turnEndsAt = Date.now() + 30_000
    if (sentence.turnId === 'niorb-bot') sentence.botActionAt = Date.now() + 700
  }
  private startSentenceIntro(room: Room, turnId: string | null) {
    const sentence = room.sentence!
    sentence.turnId = turnId; sentence.phase = 'intro'; sentence.introEndsAt = Date.now() + 5_000; sentence.roundStartedAt = null; sentence.turnStartedAt = null; sentence.speedPenalty = 0; sentence.turnEndsAt = null; sentence.botActionAt = null; sentence.reviewAt = null; refreshSentenceOptions(sentence)
  }
  private advanceSentenceTurn(room: Room, currentId: string | null) {
    const sentence = room.sentence!
    sentence.turnId = nextPlayerId(room, currentId); sentence.turnStartedAt = Date.now(); sentence.turnEndsAt = Date.now() + 30_000; sentence.botActionAt = sentence.turnId === 'niorb-bot' ? Date.now() + 700 : null
  }
  private recordTurnPenalty(sentence: SentenceState) {
    if (typeof sentence.turnStartedAt !== 'number') return
    const secondsUsed = Math.min(30, Math.max(0, Math.ceil((Date.now() - sentence.turnStartedAt) / 1_000)))
    sentence.speedPenalty = (sentence.speedPenalty ?? 0) + Math.max(0, secondsUsed - 10)
    sentence.turnStartedAt = null
  }
  private async passSentenceTurn(room: Room, currentId: string | null) {
    const sentence = room.sentence!
    this.recordTurnPenalty(sentence)
    sentence.passes = (sentence.passes ?? 0) + 1
    refreshSentenceOptions(sentence)
    if (sentenceCost(sentence.tokens, sentence.passes) >= sentenceCharacterLimit) { sentence.turnEndsAt = null; this.startSentenceReview(sentence); return }
    this.advanceSentenceTurn(room, currentId)
  }
  private startSentenceReview(sentence: SentenceState) { sentence.phase = 'reviewing'; sentence.turnEndsAt = null; sentence.botActionAt = null; sentence.reviewAt = Date.now() + 50 }
  private async finishSentence(sentence: SentenceState) {
    sentence.reviewAt = null
    const mode = sentenceMode(sentence)
    const round = currentSentenceRound(sentence)
    const objective = mode === 'mission' ? [round.mission, formLabel(round.form)].filter(Boolean).join(' ') : undefined
    const reviewed = await reviewChineseSentence(this.env.AI, this.env.DB, sentence.tokens.join(''), objective)
    const review = reviewed.review
    sentence.review = review; sentence.reviewUnavailable = reviewed.unavailable
    const localValid = mode === 'mission' ? missionMatches(round, sentence.tokens) && formMatches(round.form, sentence.tokens) : sentence.tokens.length >= 2
    if (!review && mode === 'free') { sentence.result = 'unknown'; return }
    const valid = review ? review.grammatical && review.natural && review.coherent && (mode === 'free' || review.meetsMission === true) : localValid
    if (valid) {
      const words = sentence.tokens.filter((token) => !punctuation.includes(token))
      const speed = Math.max(0, 60 - (sentence.speedPenalty ?? 0))
      const length = words.reduce((total, word) => total + [...word].length * 3 + ([...word].length > 1 ? 3 : 0), 0)
      const difficulty = words.length
      const expansion = expansionScore(sentence.tokens, mode === 'mission' ? round : undefined)
      sentence.result = 'valid'; sentence.scoreBreakdown = { speed, length, difficulty, expansion: expansion.time + expansion.place + expansion.extra, opportunity: expansion.opportunity }; sentence.lastPoints = speed + length + difficulty + expansion.total; sentence.teamScore += sentence.lastPoints
    }
    else if (mode === 'mission' && review?.grammatical && review.natural && review.coherent) sentence.result = 'unknown'
    else sentence.result = 'invalid'
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const user = await this.user(request)
    if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })

    if (url.pathname === '/create' && request.method === 'POST') {
      if (await this.room()) return Response.json({ error: 'Código já utilizado.' }, { status: 409 })
      const input = await request.json<{ level?: unknown; mode?: unknown; count?: unknown; game?: unknown; difficulty?: unknown; roundIds?: unknown; soloSession?: unknown }>().catch(() => null)
      const level = typeof input?.level === 'string' ? input.level : ''
      const mode = input?.mode === 'recognition' || input?.mode === 'hsk-mock' ? input.mode : 'recognition'
      const game = input?.game === 'sentence' ? 'sentence' : 'flash'
      const difficulty: SentenceDifficulty = input?.difficulty === 'medium' || input?.difficulty === 'hard' || input?.difficulty === 'brutal' ? input.difficulty : 'easy'
      const count = 10
      if (!level) return Response.json({ error: 'Escolha um nível HSK.' }, { status: 400 })
      if (game === 'sentence') {
        if (level !== '1' && level !== '2') return Response.json({ error: 'A construção cooperativa está disponível para HSK 1 e HSK 2.' }, { status: 400 })
        const { results: reviewedSentences } = await this.env.DB.prepare('SELECT sentence FROM multiplayer_sentence_review_cache WHERE (result_flags & 7) = 7 ORDER BY created_at DESC LIMIT 50').all<{ sentence: string }>()
        const requestedRoundIds = Array.isArray(input?.roundIds) ? input.roundIds.filter((id): id is string => typeof id === 'string') : []
        const soloSession = input?.soloSession === true && requestedRoundIds.length > 0
        const approvedSentenceRounds = roundsFromSentences(await loadChineseSentences(this.env.CHINESE_DB))
        const sentenceRounds = requestedRoundIds.length ? requestedRoundIds.map((id) => approvedSentenceRounds.find((round) => round.id === id)).filter((round): round is ApprovedSentenceRound => Boolean(round)) : roundsForDifficulty(approvedSentenceRounds, difficulty, level, [])
        if (!sentenceRounds.length || (!requestedRoundIds.length && sentenceRounds.length < 10)) return Response.json({ error: 'Ainda não há missões suficientes para este nível.' }, { status: 400 })
        const roundModes = requestedRoundIds.length ? sentenceRounds.map(() => 'mission' as const) : shuffle(sentenceRounds.map((_, index) => index < Math.ceil(sentenceRounds.length / 2) ? 'mission' as const : 'free' as const))
        const code = this.state.id.name ?? ''
        const approvedAnswers = approvedSentenceRounds.map((round) => round.answer)
        const referenceSentences = [...approvedAnswers, ...reviewedSentences.map((item) => tokenizeSentenceReference(item.sentence, approvedAnswers)).filter((tokens): tokens is string[] => tokens !== null)]
        const initialOptions = wordOptions([], difficulty, sentenceRounds[0], referenceSentences)
        const room: Room = { code, hostId: user.id, game, title: 'Construção cooperativa', rounds: [], players: [{ id: user.id, email: safeEmail(user.email), score: 0 }], status: 'lobby', index: 0, answeredIds: [], roundEndsAt: null, advanceAt: null, lobbyExpiresAt: null, soloSession, sentence: { roundModes, difficulty, level, rounds: sentenceRounds, referenceSentences, roundIndex: 0, nodeId: 'n0', tokens: [], passes: 0, wordOptions: initialOptions, shownOptions: initialOptions, turnId: null, phase: 'intro', introEndsAt: null, roundStartedAt: null, turnStartedAt: null, speedPenalty: 0, turnEndsAt: null, teamScore: 0, result: null, lastPoints: 0, scoreBreakdown: null, botActionAt: null, reviewAt: null, review: null, reviewUnavailable: null } }
        await this.extendLobby(room)
        await this.save(room)
        return Response.json({ room: publicRoom(room, this.onlineIds()) }, { status: 201 })
      }
      const { results } = await this.env.DB.prepare('SELECT id, prompt, choices_json, answer_id FROM chinese_quiz_questions WHERE hsk_level = ? AND mode = ? ORDER BY RANDOM() LIMIT ?').bind(level, mode, count).all<StoredQuestion>()
      let rounds = results.flatMap((question): Round[] => { try { const choices = JSON.parse(question.choices_json) as Choice[]; return choices.length >= 2 && choices.some((choice) => choice.id === question.answer_id) ? [{ id: question.id, prompt: question.prompt, choices, answer: question.answer_id }] : [] } catch { return [] } })
      if (rounds.length < 10) {
        const { results: vocabulary } = await this.env.DB.prepare("SELECT id, hanzi, portuguese FROM chinese_vocabulary_catalog WHERE hsk_level = ? AND type = 'character' ORDER BY RANDOM() LIMIT ?").bind(level, count + 3).all<Vocabulary>()
        rounds = vocabulary.length < 4 ? [] : vocabulary.slice(0, Math.min(count, vocabulary.length)).map((term) => ({ id: `vocabulary-${term.id}`, prompt: term.hanzi, answer: term.id, choices: shuffle([{ id: term.id, text: term.portuguese }, ...shuffle(vocabulary.filter((candidate) => candidate.id !== term.id && candidate.portuguese !== term.portuguese)).slice(0, 3).map((candidate) => ({ id: candidate.id, text: candidate.portuguese }))]) })).filter((round) => round.choices.length === 4)
      }
      if (rounds.length < 10) return Response.json({ error: 'Este nível ainda não tem conteúdo suficiente para uma partida de 10 rodadas.' }, { status: 400 })
      const code = this.state.id.name ?? ''
      const room: Room = { code, hostId: user.id, game, title: `HSK ${level} · Cartas em disputa`, rounds, players: [{ id: user.id, email: safeEmail(user.email), score: 0 }], status: 'lobby', index: 0, answeredIds: [], roundEndsAt: null, advanceAt: null, lobbyExpiresAt: null }
      await this.extendLobby(room)
      await this.save(room)
      return Response.json({ room: publicRoom(room, this.onlineIds()) }, { status: 201 })
    }

    const room = await this.room()
    if (!room) return Response.json({ error: 'Sala não encontrada.' }, { status: 404 })

    if (url.pathname === '/snapshot' && request.method === 'GET') return Response.json({ room: publicRoom(room, this.onlineIds()) })
    if (url.pathname === '/join' && request.method === 'POST') {
      if (room.game === 'sentence' && !room.players.some((player) => player.id === user.id) && room.players.length >= 4) return Response.json({ error: 'Esta partida cooperativa já tem quatro pessoas.' }, { status: 409 })
      if (!room.players.some((player) => player.id === user.id)) room.players.push({ id: user.id, email: safeEmail(user.email), score: 0 })
      if (room.status === 'lobby') await this.extendLobby(room)
      await this.save(room)
      return Response.json({ room: publicRoom(room, this.onlineIds()) })
    }
    if (url.pathname === '/leave' && request.method === 'POST') {
      room.players = room.players.filter((player) => player.id !== user.id)
      room.answeredIds = room.answeredIds.filter((id) => id !== user.id)
      if (room.game === 'sentence' && room.sentence?.turnId === user.id) { room.sentence.turnId = room.players[0]?.id ?? null; if (room.sentence.phase === 'building') this.advanceSentenceTurn(room, user.id); await this.scheduleSentence(room) }
      if (room.status === 'playing' && room.players.length && room.players.every((player) => room.answeredIds.includes(player.id))) await this.scheduleAdvance(room, Date.now() + 1_500)
      await this.save(room)
      return new Response(null, { status: 204 })
    }
    if (url.pathname === '/invite' && request.method === 'POST') {
      if (!room.players.some((player) => player.id === user.id)) return Response.json({ error: 'Entre na sala antes de convidar alguém.' }, { status: 403 })
      const body = await request.json<{ userId?: unknown }>().catch(() => null)
      if (typeof body?.userId !== 'string') return Response.json({ error: 'Pessoa inválida.' }, { status: 400 })
      if (room.status === 'lobby') { await this.extendLobby(room); await this.save(room) }
      await this.env.MULTIPLAYER_LOBBY.get(this.env.MULTIPLAYER_LOBBY.idFromName('online')).fetch('https://lobby/invite', { method: 'POST', body: JSON.stringify({ targetId: body.userId, code: room.code, from: safeEmail(user.email) }) })
      return Response.json({ ok: true })
    }
    if (url.pathname === '/live' && request.headers.get('upgrade') === 'websocket') {
      if (!room.players.some((player) => player.id === user.id)) return Response.json({ error: 'Entre na sala antes de acompanhar a partida.' }, { status: 403 })
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)
      server.serializeAttachment({ id: user.id, role: user.role })
      this.state.acceptWebSocket(server)
      server.send(JSON.stringify({ type: 'room', room: publicRoom(room, new Set([...this.onlineIds(), user.id])) }))
      this.broadcast(room)
      return new Response(null, { status: 101, webSocket: client })
    }
    return Response.json({ error: 'Rota não encontrada.' }, { status: 404 })
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return
    const actor = socket.deserializeAttachment() as { id?: string; role?: 'admin' | 'user' } | null
    const actorId = actor?.id
    if (!actorId) return
    const room = await this.room()
    if (!room) return
    let event: { type?: unknown; answer?: unknown; choice?: unknown }
    try { event = JSON.parse(message) } catch { return }
    if (event.type === 'add-bot' && room.game === 'sentence' && room.status === 'lobby' && room.players.length === 1) { room.players.push({ id: 'niorb-bot', email: 'Niorb', score: 0 }); await this.extendLobby(room); await this.save(room); return }
    if (event.type === 'start' && room.status === 'lobby' && (room.players.length >= 2 || actor?.role === 'admin' || (room.soloSession && actorId === room.hostId))) {
      room.status = 'playing'; room.answeredIds = []; room.lobbyExpiresAt = null
      if (room.game === 'sentence' && room.sentence) { this.startSentenceIntro(room, room.players[0].id); await this.scheduleSentence(room); await this.save(room); return }
      room.roundEndsAt = Date.now() + 30_000; await this.state.storage.setAlarm(room.roundEndsAt); await this.save(room); return
    }
    if (event.type === 'sentence-choice' && room.game === 'sentence' && room.status === 'playing' && room.sentence && typeof event.choice === 'string') {
      const sentence = room.sentence
      if (sentence.result || sentence.phase !== 'building' || sentence.turnId !== actorId) return
      if (![...sentence.wordOptions, ...availablePunctuation(sentence.tokens, sentence.passes ?? 0)].includes(event.choice) || sentenceCost([...sentence.tokens, event.choice], sentence.passes ?? 0) > sentenceCharacterLimit) return
      this.recordTurnPenalty(sentence)
      sentence.tokens.push(event.choice)
      refreshSentenceOptions(sentence)
      sentence.botActionAt = null
      if (punctuation.includes(event.choice) || sentenceCost(sentence.tokens, sentence.passes ?? 0) === sentenceCharacterLimit) this.startSentenceReview(sentence)
      else this.advanceSentenceTurn(room, actorId)
      await this.scheduleSentence(room)
      await this.save(room); return
    }
    if (event.type === 'sentence-pass' && room.game === 'sentence' && room.status === 'playing' && room.sentence) {
      const sentence = room.sentence
      if (sentence.result || sentence.phase !== 'building' || sentence.turnId !== actorId) return
      await this.passSentenceTurn(room, actorId); await this.scheduleSentence(room); await this.save(room); return
    }
    if (event.type === 'sentence-next' && room.game === 'sentence' && room.status === 'playing' && room.sentence?.result) {
      const sentence = room.sentence
      if (sentence.roundIndex + 1 >= sentence.rounds.length) { room.status = 'finished'; await this.save(room); return }
      sentence.roundIndex += 1; sentence.nodeId = 'n0'; sentence.tokens = []; sentence.passes = 0; sentence.result = null; sentence.lastPoints = 0; sentence.scoreBreakdown = null; sentence.review = null; sentence.reviewUnavailable = null; this.startSentenceIntro(room, nextPlayerId(room, sentence.turnId)); await this.scheduleSentence(room)
      await this.save(room); return
    }
    if (event.type === 'answer' && room.status === 'playing' && typeof event.answer === 'string' && !room.answeredIds.includes(actorId)) {
      room.answeredIds.push(actorId)
      const points = event.answer === room.rounds[room.index].answer && room.roundEndsAt ? Math.max(0, Math.ceil((room.roundEndsAt - Date.now()) / 1_000)) : 0
      if (points) { const player = room.players.find((item) => item.id === actorId); if (player) player.score += points }
      socket.send(JSON.stringify({ type: 'answer-result', correct: points > 0, points }))
      if (room.players.every((player) => room.answeredIds.includes(player.id))) await this.scheduleAdvance(room, Date.now() + 1_500)
      await this.save(room)
    }
  }

  async alarm() {
    const room = await this.room()
    if (!room) return
    const now = Date.now()
    if (room.status === 'lobby' && room.lobbyExpiresAt !== null && room.lobbyExpiresAt <= now) {
      for (const socket of this.sockets()) { socket.send(JSON.stringify({ type: 'room-closed', reason: 'A sala foi fechada por inatividade.' })); socket.close(1000, 'Sala inativa') }
      await this.state.storage.delete('room')
      return
    }
    if (room.status !== 'playing') return
    const sentence = room.sentence
    if (room.game === 'sentence' && sentence) {
      if (sentence.phase === 'intro' && sentence.introEndsAt !== null && sentence.introEndsAt <= now) this.beginSentenceTurn(room)
      else if (sentence.phase === 'reviewing' && sentence.reviewAt !== null && sentence.reviewAt <= now) await this.finishSentence(sentence)
      else if (sentence.phase === 'building' && sentence.botActionAt !== null && sentence.botActionAt <= now) {
        sentence.botActionAt = null
        if (sentence.turnId === 'niorb-bot' && !sentence.result) {
          const choices = [...sentence.wordOptions, ...availablePunctuation(sentence.tokens, sentence.passes ?? 0)].filter((option) => sentenceCost([...sentence.tokens, option], sentence.passes ?? 0) <= sentenceCharacterLimit)
          const choice = botChoice(sentence, choices)
          if (choice) {
            this.recordTurnPenalty(sentence)
            sentence.tokens.push(choice); refreshSentenceOptions(sentence)
            if (punctuation.includes(choice) || sentenceCost(sentence.tokens, sentence.passes ?? 0) >= sentenceCharacterLimit) this.startSentenceReview(sentence)
            else this.advanceSentenceTurn(room, 'niorb-bot')
          }
        }
      } else if (sentence.phase === 'building' && sentence.turnEndsAt !== null && sentence.turnEndsAt <= now && !sentence.result) await this.passSentenceTurn(room, sentence.turnId)
      await this.scheduleSentence(room)
      await this.save(room)
      return
    }
    if ((room.advanceAt !== null && room.advanceAt <= now) || (room.roundEndsAt !== null && room.roundEndsAt <= now)) await this.nextRound(room)
  }

  async webSocketClose() { const room = await this.room(); if (room) this.broadcast(room) }
}

export class MultiplayerLobby {
  private state: DurableObjectState
  private env: MultiplayerEnv
  constructor(state: DurableObjectState, env: MultiplayerEnv) { this.state = state; this.env = env }
  private async user(request: Request) { return currentUser(request, this.env) }
  private users() { const found = new Map<string, { id: string; email: string }>(); for (const socket of this.state.getWebSockets()) { const user = socket.deserializeAttachment() as { id: string; email: string } | null; if (user) found.set(user.id, user) } return [...found.values()] }
  private broadcast() { const message = JSON.stringify({ type: 'online', users: this.users() }); for (const socket of this.state.getWebSockets()) socket.send(message) }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/invite' && request.method === 'POST') { const invite = JSON.parse(await request.text()) as { targetId: string }; for (const socket of this.state.getWebSockets()) if ((socket.deserializeAttachment() as { id?: string } | null)?.id === invite.targetId) socket.send(JSON.stringify({ type: 'invite', ...invite })); return Response.json({ ok: true }) }
    const user = await this.user(request)
    if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
    if (url.pathname === '/online' && request.method === 'GET') return Response.json({ users: this.users() })
    if (url.pathname !== '/connect' || request.headers.get('upgrade') !== 'websocket') return Response.json({ error: 'Rota não encontrada.' }, { status: 404 })
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair)
    server.serializeAttachment({ id: user.id, email: safeEmail(user.email) }); this.state.acceptWebSocket(server); this.broadcast()
    return new Response(null, { status: 101, webSocket: client })
  }
  webSocketClose() { this.broadcast() }
}
