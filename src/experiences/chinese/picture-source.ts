import type { PictureGameSource, PictureTerm } from '../../modules/scene-certa/SceneCertaModule'
import { speakChinese } from './speech'

type ChineseVocabularyTerm = { id: string; hanzi: string; pinyin: string; portuguese: string; visual_kind: PictureTerm['visual_kind']; visual_value: string | null }

/**
 * Supplies the Bate-olho game with Chinese vocabulary that has a picture.
 * With `studiedWord` (daily session) only words the learner has studied are played,
 * those of `focusWords` (the new words of the session) first.
 */
export function createChinesePictureSource({ studiedWord, focusWords = [] }: { studiedWord?: (hanzi: string) => boolean; focusWords?: string[] } = {}): PictureGameSource {
  return {
    language: 'zh-Hans',
    label: 'Mandarim',
    intro: 'Veja a palavra em chinês e escolha a imagem certa, no primeiro olhar.',
    async loadTerms() {
      const response = await fetch('/api/chinese/vocabulary')
      if (!response.ok) throw new Error('Não foi possível carregar o vocabulário.')
      return (await response.json() as ChineseVocabularyTerm[])
        .filter((term) => !studiedWord || studiedWord(term.hanzi))
        .map((term) => ({
          id: term.id,
          prompt: term.hanzi,
          reading: term.pinyin,
          meaning: term.portuguese,
          visual_kind: term.visual_kind,
          visual_value: term.visual_value,
          ...(focusWords.includes(term.hanzi) ? { priority: -1 } : {}),
        }))
    },
    speak: (term) => { speakChinese(term.prompt) },
  }
}

export const chinesePictureSource = createChinesePictureSource()
