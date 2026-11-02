import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, Flame, Gamepad2, Layers3, PenLine, Play, type LucideIcon } from 'lucide-react'

type HomeSection = 'flashcards' | 'games' | 'readings' | 'writing'

// Values the English workspace does not track yet (streak, spaced repetition, session plan) render as this placeholder.
const pending = '—'

function greetingFor(hour: number) {
  if (hour < 12) return { english: 'Good morning', text: 'Bom dia' }
  if (hour < 18) return { english: 'Good afternoon', text: 'Boa tarde' }
  return { english: 'Good evening', text: 'Boa noite' }
}

function newYorkNow() {
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long' }).formatToParts(new Date())
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return { time: `${value('hour')}:${value('minute')}`, weekday: value('weekday'), greeting: greetingFor(Number(value('hour'))) }
}

function NewYorkClock() {
  const [now, setNow] = useState(newYorkNow)
  useEffect(() => {
    const interval = window.setInterval(() => setNow(newYorkNow()), 15_000)
    return () => window.clearInterval(interval)
  }, [])
  return (
    <section className="today-beijing" aria-label={`Agora em Nova York: ${now.time}, ${now.greeting.text}`}>
      <div className="today-beijing-time">
        <small><span lang="en">New York</span> · Nova York</small>
        <strong>{now.time}</strong>
        <small>{now.weekday}</small>
      </div>
      <div className="today-beijing-greeting">
        <strong lang="en">{now.greeting.english}</strong>
        <small>{now.greeting.text} de Nova York</small>
      </div>
    </section>
  )
}

const shortcuts: { section: HomeSection; label: string; Icon: LucideIcon; tone: string }[] = [
  { section: 'flashcards', label: 'Flashcards', Icon: Layers3, tone: 'accent' },
  { section: 'games', label: 'Jogos', Icon: Gamepad2, tone: 'gold' },
  { section: 'readings', label: 'Leitura', Icon: BookOpen, tone: 'ok' },
  { section: 'writing', label: 'Escrita', Icon: PenLine, tone: 'info' },
]

export default function EnglishHome({ cefrLevel, onChangeLevel, onOpenSection }: { cefrLevel: string | null; onChangeLevel: () => void; onOpenSection: (section: HomeSection) => void }) {
  const [greeting] = useState(() => greetingFor(new Date().getHours()))
  return (
    <div className="niorb-today">
      <header className="today-greeting">
        <div>
          <p><span lang="en">{greeting.english}</span> · {greeting.text}</p>
          <h1>Vamos estudar?</h1>
        </div>
        <span className="today-streak" aria-label="Dias seguidos de estudo">
          <Flame aria-hidden="true" size={20} strokeWidth={2.25} />
          {pending} dias
        </span>
      </header>

      <NewYorkClock />

      <section className="today-session" aria-labelledby="today-session-title">
        <header>
          <p id="today-session-title">SUA SESSÃO DE HOJE</p>
          <button type="button" onClick={() => onOpenSection('flashcards')} aria-label="Iniciar sessão">
            <Play aria-hidden="true" size={18} strokeWidth={2.25} />
          </button>
        </header>
        <div className="today-session-main">
          <div>
            <em>{pending} min</em>
            <span>{pending} atividades · <button type="button" className="today-session-level" onClick={onChangeLevel} aria-label={cefrLevel ? `Nível ${cefrLevel}. Mudar nível` : 'Escolher nível'}>{cefrLevel ?? pending}</button></span>
          </div>
        </div>
      </section>

      <button type="button" className="today-review" onClick={() => onOpenSection('flashcards')}>
        <span>
          <strong>Revisar {pending} cartões</strong>
          <small>Cerca de {pending} min · repetição espaçada</small>
        </span>
        <ArrowRight aria-hidden="true" size={20} strokeWidth={2.25} />
      </button>

      <nav className="today-shortcuts" aria-label="Atalhos de estudo">
        {shortcuts.map(({ section, label, Icon, tone }) => (
          <button type="button" key={section} className={`tone-${tone}`} onClick={() => onOpenSection(section)}>
            <Icon aria-hidden="true" size={24} strokeWidth={2} />
            <strong>{label}</strong>
          </button>
        ))}
      </nav>
    </div>
  )
}
