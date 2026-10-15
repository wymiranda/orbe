import { handleReadingsRequest } from './modules/readings/handler.js'
import { handleStudyRequest } from './modules/study/handler.js'
import { handleChineseRequest } from './modules/chinese/handler.js'
import { currentUser, handleAuth } from './auth.js'

type Env = {
  DB: D1Database
  ASSETS: Fetcher
  ADMIN_EMAIL?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/health') {
      return Response.json({ status: 'ok' })
    }

    const authResponse = await handleAuth(request, env)
    if (authResponse) return authResponse

    if (url.pathname.startsWith('/api/')) {
      const user = await currentUser(request, env)
      if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
      const adminRoute = url.pathname.startsWith('/api/chinese/curation') || url.pathname === '/api/chinese/vocabulary/import' || (url.pathname.startsWith('/api/readings') && request.method !== 'GET')
      if (adminRoute && user.role !== 'admin') return Response.json({ error: 'Acesso restrito a administradores.' }, { status: 403 })
    }

    const moduleResponse = await handleReadingsRequest(request, env)
    if (moduleResponse) return moduleResponse

    const studyResponse = await handleStudyRequest(request, env)
    if (studyResponse) return studyResponse

    const chineseResponse = await handleChineseRequest(request, env)
    if (chineseResponse) return chineseResponse

    if (url.pathname.startsWith('/api/')) return Response.json({ error: 'Rota não encontrada.' }, { status: 404 })
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
