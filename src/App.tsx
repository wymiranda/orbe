import { useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type Reading = {
  id: number
  title: string
  content: string
}

function App() {
  const [isCreating, setIsCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [readings, setReadings] = useState<Reading[]>([])

  function createReading(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedContent = content.trim()
    if (!trimmedContent) return

    setReadings((current) => [
      {
        id: Date.now(),
        title: title.trim() || 'Sem título',
        content: trimmedContent,
      },
      ...current,
    ])
    setTitle('')
    setContent('')
    setIsCreating(false)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="Orbe, início">
          orb<span>e</span>
        </a>
      </header>

      <section className="welcome" aria-labelledby="welcome-title">
        <p className="eyebrow">LEITURAS</p>
        <h1 id="welcome-title">Seu espaço para ler e lembrar.</h1>
        <p className="intro">
          Guarde um texto, retome uma leitura e crie cards quando uma ideia merecer ficar.
        </p>

        <div className="actions">
          <button type="button" onClick={() => setIsCreating(true)}>Novo texto</button>
          <button type="button" className="secondary" disabled>Salvar link para depois</button>
        </div>

        {isCreating && (
          <form className="new-reading" onSubmit={createReading}>
            <label>
              Título
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Ideias sobre aprendizado" autoFocus />
            </label>
            <label>
              Texto
              <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Escreva ou cole algo que deseja ler..." rows={8} required />
            </label>
            <div className="form-actions">
              <button type="submit">Salvar texto</button>
              <button type="button" className="secondary" onClick={() => setIsCreating(false)}>Cancelar</button>
            </div>
          </form>
        )}

        {readings.length > 0 && (
          <section className="library" aria-labelledby="library-title">
            <h2 id="library-title">Sua biblioteca</h2>
            <ul>
              {readings.map((reading) => (
                <li key={reading.id}>
                  <strong>{reading.title}</strong>
                  <span>{reading.content}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
    </main>
  )
}

export default App
