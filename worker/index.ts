import { handleReadingsRequest } from './modules/readings/handler.js'
import { handleStudyRequest, purgeExpiredStudyProgress } from './modules/study/handler.js'
import { handleChineseRequest } from './modules/chinese/handler.js'
import { handleEnglishRequest } from './modules/english/handler.js'
import { handleMultiplayerRequest, MultiplayerLobby, MultiplayerRoom } from './modules/multiplayer/handler.js'
import { handleEmailRequest } from './modules/email/handler.js'
import { handleMediaRequest, purgeUnlinkedMedia } from './modules/media/handler.js'
import { handleTeachingRequest } from './modules/teaching/handler.js'
import { currentUser, handleAuth } from './auth.js'

type Env = {
  DB: D1Database
	CHINESE_DB: D1Database
	ENGLISH_DB: D1Database
	AI: Ai
  MEDIA: R2Bucket
  ASSETS: Fetcher
  ADMIN_EMAIL?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_ALLOWED_EMAILS?: string
  TEMP_LOGIN_EMAIL?: string
  TEMP_LOGIN_PASSWORD?: string
  BREVO_API_KEY?: string
  EMAIL_FROM?: string
  EMAIL_SENDER_NAME?: string
  EMAIL_REPLY_TO?: string
  MULTIPLAYER_ROOM: DurableObjectNamespace
  MULTIPLAYER_LOBBY: DurableObjectNamespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.hostname.endsWith('.workers.dev') && url.pathname !== '/recuperar-progresso') {
      url.protocol = 'https:'
      url.hostname = 'niorb.com'
      url.port = ''
      return Response.redirect(url.toString(), 308)
    }

    if (url.pathname === '/recuperar-progresso') {
      return env.ASSETS.fetch(request)
    }

    let authenticatedUser: { id: string } | undefined

    if (url.pathname === '/api/health') {
      return Response.json({ status: 'ok' })
    }

    if (url.pathname === '/api/public/contact') {
      const email = (env.EMAIL_REPLY_TO ?? env.EMAIL_FROM ?? '').trim()
      return Response.json({ email }, { headers: { 'cache-control': 'public, max-age=3600' } })
    }

    if (url.pathname === '/') {
      return Response.redirect(new URL('/app', url).toString(), 302)
    }

    const authResponse = await handleAuth(request, env)
    if (authResponse) return authResponse

    if (url.pathname.startsWith('/api/')) {
      const user = await currentUser(request, env)
      if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
      authenticatedUser = { id: user.id }
      const adminRoute = url.pathname.startsWith('/api/media/') || url.pathname.startsWith('/api/chinese/curation') || url.pathname === '/api/chinese/vocabulary/import' || url.pathname === '/api/english/vocabulary/import' || (url.pathname.startsWith('/api/chinese/vocabulary/') && request.method !== 'GET') || (url.pathname.startsWith('/api/chinese/quiz-questions') && request.method !== 'GET') || (url.pathname.startsWith('/api/chinese/hsk-mock-questions') && request.method !== 'GET') || (url.pathname.startsWith('/api/readings') && request.method !== 'GET')
      if (adminRoute && user.role !== 'admin') return Response.json({ error: 'Acesso restrito a administradores.' }, { status: 403 })
    }

    const moduleResponse = await handleReadingsRequest(request, env)
    if (moduleResponse) return moduleResponse

    const studyResponse = await handleStudyRequest(request, env, authenticatedUser)
    if (studyResponse) return studyResponse

    const chineseResponse = await handleChineseRequest(request, env)
    if (chineseResponse) return chineseResponse

    const englishResponse = await handleEnglishRequest(request, env, authenticatedUser)
    if (englishResponse) return englishResponse

    const mediaResponse = await handleMediaRequest(request, env)
    if (mediaResponse) return mediaResponse

    const teachingResponse = await handleTeachingRequest(request, env)
    if (teachingResponse) return teachingResponse

    const multiplayerResponse = await handleMultiplayerRequest(request, env)
    if (multiplayerResponse) return multiplayerResponse

    const emailResponse = await handleEmailRequest(request, env)
    if (emailResponse) return emailResponse

    if (url.pathname.startsWith('/api/')) return Response.json({ error: 'Rota não encontrada.' }, { status: 404 })
    return env.ASSETS.fetch(request)
  },
  async scheduled(_controller: ScheduledController, env: Env) {
    await purgeExpiredStudyProgress(env)
    if (new Date().getUTCDay() === 0) await purgeUnlinkedMedia(env)
  },
} satisfies ExportedHandler<Env>

export { MultiplayerLobby, MultiplayerRoom }
