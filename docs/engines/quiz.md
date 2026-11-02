# Motor Quiz

## Propósito

`src/modules/quiz/QuizModule.tsx` é um motor genérico de sessões de perguntas. Ele renderiza a interação, coleta respostas, corrige, mostra o resultado e salva o resultado localmente.

Ele não conhece HSK, chinês, vocabulário, imagens específicas, áudio, banco de dados ou a origem do conteúdo. Todo conteúdo chega por um `QuizSource` externo.

```text
Fornecedor de conteúdo ── sessão pronta ──> Motor Quiz ──> resposta e resultado locais
```

Um fornecedor pode ser uma experiência do Niorb, um pacote de conteúdo local, outro Worker ou um app externo. Atualmente, `src/experiences/chinese/quiz-source.ts` é um fornecedor: ele consulta o catálogo chinês e monta questões de reconhecimento.

## Contrato do fornecedor

O motor recebe um objeto `QuizSource`:

```ts
type QuizSource = {
  id: string
  title: string
  description: string
  modes?: QuizMode[]
  loadSets: () => Promise<QuizSet[]>
  createSession: (setId: string, count: number, modeId?: string) => Promise<QuizSessionContent>
}
```

- `id`: identificador estável do fornecedor. É usado para separar o resultado local de cada fonte.
- `title` e `description`: exibidos na tela de configuração do Quiz.
- `modes`: opções de prática exibidas como cartões; quando ausente, o motor mantém a configuração simples de uma única prática.
- `loadSets()`: devolve os conjuntos que o usuário pode escolher, como `HSK 1`, `HSK 2`, `Direito constitucional` ou `Capítulo 3`.
- `createSession(setId, count, modeId?)`: recebe as escolhas e devolve uma sessão completa, já pronta para ser executada.

O motor não acessa APIs ou tabelas de conteúdo por conta própria. O fornecedor decide se os dados vêm de memória, arquivo, D1, R2, API remota ou cache local.

### Conjuntos

```ts
type QuizSet = {
  id: string
  label: string
  description?: string
}
```

### Sessão pronta

```ts
type QuizSessionContent = {
  id: string
  title: string
  description?: string
  questions: QuizQuestion[]
}
```

Uma sessão deve conter ao menos uma questão. O fornecedor pode devolver menos que `count` quando não houver material suficiente; a tela mostrará a quantidade efetivamente recebida.

## Prompt e assets

Cada questão pode trazer texto, imagem e áudio juntos ou em combinações:

```ts
type QuizPrompt = {
  text?: string
  image?: { src: string; alt: string }
  audio?: { src: string; label?: string }
}
```

`src` deve ser uma URL que o navegador consiga acessar. O motor apenas usa `<img>` e `<audio controls>`: não baixa, transforma, armazena nem torna assets disponíveis offline sozinho. A estratégia de cache/offline pertence ao fornecedor ou ao shell do app.

Forneça sempre `image.alt`. Uma questão deve ter ao menos um dos três conteúdos no prompt. Antes de iniciar, o motor valida IDs, prompts, alternativas, gabaritos e tokens; uma sessão inválida é recusada com uma mensagem clara.

Alternativas de `single_choice` e itens do lado esquerdo de `match` também podem usar `{ image: { src, alt } }` no lugar de texto. Nas associações, porém, as opções do `<select>` precisam ter `text`.

## Tipos de questão aceitos

### `true_false`

Resposta booleana.

```ts
{
  id: 'q-01',
  type: 'true_false',
  prompt: { text: '猫 significa “cachorro”.' },
  answer: false,
}
```

### `single_choice`

Uma alternativa correta. `answer` é o `id` da alternativa, não seu texto.

```ts
{
  id: 'q-02',
  type: 'single_choice',
  prompt: { text: '你' },
  choices: [
    { id: 'a', text: 'eu' },
    { id: 'b', text: 'você' },
    { id: 'c', text: 'ela' },
  ],
  answer: 'b',
}
```

Uma alternativa também pode ser visual:

```ts
{ id: 'cat', image: { src: '/content/cat.webp', alt: 'Um gato' } }
```

### `fill_blank`

Renderiza alternativas como `single_choice`; o fornecedor coloca o enunciado já com a lacuna no texto.

```ts
{
  id: 'q-03',
  type: 'fill_blank',
  prompt: { text: '我___学生。' },
  choices: [
    { id: 'a', text: '是' },
    { id: 'b', text: '有' },
    { id: 'c', text: '在' },
  ],
  answer: 'a',
}
```

### `match`

Cada item da esquerda recebe uma alternativa da direita. `answer` mapeia o `id` de cada par para o `id` da alternativa correta.

```ts
{
  id: 'q-04',
  type: 'match',
  prompt: { text: 'Associe cada termo ao significado.' },
  pairs: [
    { id: 'one', image: { src: '/content/water.webp', alt: 'Um copo de água' } },
    { id: 'two', text: '书' },
  ],
  choices: [
    { id: 'water', text: 'água' },
    { id: 'book', text: 'livro' },
  ],
  answer: { one: 'water', two: 'book' },
}
```

### `ordering`

O usuário seleciona tokens para formar uma sequência. `answer` é um vetor com os IDs na ordem correta.

```ts
{
  id: 'q-05',
  type: 'ordering',
  prompt: { text: 'Organize a frase.' },
  tokens: [
    { id: 'i', text: '我' },
    { id: 'like', text: '喜欢' },
    { id: 'tea', text: '茶' },
  ],
  answer: ['i', 'like', 'tea'],
}
```

### `written_answer`

Entrada textual livre. O motor compara removendo espaços externos, caixa e diacríticos. Use apenas quando essa normalização for aceitável; não serve para avaliar ortografia, tom de pinyin ou escrita de hanzi com rigor.

```ts
{
  id: 'q-06',
  type: 'written_answer',
  prompt: { text: 'Escreva “água” em chinês.' },
  placeholder: 'Sua resposta',
  answer: '水',
}
```

## Correção e estado local

- O usuário confirma a resposta antes de avançar.
- Para alternativas, lacunas e associação, a comparação é pelos IDs fornecidos pelo conteúdo.
- Para ordenação, todos os IDs e a ordem precisam corresponder.
- Para resposta escrita, a comparação usa a normalização descrita acima.
- O motor exibe apenas “Correto” ou “Resposta incorreta”. Ele não mostra o gabarito textual após um erro.
- Ao fim, ele grava o último resultado daquele `source.id` em `localStorage`, na chave `niorb:quiz:results:v1`.
- Nenhuma resposta individual, conteúdo de sessão, estatística detalhada ou asset é enviado ao servidor pelo motor.

## Integração atual: Chinês

O fornecedor `chineseQuizSource` usa o catálogo HSK e oferece dois modos, ambos com questões `single_choice`:

```text
Reconhecimento: hanzi -> quatro significados em português -> uma resposta correta
Simulado HSK: alterna hanzi -> significado e significado -> hanzi + pinyin
```

O simulado atual é de vocabulário e não equivale à prova oficial HSK. Ele é uma integração, não parte do motor. Um futuro pacote com áudio, imagens, frases e o plano de uma prova HSK pode gerar `true_false`, `match`, `fill_blank` e os demais tipos sem alterar `QuizModule`.

### Questões cadastradas por administradores

Na área **Gestão** do espaço Chinês, administradores podem cadastrar questões de múltipla escolha para um nível HSK e modo específicos. O formulário pede enunciado, quatro alternativas e o gabarito.

Essas questões ficam em `chinese_quiz_questions`. Quando houver questões cadastradas para o nível e modo escolhidos, o fornecedor chinês as usa no Quiz; sem questões cadastradas, mantém a geração automática a partir do catálogo de vocabulário. A rota de cadastro e remoção exige papel `admin`; a leitura das questões é usada pelo Quiz autenticado.

Para uma lacuna HSK 1, escolha **Completar lacuna** no formulário e preencha, por exemplo:

```text
Enunciado: 我___学生。
A: 是 · shì
B: 有 · yǒu
C: 在 · zài
Gabarito: A
```

O valor salvo é uma questão `fill_blank`: a lacuna deve estar no enunciado e as alternativas podem trazer hanzi e pinyin na mesma linha. A adaptação inicial usa três alternativas independentes; o banco compartilhado A–F da prova oficial não faz parte desse formato ainda.

Também é possível colar a sintaxe abaixo em **Gestão → Importar sintaxe**. Inclua `hsk_level` e `mode`, que definem onde ela aparecerá:

```json
{
  "id": "hsk1-fill-01",
  "hsk_level": "1",
  "mode": "hsk-mock",
  "type": "fill_blank",
  "prompt": { "text": "我___学生。" },
  "choices": [
    { "id": "a", "text": "是 · shì" },
    { "id": "b", "text": "有 · yǒu" },
    { "id": "c", "text": "在 · zài" }
  ],
  "answer": "a"
}
```

O campo `id` é opcional; se ausente, o sistema cria um. Para importar várias questões, envie um array JSON desses objetos.

## Limites intencionais atuais

- Não há cronômetro, pontuação ponderada, revisão espaçada ou banco de questões no motor.
- Há validação leve em tempo de execução para impedir sessões quebradas; ela não substitui a curadoria de conteúdo do fornecedor.
- Não há suporte automático a múltiplas respostas corretas, resposta parcial ou correção por IA.
- Não há sincronização de resultados entre dispositivos.

Esses recursos só devem entrar quando houver um caso de conteúdo real que os exija.
