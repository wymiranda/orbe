/**
 * How to use the HSK words that work as grammar (particles, negations, measure words, question
 * words, verbs whose meaning depends on where they go): a translation alone would teach them
 * wrong. Shown on the card that presents the word. Reviewed as docs/hsk1-explicacoes.md.
 */
export type WordExplanation = { text: string; examples: { text: string; reading: string; meaning: string }[] }

export const wordExplanations: Record<string, WordExplanation> = {
  '吗': {
    text: 'Transforma uma afirmação em pergunta de sim ou não. Vai no fim da frase, e o resto não muda. Não se usa com palavras de pergunta como 什么, 谁 ou 哪儿.',
    examples: [
      { text: '你喝茶吗？', reading: 'Nǐ hē chá ma?', meaning: 'Você bebe chá?' },
      { text: '他想吃苹果吗？', reading: 'Tā xiǎng chī píngguǒ ma?', meaning: 'Ele quer comer maçã?' },
    ],
  },
  '呢': {
    text: 'Devolve a pergunta sobre o mesmo assunto: "e você?", "e ele?". Vai no fim, logo depois da pessoa ou da coisa.',
    examples: [
      { text: '我很好，你呢？', reading: 'Wǒ hěn hǎo, nǐ ne?', meaning: 'Eu estou bem, e você?' },
      { text: '我喝茶，你呢？', reading: 'Wǒ hē chá, nǐ ne?', meaning: 'Eu bebo chá, e você?' },
    ],
  },
  '吧': {
    text: 'No fim da frase, deixa o tom mais leve: faz uma sugestão ("vamos…") ou pede confirmação ("…, né?").',
    examples: [
      { text: '喝茶吧。', reading: 'Hē chá ba.', meaning: 'Vamos beber chá.' },
      { text: '你是学生吧？', reading: 'Nǐ shì xuésheng ba?', meaning: 'Você é estudante, né?' },
    ],
  },
  '了': {
    text: 'Mostra que algo aconteceu ou mudou. Depois do verbo, diz que a ação se completou. No fim da frase, diz que a situação agora é outra.',
    examples: [
      { text: '我吃了。', reading: 'Wǒ chī le.', meaning: 'Eu já comi.' },
      { text: '他喝了。', reading: 'Tā hē le.', meaning: 'Ele já bebeu.' },
    ],
  },
  '的': {
    text: 'Liga quem possui ao que é possuído, na ordem contrária do português: 我的书 é "o meu livro". Também liga uma descrição a uma coisa. Com família próxima costuma cair: 我妈妈 é "minha mãe".',
    examples: [
      { text: '我的茶', reading: 'wǒ de chá', meaning: 'o meu chá' },
      { text: '妈妈的苹果', reading: 'māma de píngguǒ', meaning: 'a maçã da mamãe' },
      { text: '是我的。', reading: 'Shì wǒ de.', meaning: 'É meu.' },
    ],
  },
  '在': {
    text: 'Sozinho, é "estar em" um lugar. Antes de outro verbo, diz onde a ação acontece, e o lugar vem antes da ação, ao contrário do português. 在 + verbo também diz que algo está acontecendo agora.',
    examples: [
      { text: '我在家。', reading: 'Wǒ zài jiā.', meaning: 'Eu estou em casa.' },
      { text: '我在家喝茶。', reading: 'Wǒ zài jiā hē chá.', meaning: 'Eu bebo chá em casa.' },
      { text: '他在家吃苹果。', reading: 'Tā zài jiā chī píngguǒ.', meaning: 'Ele come maçã em casa.' },
    ],
  },
  '是': {
    text: '"Ser" para dizer o que ou quem algo é: liga duas coisas. Não vai antes de adjetivo: "ela está bem" é 她很好, sem 是.',
    examples: [
      { text: '他是老师。', reading: 'Tā shì lǎoshī.', meaning: 'Ele é professor.' },
      { text: '我不是老师。', reading: 'Wǒ bú shì lǎoshī.', meaning: 'Eu não sou professor.' },
    ],
  },
  '很': {
    text: 'Antes de um adjetivo quase sempre vai 很, mesmo sem o sentido forte de "muito". Sem ele, a frase soa incompleta.',
    examples: [
      { text: '我很好。', reading: 'Wǒ hěn hǎo.', meaning: 'Eu estou bem.' },
      { text: '他很好。', reading: 'Tā hěn hǎo.', meaning: 'Ele está bem.' },
    ],
  },
  '不': {
    text: 'Nega o presente, o futuro e o costume, e vem antes do verbo. Para negar 有 (ter) usa-se 没有, nunca 不有. Antes de uma sílaba de 4º tom, vira bú.',
    examples: [
      { text: '我不喝茶。', reading: 'Wǒ bù hē chá.', meaning: 'Eu não bebo chá.' },
      { text: '我不想喝水。', reading: 'Wǒ bù xiǎng hē shuǐ.', meaning: 'Eu não quero beber água.' },
    ],
  },
  '没有': {
    text: 'Nega 有: "não ter", "não haver". Também diz que algo não aconteceu: 我没有喝 é "eu não bebi".',
    examples: [
      { text: '我没有茶。', reading: 'Wǒ méiyǒu chá.', meaning: 'Eu não tenho chá.' },
      { text: '他没有喝水。', reading: 'Tā méiyǒu hē shuǐ.', meaning: 'Ele não bebeu água.' },
    ],
  },
  '有': {
    text: '"Ter", e também "haver": 有水 é "tem água". A negação é sempre 没有.',
    examples: [
      { text: '我有茶。', reading: 'Wǒ yǒu chá.', meaning: 'Eu tenho chá.' },
      { text: '你有水吗？', reading: 'Nǐ yǒu shuǐ ma?', meaning: 'Você tem água?' },
    ],
  },
  '和': {
    text: '"E" só entre pessoas ou coisas. Não liga verbos nem frases, como o "e" do português faz.',
    examples: [
      { text: '我和妈妈', reading: 'wǒ hé māma', meaning: 'eu e a mamãe' },
      { text: '我喜欢茶和水。', reading: 'Wǒ xǐhuan chá hé shuǐ.', meaning: 'Eu gosto de chá e de água.' },
    ],
  },
  '都': {
    text: '"Todos", "ambos". Vem depois de quem são "todos" e antes do verbo, nunca no começo da frase.',
    examples: [
      { text: '我们都是学生。', reading: 'Wǒmen dōu shì xuésheng.', meaning: 'Nós todos somos estudantes.' },
      { text: '他们都喝茶。', reading: 'Tāmen dōu hē chá.', meaning: 'Todos eles bebem chá.' },
    ],
  },
  '也': {
    text: '"Também". Vai depois de quem faz e antes do verbo, nunca no fim da frase como em português.',
    examples: [
      { text: '我也喝茶。', reading: 'Wǒ yě hē chá.', meaning: 'Eu também bebo chá.' },
      { text: '她也是老师。', reading: 'Tā yě shì lǎoshī.', meaning: 'Ela também é professora.' },
    ],
  },
  '个': {
    text: 'Entre um número (ou 这, 那) e a coisa contada vai um classificador. 个 é o mais comum: serve para pessoas e para muitas coisas.',
    examples: [
      { text: '一个苹果', reading: 'yí ge píngguǒ', meaning: 'uma maçã' },
      { text: '三个老师', reading: 'sān ge lǎoshī', meaning: 'três professores' },
    ],
  },
  '几': {
    text: 'Pergunta "quantos" quando se espera um número pequeno, até uns dez, e vem com classificador: 几个.',
    examples: [
      { text: '你吃几个苹果？', reading: 'Nǐ chī jǐ ge píngguǒ?', meaning: 'Quantas maçãs você come?' },
      { text: '你想吃几个？', reading: 'Nǐ xiǎng chī jǐ ge?', meaning: 'Quantas você quer comer?' },
    ],
  },
  '多少': {
    text: 'Pergunta "quanto" ou "quantos" para números maiores ou desconhecidos, como um preço. Não precisa de classificador.',
    examples: [
      { text: '你喝多少水？', reading: 'Nǐ hē duōshao shuǐ?', meaning: 'Quanta água você bebe?' },
      { text: '你吃多少苹果？', reading: 'Nǐ chī duōshao píngguǒ?', meaning: 'Quantas maçãs você come?' },
    ],
  },
  '什么': {
    text: '"O quê". Fica no lugar da coisa perguntada, sem mudar a ordem da frase e sem 吗.',
    examples: [
      { text: '你喝什么？', reading: 'Nǐ hē shénme?', meaning: 'O que você bebe?' },
      { text: '你吃什么？', reading: 'Nǐ chī shénme?', meaning: 'O que você come?' },
    ],
  },
  '哪儿': {
    text: '"Onde". Fica no lugar do lugar perguntado, em geral depois de 在 ou 去, e sem 吗.',
    examples: [
      { text: '你在哪儿？', reading: 'Nǐ zài nǎr?', meaning: 'Onde você está?' },
      { text: '妈妈在哪儿？', reading: 'Māma zài nǎr?', meaning: 'Onde está a mamãe?' },
    ],
  },
  '谁': {
    text: '"Quem". Fica no lugar da pessoa perguntada, sem mudar a ordem da frase e sem 吗.',
    examples: [
      { text: '她是谁？', reading: 'Tā shì shuí?', meaning: 'Quem é ela?' },
      { text: '谁喝茶？', reading: 'Shuí hē chá?', meaning: 'Quem bebe chá?' },
    ],
  },
  '太': {
    text: '"Demais", quase sempre com 了 no fim: 太…了. Também expressa entusiasmo, como em 太好了.',
    examples: [
      { text: '太好了！', reading: 'Tài hǎo le!', meaning: 'Que ótimo!' },
      { text: '他太好了。', reading: 'Tā tài hǎo le.', meaning: 'Ele é bom demais.' },
    ],
  },
  '想': {
    text: 'Antes de um verbo, é "querer" fazer algo. Antes de uma pessoa, é "sentir saudade". Sozinho, é "pensar".',
    examples: [
      { text: '我想喝茶。', reading: 'Wǒ xiǎng hē chá.', meaning: 'Eu quero beber chá.' },
      { text: '我不想喝水。', reading: 'Wǒ bù xiǎng hē shuǐ.', meaning: 'Eu não quero beber água.' },
    ],
  },
  '会': {
    text: '"Saber fazer" algo que se aprendeu, como uma língua. Também diz que algo vai acontecer.',
    examples: [
      { text: '我会说中文。', reading: 'Wǒ huì shuō Zhōngwén.', meaning: 'Eu sei falar chinês.' },
      { text: '明天会下雨。', reading: 'Míngtiān huì xià yǔ.', meaning: 'Amanhã vai chover.' },
    ],
  },
  '能': {
    text: '"Poder", "conseguir": ter condição ou permissão. Para uma habilidade aprendida usa-se 会.',
    examples: [
      { text: '你能吃苹果吗？', reading: 'Nǐ néng chī píngguǒ ma?', meaning: 'Você pode comer maçã?' },
      { text: '我不能喝茶。', reading: 'Wǒ bù néng hē chá.', meaning: 'Eu não posso beber chá.' },
    ],
  },
  '要': {
    text: '"Querer" com mais firmeza que 想, "precisar" ou "ir fazer". É o jeito comum de pedir algo.',
    examples: [
      { text: '我要茶。', reading: 'Wǒ yào chá.', meaning: 'Eu quero chá.' },
      { text: '我要喝水。', reading: 'Wǒ yào hē shuǐ.', meaning: 'Eu preciso beber água.' },
    ],
  },
  '两': {
    text: '"Dois" antes de um classificador ou de uma coisa contada: 两个人. Para contar e dentro de números como 十二 usa-se 二.',
    examples: [
      { text: '两个苹果', reading: 'liǎng ge píngguǒ', meaning: 'duas maçãs' },
      { text: '两个老师', reading: 'liǎng ge lǎoshī', meaning: 'dois professores' },
    ],
  },
  '二': {
    text: '"Dois" para contar, dentro de números (十二, 二十) e em datas. Antes de um classificador vira 两.',
    examples: [
      { text: '十二', reading: 'shí\'èr', meaning: 'doze' },
      { text: '二月', reading: 'èr yuè', meaning: 'fevereiro' },
    ],
  },
  '们': {
    text: 'Faz o plural de pronomes e de pessoas: 我们, 你们, 他们. Não se usa com coisas, nem quando já há um número.',
    examples: [
      { text: '我们', reading: 'wǒmen', meaning: 'nós' },
      { text: '老师们', reading: 'lǎoshīmen', meaning: 'os professores' },
    ],
  },
}
