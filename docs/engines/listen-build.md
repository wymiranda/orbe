# Jogo Ouça e monte

## Propósito

`src/modules/listen-build/ListenBuildModule.tsx` treina a escuta: o jogo fala uma frase, o aluno a reconstrói com cartas de palavras e só depois vê o texto. É o primeiro módulo que gera evidência na modalidade `listening` do mapa de habilidades.

O módulo não conhece chinês, HSK, catálogo ou banco de dados. Frases, voz e textos dependentes do idioma chegam por um `ListeningSource`. As regras puras (montar a mão de cartas e corrigir) ficam em `src/modules/listen-build/listen-build.ts`, sem React nem navegador, para serem testadas isoladamente.

```text
Domínio Chinês ── frases + voz ──> Ouça e monte ──> ActivityResult (comprehension · listening)
```

## Contrato do fornecedor

```ts
type ListeningSource = {
  language: string            // BCP-47, enviado no resultado
  label: string               // cabeçalho quando não há objetivo de trilha
  intro: string               // descrição da tela inicial
  missingVoiceMessage: string // aviso quando o aparelho não fala o idioma
  loadSentences: () => Promise<ListeningSentence[]>
  voiceStatus: () => Promise<'available' | 'missing' | 'unknown' | 'unsupported'>
  speak: (text: string) => void
}

type ListeningSentence = {
  id: string
  tokens: string[]    // palavras na ordem, sem pontuação
  text: string        // texto falado e revelado após a resposta
  reading?: string    // pinyin/IPA revelado após a resposta, só se completo
  contentIds: string[] // IDs do catálogo creditados com o resultado
}
```

- `voiceStatus` `missing` ou `unsupported` bloqueia o jogo e mostra `missingVoiceMessage`. `unknown` (o navegador não informou as vozes) não bloqueia: o jogo tenta falar.
- Cada rodada mostra as palavras da frase mais duas cartas de outras frases. Uma carta extra nunca repete uma palavra da resposta.
- A correção compara o texto das cartas, então cartas iguais são intercambiáveis.

## Integração atual: Chinês

`src/experiences/chinese/listening-source.ts` lê `GET /api/chinese/sentences` e completa o pinyin com o catálogo de vocabulário. As frases vêm de `worker/modules/chinese/sentence-corpus.ts`, a mesma fonte usada pelo jogo multiplayer de frases; missões e bônus continuam sendo regras do multiplayer.

- **Catálogo de Jogos:** frases até o nível HSK autodeclarado (1 ou 2).
- **Sessão diária:** às vezes ocupa a etapa de jogo, no lugar do Bate-olho, com 3 frases formadas só por palavras que a pessoa já viu na trilha. Sem frases elegíveis ou sem voz em chinês, a sessão segue direto para o próximo passo.
- **Trilha:** uma atividade com `moduleId: "listen-build"` abre o jogo com as frases ligadas ao conteúdo da atividade.

A voz é a do sistema operacional, pela Web Speech API (`src/experiences/chinese/speech.ts`), que escolhe explicitamente uma voz `zh` quando o aparelho a oferece. Para frases ela é suficiente; para um futuro exercício de tons isolados, use áudio gravado com o tom controlado.

## Resultado

Para cada frase respondida, o módulo devolve uma avaliação `comprehension` por item de `contentIds` (a frase e cada palavra), com `correct` e `score` 0 ou 1. `moduleId: 'listen-build'` é mapeado para a modalidade `listening` em `src/learning-paths/knowledge.ts`.
