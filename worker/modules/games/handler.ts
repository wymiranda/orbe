import { currentUser, type AuthEnv } from '../../auth.js'

type GamesEnv = AuthEnv & { DB: D1Database }

/**
 * Cover image of each game of the Jogar catalogue, chosen by an administrator.
 * Without a setting a game keeps its default picture. "Construam uma frase
 * juntos" keeps the setting it already had, so its saved image carries over.
 */
const coverSettings: Record<string, string> = {
  construa: 'multiplayer.sentence.image_url',
  'bate-olho': 'games.bate-olho.cover_url',
  'ouca-e-monte': 'games.ouca-e-monte.cover_url',
  'solte-a-voz': 'games.solte-a-voz.cover_url',
}

export async function handleGamesRequest(request: Request, env: GamesEnv): Promise<Response | null> {
  const url = new URL(request.url)
  if (url.pathname !== '/api/games/cover-images') return null

  if (request.method === 'GET') {
    try {
      const keys = Object.values(coverSettings)
      const { results } = await env.DB.prepare(`SELECT setting_key, setting_value FROM workspace_settings WHERE setting_key IN (${keys.map(() => '?').join(', ')})`).bind(...keys).all<{ setting_key: string; setting_value: string }>()
      const byKey = new Map(results.map((row) => [row.setting_key, row.setting_value]))
      return Response.json(Object.fromEntries(Object.entries(coverSettings).map(([game, key]) => [game, byKey.get(key) ?? null])))
    } catch (error) {
      // The catalogue stays usable with its default pictures.
      console.error('Unable to load game cover images.', error)
      return Response.json(Object.fromEntries(Object.keys(coverSettings).map((game) => [game, null])))
    }
  }

  if (request.method === 'PUT') {
    const user = await currentUser(request, env)
    if (!user || user.role !== 'admin') return Response.json({ error: 'Acesso restrito a administradores.' }, { status: 403 })
    const body = await request.json().catch(() => null) as { game?: unknown; imageUrl?: unknown } | null
    const key = typeof body?.game === 'string' ? coverSettings[body.game] : undefined
    if (!key) return Response.json({ error: 'Rota não encontrada.' }, { status: 404 })
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
      if (imageUrl) await env.DB.prepare('INSERT INTO workspace_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at').bind(key, imageUrl, new Date().toISOString()).run()
      else await env.DB.prepare('DELETE FROM workspace_settings WHERE setting_key = ?').bind(key).run()
      return Response.json({ imageUrl: imageUrl || null })
    } catch (error) {
      console.error('Unable to save game cover image.', error)
      return Response.json({ error: 'Não foi possível salvar a imagem agora.' }, { status: 500 })
    }
  }

  return null
}
