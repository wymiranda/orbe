import type { PictureGameSource, PictureTerm } from '../../modules/scene-certa/SceneCertaModule'
import { speakEnglish } from './speech'

type EnglishVocabularyTerm = { id: string; term: string; pronunciation: string | null; portuguese: string; visual_kind?: PictureTerm['visual_kind']; visual_value?: string | null }

/** Supplies the Bate-olho game with English vocabulary that has a picture. */
export const englishPictureSource: PictureGameSource = {
  language: 'en',
  label: 'Inglês',
  intro: 'Veja a palavra em inglês e escolha a imagem certa, no primeiro olhar.',
  async loadTerms() {
    const response = await fetch('/api/english/vocabulary')
    if (!response.ok) throw new Error('Não foi possível carregar o vocabulário.')
    return (await response.json() as EnglishVocabularyTerm[]).map((term) => ({
      id: term.id,
      // Catalogue spelling variants ("airplane/aeroplane") are shown and spoken as the first one.
      prompt: term.term.split('/')[0].trim(),
      reading: term.pronunciation ?? '',
      meaning: term.portuguese,
      visual_kind: term.visual_kind ?? null,
      visual_value: term.visual_value ?? null,
    }))
  },
  speak: (term) => { speakEnglish(term.prompt) },
}
