import { useEffect, useState } from 'react'

type Term = { id: string; hanzi: string; pinyin: string; portuguese: string; hsk_level: string; occurrences: number; reading_count: number }
type Report = { summary: { total_terms: number; used_terms: number; unseen_terms: number }; unseen: Term[]; low_exposure: Term[]; recurring: Term[] }

function Terms({ title, description, terms }: { title: string; description: string; terms: Term[] }) {
  return <article><p className="eyebrow">{description}</p><h2>{title}</h2>{terms.length ? <ul className="curation-list">{terms.map((term) => <li key={term.id}><strong>{term.hanzi}</strong><span>{term.pinyin} · {term.portuguese}</span><small>HSK {term.hsk_level} · {term.occurrences}x em {term.reading_count} {term.reading_count === 1 ? 'leitura' : 'leituras'}</small></li>)}</ul> : <p className="empty">Nada para sinalizar agora.</p>}</article>
}

function ChineseAdmin({ embedded = false }: { embedded?: boolean }) {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  useEffect(() => { void fetch('/api/chinese/curation').then(async (response) => { if (!response.ok) throw new Error('Não foi possível carregar a curadoria.'); setReport(await response.json() as Report) }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a curadoria.')) }, [])
  async function exportReport() {
    setExporting(true)
    setError('')
    try {
      const response = await fetch('/api/chinese/curation/export.csv', { headers: { accept: 'text/csv' } })
      const contentType = response.headers.get('content-type') ?? ''
      if (!response.ok) throw new Error('Não foi possível exportar o relatório.')
      if (!contentType.startsWith('text/csv')) throw new Error('A exportação não retornou um CSV. Atualize a página e tente novamente.')
      const url = URL.createObjectURL(await response.blob())
      const download = document.createElement('a')
      download.href = url
      download.download = 'orbe-curadoria-chines.csv'
      document.body.append(download)
      download.click()
      download.remove()
      URL.revokeObjectURL(url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível exportar o relatório.')
    } finally {
      setExporting(false)
    }
  }
  return <main className={embedded ? 'workspace-view' : 'app-shell'}>{!embedded && <header className="app-header"><a className="brand" href="/" aria-label="Orbe, início">orb<span>e</span></a></header>}<section className="welcome curation-page"><p className="eyebrow">ADMINISTRAÇÃO</p><h1>Curadoria do Chinês.</h1><p className="intro">Sinais para escolher o vocabulário dos próximos textos.</p><button type="button" className="export-report" onClick={() => void exportReport()} disabled={exporting}>{exporting ? 'Preparando CSV…' : 'Exportar relatório CSV'}</button>{error && <p className="error">{error}</p>}{!report && !error && <p className="empty">Preparando relatório…</p>}{report && <><section className="curation-summary"><div><strong>{report.summary.total_terms}</strong><span>no catálogo</span></div><div><strong>{report.summary.used_terms}</strong><span>já usados</span></div><div><strong>{report.summary.unseen_terms}</strong><span>nunca usados</span></div></section><section className="curation-grid"><Terms title="Nunca apareceram" description="LACUNAS" terms={report.unseen} /><Terms title="Pouco expostas" description="REFORÇO" terms={report.low_exposure} /><Terms title="Recorrentes" description="MAIOR EXPOSIÇÃO" terms={report.recurring} /></section></>}</section></main>
}

export default ChineseAdmin
