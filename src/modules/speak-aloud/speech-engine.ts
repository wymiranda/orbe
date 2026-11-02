/*
 * Speech recognition engines for "Solte a Voz". The game only talks to the
 * SpeechRecognitionEngine contract, so the browser engine below can later be
 * replaced by an on-device one (Sherpa-ONNX…) without touching the game.
 *
 * No audio is ever stored or sent to Niorb: the browser engine hands the
 * microphone to the browser, which may process it in its own (external) service.
 */

export type RecognitionErrorCode = 'unsupported' | 'permission' | 'network' | 'no-speech' | 'aborted' | 'failed'

export type RecognitionHandlers = {
  /** Partial transcript while the learner is still speaking. */
  onInterim: (text: string) => void
  /** Final transcript and its alternatives, most likely first. */
  onFinal: (alternatives: string[]) => void
  /** The learner stopped speaking; the engine is now working on the result. */
  onSpeechEnd: () => void
  onError: (code: RecognitionErrorCode) => void
  /** Always called last, once the engine has released the microphone. */
  onEnd: () => void
}

export type RecognitionOptions = { language: string; interimResults: boolean; maxAlternatives: number }
export type RecognitionHandle = { stop: () => void; abort: () => void }

export interface SpeechRecognitionEngine {
  readonly supported: boolean
  start: (options: RecognitionOptions, handlers: RecognitionHandlers) => RecognitionHandle
}

// The Web Speech API is not part of TypeScript's DOM library: only what is used here is declared.
type BrowserAlternative = { transcript: string }
type BrowserResult = { isFinal: boolean; length: number; [index: number]: BrowserAlternative }
type BrowserResultEvent = { resultIndex: number; results: { length: number; [index: number]: BrowserResult } }
type BrowserRecognition = {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean
  onresult: ((event: BrowserResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onspeechend: (() => void) | null
  onend: (() => void) | null
  start: () => void; stop: () => void; abort: () => void
}
type BrowserRecognitionConstructor = new () => BrowserRecognition

function browserRecognition(): BrowserRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as { SpeechRecognition?: BrowserRecognitionConstructor; webkitSpeechRecognition?: BrowserRecognitionConstructor }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

const browserErrors: Record<string, RecognitionErrorCode> = {
  'not-allowed': 'permission',
  'service-not-allowed': 'permission',
  network: 'network',
  'no-speech': 'no-speech',
  aborted: 'aborted',
}

/** The browser's own recognizer (SpeechRecognition / webkitSpeechRecognition). */
export const webSpeechEngine: SpeechRecognitionEngine = {
  get supported() { return browserRecognition() !== null },
  start(options, handlers) {
    const Recognition = browserRecognition()
    if (!Recognition) { handlers.onError('unsupported'); handlers.onEnd(); return { stop() {}, abort() {} } }
    const recognition = new Recognition()
    recognition.lang = options.language
    recognition.interimResults = options.interimResults
    recognition.maxAlternatives = options.maxAlternatives
    recognition.continuous = false
    recognition.onresult = (event) => {
      let interim = ''
      const finals: string[][] = []
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) finals.push(Array.from({ length: result.length }, (_, alternative) => result[alternative].transcript))
        else interim += result[0]?.transcript ?? ''
      }
      if (finals.length) {
        // One utterance may arrive in several final pieces: alternatives are joined piece by piece.
        const count = Math.max(...finals.map((piece) => piece.length))
        handlers.onFinal(Array.from({ length: count }, (_, alternative) => finals.map((piece) => piece[alternative] ?? piece[0]).join('')))
      } else if (interim) handlers.onInterim(interim)
    }
    recognition.onerror = (event) => handlers.onError(browserErrors[event.error] ?? 'failed')
    recognition.onspeechend = () => handlers.onSpeechEnd()
    recognition.onend = () => handlers.onEnd()
    try { recognition.start() } catch { handlers.onError('failed'); handlers.onEnd() }
    return { stop: () => recognition.stop(), abort: () => recognition.abort() }
  },
}
