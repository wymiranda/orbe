export type StudyDifficulty = 'easy' | 'medium' | 'hard' | 'brutal'
export type StudySuggestion = { kind: 'difficulty'; difficulty: StudyDifficulty } | { kind: 'hsk'; hskLevel: string } | null
export type User = { id: string; email: string; role: 'admin' | 'user'; is_teacher: boolean; display_name: string | null; self_assessed_hsk_level: string | null; session_duration_minutes: number | null; study_difficulty: StudyDifficulty; placement_level: string | null }
type StoredUser = User & { last_seen_at: string | null; study_suggestion_since: string | null }
export type AuthEnv = {
  DB: D1Database
  CHINESE_DB?: D1Database
  ADMIN_EMAIL?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_ALLOWED_EMAILS?: string
  TEMP_LOGIN_EMAIL?: string
  TEMP_LOGIN_PASSWORD?: string
}

const session = 'niorb_session'
const legacySession = 'orbe_session'
const googleState = 'niorb_google_oauth_state'
const sessionLifetimeSeconds = 15 * 24 * 60 * 60
const sessionLifetimeMilliseconds = sessionLifetimeSeconds * 1_000
const getCookies = (request: Request) => new Map<string, string>((request.headers.get('cookie') ?? '').split(';').map((part) => {
  const [name, value = ''] = part.trim().split(/=(.*)/s, 2)
  return [name, value] as [string, string]
}).filter(([name]) => name))

const makeCookie = (name: string, value: string, maxAge: number, secure: boolean) => `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
const sessionId = (request: Request) => {
  const cookies = getCookies(request)
  return cookies.get(session) ?? cookies.get(legacySession) ?? null
}
const redirect = (location: string, headers?: Headers) => {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('location', location)
  responseHeaders.set('cache-control', 'no-store')
  return new Response(null, { status: 302, headers: responseHeaders })
}

const googleCallback = (url: URL) => new URL('/api/auth/google/callback', url.origin).toString()
const allowedGoogleEmails = (env: AuthEnv) => new Set((env.GOOGLE_ALLOWED_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))
const temporaryLoginEmail = (env: AuthEnv) => (env.TEMP_LOGIN_EMAIL ?? '').trim().toLowerCase()
const isLocalDevelopmentOrigin = (url: URL) => {
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)) return true
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(host) || /^10(?:\.\d{1,3}){3}$/.test(host)) return true
  const private172 = /^172\.(\d{1,3})(?:\.\d{1,3}){2}$/.exec(host)
  return private172 !== null && Number(private172[1]) >= 16 && Number(private172[1]) <= 31
}

async function matchesTemporaryPassword(value: string, expected: string) {
  const encoder = new TextEncoder()
  const [actualHash, expectedHash] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(value)), crypto.subtle.digest('SHA-256', encoder.encode(expected))])
  const actual = new Uint8Array(actualHash); const wanted = new Uint8Array(expectedHash)
  let difference = 0
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ wanted[index]
  return difference === 0
}

async function upsertUser(email: string, env: AuthEnv) {
  const now = new Date().toISOString()
  const role = email === (env.ADMIN_EMAIL ?? '').toLowerCase() ? 'admin' : 'user'
  let user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>()
  if (user) await env.DB.prepare('UPDATE users SET role = ?, last_login_at = ?, last_seen_at = ?, updated_at = ? WHERE id = ?').bind(role, now, now, now, user.id).run()
  else {
    user = { id: crypto.randomUUID() }
    await env.DB.prepare('INSERT INTO users (id, email, role, created_at, updated_at, last_login_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(user.id, email, role, now, now, now, now).run()
  }
  return { id: user.id, role }
}

export async function currentUser(request: Request, env: AuthEnv) {
  const id = sessionId(request)
  if (!id) return null
  const user = await env.DB.prepare(`SELECT users.id, users.email, users.role, (users.role = 'admin' OR EXISTS(SELECT 1 FROM teacher_profiles WHERE teacher_profiles.user_id = users.id)) AS is_teacher, users.display_name, users.self_assessed_hsk_level, users.session_duration_minutes, users.study_difficulty, users.placement_level, users.study_suggestion_since, users.last_seen_at FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id WHERE auth_sessions.id = ? AND auth_sessions.expires_at > ?`).bind(id, new Date().toISOString()).first<StoredUser>()
  const now = new Date().toISOString()
  if (user && user.last_seen_at?.slice(0, 10) !== now.slice(0, 10)) await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, user.id).run()
  return user ? { ...user, is_teacher: Boolean(user.is_teacher) } : null
}

const studyDifficulties: StudyDifficulty[] = ['easy', 'medium', 'hard', 'brutal']
/** HSK levels the session games have sentences for (the sentence game accepts the same two). */
const sessionHskLevels = ['1', '2']
const suggestionSessions = 3
const suggestionAccuracy = 0.85
/** Sessions on Difícil, each above this accuracy, that make surprise Brutal rounds more frequent there. */
const brutalBoostSessions = 5
const brutalBoostAccuracy = 0.85

/** The last five Difícil sessions at the learner's level, each above 85%. */
async function brutalBoost(user: StoredUser, env: AuthEnv) {
  const { results } = await env.DB.prepare("SELECT answers_correct, answers_total FROM user_study_session_logs WHERE user_id = ? AND completed_at IS NOT NULL AND difficulty = 'hard' AND hsk_level = ? AND answers_total > 0 ORDER BY completed_at DESC LIMIT ?")
    .bind(user.id, user.self_assessed_hsk_level ?? '1', brutalBoostSessions).all<{ answers_correct: number; answers_total: number }>()
  return results.length === brutalBoostSessions && results.every((session) => session.answers_correct / session.answers_total > brutalBoostAccuracy)
}

/** Different Brutal sentences of an HSK level answered correctly that make Brutal a playable level there, for good. */
const brutalUnlockSentences = 10

/** HSK levels where Brutal is a playable level, and whether an unlock still has to be announced. */
async function brutalProgress(userId: string, env: AuthEnv) {
  const { results } = await env.DB.prepare('SELECT hsk_level, notice_seen_at FROM user_brutal_unlocks WHERE user_id = ? ORDER BY hsk_level').bind(userId).all<{ hsk_level: string; notice_seen_at: string | null }>()
  return { levels: results.map((row) => row.hsk_level), notice: results.some((row) => row.notice_seen_at === null) }
}

/** The last three sessions with answers, at the current level and difficulty, all at 85% or more. */
async function strongAtCurrentSetting(user: StoredUser, env: AuthEnv) {
  const { results } = await env.DB.prepare('SELECT answers_correct, answers_total FROM user_study_session_logs WHERE user_id = ? AND completed_at IS NOT NULL AND completed_at > ? AND difficulty = ? AND hsk_level = ? AND answers_total > 0 ORDER BY completed_at DESC LIMIT ?')
    .bind(user.id, user.study_suggestion_since ?? '', user.study_difficulty, user.self_assessed_hsk_level ?? '1', suggestionSessions).all<{ answers_correct: number; answers_total: number }>()
  return results.length === suggestionSessions && results.every((session) => session.answers_correct / session.answers_total >= suggestionAccuracy)
}

/** Fácil → Médio → Difícil; from Difícil (or Brutal) the next HSK level, when it has content. */
async function studySuggestion(user: StoredUser, env: AuthEnv): Promise<StudySuggestion> {
  if (!await strongAtCurrentSetting(user, env)) return null
  if (user.study_difficulty === 'easy') return { kind: 'difficulty', difficulty: 'medium' }
  if (user.study_difficulty === 'medium') return { kind: 'difficulty', difficulty: 'hard' }
  const next = String(Number(user.self_assessed_hsk_level ?? '1') + 1)
  return sessionHskLevels.includes(next) ? { kind: 'hsk', hskLevel: next } : null
}

const difficultyRank: Record<StudyDifficulty, number> = { easy: 0, medium: 1, hard: 2, brutal: 3 }

/**
 * The level a learner jumped to: raising the level or the difficulty on their own, not through the
 * app's suggestion, takes the words up to that level as known (proven later by the games). Going
 * down brings the jump down with it; a step by step progression keeps it as it was.
 */
export function placementAfter(user: StoredUser, next: { level: string | null; difficulty: StudyDifficulty }, suggested: StudySuggestion) {
  const level = Number(next.level ?? '1') || 0
  const current = Number(user.self_assessed_hsk_level ?? '1') || 0
  const raised = level > current || (level === current && difficultyRank[next.difficulty] > difficultyRank[user.study_difficulty])
  const followsSuggestion = suggested !== null && (suggested.kind === 'hsk' ? suggested.hskLevel === next.level : suggested.difficulty === next.difficulty && level === current)
  const capped = Math.min(level, Number(sessionHskLevels[sessionHskLevels.length - 1]))
  if (raised && !followsSuggestion && capped > 0) return String(Math.max(capped, Number(user.placement_level ?? 0)))
  if (user.placement_level && capped < Number(user.placement_level)) return capped > 0 ? String(capped) : null
  return user.placement_level
}

async function publicUser(user: StoredUser, env: AuthEnv) {
  const { study_suggestion_since: _since, last_seen_at: _seen, ...visible } = user
  const brutal = await brutalProgress(user.id, env)
  return { ...visible, study_suggestion: await studySuggestion(user, env), brutal_levels: brutal.levels, brutal_notice: brutal.notice, brutal_boost: await brutalBoost(user, env) }
}

async function createSession(userId: string, env: AuthEnv, secure: boolean) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await env.DB.prepare('INSERT INTO auth_sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(id, userId, new Date(Date.now() + sessionLifetimeMilliseconds).toISOString(), now).run()
  return makeCookie(session, id, sessionLifetimeSeconds, secure)
}

async function refreshSession(request: Request, env: AuthEnv, secure: boolean) {
  const id = sessionId(request)
  if (!id) return null
  await env.DB.prepare('UPDATE auth_sessions SET expires_at = ? WHERE id = ?').bind(new Date(Date.now() + sessionLifetimeMilliseconds).toISOString(), id).run()
  return makeCookie(session, id, sessionLifetimeSeconds, secure)
}

export async function handleAuth(request: Request, env: AuthEnv): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/auth/') && !url.pathname.startsWith('/api/study-sessions')) return null
  const secureCookies = url.protocol === 'https:'

  if (url.pathname === '/api/auth/me') {
    const user = await currentUser(request, env)
    const headers = new Headers({ 'cache-control': 'no-store' })
    if (user) {
      const refreshedSession = await refreshSession(request, env, secureCookies)
      if (refreshedSession) headers.append('set-cookie', refreshedSession)
      if (getCookies(request).has(legacySession)) headers.append('set-cookie', makeCookie(legacySession, '', 0, secureCookies))
    }
    return Response.json({ user: user ? await publicUser(user, env) : null }, { headers })
  }

  if (url.pathname === '/api/auth/study-settings' && request.method === 'PATCH') {
    const user = await currentUser(request, env)
    if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
    const body = await request.json().catch(() => null) as { hskLevel?: unknown; difficulty?: unknown } | null
    const hskLevel = body?.hskLevel === undefined ? user.self_assessed_hsk_level : typeof body.hskLevel === 'string' && sessionHskLevels.includes(body.hskLevel) ? body.hskLevel : undefined
    const brutalLevels = (await brutalProgress(user.id, env)).levels
    // Moving to a level where Brutal is still locked keeps the learner on Difícil.
    const difficulty = body?.difficulty === undefined ? (user.study_difficulty === 'brutal' && hskLevel && !brutalLevels.includes(hskLevel) ? 'hard' : user.study_difficulty) : studyDifficulties.find((value) => value === body.difficulty)
    if (hskLevel === undefined || !difficulty || (difficulty === 'brutal' && !brutalLevels.includes(hskLevel ?? '1'))) return Response.json({ error: 'Escolha um nível e uma dificuldade válidos.' }, { status: 400 })
    const changed = hskLevel !== user.self_assessed_hsk_level || difficulty !== user.study_difficulty
    const now = new Date().toISOString()
    const since = changed ? now : user.study_suggestion_since
    const placement = changed ? placementAfter(user, { level: hskLevel, difficulty }, await studySuggestion(user, env)) : user.placement_level
    if (changed) await env.DB.prepare('UPDATE users SET self_assessed_hsk_level = ?, study_difficulty = ?, placement_level = ?, study_suggestion_since = ?, updated_at = ? WHERE id = ?').bind(hskLevel, difficulty, placement, since, now, user.id).run()
    return Response.json({ user: await publicUser({ ...user, self_assessed_hsk_level: hskLevel, study_difficulty: difficulty, placement_level: placement, study_suggestion_since: since }, env) })
  }

  // "Agora não": the suggestion returns only after three more strong sessions.
  if (url.pathname === '/api/auth/study-suggestion/dismiss' && request.method === 'POST') {
    const user = await currentUser(request, env)
    if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
    const now = new Date().toISOString()
    await env.DB.prepare('UPDATE users SET study_suggestion_since = ? WHERE id = ?').bind(now, user.id).run()
    return Response.json({ user: await publicUser({ ...user, study_suggestion_since: now }, env) })
  }

  if (url.pathname === '/api/auth/brutal-notice/seen' && request.method === 'POST') {
    const user = await currentUser(request, env)
    if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
    await env.DB.prepare('UPDATE user_brutal_unlocks SET notice_seen_at = ? WHERE user_id = ? AND notice_seen_at IS NULL').bind(new Date().toISOString(), user.id).run()
    return new Response(null, { status: 204 })
  }

  // A Brutal sentence answered correctly. The same sentence counts once; the tenth
  // different one of an HSK level makes Brutal a playable level there.
  if (url.pathname === '/api/auth/brutal-progress' && request.method === 'POST') {
    const user = await currentUser(request, env)
    if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
    const body = await request.json().catch(() => null) as { sentenceId?: unknown } | null
    const sentenceId = typeof body?.sentenceId === 'string' && body.sentenceId.length <= 120 ? body.sentenceId : null
    const sentence = sentenceId && env.CHINESE_DB ? await env.CHINESE_DB.prepare("SELECT hsk_level FROM chinese_sentences WHERE id = ? AND difficulty = 'brutal'").bind(sentenceId).first<{ hsk_level: string }>() : null
    if (!sentenceId || !sentence || !sessionHskLevels.includes(sentence.hsk_level)) return Response.json({ error: 'Frase Brutal inválida.' }, { status: 400 })
    const now = new Date().toISOString()
    await env.DB.prepare('INSERT OR IGNORE INTO user_brutal_correct_sentences (user_id, sentence_id, hsk_level, answered_at) VALUES (?, ?, ?, ?)').bind(user.id, sentenceId, sentence.hsk_level, now).run()
    await env.DB.prepare('INSERT OR IGNORE INTO user_brutal_unlocks (user_id, hsk_level, unlocked_at) SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM user_brutal_correct_sentences WHERE user_id = ? AND hsk_level = ?) >= ?').bind(user.id, sentence.hsk_level, now, user.id, sentence.hsk_level, brutalUnlockSentences).run()
    return Response.json({ user: await publicUser(user, env) })
  }

  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    const id = sessionId(request)
    if (id) await env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?').bind(id).run()
    const headers = new Headers()
    headers.append('set-cookie', makeCookie(session, '', 0, secureCookies))
    headers.append('set-cookie', makeCookie(legacySession, '', 0, secureCookies))
    return new Response(null, { status: 204, headers })
  }

  if (url.pathname === '/api/auth/profile' && request.method === 'PATCH') {
    const user = await currentUser(request, env)
    if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
    const body = await request.json().catch(() => null) as { displayName?: unknown; selfAssessedHskLevel?: unknown; sessionDurationMinutes?: unknown } | null
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim().replace(/\s+/g, ' ') : ''
    const selfAssessedHskLevel = typeof body?.selfAssessedHskLevel === 'string' && ['0', '1', '2', '3', '4', '5', '6'].includes(body.selfAssessedHskLevel) ? body.selfAssessedHskLevel : null
    const sessionDurationMinutes = typeof body?.sessionDurationMinutes === 'number' && [5, 10, 15, 20, 30].includes(body.sessionDurationMinutes) ? body.sessionDurationMinutes : null
    if (displayName.length > 64) return Response.json({ error: 'Use no máximo 64 caracteres.' }, { status: 400 })
    if (body?.sessionDurationMinutes !== undefined && sessionDurationMinutes === null) return Response.json({ error: 'Escolha uma duração de sessão válida.' }, { status: 400 })
    const now = new Date().toISOString()
    // A new level starts a new count towards the next suggestion.
    const since = selfAssessedHskLevel !== null && selfAssessedHskLevel !== user.self_assessed_hsk_level ? now : user.study_suggestion_since
    // "Nível que você acredita ter" raised by hand is a jump too (the first sign-up, with no level yet, is not).
    const placement = selfAssessedHskLevel !== null && user.self_assessed_hsk_level !== null && selfAssessedHskLevel !== user.self_assessed_hsk_level ? placementAfter(user, { level: selfAssessedHskLevel, difficulty: user.study_difficulty }, null) : user.placement_level
    await env.DB.prepare('UPDATE users SET display_name = ?, self_assessed_hsk_level = COALESCE(?, self_assessed_hsk_level), session_duration_minutes = COALESCE(?, session_duration_minutes), placement_level = ?, study_suggestion_since = ?, updated_at = ? WHERE id = ?').bind(displayName || null, selfAssessedHskLevel, sessionDurationMinutes, placement, since, now, user.id).run()
    return Response.json({ user: await publicUser({ ...user, display_name: displayName || null, self_assessed_hsk_level: selfAssessedHskLevel ?? user.self_assessed_hsk_level, session_duration_minutes: sessionDurationMinutes ?? user.session_duration_minutes, placement_level: placement, study_suggestion_since: since }, env) })
  }

  if (url.pathname === '/api/study-sessions' && request.method === 'POST') {
    const user = await currentUser(request, env)
    if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
    const body = await request.json().catch(() => null) as { plannedDurationMinutes?: unknown; activity?: { requestId?: unknown; moduleId?: unknown; objective?: unknown; mode?: unknown; contentIds?: unknown } } | null
    const plannedDurationMinutes = typeof body?.plannedDurationMinutes === 'number' && [5, 10, 15, 20, 30].includes(body.plannedDurationMinutes) ? body.plannedDurationMinutes : null
    const activity = body?.activity
    const contentIds = Array.isArray(activity?.contentIds) && activity.contentIds.every((id) => typeof id === 'string') ? activity.contentIds : null
    if (plannedDurationMinutes === null || !activity || typeof activity.requestId !== 'string' || typeof activity.moduleId !== 'string' || typeof activity.objective !== 'string' || typeof activity.mode !== 'string' || contentIds === null) return Response.json({ error: 'Dados da sessão inválidos.' }, { status: 400 })
    const id = crypto.randomUUID()
    const startedAt = new Date().toISOString()
    const activityJson = JSON.stringify({ requestId: activity.requestId, moduleId: activity.moduleId, objective: activity.objective, mode: activity.mode, contentIds })
    await env.DB.prepare('INSERT INTO user_study_session_logs (id, user_id, planned_duration_minutes, activity_json, started_at, difficulty, hsk_level) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, user.id, plannedDurationMinutes, activityJson, startedAt, user.study_difficulty, user.self_assessed_hsk_level ?? '1').run()
    return Response.json({ id, startedAt })
  }

  const completeStudySession = /^\/api\/study-sessions\/([0-9a-f-]{36})\/complete$/i.exec(url.pathname)
  if (completeStudySession && request.method === 'POST') {
    const user = await currentUser(request, env)
    if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
    const body = await request.json().catch(() => null) as { answersCorrect?: unknown; answersTotal?: unknown } | null
    const total = Number.isInteger(body?.answersTotal) && (body?.answersTotal as number) >= 0 && (body?.answersTotal as number) <= 10_000 ? body?.answersTotal as number : null
    const correct = total !== null && Number.isInteger(body?.answersCorrect) && (body?.answersCorrect as number) >= 0 && (body?.answersCorrect as number) <= total ? body?.answersCorrect as number : null
    await env.DB.prepare('UPDATE user_study_session_logs SET completed_at = COALESCE(completed_at, ?), answers_total = COALESCE(answers_total, ?), answers_correct = COALESCE(answers_correct, ?) WHERE id = ? AND user_id = ?').bind(new Date().toISOString(), correct === null ? null : total, correct, completeStudySession[1], user.id).run()
    return new Response(null, { status: 204 })
  }

  if (url.pathname === '/api/auth/activity' && request.method === 'POST') {
    const user = await currentUser(request, env)
    if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
    const body = await request.json().catch(() => null) as { module?: unknown } | null
    const module = typeof body?.module === 'string' && ['home', 'progress', 'readings', 'flashcards', 'writing', 'quiz', 'multiplayer', 'admin', 'profile'].includes(body.module) ? body.module : null
    if (!module) return Response.json({ error: 'Módulo inválido.' }, { status: 400 })
    const now = new Date().toISOString()
    if (user.last_seen_at?.slice(0, 10) === now.slice(0, 10)) await env.DB.prepare('UPDATE users SET last_module = ? WHERE id = ?').bind(module, user.id).run()
    else await env.DB.prepare('UPDATE users SET last_module = ?, last_seen_at = ? WHERE id = ?').bind(module, now, user.id).run()
    return new Response(null, { status: 204 })
  }

  if (url.pathname === '/api/auth/admin/users' && request.method === 'GET') {
    const requester = await currentUser(request, env)
    if (!requester || requester.role !== 'admin') return Response.json({ error: 'Acesso restrito a administradores.' }, { status: 403 })
    const { results } = await env.DB.prepare('SELECT id, email, role, created_at, last_login_at, last_seen_at, last_module FROM users ORDER BY COALESCE(last_seen_at, created_at) DESC').all()
    return Response.json({ users: results })
  }

  const teacherProfile = /^\/api\/auth\/admin\/users\/([0-9a-f-]{36})\/teacher$/i.exec(url.pathname)
  if (teacherProfile && request.method === 'PATCH') {
    const requester = await currentUser(request, env)
    if (!requester || requester.role !== 'admin') return Response.json({ error: 'Acesso restrito a administradores.' }, { status: 403 })
    const body = await request.json().catch(() => null) as { enabled?: unknown } | null
    if (typeof body?.enabled !== 'boolean') return Response.json({ error: 'Informe se o acesso de professor será habilitado.' }, { status: 400 })
    if (body.enabled) await env.DB.prepare('INSERT OR IGNORE INTO teacher_profiles (user_id, created_at, updated_at) VALUES (?, ?, ?)').bind(teacherProfile[1], new Date().toISOString(), new Date().toISOString()).run()
    else await env.DB.prepare('DELETE FROM teacher_profiles WHERE user_id = ?').bind(teacherProfile[1]).run()
    return new Response(null, { status: 204 })
  }

  if (url.pathname === '/api/auth/password' && request.method === 'POST') {
    const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    // Google does not accept a plain HTTP callback on a LAN IP. Keep this
    // escape hatch strictly scoped to a local development origin, including a
    // phone opening the app through the computer's private network address.
    const localDevelopmentLogin = isLocalDevelopmentOrigin(url)
    const configuredEmail = localDevelopmentLogin ? (env.ADMIN_EMAIL ?? '').trim().toLowerCase() : temporaryLoginEmail(env)
    const configuredPassword = localDevelopmentLogin ? '123' : (env.TEMP_LOGIN_PASSWORD ?? '')
    if (!configuredEmail || !configuredPassword || email !== configuredEmail || !(await matchesTemporaryPassword(password, configuredPassword))) return Response.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 })
    const user = await upsertUser(email, env)
    return Response.json({ user: { email, role: user.role }, temporary: true }, { headers: { 'set-cookie': await createSession(user.id, env, secureCookies), 'cache-control': 'no-store' } })
  }

  if (url.pathname === '/api/auth/google' && request.method === 'GET') {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return Response.json({ error: 'Google login is not configured.' }, { status: 503 })
    const state = crypto.randomUUID()
    const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authorizationUrl.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: googleCallback(url),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    }).toString()
    return redirect(authorizationUrl.toString(), new Headers({ 'set-cookie': makeCookie(googleState, state, 600, secureCookies) }))
  }

  if (url.pathname === '/api/auth/google/callback' && request.method === 'GET') {
    const state = url.searchParams.get('state')
    const expectedState = getCookies(request).get(googleState)
    const clearState = makeCookie(googleState, '', 0, secureCookies)
    if (!state || !expectedState || state !== expectedState) return redirect(new URL('/app?auth_error=state', url.origin).toString(), new Headers({ 'set-cookie': clearState }))
    if (url.searchParams.has('error')) return redirect(new URL('/app?auth_error=denied', url.origin).toString(), new Headers({ 'set-cookie': clearState }))

    const code = url.searchParams.get('code')
    if (!code || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return redirect(new URL('/app?auth_error=configuration', url.origin).toString(), new Headers({ 'set-cookie': clearState }))
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: googleCallback(url), grant_type: 'authorization_code' }),
    })
    const tokens = await tokenResponse.json().catch(() => null) as { access_token?: string } | null
    if (!tokenResponse.ok || !tokens?.access_token) return redirect(new URL('/app?auth_error=token', url.origin).toString(), new Headers({ 'set-cookie': clearState }))

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tokens.access_token}` } })
    const profile = await profileResponse.json().catch(() => null) as { email?: string; email_verified?: boolean } | null
    const email = profile?.email?.trim().toLowerCase() ?? ''
    if (!profileResponse.ok || !profile?.email_verified || !/^\S+@\S+\.\S+$/.test(email)) return redirect(new URL('/app?auth_error=profile', url.origin).toString(), new Headers({ 'set-cookie': clearState }))
    const allowedEmails = allowedGoogleEmails(env)
    if (allowedEmails.size && !allowedEmails.has(email)) return redirect(new URL('/app?auth_error=unauthorized', url.origin).toString(), new Headers({ 'set-cookie': clearState }))

    const user = await upsertUser(email, env)
    // Keep the short-lived state cookie until it expires. Sending only the
    // session cookie avoids local dev servers combining two Set-Cookie values.
    return redirect(new URL('/app', url.origin).toString(), new Headers({ 'set-cookie': await createSession(user.id, env, secureCookies) }))
  }

  return Response.json({ error: 'Rota não encontrada.' }, { status: 404 })
}
