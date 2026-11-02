# Núcleo inicial do HSK 1

Aprovado. As frases novas entram no catálogo pela migração `migrations-chinese/0007_add_hsk1_starter_core.sql`.

## Objetivo

As primeiras sessões são o primeiro contato da pessoa com o app. O núcleo inicial usa poucas palavras, escolhidas por quanto elas se combinam, e várias frases para cada uma, para os jogos variarem sem jogar muitas palavras novas de uma vez.

Regras:

- 3 palavras novas por sessão: 3 depois da primeira sessão, 6 depois da segunda, 9 depois da terceira.
- Cada frase usa só palavras das etapas anteriores e da própria etapa. A sessão só mostra frases cujas palavras a pessoa já aprendeu (a surpresa Brutal é a única exceção).
- Cada palavra nova já tem frases para praticar na própria sessão em que é aprendida.
- Frases de conversa real, como no critério de `hsk1-frases.md`. Nada de combinação artificial só para encaixar vocabulário.
- Até 12 hanzi por frase, sem contar a pontuação.

## Ordem das palavras e por quê

| Etapa | Palavras | Por que nesta ordem |
| --- | --- | --- |
| 1 | 我 喝 茶 | A primeira frase completa (sujeito, verbo, objeto). |
| 2 | 想 不 水 | Querer e negar ampliam qualquer frase com verbo. 水 é a segunda bebida, para 喝 não ficar preso ao chá. |
| 3 | 吃 苹果 他 | Um segundo verbo e um segundo objeto. 他 dá um segundo sujeito a todas as frases. |
| 4 | 你 吗 她 | 你 abre o diálogo e 吗 transforma qualquer frase já aprendida em pergunta: é o que mais multiplica o repertório. |
| 5 | 喜欢 很 好 | 喜欢 recebe um verbo inteiro (喜欢喝茶), reaproveitando tudo o que veio antes. 很 e 好 respondem "tudo bem?". |
| 6 | 呢 是 老师 | Devolver a pergunta (你呢) e dizer quem alguém é. 是 é um dos verbos mais usados do HSK 1. |
| 7 | 学生 在 家 | Dizer quem a pessoa é e onde alguém está, e onde se faz algo (在家吃苹果). |
| 8 | 妈妈 | Um sujeito novo que já combina com tudo. |

Depois do núcleo, as palavras seguintes continuam sendo escolhidas automaticamente, pelas frases que elas completam.

## Frases por etapa

As marcadas com "já existe" estavam no catálogo antes. A missão de cada frase segue o padrão atual: "Monte: " + a tradução.

### Etapa 1 — 我 喝 茶

| Chinês | Português | Dificuldade | |
| --- | --- | --- | --- |
| 我喝茶。 | Eu bebo chá. | Fácil | já existe |

### Etapa 2 — 想 不 水

| Chinês | Português | Dificuldade | |
| --- | --- | --- | --- |
| 我想喝茶。 | Eu quero beber chá. | Fácil | já existe |
| 我不喝茶。 | Eu não bebo chá. | Fácil | já existe |
| 我不想喝茶。 | Eu não quero beber chá. | Fácil | |
| 我喝水。 | Eu bebo água. | Fácil | já existe |
| 我想喝水。 | Eu quero beber água. | Fácil | já existe |
| 我不喝水。 | Eu não bebo água. | Fácil | |

### Etapa 3 — 吃 苹果 他

| Chinês | Português | Dificuldade | |
| --- | --- | --- | --- |
| 我吃苹果。 | Eu como maçã. | Fácil | já existe |
| 我想吃苹果。 | Eu quero comer maçã. | Fácil | |
| 我不吃苹果。 | Eu não como maçã. | Fácil | |
| 我不想吃苹果。 | Eu não quero comer maçã. | Fácil | |
| 他喝茶。 | Ele bebe chá. | Fácil | |
| 他不吃苹果。 | Ele não come maçã. | Fácil | |

### Etapa 4 — 你 吗 她

| Chinês | Português | Dificuldade | |
| --- | --- | --- | --- |
| 你喝茶吗？ | Você bebe chá? | Fácil | |
| 你喝水吗？ | Você bebe água? | Fácil | já existe |
| 你吃苹果吗？ | Você come maçã? | Fácil | |
| 她想喝水。 | Ela quer beber água. | Fácil | já existe |
| 你想喝水吗？ | Você quer beber água? | Médio | |
| 你想吃苹果吗？ | Você quer comer maçã? | Médio | |
| 他想吃苹果吗？ | Ele quer comer maçã? | Médio | |

### Etapa 5 — 喜欢 很 好

| Chinês | Português | Dificuldade | |
| --- | --- | --- | --- |
| 我喜欢你。 | Eu gosto de você. | Fácil | |
| 他喜欢喝茶。 | Ele gosta de beber chá. | Fácil | |
| 她喜欢吃苹果。 | Ela gosta de comer maçã. | Fácil | |
| 我喜欢喝水。 | Eu gosto de beber água. | Fácil | |
| 她不喜欢喝茶。 | Ela não gosta de beber chá. | Fácil | |
| 我很好。 | Eu estou bem. | Fácil | |
| 他很好。 | Ele está bem. | Fácil | |
| 你喜欢喝茶吗？ | Você gosta de beber chá? | Médio | |

### Etapa 6 — 呢 是 老师

| Chinês | Português | Dificuldade | |
| --- | --- | --- | --- |
| 他是老师。 | Ele é professor. | Fácil | |
| 你是老师吗？ | Você é professor? | Fácil | |
| 她是老师吗？ | Ela é professora? | Fácil | |
| 我很好，你呢？ | Eu estou bem, e você? | Médio | |
| 我喝茶，你呢？ | Eu bebo chá, e você? | Médio | |
| 她喜欢吃苹果，你呢？ | Ela gosta de comer maçã, e você? | Médio | |

### Etapa 7 — 学生 在 家

| Chinês | Português | Dificuldade | |
| --- | --- | --- | --- |
| 我是学生。 | Eu sou estudante. | Fácil | já existe |
| 她不是学生。 | Ela não é estudante. | Fácil | |
| 我在家。 | Eu estou em casa. | Fácil | |
| 她不在家。 | Ela não está em casa. | Fácil | |
| 他在家吗？ | Ele está em casa? | Fácil | |
| 我是学生，你呢？ | Eu sou estudante, e você? | Médio | |
| 我在家吃苹果。 | Eu como maçã em casa. | Médio | |

### Etapa 8 — 妈妈

| Chinês | Português | Dificuldade | |
| --- | --- | --- | --- |
| 妈妈在家。 | Mamãe está em casa. | Fácil | já existe |
| 妈妈是老师。 | Mamãe é professora. | Fácil | |
| 你妈妈在家吗？ | Sua mãe está em casa? | Médio | |
| 妈妈在家喝茶。 | Mamãe bebe chá em casa. | Médio | |
