import { useEffect, useState } from 'react'
import '../../App.css'
import ReadingsModule from '../../modules/readings/ReadingsModule'
import StudyModule from '../../modules/study/StudyModule'
import WritingModule, { type WritingPracticeItem } from '../../modules/writing/WritingModule'
import ChineseAdmin from './ChineseAdmin'
import InstallOrbeButton from '../../core/InstallOrbeButton'
import { loadDeviceProgress } from './device-progress'

type HskProgress = { hsk_level: string; total: number; learned: number }
type StudyOverview = { coverage: { learned: number; total: number }; hsk: HskProgress[]; decks: { due_count: number }[] }
type Section = 'home' | 'readings' | 'flashcards' | 'writing' | 'admin'

const navigation: { id: Section; label: string; icon: string }[] = [
  { id: 'home', label: 'Início', icon: '⌂' },
  { id: 'readings', label: 'Leituras', icon: '文' },
  { id: 'flashcards', label: 'Estudar', icon: '✦' },
  { id: 'writing', label: 'Escrita', icon: '✎' },
  { id: 'admin', label: 'Gestão', icon: '•••' },
]

function levelNumber(level: string) { return Number(level.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER) }
function percent(learned: number, total: number) { return total ? Math.round((learned / total) * 100) : 0 }

function WorkspaceNavigation({ section, onSelect }: { section: Section; onSelect: (section: Section) => void }) {
  const links = navigation.map((item) => <button key={item.id} type="button" className={item.id === section ? 'active' : ''} aria-current={item.id === section ? 'page' : undefined} onClick={() => onSelect(item.id)}><span aria-hidden="true">{item.icon}</span><b>{item.label}</b></button>)
  return <>
    <aside className="workspace-sidebar">
      <a className="workspace-brand" href="/" aria-label="Orbe, início">orb<span>e</span></a>
      <div className="workspace-identity"><small>ESPAÇO</small><strong>Chinês</strong></div>
      <nav aria-label="Navegação do espaço Chinês">{links}</nav>
      <p className="workspace-note">Aprenda no seu ritmo.</p>
    </aside>
    <nav className="workspace-mobile-nav" aria-label="Navegação do espaço Chinês">{links}</nav>
  </>
}

function ChineseWorkspace() {
  const [section, setSection] = useState<Section>('home')
  const [overview, setOverview] = useState<StudyOverview | null>(null)
  const [overviewError, setOverviewError] = useState('')

  useEffect(() => {
    if (section !== 'home') return
    let cancelled = false
    async function loadOverview() {
      try {
        const response = await fetch('/api/chinese/vocabulary')
        if (!response.ok) throw new Error('Não foi possível carregar seu progresso.')
        const vocabulary = await response.json() as { id: string; hsk_level: string }[]
        const progress = loadDeviceProgress()
        const hsk = Object.values(vocabulary.reduce((levels, item) => {
          const level = levels[item.hsk_level] ?? { hsk_level: item.hsk_level, total: 0, learned: 0 }
          level.total += 1
          if (progress.vocabulary[item.id] === 'learned') level.learned += 1
          levels[item.hsk_level] = level
          return levels
        }, {} as Record<string, HskProgress>))
        const learned = hsk.reduce((sum, level) => sum + level.learned, 0)
        const dueCount = progress.cards.filter((card) => card.dueAt <= new Date().toISOString()).length
        if (!cancelled) setOverview({ coverage: { learned, total: vocabulary.length }, hsk, decks: [{ due_count: dueCount }] })
      } catch (cause) {
        if (!cancelled) setOverviewError(cause instanceof Error ? cause.message : 'Não foi possível carregar seu progresso.')
      }
    }
    void loadOverview()
    return () => { cancelled = true }
  }, [section])

  let content: React.ReactNode
  if (section === 'readings') content = <ReadingsModule embedded />
  else if (section === 'flashcards') content = <StudyModule embedded />
  else if (section === 'writing') content = <ChineseWriting />
  else if (section === 'admin') content = <ChineseAdmin embedded />
  else content = <main className="workspace-view"><section className="welcome chinese-dashboard" aria-labelledby="chinese-title">
    <p className="eyebrow">ESPAÇO DE ESTUDO</p>
    <h1 id="chinese-title">Seu chinês, de relance.</h1>
    <p className="intro">Acompanhe seu vocabulário e escolha o próximo passo.</p>
    <div className="actions"><button type="button" onClick={() => setSection('readings')}>Continuar lendo</button><button type="button" className="secondary" onClick={() => setSection('flashcards')}>Estudar cards</button><InstallOrbeButton /></div>
    {overviewError && <p className="error" role="alert">{overviewError}</p>}
    {!overview && !overviewError && <p className="empty dashboard-loading">Preparando seu panorama…</p>}
    {overview && <ProgressDashboard overview={overview} onOpenFlashcards={() => setSection('flashcards')} />}
  </section></main>

  return <div className="workspace-layout"><WorkspaceNavigation section={section} onSelect={setSection} /><div className="workspace-main">{content}</div></div>
}

function ChineseWriting() {
  const [items, setItems] = useState<WritingPracticeItem[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    void fetch('/api/chinese/vocabulary').then(async (response) => {
      if (!response.ok) throw new Error('Não foi possível carregar os caracteres.')
      const vocabulary = await response.json() as { id: string; type: string; hanzi: string; pinyin: string; portuguese: string }[]
      setItems(vocabulary.filter((item) => item.type === 'character').map((item) => ({ id: item.id, glyph: item.hanzi, label: item.portuguese, detail: item.pinyin })))
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os caracteres.'))
  }, [])
  if (error) return <main className="workspace-view"><section className="welcome writing-page"><p className="eyebrow">ESCRITA</p><h1>Pratique traço por traço.</h1><p className="error">{error}</p></section></main>
  return <WritingModule items={items} embedded />
}

function ProgressDashboard({ overview, onOpenFlashcards }: { overview: StudyOverview; onOpenFlashcards: () => void }) {
  const levels = [...overview.hsk].sort((first, second) => levelNumber(first.hsk_level) - levelNumber(second.hsk_level))
  const activeLevel = levels.find((level) => level.learned < level.total) ?? levels.at(-1)
  const overallPercent = percent(overview.coverage.learned, overview.coverage.total)
  const remaining = activeLevel ? activeLevel.total - activeLevel.learned : 0
  const dueCount = overview.decks.reduce((total, deck) => total + deck.due_count, 0)
  if (!levels.length) return <section className="progress-empty"><strong>Seu mapa começa aqui.</strong><p>Importe um catálogo de vocabulário com níveis HSK para acompanhar sua evolução.</p></section>
  return <section className="progress-dashboard" aria-label="Panorama do progresso em chinês">
    <div className="progress-hero-card"><div className="progress-ring" style={{ '--progress': String(overallPercent) + '%' } as React.CSSProperties}><div><strong>{overallPercent}%</strong><span>coberto</span></div></div><div><p className="eyebrow">VOCABULÁRIO CONHECIDO</p><h2>{overview.coverage.learned} de {overview.coverage.total}</h2><p>Itens marcados como aprendidos no seu catálogo atual.</p></div></div>
    <div className="progress-insights"><article><span>EM FOCO</span><strong>HSK {activeLevel?.hsk_level ?? '—'}</strong><p>{remaining === 0 ? 'Nível concluído. Continue para o próximo.' : 'Faltam ' + remaining + ' itens para concluir este nível.'}</p></article><article><span>REVISÃO</span><strong>{dueCount}</strong><p>{dueCount === 1 ? 'card esperando você hoje.' : 'cards esperando você hoje.'}</p><button type="button" className="secondary" onClick={onOpenFlashcards}>Revisar agora</button></article></div>
    <section className="hsk-path" aria-labelledby="hsk-path-title"><div><p className="eyebrow">CAMINHO HSK</p><h2 id="hsk-path-title">Seu avanço por nível</h2></div><ol>{levels.map((level) => { const levelPercent = percent(level.learned, level.total); return <li key={level.hsk_level} className={level === activeLevel ? 'active' : levelPercent === 100 ? 'complete' : ''}><div className="hsk-level-label"><strong>HSK {level.hsk_level}</strong><span>{level.learned} / {level.total}</span></div><div className="hsk-track" aria-label={'HSK ' + level.hsk_level + ': ' + levelPercent + '% concluído'}><span style={{ width: String(levelPercent) + '%' }} /></div><small>{levelPercent}%</small></li> })}</ol></section>
    <p className="progress-note">A cobertura mostra o que você marcou como aprendido no catálogo importado; ela não equivale, por si só, a uma certificação HSK.</p>
  </section>
}

export default ChineseWorkspace
