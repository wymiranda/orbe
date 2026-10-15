import { useEffect, useState } from 'react'

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function InstallOrbeButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const capturePrompt = (event: Event) => { event.preventDefault(); setPromptEvent(event as InstallPromptEvent) }
    const markInstalled = () => { setInstalled(true); setPromptEvent(null) }
    window.addEventListener('beforeinstallprompt', capturePrompt)
    window.addEventListener('appinstalled', markInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', capturePrompt); window.removeEventListener('appinstalled', markInstalled) }
  }, [])

  async function install() {
    if (isIos()) return setShowIosHelp((current) => !current)
    if (!promptEvent) return
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setPromptEvent(null)
  }

  const ios = isIos()

  if (installed || window.matchMedia('(display-mode: standalone)').matches || (!ios && !promptEvent)) return null
  return <div className="install-orbe"><button type="button" className="secondary" onClick={() => void install()}>Instalar Orbe</button>{showIosHelp && <p>No Safari, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</p>}</div>
}

export default InstallOrbeButton
