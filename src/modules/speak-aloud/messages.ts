import type { RecognitionErrorCode } from './speech-engine'

/** What the learner reads when recognition fails; kept small so a catalogue can import it without the game. */
export const recognitionErrors: Record<RecognitionErrorCode, string> = {
  unsupported: 'Este navegador não reconhece fala. Use o Chrome, o Edge ou o Safari.',
  permission: 'Permita o uso do microfone para jogar.',
  network: 'Sem conexão com o serviço de reconhecimento do navegador. Tente de novo.',
  'no-speech': 'Não ouvimos nada. Tente de novo.',
  aborted: 'Não foi possível reconhecer sua fala. Tente de novo.',
  failed: 'Não foi possível reconhecer sua fala. Tente de novo.',
}
