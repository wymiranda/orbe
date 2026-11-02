import { useState } from 'react'
import { cefrLevels } from './cefr-levels'


export default function LevelOnboarding({ initialLevel, onSave }: { initialLevel: string | null; onSave: (cefrLevel: string) => Promise<void> }) {
  const [cefrLevel, setCefrLevel] = useState(initialLevel ?? 'A1')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSave(cefrLevel)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o nível.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="name-onboarding-backdrop"><section className="name-onboarding" role="dialog" aria-modal="true" aria-labelledby="english-level-title"><h2 id="english-level-title">Em qual nível você quer começar?</h2><p>Você pode mudar isso depois.</p><form onSubmit={submit}><label>Nível<select value={cefrLevel} onChange={(event) => setCefrLevel(event.target.value)} autoFocus>{cefrLevels.map(({ level, name }) => <option key={level} value={level}>{level} · {name}</option>)}</select></label>{error && <p className="name-onboarding-error" role="alert">{error}</p>}<button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Continuar'}</button></form></section></div>
}
