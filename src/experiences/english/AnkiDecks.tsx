import { useState } from 'react'

/** Contract of GET /api/english/decks (worker/modules/english/decks.ts). */
export type EnglishDeck = { id: string; name: string; visibility: 'private' | 'public'; mine: boolean; card_count: number; created_at: string }
type Visibility = EnglishDeck['visibility']

const unreadable = 'Não foi possível ler este arquivo do Anki.'
const noCards = 'Este baralho não tem cartões de texto.'
const visibilityOptions: { value: Visibility; label: string }[] = [{ value: 'private', label: 'Só eu' }, { value: 'public', label: 'Todos' }]

async function errorOf(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null
  return body?.error ?? fallback
}

/**
 * Import of Anki decks (.apkg) and the list of the learner's decks. The file is
 * read in the browser; the deck is private ("Só eu") unless the owner picks "Todos".
 */
export default function AnkiDecks({ decks, onDecksChange }: { decks: EnglishDeck[]; onDecksChange: (decks: EnglishDeck[]) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('private')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function chooseFile(next: File | null) {
    setFile(next); setMessage(''); setError('')
    if (next) setName(next.name.replace(/\.apkg$/i, ''))
  }

  async function importDeck() {
    if (!file) return
    setBusy(true); setMessage(''); setError('')
    try {
      const { readAnkiPackage } = await import('./anki-import')
      const deck = await readAnkiPackage(file).catch(() => { throw new Error(unreadable) })
      if (!deck.cards.length) throw new Error(noCards)
      const response = await fetch('/api/english/decks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name.trim() || deck.name || file.name, visibility, cards: deck.cards }) })
      if (!response.ok) throw new Error(await errorOf(response, unreadable))
      const created = await response.json() as EnglishDeck
      onDecksChange([created, ...decks])
      setMessage(`${created.card_count} cartões importados.`)
      setFile(null); setName('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : unreadable)
    } finally {
      setBusy(false)
    }
  }

  async function changeVisibility(deck: EnglishDeck, next: Visibility) {
    setError('')
    const response = await fetch(`/api/english/decks/${deck.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visibility: next }) })
    if (!response.ok) { setError(await errorOf(response, unreadable)); return }
    onDecksChange(decks.map((item) => item.id === deck.id ? { ...item, visibility: next } : item))
  }

  async function removeDeck(deck: EnglishDeck) {
    if (!window.confirm('Excluir este baralho?')) return
    setError('')
    const response = await fetch(`/api/english/decks/${deck.id}`, { method: 'DELETE' })
    if (!response.ok) { setError(await errorOf(response, unreadable)); return }
    onDecksChange(decks.filter((item) => item.id !== deck.id))
  }

  return <section className="bulk-card-add anki-decks" aria-labelledby="anki-decks-title">
    <div><p className="eyebrow">IMPORTAR DO ANKI</p><h2 id="anki-decks-title">Seus baralhos do Anki</h2><p>Envie um arquivo .apkg exportado do Anki.</p></div>
    <div className="bulk-card-controls">
      <label>Arquivo .apkg<input type="file" accept=".apkg" disabled={busy} onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} /></label>
      <label>Nome do baralho<input value={name} maxLength={120} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      <div role="group" aria-label="Quem pode ver" className="anki-visibility"><span>Quem pode ver</span>{visibilityOptions.map(({ value, label }) => <button type="button" key={value} className={visibility === value ? '' : 'secondary'} aria-pressed={visibility === value} disabled={busy} onClick={() => setVisibility(value)}>{label}</button>)}</div>
      <button type="button" onClick={() => void importDeck()} disabled={!file || busy}>Importar baralho</button>
    </div>
    {message && <p className="bulk-card-status" role="status">{message}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {decks.length > 0 && <ul className="anki-deck-list">{decks.map((deck) => <li key={deck.id}>
      <span><strong>{deck.name}</strong> · {deck.card_count} cartões</span>
      {deck.mine && <span className="anki-deck-actions">
        <span role="group" aria-label="Quem pode ver" className="anki-visibility">{visibilityOptions.map(({ value, label }) => <button type="button" key={value} className={deck.visibility === value ? '' : 'secondary'} aria-pressed={deck.visibility === value} onClick={() => void changeVisibility(deck, value)}>{label}</button>)}</span>
        <button type="button" className="secondary" onClick={() => void removeDeck(deck)}>Excluir</button>
      </span>}
    </li>)}</ul>}
  </section>
}
