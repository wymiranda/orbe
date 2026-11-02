import { currentUser } from '../../auth.js'

export type MediaEnv = { DB: D1Database; MEDIA: R2Bucket }

type MediaAsset = { id: string; filename: string; content_type: string; byte_size: number; created_at: string; links: number }

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])
const maxImageBytes = 2 * 1024 * 1024

function publicAsset(asset: MediaAsset) { return { ...asset, url: `/api/media/images/${encodeURIComponent(asset.id)}/file` } }

export async function handleMediaRequest(request: Request, env: MediaEnv): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/media/images')) return null

  const fileMatch = /^\/api\/media\/images\/([0-9a-f-]{36})\/file$/i.exec(url.pathname)
  if (fileMatch && request.method === 'GET') {
    const asset = await env.DB.prepare('SELECT id, storage_key, content_type FROM media_assets WHERE id = ?').bind(fileMatch[1]).first<{ id: string; storage_key: string; content_type: string }>()
    if (!asset) return Response.json({ error: 'Imagem não encontrada.' }, { status: 404 })
    const object = await env.MEDIA.get(asset.storage_key)
    if (!object) return Response.json({ error: 'Arquivo da imagem não encontrado.' }, { status: 404 })
    return new Response(object.body, { headers: { 'content-type': object.httpMetadata?.contentType ?? asset.content_type, 'cache-control': 'private, max-age=31536000, immutable', etag: object.httpEtag } })
  }

  if (url.pathname === '/api/media/images' && request.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT media_assets.id, media_assets.filename, media_assets.content_type, media_assets.byte_size, media_assets.created_at, COUNT(media_asset_links.asset_id) AS links FROM media_assets LEFT JOIN media_asset_links ON media_asset_links.asset_id = media_assets.id GROUP BY media_assets.id ORDER BY media_assets.created_at DESC`).all<MediaAsset>()
    return Response.json(results.map(publicAsset))
  }

  const user = await currentUser(request, env)
  if (!user || user.role !== 'admin') return Response.json({ error: 'Acesso restrito a administradores.' }, { status: 403 })

  if (url.pathname === '/api/media/images' && request.method === 'POST') {
    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File) || !imageTypes.has(file.type) || file.size > maxImageBytes) return Response.json({ error: 'Envie uma imagem PNG, JPEG, WebP, GIF ou SVG de até 2 MB.' }, { status: 400 })
    const id = crypto.randomUUID()
    const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase().replace(/[^.a-z0-9]/g, '') : ''
    const storageKey = `images/${id}${extension}`
    await env.MEDIA.put(storageKey, file.stream(), { httpMetadata: { contentType: file.type } })
    const asset = { id, filename: file.name || `imagem${extension}`, content_type: file.type, byte_size: file.size, created_at: new Date().toISOString(), links: 0 }
    await env.DB.prepare('INSERT INTO media_assets (id, storage_key, filename, content_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(asset.id, storageKey, asset.filename, asset.content_type, asset.byte_size, asset.created_at).run()
    return Response.json(publicAsset(asset), { status: 201 })
  }

  const deleteMatch = /^\/api\/media\/images\/([0-9a-f-]{36})$/i.exec(url.pathname)
  if (deleteMatch && request.method === 'DELETE') {
    const asset = await env.DB.prepare('SELECT storage_key FROM media_assets WHERE id = ?').bind(deleteMatch[1]).first<{ storage_key: string }>()
    if (!asset) return new Response(null, { status: 204 })
    const linked = await env.DB.prepare('SELECT 1 FROM media_asset_links WHERE asset_id = ? LIMIT 1').bind(deleteMatch[1]).first()
    if (linked) return Response.json({ error: 'Remova os vínculos da imagem antes de apagá-la.' }, { status: 409 })
    await env.MEDIA.delete(asset.storage_key)
    await env.DB.prepare('DELETE FROM media_assets WHERE id = ?').bind(deleteMatch[1]).run()
    return new Response(null, { status: 204 })
  }

  return Response.json({ error: 'Rota não encontrada.' }, { status: 404 })
}

/** Called weekly; files only disappear after all modules have released their links. */
export async function purgeUnlinkedMedia(env: MediaEnv) {
  const { results } = await env.DB.prepare('SELECT id, storage_key FROM media_assets WHERE NOT EXISTS (SELECT 1 FROM media_asset_links WHERE media_asset_links.asset_id = media_assets.id)').all<{ id: string; storage_key: string }>()
  for (const asset of results) {
    await env.MEDIA.delete(asset.storage_key)
    await env.DB.prepare('DELETE FROM media_assets WHERE id = ?').bind(asset.id).run()
  }
}
