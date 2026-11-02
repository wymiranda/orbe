import { Suspense, useEffect, useState } from 'react'
import { moduleRegistry } from './module-registry'

function AppShell({ onChooseWorkspace, onLogout, workspaceId, isTeacher = false }: { onChooseWorkspace: () => void; onLogout: () => void; workspaceId?: string; isTeacher?: boolean }) {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  const enabledModules = moduleRegistry.filter((module) => module.enabledByDefault && (!module.requiresTeacher || isTeacher))
  const navigationEntries = enabledModules.filter((module) => module.exposedInNavigation)
  const activeModule = navigationEntries.find((module) => module.id === workspaceId) ?? navigationEntries[0] ?? enabledModules[0]

  if (!activeModule) return <main>Nenhum módulo habilitado.</main>

  const ActiveModule = activeModule.component
  return <>{!online && <p className="offline-notice" role="status">Modo offline: conteúdo já aberto e seu progresso local continuam disponíveis.</p>}<Suspense fallback={<main className="app-loading" aria-busy="true" />}><ActiveModule onChooseWorkspace={onChooseWorkspace} onLogout={onLogout} /></Suspense></>
}

export default AppShell
