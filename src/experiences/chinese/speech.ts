/**
 * Chinese text-to-speech through the browser's Web Speech API.
 *
 * The voice itself belongs to the device's operating system (Google TTS on
 * Android, Apple voices on iOS/macOS, Microsoft voices on Windows). Without an
 * explicit Chinese voice, some devices read hanzi with their default voice, so
 * the voice is chosen explicitly whenever the device lists one.
 */
export type ChineseVoiceStatus = 'available' | 'missing' | 'unknown' | 'unsupported'

const chineseLanguage = /^(zh|cmn)([-_]|$)/i
let chosenVoice: SpeechSynthesisVoice | null = null

function supported() { return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window }

export function pickChineseVoice(voices: Pick<SpeechSynthesisVoice, 'lang'>[]) {
  return voices.find((voice) => /^zh[-_]CN$/i.test(voice.lang)) ?? voices.find((voice) => chineseLanguage.test(voice.lang)) ?? null
}

/**
 * Resolves whether the device can speak Chinese. Browsers load their voice
 * list asynchronously; when the list never arrives the status is "unknown" and
 * callers should still try to speak instead of blocking the learner.
 */
export function chineseVoiceStatus(waitMs = 1500): Promise<ChineseVoiceStatus> {
  if (!supported()) return Promise.resolve('unsupported')
  const synth = window.speechSynthesis
  return new Promise((resolve) => {
    const settle = () => {
      const voices = synth.getVoices()
      if (!voices.length) return false
      chosenVoice = pickChineseVoice(voices) as SpeechSynthesisVoice | null
      resolve(chosenVoice ? 'available' : 'missing')
      return true
    }
    if (settle()) return
    const onChange = () => { if (settle()) { window.clearTimeout(timer); synth.removeEventListener('voiceschanged', onChange) } }
    const timer = window.setTimeout(() => { synth.removeEventListener('voiceschanged', onChange); if (!settle()) resolve('unknown') }, waitMs)
    synth.addEventListener('voiceschanged', onChange)
  })
}

/** Speaks Chinese text; returns false when the browser has no speech synthesis. */
export function speakChinese(text: string, rate = 0.8) {
  if (!supported()) return false
  const synth = window.speechSynthesis
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  const voice = chosenVoice ?? (pickChineseVoice(synth.getVoices()) as SpeechSynthesisVoice | null)
  if (voice) utterance.voice = voice
  utterance.rate = rate
  synth.speak(utterance)
  return true
}
