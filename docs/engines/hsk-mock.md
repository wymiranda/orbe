# Estrutura do simulado HSK

`chinese_hsk_mock_questions` armazena somente questões curadas de HSK 1 e HSK 2. Cada linha mantém a seção, parte, formato oficial e uma definição compatível com o motor genérico de Quiz.

## Formatos disponíveis

| Formato | Tipo do motor | Uso |
| --- | --- | --- |
| `listening_picture_true_false` | `true_false` | Áudio + imagem. |
| `listening_picture_choice` | `single_choice` | Áudio + escolha de imagem. |
| `listening_dialogue_picture_choice` | `single_choice` | Diálogo em áudio + imagem. |
| `listening_dialogue_choice` | `single_choice` | Diálogo/pergunta em áudio + alternativas. |
| `reading_picture_true_false` | `true_false` | Frase + imagem. |
| `reading_picture_choice` | `single_choice` | Frase + escolha de imagem. |
| `reading_match` | `match` | Correspondência entre frases. |
| `reading_fill_blank` | `fill_blank` | Lacuna com alternativas. |
| `reading_statement_true_false` | `true_false` | Verificação de correspondência de sentido. |

O JSON de `definition` segue o contrato do `QuizModule`: `id`, `type`, `prompt`, `answer` e, conforme o tipo, `choices` ou `pairs`. `prompt` e alternativas aceitam texto, imagem e áudio. A API aceita importação em `POST /api/chinese/hsk-mock-questions/import` e leitura filtrada por nível em `GET /api/chinese/hsk-mock-questions?level=1`.
