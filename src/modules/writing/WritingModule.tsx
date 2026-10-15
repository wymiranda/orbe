import { useCallback, useEffect, useRef, useState } from 'react'
import HanziWriter from 'hanzi-writer'
import '../../App.css'

export type WritingPracticeItem = { id: string; glyph: string; label: string; detail?: string }

const attemptStorageKey = 'orbe:writing:attempts:v1'

function loadAttempts(): Record<string, number> {
  try {
    const stored = localStorage.getItem(attemptStorageKey)
    return stored ? JSON.parse(stored) as Record<string, number> : {}
  } catch { return {} }
}

function WritingModule({ items, embedded = false }: { items: WritingPracticeItem[]; embedded?: boolean }) {
  const [itemId, setItemId] = useState(items[0]?.id ?? '')
  const [attempts, setAttempts] = useState<Record<string, number>>(loadAttempts)
  const [strokeCount, setStrokeCount] = useState(0)
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<'free' | 'guided'>('free')
  const [guidedStatus, setGuidedStatus] = useState('Carregando guia…')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const guidedTargetRef = useRef<HTMLDivElement>(null)
  const guidedWriterRef = useRef<ReturnType<typeof HanziWriter.create> | null>(null)
  const drawing = useRef(false)
  const previousPoint = useRef<{ x: number; y: number } | null>(null)
  const current = items.find((item) => item.id === itemId) ?? items[0]
  const currentGlyph = current?.glyph ?? ''

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !current) return
    const size = Math.max(280, Math.floor(canvas.getBoundingClientRect().width)); const ratio = window.devicePixelRatio || 1
    canvas.width = size * ratio; canvas.height = size * ratio
    const context = canvas.getContext('2d'); if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, size, size)
    context.strokeStyle = '#e1d6c7'; context.lineWidth = 1; context.setLineDash([5, 5]); context.beginPath()
    context.moveTo(size / 2, 16); context.lineTo(size / 2, size - 16); context.moveTo(16, size / 2); context.lineTo(size - 16, size / 2); context.stroke(); context.setLineDash([])
    context.fillStyle = 'rgb(113 62 53 / .12)'; context.font = `${Math.floor(size * .7)}px serif`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(current.glyph, size / 2, size / 2 + size * .035)
    setStrokeCount(0); setMessage('')
  }, [current])
  useEffect(() => { clearCanvas() }, [clearCanvas])
  useEffect(() => {
    if (mode !== 'guided' || !currentGlyph || !guidedTargetRef.current) return
    const target = guidedTargetRef.current
    let active = true
    target.replaceChildren()
    guidedWriterRef.current = HanziWriter.create(target, currentGlyph, {
      width: 320,
      height: 320,
      padding: 18,
      showCharacter: false,
      showOutline: true,
      strokeColor: '#713e35',
      outlineColor: '#e1d6c7',
      drawingColor: '#a95043',
      highlightColor: '#c48755',
      highlightCompleteColor: '#6d8a69',
      charDataLoader: (character) => fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(character)}.json`).then((response) => {
        if (!response.ok) throw new Error('Dados do caractere indisponíveis.')
        return response.json()
      }),
      onLoadCharDataSuccess: () => { if (active) setGuidedStatus('Guia pronto. Desenhe os traços na ordem correta.') },
      onLoadCharDataError: () => { if (active) setGuidedStatus('Não foi possível carregar os traços deste caractere.') },
    })
    setGuidedStatus('Carregando guia…')
    return () => { active = false; guidedWriterRef.current?.cancelQuiz(); guidedWriterRef.current = null }
  }, [currentGlyph, mode])
  function point(event: React.PointerEvent<HTMLCanvasElement>) { const bounds = event.currentTarget.getBoundingClientRect(); return { x: event.clientX - bounds.left, y: event.clientY - bounds.top } }
  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) { event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; previousPoint.current = point(event); setStrokeCount((count) => count + 1); setMessage('') }
  function draw(event: React.PointerEvent<HTMLCanvasElement>) { if (!drawing.current || !previousPoint.current) return; const context = canvasRef.current?.getContext('2d'); if (!context) return; const next = point(event); context.strokeStyle = '#713e35'; context.lineCap = 'round'; context.lineJoin = 'round'; context.lineWidth = 7; context.beginPath(); context.moveTo(previousPoint.current.x, previousPoint.current.y); context.lineTo(next.x, next.y); context.stroke(); previousPoint.current = next }
  function registerAttempt() { if (!current || strokeCount === 0) { setMessage('Faça ao menos um traço antes de registrar.'); return }; const next = { ...attempts, [current.id]: (attempts[current.id] ?? 0) + 1 }; setAttempts(next); localStorage.setItem(attemptStorageKey, JSON.stringify(next)); setMessage('Tentativa registrada neste dispositivo.') }
  function startGuidedPractice() {
    if (!current || !guidedWriterRef.current) return
    setGuidedStatus('Prática em andamento. A correção acontece no seu navegador.')
    void guidedWriterRef.current.quiz({
      showHintAfterMisses: 2,
      onMistake: ({ totalMistakes }) => setGuidedStatus(`${totalMistakes} ${totalMistakes === 1 ? 'tentativa fora do traço' : 'tentativas fora do traço'}. Continue.`),
      onComplete: ({ totalMistakes }) => {
        const next = { ...attempts, [current.id]: (attempts[current.id] ?? 0) + 1 }
        setAttempts(next); localStorage.setItem(attemptStorageKey, JSON.stringify(next))
        setGuidedStatus(totalMistakes ? `Concluído com ${totalMistakes} correções. Tentativa registrada.` : 'Perfeito. Tentativa registrada.')
      },
    })
  }
  if (!items.length) return <main className={embedded ? 'workspace-view' : 'app-shell'}><section className="welcome writing-page"><p className="eyebrow">ESCRITA</p><h1>Seu caderno está pronto.</h1><p className="intro">Adicione caracteres à experiência para começar a praticar.</p></section></main>
  return <main className={embedded ? 'workspace-view' : 'app-shell'}>{!embedded && <header className="app-header"><a className="brand" href="/">orb<span>e</span></a></header>}<section className="welcome writing-page"><p className="eyebrow">ESCRITA</p><h1>Pratique traço por traço.</h1><p className="intro">Escolha o modo livre para desenhar sem correção, ou o guiado para aprender a ordem dos traços.</p><label className="writing-picker">Caractere para praticar<select value={current?.id ?? ''} onChange={(event) => setItemId(event.target.value)}>{items.map((item) => <option value={item.id} key={item.id}>{item.glyph} · {item.label}</option>)}</select></label><div className="writing-mode" role="group" aria-label="Modo de prática"><button type="button" className={mode === 'free' ? '' : 'secondary'} onClick={() => setMode('free')}>Livre</button><button type="button" className={mode === 'guided' ? '' : 'secondary'} onClick={() => setMode('guided')}>Guiado</button></div><section className="writing-board" aria-label={`Área de prática para ${current.glyph}`}><header><div><strong>{current.glyph}</strong><span>{current.label}{current.detail ? ` · ${current.detail}` : ''}</span></div><small>{attempts[current.id] ?? 0} tentativas</small></header>{mode === 'free' ? <><canvas ref={canvasRef} className="writing-canvas" aria-label={`Desenhe ${current.glyph}`} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={() => { drawing.current = false; previousPoint.current = null }} onPointerCancel={() => { drawing.current = false; previousPoint.current = null }} /><div className="writing-actions"><button type="button" className="secondary" onClick={clearCanvas}>Limpar</button><button type="button" onClick={registerAttempt}>Registrar tentativa</button></div>{message && <p className="writing-message" role="status">{message}</p>}</> : <><div ref={guidedTargetRef} className="guided-writer" aria-label={`Prática guiada de ${current.glyph}`} /><div className="writing-actions"><button type="button" onClick={startGuidedPractice} disabled={guidedStatus === 'Carregando guia…' || guidedStatus.startsWith('Não foi possível')}>Começar prática guiada</button></div><p className="writing-message" role="status">{guidedStatus}</p></>}</section></section></main>
}

export default WritingModule
