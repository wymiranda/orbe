import { useCallback, useEffect, useRef, useState } from 'react'
import { webSpeechEngine, type RecognitionErrorCode, type RecognitionHandle, type SpeechRecognitionEngine } from './speech-engine'

/*
 * Reusable speech recognition state, independent of any game.
 * idle → listening → processing → success (a transcript arrived) | error.
 * "success" means something was recognized, not that it was the right answer.
 */

export type RecognitionStatus = 'idle' | 'listening' | 'processing' | 'success' | 'error'

/** Only one recognition may hold the microphone at a time, across every hook instance. */
let activeHandle: RecognitionHandle | null = null

export function useSpeechRecognition({ language, engine = webSpeechEngine, silenceMs = 7000, maxMs = 15000, onResult }: {
  /** BCP-47 language of the speech (the language being studied, never the interface language). */
  language: string
  engine?: SpeechRecognitionEngine
  /** Without any speech recognized for this long, listening stops as silence. */
  silenceMs?: number
  /** Listening never lasts longer than this. */
  maxMs?: number
  /** Called once per final transcript, with its alternatives (most likely first). */
  onResult?: (alternatives: string[]) => void
}) {
  const [status, setStatus] = useState<RecognitionStatus>(engine.supported ? 'idle' : 'error')
  const [interim, setInterim] = useState('')
  const [alternatives, setAlternatives] = useState<string[]>([])
  const [error, setError] = useState<RecognitionErrorCode | null>(engine.supported ? null : 'unsupported')
  const handle = useRef<RecognitionHandle | null>(null)
  const timers = useRef<number[]>([])
  const received = useRef(false)
  const failed = useRef(false)
  // Callbacks of a recognition that was reset or replaced are ignored.
  const sessionId = useRef(0)
  // The latest callback, so a recognition started earlier never calls a stale one.
  const resultCallback = useRef(onResult)
  useEffect(() => { resultCallback.current = onResult })

  const clearTimers = () => { timers.current.forEach((timer) => window.clearTimeout(timer)); timers.current = [] }
  const release = () => { clearTimers(); if (activeHandle === handle.current) activeHandle = null; handle.current = null }

  const start = useCallback(() => {
    if (handle.current || !engine.supported) return
    activeHandle?.abort()
    const session = ++sessionId.current
    const live = () => session === sessionId.current
    received.current = false; failed.current = false
    let ended = false
    setInterim(''); setAlternatives([]); setError(null); setStatus('listening')
    const armSilence = () => { clearTimers(); timers.current = [window.setTimeout(() => handle.current?.stop(), silenceMs), window.setTimeout(() => handle.current?.stop(), maxMs)] }
    const current = engine.start({ language, interimResults: true, maxAlternatives: 3 }, {
      onInterim: (text) => { if (!live()) return; setInterim(text); armSilence() },
      onFinal: (texts) => { if (!live()) return; received.current = true; setAlternatives(texts); setInterim(''); setStatus('success'); resultCallback.current?.(texts) },
      onSpeechEnd: () => { if (live() && !received.current && !failed.current) setStatus('processing') },
      onError: (code) => { if (!live() || code === 'aborted') return; failed.current = true; setError(code); setStatus('error') },
      onEnd: () => {
        ended = true
        if (!live()) return
        // Ended without a transcript nor an error: the learner said nothing that could be recognized.
        if (!received.current && !failed.current) { setError('no-speech'); setStatus('error') }
        if (handle.current === current) release()
      },
    })
    // An engine may fail at once (before returning): then there is nothing left to hold.
    if (ended) return
    handle.current = current
    activeHandle = current
    armSilence()
  }, [engine, language, maxMs, silenceMs])

  /** Stops listening and keeps whatever was said so far. */
  const stop = useCallback(() => { if (handle.current) { setStatus('processing'); handle.current.stop() } }, [])
  /** Back to idle, dropping the current transcript (used before a retry or the next item). */
  const reset = useCallback(() => {
    sessionId.current += 1
    handle.current?.abort(); release()
    setInterim(''); setAlternatives([]); setError(engine.supported ? null : 'unsupported'); setStatus(engine.supported ? 'idle' : 'error')
  }, [engine])

  // The microphone is always released when the component goes away.
  useEffect(() => () => { sessionId.current += 1; handle.current?.abort(); release() }, [])

  return { status, interim, alternatives, error, supported: engine.supported, start, stop, reset }
}
