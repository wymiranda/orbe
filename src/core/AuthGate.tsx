import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, BookOpenCheck, ChevronDown, EyeOff, Globe2, LockKeyhole, Mail } from 'lucide-react'
import AppShell from './AppShell'
import { claimDeviceStorage, clearCachedUser, loadCachedUser, saveCachedUser } from './offline'
import { moduleRegistry } from './module-registry'

type User = { email: string; role: 'admin' | 'user'; is_teacher?: boolean }
const PublicSite = lazy(() => import('./PublicSite'))
const workspaceStorageKey = 'niorb:last-workspace:v1'

const validWorkspace = (workspaceId: string | null) => workspaceId && moduleRegistry.some((module) => module.id === workspaceId && module.kind === 'experience' && module.enabledByDefault) ? workspaceId : null

/**
 * Each browser tab keeps its own workspace (sessionStorage survives a reload of
 * that tab only), so several tabs can show different workspaces. The last choice
 * made in any tab is only the default for a new tab.
 */
function loadWorkspace() {
  try {
    return validWorkspace(sessionStorage.getItem(workspaceStorageKey)) ?? validWorkspace(localStorage.getItem(workspaceStorageKey))
  } catch { return null }
}

function saveWorkspace(workspaceId: string) {
  try {
    sessionStorage.setItem(workspaceStorageKey, workspaceId)
    localStorage.setItem(workspaceStorageKey, workspaceId)
  } catch { /* the choice still applies until this tab is reloaded */ }
}

/** Windows does not draw flag emoji (it shows "CN"/"US"), so the flag is an image; the emoji remains if the image fails. */
function WorkspaceFlag({ chinese }: { chinese: boolean }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <i className="workspace-picker-flag" aria-hidden="true">{chinese ? '🇨🇳' : '🇺🇸'}</i>
  return <img className="workspace-picker-flag" src={chinese ? '/images/flags/cn.svg' : '/images/flags/us.svg'} width="24" height="16" alt="" aria-hidden="true" onError={() => setFailed(true)} />
}

const googleAuthErrors: Record<string, string> = {
  state: 'A validação de segurança do login expirou. Tente novamente.',
  denied: 'O login com Google foi cancelado.',
  configuration: 'A configuração local do Google está incompleta.',
  token: 'O Google recusou a troca do código de login. Verifique o Client ID, o secret e a URI de retorno.',
  profile: 'Não foi possível confirmar o e-mail desta conta Google.',
  unauthorized: 'Esta conta Google não tem acesso ao niorb.',
}

export default function AuthGate() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [submittingPassword, setSubmittingPassword] = useState(false)
  const [workspaceId, setWorkspaceId] = useState<string | null>(loadWorkspace)
  const authError = new URLSearchParams(window.location.search).get('auth_error')
  const googleLoginUrl = `/api/auth/google?start=${Date.now()}`

  useEffect(() => {
    void fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível validar a sessão.')
        const currentUser = (await response.json() as { user: User | null }).user
        if (currentUser) { await claimDeviceStorage(currentUser.email); saveCachedUser(currentUser) }
        else clearCachedUser()
        return currentUser
      })
      .then(setUser, () => setUser(loadCachedUser()))
  }, [])

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    clearCachedUser()
    localStorage.removeItem(workspaceStorageKey)
    sessionStorage.removeItem(workspaceStorageKey)
    setUser(null); setWorkspaceId(null)
    window.history.replaceState(null, '', '/app')
  }

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPasswordError(''); setSubmittingPassword(true)
    try {
      const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
      const payload = await response.json() as { user?: User; error?: string }
      if (!response.ok || !payload.user) throw new Error(payload.error ?? 'Não foi possível entrar.')
      await claimDeviceStorage(payload.user.email); saveCachedUser(payload.user); setUser(payload.user); setPassword(''); window.history.replaceState(null, '', '/app')
    } catch (cause) { setPasswordError(cause instanceof Error ? cause.message : 'Não foi possível entrar.') } finally { setSubmittingPassword(false) }
  }

  if (window.location.pathname === '/') {
    window.location.replace('/app')
    return null
  }
  if (window.location.pathname === '/privacidade') return <Suspense fallback={null}><PublicSite privacy /></Suspense>
  if (window.location.pathname === '/termos') return <Suspense fallback={null}><PublicSite terms /></Suspense>
  if (window.location.pathname === '/politicas') return <Suspense fallback={null}><PublicSite page="policies" /></Suspense>
  if (window.location.pathname === '/politicas/litra') return <Suspense fallback={null}><PublicSite page="litra" /></Suspense>
  if (user === undefined) return <main className="auth-page"><p>Preparando seu espaço…</p></main>
  if (!user) return <main className="auth-page auth-page--split auth-login">
    <aside className="auth-login-visual">
      <a className="auth-login-brand" href="/" aria-label="niorb, início">niorb</a>
      <div className="auth-login-illustration"><img src="/images/login-language-world.webp" width="720" height="483" decoding="async" alt="Planeta em papercut cercado por idiomas" /></div>
      <div className="auth-login-copy"><h1>Línguas para um mundo mais próximo.</h1></div>
    </aside>
    <section className="auth-login-panel">
      <button className="auth-login-language" type="button"><Globe2 aria-hidden="true" />Português (BR)<ChevronDown aria-hidden="true" /></button>
      <div className="auth-login-form">
        <p className="eyebrow">BEM-VINDO AO NIORB</p><h2>Entre para continuar.</h2><p className="auth-lead">Acesse sua conta e retome seus estudos em qualquer idioma.</p>
        <a className="google-login" href={googleLoginUrl}><span className="google-mark" aria-hidden="true">G</span>Entrar com Google</a>
        <div className="auth-divider"><span>ou</span></div>
        <form className="password-login" onSubmit={(event) => void signInWithPassword(event)}>
          <label>E-mail<span className="auth-input"><Mail aria-hidden="true" /><input type="email" autoComplete="username" placeholder="seu@email.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></span></label>
          <label>Senha<span className="auth-input"><LockKeyhole aria-hidden="true" /><input type="password" autoComplete="current-password" placeholder="Sua senha" value={password} onChange={(event) => setPassword(event.target.value)} required /><EyeOff aria-hidden="true" /></span></label>
          <button type="submit" disabled={submittingPassword}>{submittingPassword ? 'Entrando…' : <>Entrar com e-mail <ArrowRight aria-hidden="true" /></>}</button>{passwordError && <p className="auth-error" role="alert">{passwordError}</p>}
        </form>
        {authError && <p className="auth-error" role="alert">{googleAuthErrors[authError] ?? 'Não foi possível concluir o login com Google. Tente novamente.'}</p>}
      </div>
    </section>
  </main>
  if (!workspaceId) return <main className="workspace-picker-page"><section className="workspace-picker"><a className="workspace-picker-brand" href="/">niorb</a><p className="eyebrow">SELECIONE SEU WORKSPACE</p><h1>Em que língua você quer entrar?</h1><div className="workspace-picker-options">{moduleRegistry.filter((module) => module.kind === 'experience' && module.enabledByDefault && (!module.requiresTeacher || user.is_teacher)).sort((left, right) => Number(Boolean(right.requiresTeacher)) - Number(Boolean(left.requiresTeacher))).map((module) => <button key={module.id} type="button" onClick={() => { saveWorkspace(module.id); setWorkspaceId(module.id) }}>{module.id === 'teacher' ? <BookOpenCheck aria-hidden="true" /> : <WorkspaceFlag chinese={module.id === 'chinese'} />}<span><strong>{module.name}</strong><small>Entrar no workspace</small></span><ArrowRight aria-hidden="true" /></button>)}</div><button className="workspace-picker-signout" type="button" onClick={() => void signOut()}>Sair</button></section></main>
  return <AppShell onChooseWorkspace={() => setWorkspaceId(null)} onLogout={() => void signOut()} workspaceId={workspaceId} isTeacher={Boolean(user.is_teacher)} />
}
