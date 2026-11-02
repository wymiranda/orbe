import { useEffect, useState } from 'react'
import { cefrLevels } from './cefr-levels'
import { ArrowRight, BookOpen, Flame, Gamepad2, Layers3, PenLine, Play, type LucideIcon } from 'lucide-react'

type HomeSection = 'flashcards' | 'games' | 'readings' | 'writing'
export type EnglishStudyDifficulty = 'easy' | 'medium' | 'hard'

// Same choices as the Chinese session card. Difficulty is stored but content is not split by it yet.
const difficulties: { value: EnglishStudyDifficulty; label: string }[] = [{ value: 'easy', label: 'Fácil' }, { value: 'medium', label: 'Médio' }, { value: 'hard', label: 'Difícil' }]

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

// The faded word behind each card plays the part of the hanzi on the Chinese cards (卡 玩 读 写).
const shortcuts: { section: HomeSection; label: string; word: string; Icon: LucideIcon; tone: string }[] = [
  { section: 'flashcards', label: 'Flashcards', word: 'Cards', Icon: Layers3, tone: 'accent' },
  { section: 'games', label: 'Jogos', word: 'Play', Icon: Gamepad2, tone: 'gold' },
  { section: 'readings', label: 'Leitura', word: 'Read', Icon: BookOpen, tone: 'ok' },
  { section: 'writing', label: 'Escrita', word: 'Write', Icon: PenLine, tone: 'info' },
]

export default function EnglishHome({ cefrLevel, difficulty, onChangeLevel, onChangeStudySettings, onOpenSection, savingSettings = false }: {
  cefrLevel: string | null
  difficulty: EnglishStudyDifficulty
  onChangeLevel: () => void
  onChangeStudySettings: (settings: { cefrLevel?: string; difficulty?: EnglishStudyDifficulty }) => void
  onOpenSection: (section: HomeSection) => void
  savingSettings?: boolean
}) {
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
        <div className="today-session-settings">
          <div role="group" aria-label="Dificuldade">
            {difficulties.map(({ value, label }) => (
              <button type="button" key={value} aria-pressed={difficulty === value} disabled={savingSettings} onClick={() => onChangeStudySettings({ difficulty: value })}>
                {label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Nível">
            {cefrLevels.map(({ level }) => (
              <button type="button" key={level} aria-pressed={cefrLevel === level} disabled={savingSettings} onClick={() => onChangeStudySettings({ cefrLevel: level })}>
                {level}
              </button>
            ))}
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
        {shortcuts.map(({ section, label, word, Icon, tone }) => (
          <button type="button" key={section} className={`tone-${tone}`} onClick={() => onOpenSection(section)}>
            <Icon aria-hidden="true" size={24} strokeWidth={2} />
            <strong>{label}</strong>
            <span className="today-shortcut-word" lang="en" aria-hidden="true">{word}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
