export type User = { id: string; email: string; role: 'admin' | 'user' }
export type AuthEnv = { DB: D1Database; BETA_ACCESS_PIN?: string; ADMIN_EMAIL?: string }

const session = 'orbe_session'
const getCookies = (request: Request) => new Map<string, string>((request.headers.get('cookie') ?? '').split(';').map((part) => {
  const [name, value = ''] = part.trim().split(/=(.*)/s, 2)
  return [name, value] as [string, string]
}).filter(([name]) => name))

const makeCookie = (name: string, value: string, maxAge: number, secure: boolean) => `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`

export async function currentUser(request: Request, env: AuthEnv) {
  const id = getCookies(request).get(session)
  if (!id) return null
  return env.DB.prepare('SELECT users.id, users.email, users.role FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id WHERE auth_sessions.id = ? AND auth_sessions.expires_at > ?').bind(id, new Date().toISOString()).first<User>()
}

async function createSession(userId: string, env: AuthEnv, secure: boolean) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await env.DB.prepare('INSERT INTO auth_sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(id, userId, new Date(Date.now() + 2592e6).toISOString(), now).run()
  return makeCookie(session, id, 2592e3, secure)
}

export async function handleAuth(request: Request, env: AuthEnv): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/auth/')) return null
  const secureCookies = url.protocol === 'https:'

  if (url.pathname === '/api/auth/me') return Response.json({ user: await currentUser(request, env) })

  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    const id = getCookies(request).get(session)
    if (id) await env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?').bind(id).run()
    return new Response(null, { status: 204, headers: { 'set-cookie': makeCookie(session, '', 0, secureCookies) } })
  }

  if (url.pathname === '/api/auth/pin' && request.method === 'POST') {
    if (!env.BETA_ACCESS_PIN) return Response.json({ error: 'O PIN de acesso ainda não foi configurado.' }, { status: 503 })
    const body = await request.json<{ email?: string; pin?: string }>().catch(() => null)
    const email = body?.email?.trim().toLowerCase() ?? ''
    if (!/^\S+@\S+\.\S+$/.test(email) || !body?.pin) return Response.json({ error: 'Informe um e-mail válido e o PIN.' }, { status: 400 })
    if (body.pin !== env.BETA_ACCESS_PIN) return Response.json({ error: 'PIN incorreto.' }, { status: 401 })

    const now = new Date().toISOString()
    const role = email === (env.ADMIN_EMAIL ?? '').toLowerCase() ? 'admin' : 'user'
    let user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>()
    if (user) await env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').bind(role, now, user.id).run()
    else {
      user = { id: crypto.randomUUID() }
      await env.DB.prepare('INSERT INTO users (id, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(user.id, email, role, now, now).run()
    }

    return Response.json({ user: { email, role }, ok: true }, { headers: { 'set-cookie': await createSession(user.id, env, secureCookies) } })
  }

  return Response.json({ error: 'Rota não encontrada.' }, { status: 404 })
}
