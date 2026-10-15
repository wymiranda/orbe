# Orbe

Uma plataforma de conteúdo compartilhado com experiências de estudo pessoais.

## Direção da plataforma

O Orbe é um núcleo pessoal composto por módulos habilitáveis. Ele começa com Leituras, mas deve poder reunir áreas independentes, como Finanças, Tarefas e Idiomas, sem transformar tudo em uma aplicação acoplada.

### Princípios de desenvolvimento

- O Core cuida somente do que é compartilhado: identidade, preferências, catálogo de módulos, módulos habilitados, navegação e layout.
- Cada módulo é dono de sua interface, regras de negócio, API, migrações e dados. Módulos não acessam diretamente tabelas, componentes ou regras uns dos outros.
- A comunicação entre Core e módulo, ou entre módulos, ocorre por contratos explícitos de API e tipos — nunca por dependência implícita do banco de dados.
- Um módulo novo deve nascer isolado em `src/modules/<modulo>` e `worker/modules/<modulo>`, mesmo enquanto o app usa um único deploy e um único D1.
- A implementação inicial é um monólito modular: simples para desenvolver e publicar, mas com fronteiras que permitam extrair um módulo para outro Worker, domínio ou banco quando isso fizer sentido.
- Um módulo deve poder virar um app independente reutilizando suas regras e contrato público, sem precisar carregar ou conhecer os demais módulos do Orbe.
- Habilitar ou desabilitar um módulo altera a experiência e a navegação, não apaga seus dados. Quando houver contas, essa escolha será uma preferência persistida por usuário.
- Não antecipar infraestrutura complexa. Uma abstração só entra quando houver um segundo caso real que a justifique, preservando clareza e autonomia dos módulos.
- Conteúdo publicado (leituras, catálogo e decks) pertence à plataforma. Progresso pessoal (cards, revisões, vocabulário conhecido e ponto de leitura) pertence ao dispositivo do usuário e não vai para o servidor sem uma decisão explícita de sincronização.

### Macro-módulos e experiências compostas

Além dos módulos independentes, o Orbe pode oferecer macro-módulos: experiências que compõem capacidades existentes, conectam seus fluxos e adicionam regras e configurações próprias. Um macro-módulo não reimplementa nem passa a ser dono dos módulos que utiliza.

```text
Orbe
├── Leituras
├── Flashcards
├── Escrita
└── Chinês (macro-módulo)
    ├── compõe Leituras, Flashcards e Escrita
    ├── conhece segmentação, hanzi, pinyin e catálogo
    └── guarda preferências e fluxos próprios
```

Flashcards não é um módulo-pai de todas as formas de estudo: ele cuida somente de cards, decks e revisões espaçadas. Escrita é outro módulo independente, responsável por tentativas de escrita manual, prática e avaliação. Nenhum dos dois é filho do outro.

Por exemplo, o macro-módulo Chinês pode abrir uma leitura, reconhecer um termo em uma linha, solicitar ao módulo Flashcards a criação de um card e oferecer a prática de seus caracteres pelo módulo Escrita. Leituras continua servindo para qualquer texto, Flashcards para qualquer assunto e Escrita pode ser reutilizado por outras experiências, como Japonês.

Essa composição ocorre por contratos explícitos: cada módulo base expõe capacidades e o macro-módulo as orquestra. O macro não acessa tabelas ou componentes internos dos módulos que usa. Dados e regras específicos do Chinês, como catálogo, segmentação, pinyin e preferências, permanecem sob o domínio Chinês. A abstração só deve ser criada quando houver um segundo uso real que a justifique.

O front principal também pertence à experiência, e não aos módulos base: o usuário abre um workspace, que oferece sua própria navegação e reúne as capacidades necessárias. Módulos podem fornecer telas reutilizáveis, mas não precisam aparecer como destinos globais da navegação. Isso permite que Leituras e Flashcards sejam reaproveitados por outra experiência sem que a interface do Orbe passe a parecer uma coleção de ferramentas soltas.

## Desenvolvimento

```bash
npm install
npm run dev
```

O app abre localmente no endereço mostrado pelo Vite. A rota `GET /api/health` responde pelo Worker.

## Comandos

```bash
npm run build
npm run lint
npm run deploy
```

## Banco de dados

O Cloudflare D1 guarda somente autenticação e conteúdo compartilhado: leituras, capítulos, catálogo chinês e decks publicados. O progresso de estudo fica em `localStorage` no dispositivo. O desenvolvimento usa uma cópia local persistente; a publicação usa o banco remoto `orbe`.

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

As mudanças de estrutura do banco ficam em `migrations/`. O projeto está em um reset inicial e possui somente `0001_create_platform.sql`; depois que ela for aplicada em produção, novas mudanças devem usar uma nova migration numerada, sem editar a `0001`.

R2 entrará somente quando o app aceitar arquivos como PDFs, EPUBs ou imagens.
