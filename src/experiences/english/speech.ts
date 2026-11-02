/** English text-to-speech through the browser's Web Speech API, preferring an American voice. */

function supported() { return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window }

function pickEnglishVoice(voices: SpeechSynthesisVoice[]) {
  return voices.find((voice) => /^en[-_]US$/i.test(voice.lang)) ?? voices.find((voice) => /^en([-_]|$)/i.test(voice.lang)) ?? null
}

/** Speaks English text; returns false when the browser has no speech synthesis. */
export function speakEnglish(text: string, rate = 0.85) {
  if (!supported()) return false
  const synth = window.speechSynthesis
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  const voice = pickEnglishVoice(synth.getVoices())
  if (voice) utterance.voice = voice
  utterance.rate = rate
  synth.speak(utterance)
  return true
}
