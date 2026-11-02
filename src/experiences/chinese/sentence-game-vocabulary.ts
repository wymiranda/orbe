import type { VocabularyHint } from '../../modules/multiplayer/MultiplayerModule'

/** Hints (pinyin and meaning) shown on the cards of the sentence game. */
export const sentenceGameVocabulary: Record<string, VocabularyHint> = Object.fromEntries([
  ['我', 'wǒ', 'eu'], ['你', 'nǐ', 'você'], ['他', 'tā', 'ele'], ['她', 'tā', 'ela'], ['我们', 'wǒmen', 'nós'], ['妈妈', 'māma', 'mamãe'], ['今天', 'jīntiān', 'hoje'], ['想', 'xiǎng', 'querer'], ['喝', 'hē', 'beber'], ['喜欢', 'xǐhuan', 'gostar'], ['在', 'zài', 'estar em'], ['去', 'qù', 'ir'], ['看', 'kàn', 'ver / ler'], ['吃', 'chī', 'comer'], ['不', 'bù', 'não'], ['很', 'hěn', 'muito'], ['水', 'shuǐ', 'água'], ['茶', 'chá', 'chá'], ['学校', 'xuéxiào', 'escola'], ['书', 'shū', 'livro'], ['米饭', 'mǐfàn', 'arroz'], ['家', 'jiā', 'casa'], ['中国', 'Zhōngguó', 'China'], ['电影', 'diànyǐng', 'filme'], ['吗', 'ma', 'partícula interrogativa'], ['好', 'hǎo', 'bom / bem'], ['忙', 'máng', 'ocupado'],
].map(([hanzi, pinyin, portuguese]) => [hanzi, { hanzi, pinyin, portuguese }]))
