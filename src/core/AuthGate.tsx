import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import AppShell from './AppShell'
import PublicSite from './PublicSite'
import { clearCachedUser, loadCachedUser, saveCachedUser } from './offline'

type User = { email: string; role: 'admin' | 'user' }

export default function AuthGate() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    void fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível validar a sessão.')
        const currentUser = (await response.json() as { user: User | null }).user
        if (currentUser) saveCachedUser(currentUser)
        else clearCachedUser()
        setUser(currentUser)
      })
      .catch(() => setUser(loadCachedUser()))
  }, [])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSending(true)
    setError('')
    try {
      const response = await fetch('/api/auth/pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, pin }),
      })
      const body = await response.json() as { error?: string; user?: User }
      if (!response.ok || !body.user) throw new Error(body.error ?? 'Não foi possível entrar.')
      saveCachedUser(body.user)
      setUser(body.user)
      setPin('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível entrar.')
    } finally {
      setSending(false)
    }
  }

  if (window.location.pathname === '/') return <PublicSite />
  if (window.location.pathname === '/privacidade') return <PublicSite privacy />
  if (window.location.pathname === '/termos') return <PublicSite terms />
  if (user === undefined) return <main className="auth-page"><p>Preparando seu espaço…</p></main>
  if (!user) return <main className="auth-page"><section><a className="brand" href="/">orb<span>e</span></a><p className="eyebrow">ACESSO BETA</p><h1>Entre para continuar.</h1><p>Use seu e-mail e o PIN compartilhado para acessar seu espaço de estudo.</p><form className="pin-login" onSubmit={signIn}><label>E-mail<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>PIN<input type="password" inputMode="numeric" autoComplete="one-time-code" value={pin} onChange={(event) => setPin(event.target.value)} required /></label>{error && <p className="auth-error" role="alert">{error}</p>}<button className="google-login" disabled={sending}>{sending ? 'Entrando…' : 'Entrar'}</button></form></section></main>
  return <AppShell />
}
