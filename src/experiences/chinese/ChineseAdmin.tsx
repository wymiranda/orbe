import { useEffect, useState } from "react";
import PageHeader from "../../core/PageHeader";

type Term = {
  id: string;
  hanzi: string;
  pinyin: string;
  portuguese: string;
  hsk_level: string;
  occurrences: number;
  reading_count: number;
};
type VocabularyVisualKind = "emoji" | "svg" | "image" | "";
type Vocabulary = {
  id: string;
  hanzi: string;
  pinyin: string;
  portuguese: string;
  hsk_level: string;
  visual_kind: Exclude<VocabularyVisualKind, ""> | null;
  visual_value: string | null;
  visual_asset_id?: string | null;
};
type VisualDraft = { kind: VocabularyVisualKind; value: string; assetId?: string };
type MediaImage = { id: string; filename: string; content_type: string; byte_size: number; created_at: string; links: number; url: string };
type Report = {
  summary: { total_terms: number; used_terms: number; unseen_terms: number };
  unseen: Term[];
  low_exposure: Term[];
  recurring: Term[];
};
type QuizQuestion = {
  id: string;
  hsk_level: string;
  mode: "recognition" | "hsk-mock";
  question_type: "single_choice" | "fill_blank";
  prompt: string;
  choices: { id: string; text: string }[];
  answer_id: string;
};
type ImportedQuizQuestion = {
  id?: string;
  hsk_level: string;
  mode: "recognition" | "hsk-mock";
  type: "single_choice" | "fill_blank";
  prompt: { text: string };
  choices: { id: string; text: string }[];
  answer: string;
};
type AdminUser = {
  id: string;
  email: string;
  role: "admin" | "user";
  created_at: string;
  last_login_at: string | null;
  last_seen_at: string | null;
  last_module: string | null;
};
type AdminSection = "people" | "vocabulary" | "images" | "quiz" | "curation";

const choiceIds = ["a", "b", "c", "d"];

function dateTime(value: string | null) {
  return value
    ? new Date(value).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
}
function moduleLabel(value: string | null) {
  return (
    (
      {
        home: "Início",
        progress: "Progresso",
        readings: "Leituras",
        flashcards: "Flashcards",
        writing: "Escrita",
        quiz: "Quiz",
        multiplayer: "Construam uma frase juntos",
        "scene-certa": "Bate-olho",
        "listen-build": "Ouça e monte",
        admin: "Administração",
      } as Record<string, string>
    )[value ?? ""] ?? "—"
  );
}

function Terms({
  title,
  description,
  terms,
}: {
  title: string;
  description: string;
  terms: Term[];
}) {
  return (
    <article>
      <p className="eyebrow">{description}</p>
      <h2>{title}</h2>
      {terms.length ? (
        <ul className="curation-list">
          {terms.map((term) => (
            <li key={term.id}>
              <strong>{term.hanzi}</strong>
              <span>
                {term.pinyin} · {term.portuguese}
              </span>
              <small>
                HSK {term.hsk_level} · {term.occurrences}x em{" "}
                {term.reading_count}{" "}
                {term.reading_count === 1 ? "leitura" : "leituras"}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Nada para sinalizar agora.</p>
      )}
    </article>
  );
}

function visualSource(kind: VocabularyVisualKind, value: string) {
  if (kind === "svg") return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
  return value;
}

function normalizedSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function ListPagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  if (pageCount < 2) return null;
  return <nav className="list-pagination" aria-label="Paginação"><button type="button" className="secondary" disabled={page === 0} onClick={() => onChange(page - 1)}>Anterior</button><span>{page + 1} de {pageCount}</span><button type="button" className="secondary" disabled={page + 1 === pageCount} onClick={() => onChange(page + 1)}>Próxima</button></nav>;
}

function ChineseAdmin({ embedded = false }: { embedded?: boolean }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [hskLevel, setHskLevel] = useState("1");
  const [mode, setMode] = useState<"recognition" | "hsk-mock">("recognition");
  const [questionType, setQuestionType] = useState<
    "single_choice" | "fill_blank"
  >("single_choice");
  const [prompt, setPrompt] = useState("");
  const [choices, setChoices] = useState(["", "", "", ""]);
  const [answerId, setAnswerId] = useState("a");
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [questionSyntax, setQuestionSyntax] = useState("");
  const [importingQuestions, setImportingQuestions] = useState(false);
  const [removingQuestion, setRemovingQuestion] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [vocabulary, setVocabulary] = useState<Vocabulary[]>([]);
  const [visualDrafts, setVisualDrafts] = useState<Record<string, VisualDraft>>({});
  const [adminSection, setAdminSection] = useState<AdminSection>("curation");
  const [visualFilter, setVisualFilter] = useState("");
  const [vocabularySearch, setVocabularySearch] = useState("");
  const [vocabularyPage, setVocabularyPage] = useState(0);
  const [savingVisual, setSavingVisual] = useState("");
  const [fillingVisuals, setFillingVisuals] = useState(false);
  const [images, setImages] = useState<MediaImage[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  useEffect(() => {
    void Promise.all([
      fetch("/api/chinese/curation").then(async (response) => {
        if (!response.ok)
          throw new Error("Não foi possível carregar a curadoria.");
        return response.json() as Promise<Report>;
      }),
      fetch("/api/chinese/quiz-questions").then(async (response) => {
        if (!response.ok)
          throw new Error("Não foi possível carregar as questões.");
        return response.json() as Promise<QuizQuestion[]>;
      }),
      fetch("/api/chinese/vocabulary").then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar o vocabulário.");
        return response.json() as Promise<Vocabulary[]>;
      }),
      fetch("/api/media/images").then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar as imagens.");
        return response.json() as Promise<MediaImage[]>;
      }),
    ])
      .then(([nextReport, nextQuestions, nextVocabulary, nextImages]) => {
        setReport(nextReport);
        setQuestions(nextQuestions);
        setVocabulary(nextVocabulary);
        setVisualDrafts(Object.fromEntries(nextVocabulary.map((term) => [term.id, { kind: term.visual_kind ?? "", value: term.visual_value ?? "", assetId: term.visual_asset_id ?? undefined }])));
        setImages(nextImages);
      })
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar a curadoria.",
        ),
      );
  }, []);
  useEffect(() => {
    let cancelled = false;
    const loadAudience = async () => {
      try {
        const [usersResponse, onlineResponse] = await Promise.all([
          fetch("/api/auth/admin/users"),
          fetch("/api/multiplayer/lobby/online"),
        ]);
        if (!usersResponse.ok || !onlineResponse.ok)
          throw new Error("Não foi possível carregar as pessoas.");
        const usersBody = (await usersResponse.json()) as {
          users: AdminUser[];
        };
        const onlineBody = (await onlineResponse.json()) as {
          users: { id: string }[];
        };
        if (!cancelled) {
          setUsers(usersBody.users);
          setOnlineIds(new Set(onlineBody.users.map((user) => user.id)));
        }
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar as pessoas.",
          );
      }
    };
    void loadAudience();
    const interval = window.setInterval(() => void loadAudience(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);
  async function exportReport() {
    setExporting(true);
    setError("");
    try {
      const response = await fetch("/api/chinese/curation/export.csv", {
        headers: { accept: "text/csv" },
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok)
        throw new Error("Não foi possível exportar o relatório.");
      if (!contentType.startsWith("text/csv"))
        throw new Error(
          "A exportação não retornou um CSV. Atualize a página e tente novamente.",
        );
      const url = URL.createObjectURL(await response.blob());
      const download = document.createElement("a");
      download.href = url;
      download.download = "niorb-curadoria-chines.csv";
      document.body.append(download);
      download.click();
      download.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível exportar o relatório.",
      );
    } finally {
      setExporting(false);
    }
  }
  async function saveVisual(id: string) {
    const draft = visualDrafts[id] ?? { kind: "", value: "" };
    setSavingVisual(id);
    setError("");
    try {
      const response = await fetch(`/api/chinese/vocabulary/${encodeURIComponent(id)}/visual`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: draft.kind || null, value: draft.value, assetId: draft.assetId }),
      });
      const body = (await response.json()) as { visual_kind?: Vocabulary["visual_kind"]; visual_value?: string | null; visual_asset_id?: string | null; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar a representação visual.");
      setVocabulary((current) => current.map((term) => term.id === id ? { ...term, visual_kind: body.visual_kind ?? null, visual_value: body.visual_value ?? null, visual_asset_id: body.visual_asset_id ?? null } : term));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a representação visual.");
    } finally { setSavingVisual(""); }
  }
  async function fillKnownVisuals() {
    setFillingVisuals(true); setError("");
    try {
      const response = await fetch("/api/chinese/vocabulary/visuals/autofill", { method: "POST" });
      const body = await response.json() as { updated?: number; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível preencher os visuais.");
      const vocabularyResponse = await fetch("/api/chinese/vocabulary");
      if (!vocabularyResponse.ok) throw new Error("Os visuais foram atualizados, mas o catálogo não pôde ser recarregado.");
      const nextVocabulary = await vocabularyResponse.json() as Vocabulary[];
      setVocabulary(nextVocabulary);
      setVisualDrafts(Object.fromEntries(nextVocabulary.map((term) => [term.id, { kind: term.visual_kind ?? "", value: term.visual_value ?? "" }])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível preencher os visuais."); }
    finally { setFillingVisuals(false); }
  }
  async function uploadImage(file: File | undefined, vocabularyId?: string) {
    if (!file) return;
    setUploadingImage(true); setError("");
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/media/images", { method: "POST", body: form });
      const image = (await response.json()) as MediaImage & { error?: string };
      if (!response.ok) throw new Error(image.error ?? "Não foi possível enviar a imagem.");
      setImages((current) => [image, ...current]);
      if (vocabularyId) setVisualDrafts((current) => ({ ...current, [vocabularyId]: { kind: "image", value: image.url, assetId: image.id } }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível enviar a imagem."); }
    finally { setUploadingImage(false); }
  }
  async function deleteImage(image: MediaImage) {
    setError("");
    try { const response = await fetch(`/api/media/images/${encodeURIComponent(image.id)}`, { method: "DELETE" }); if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "Não foi possível apagar a imagem."); setImages((current) => current.filter((item) => item.id !== image.id)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível apagar a imagem."); }
  }
  const filteredVocabulary = vocabulary.filter((term) => {
    const matchesLevel = !visualFilter || term.hsk_level === visualFilter;
    const query = normalizedSearch(vocabularySearch.trim());
    const matchesSearch = !query || [term.hanzi, term.pinyin, term.portuguese].some((value) => normalizedSearch(value).includes(query));
    return matchesLevel && matchesSearch;
  });
  const vocabularyPageSize = 20;
  const vocabularyPageCount = Math.max(1, Math.ceil(filteredVocabulary.length / vocabularyPageSize));
  const activeVocabularyPage = Math.min(vocabularyPage, vocabularyPageCount - 1);
  const visibleVocabulary = filteredVocabulary.slice(activeVocabularyPage * vocabularyPageSize, (activeVocabularyPage + 1) * vocabularyPageSize);
  async function saveQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingQuestion(true);
    setError("");
    try {
      const response = await fetch("/api/chinese/quiz-questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hsk_level: hskLevel,
          mode,
          question_type: questionType,
          prompt,
          choices: choices
            .slice(0, questionType === "fill_blank" ? 3 : 4)
            .map((text, index) => ({ id: choiceIds[index], text })),
          answer_id: answerId,
        }),
      });
      const body = (await response.json()) as QuizQuestion | { error?: string };
      if (!response.ok)
        throw new Error(
          "error" in body ? body.error : "Não foi possível salvar a questão.",
        );
      setQuestions((current) => [body as QuizQuestion, ...current]);
      setPrompt("");
      setChoices(["", "", "", ""]);
      setAnswerId("a");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar a questão.",
      );
    } finally {
      setSavingQuestion(false);
    }
  }
  async function removeQuestion(id: string) {
    setRemovingQuestion(id);
    setError("");
    try {
      const response = await fetch(`/api/chinese/quiz-questions/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Não foi possível remover a questão.");
      setQuestions((current) =>
        current.filter((question) => question.id !== id),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível remover a questão.",
      );
    } finally {
      setRemovingQuestion("");
    }
  }
  async function importQuestionSyntax(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImportingQuestions(true);
    setError("");
    try {
      const parsed = JSON.parse(questionSyntax) as
        ImportedQuizQuestion | ImportedQuizQuestion[];
      const response = await fetch("/api/chinese/quiz-questions/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const body = (await response.json()) as
        QuizQuestion[] | { error?: string };
      if (!response.ok)
        throw new Error(
          "error" in body ? body.error : "Não foi possível importar a questão.",
        );
      setQuestions((current) => [...(body as QuizQuestion[]), ...current]);
      setQuestionSyntax("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível importar a questão.",
      );
    } finally {
      setImportingQuestions(false);
    }
  }
  const promptPlaceholder =
    questionType === "fill_blank"
      ? "Ex.: 我___学生。"
      : "Ex.: Qual termo corresponde a “água”?";
  const visibleChoices = choices.slice(
    0,
    questionType === "fill_blank" ? 3 : 4,
  );
  return (
    <main className={embedded ? "workspace-view" : "app-shell"}>
      {!embedded && (
        <header className="app-header">
          <a className="brand" href="/" aria-label="niorb, início">
            niorb
          </a>
        </header>
      )}
      <section className="welcome curation-page">
        <PageHeader
          eyebrow="ADMINISTRAÇÃO"
          title="Curadoria do Chinês."
          description="Organize o catálogo e cadastre questões para as práticas de Quiz."
        />
        <button
          type="button"
          className="export-report"
          onClick={() => void exportReport()}
          disabled={exporting}
        >
          {exporting ? "Preparando CSV…" : "Exportar relatório CSV"}
        </button>
        <nav className="admin-section-nav" aria-label="Seções da administração">
          <button type="button" className={adminSection === "people" ? "active" : "secondary"} onClick={() => setAdminSection("people")}>Pessoas</button>
          <button type="button" className={adminSection === "vocabulary" ? "active" : "secondary"} onClick={() => setAdminSection("vocabulary")}>Vocabulário</button>
          <button type="button" className={adminSection === "images" ? "active" : "secondary"} onClick={() => setAdminSection("images")}>Imagens</button>
          <button type="button" className={adminSection === "quiz" ? "active" : "secondary"} onClick={() => setAdminSection("quiz")}>Questões</button>
          <button type="button" className={adminSection === "curation" ? "active" : "secondary"} onClick={() => setAdminSection("curation")}>Curadoria</button>
        </nav>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {adminSection === "vocabulary" && (
          <section className="vocabulary-visual-editor" aria-labelledby="vocabulary-visual-title">
            <header>
              <div>
                <p className="eyebrow">VOCABULÁRIO</p>
                <h2 id="vocabulary-visual-title">Visuais das palavras</h2>
                <p>Associe um emoji, SVG ou imagem a cada termo. Imagens enviadas ficam limitadas a 192 KB.</p>
              </div>
              <button type="button" className="secondary" onClick={() => void fillKnownVisuals()} disabled={fillingVisuals}>{fillingVisuals ? "Preenchendo…" : "Preencher visuais conhecidos"}</button>
              <label>
                Buscar
                <input value={vocabularySearch} onChange={(event) => { setVocabularySearch(event.target.value); setVocabularyPage(0); }} placeholder="Hanzi, pinyin ou tradução" />
              </label>
              <label>
                Nível HSK
                <select value={visualFilter} onChange={(event) => { setVisualFilter(event.target.value); setVocabularyPage(0); }}>
                  <option value="">Todos ({vocabulary.length})</option>
                  {[...new Set(vocabulary.map((term) => term.hsk_level))].sort((left, right) => Number(left) - Number(right)).map((level) => <option key={level} value={level}>HSK {level}</option>)}
                </select>
              </label>
            </header>
            <ul>
              {visibleVocabulary.map((term) => {
                const draft = visualDrafts[term.id] ?? { kind: "", value: "" };
                return <li key={term.id}>
                  <div className="vocabulary-visual-term"><strong>{term.hanzi}</strong><span>{term.pinyin} · {term.portuguese}</span><small>HSK {term.hsk_level}</small></div>
                  <div className="vocabulary-visual-preview" aria-label={`Visual de ${term.hanzi}`}>{draft.kind === "emoji" ? <span>{draft.value || "—"}</span> : draft.value ? <img src={visualSource(draft.kind, draft.value)} alt="" /> : <span>—</span>}</div>
                  <label>Tipo<select value={draft.kind} onChange={(event) => { const kind = event.target.value as VocabularyVisualKind; setVisualDrafts((current) => ({ ...current, [term.id]: { ...draft, kind, value: kind ? draft.value : "" } })); }}><option value="">Sem visual</option><option value="emoji">Emoji</option><option value="svg">SVG</option><option value="image">Imagem</option></select></label>
                  {draft.kind === "svg" ? <label className="vocabulary-visual-value">SVG<textarea value={draft.value} onChange={(event) => setVisualDrafts((current) => ({ ...current, [term.id]: { ...draft, value: event.target.value } }))} placeholder="&lt;svg …&gt;…&lt;/svg&gt;" /></label> : draft.kind === "emoji" ? <label className="vocabulary-visual-value">Emoji<input value={draft.value} onChange={(event) => setVisualDrafts((current) => ({ ...current, [term.id]: { ...draft, value: event.target.value } }))} placeholder="Ex.: 🍎" /></label> : null}
                  {draft.kind === "image" && <><label className="vocabulary-visual-value">Imagem da biblioteca<select value={draft.assetId ?? ""} onChange={(event) => { const image = images.find((item) => item.id === event.target.value); setVisualDrafts((current) => ({ ...current, [term.id]: { ...draft, assetId: image?.id, value: image?.url ?? "" } })); }}><option value="">Escolha uma imagem</option>{images.map((image) => <option key={image.id} value={image.id}>{image.filename}</option>)}</select></label><label className="vocabulary-visual-file">Enviar imagem<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(event) => void uploadImage(event.target.files?.[0], term.id)} /></label></>}
                  <button type="button" onClick={() => void saveVisual(term.id)} disabled={savingVisual === term.id}>{savingVisual === term.id ? "Salvando…" : "Salvar"}</button>
                </li>;
              })}
            </ul>
            {!visibleVocabulary.length && <p className="empty">Nenhuma palavra encontrada com esses filtros.</p>}
            <ListPagination page={activeVocabularyPage} pageCount={vocabularyPageCount} onChange={setVocabularyPage} />
          </section>
        )}
        {adminSection === "images" && <section className="media-library" aria-labelledby="media-library-title"><header><div><p className="eyebrow">BIBLIOTECA</p><h2 id="media-library-title">Controle de imagens</h2></div><label className="secondary">{uploadingImage ? "Enviando…" : "Enviar imagem"}<input className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" disabled={uploadingImage} onChange={(event) => void uploadImage(event.target.files?.[0])} /></label></header>{images.length ? <ul>{images.map((image) => <li key={image.id}><img src={image.url} alt="" /><div><strong>{image.filename}</strong><small>{Math.ceil(image.byte_size / 1024)} KB · {image.links} {image.links === 1 ? "vínculo" : "vínculos"}</small></div><button type="button" className="secondary" disabled={image.links > 0} onClick={() => void deleteImage(image)}>Apagar</button></li>)}</ul> : <p className="empty">Nenhuma imagem enviada.</p>}</section>}
        {adminSection === "people" && <section className="admin-users" aria-labelledby="admin-users-title">
          <div>
            <p className="eyebrow">PESSOAS</p>
            <h2 id="admin-users-title">Quem está por aqui</h2>
            <p>
              {onlineIds.size}{' '}
              {onlineIds.size === 1 ? 'pessoa online' : 'pessoas online'} agora.
              Atualiza a cada 15 segundos.
            </p>
          </div>
          {users.length ? (
            <ul>
              {users.map((user) => (
                <li key={user.id}>
                  <div>
                    <strong>{user.email}</strong>
                    <span>
                      {onlineIds.has(user.id) ? '● online agora' : 'offline'} ·{' '}
                      {user.role === 'admin' ? 'admin' : 'usuário'}
                    </span>
                  </div>
                  <small>
                    Último login: {dateTime(user.last_login_at)}
                    <br />
                    Última presença: {dateTime(user.last_seen_at)}
                    <br />
                    Último acesso: {moduleLabel(user.last_module)}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Ainda não há pessoas registradas.</p>
          )}
        </section>}
        {adminSection === "quiz" && <><section
          className="quiz-question-admin"
          aria-labelledby="quiz-question-title"
        >
          <div>
            <p className="eyebrow">BANCO DE QUESTÕES</p>
            <h2 id="quiz-question-title">Nova questão</h2>
            <p>
              Questões cadastradas substituem as automáticas no mesmo nível e
              modo.
            </p>
          </div>
          <form onSubmit={(event) => void saveQuestion(event)}>
            <div className="quiz-question-meta">
              <label>
                Nível HSK
                <input
                  value={hskLevel}
                  onChange={(event) => setHskLevel(event.target.value)}
                  required
                />
              </label>
              <label>
                Modo
                <select
                  value={mode}
                  onChange={(event) =>
                    setMode(event.target.value as "recognition" | "hsk-mock")
                  }
                >
                  <option value="recognition">Reconhecimento</option>
                  <option value="hsk-mock">Simulado HSK</option>
                </select>
              </label>
              <label>
                Tipo
                <select
                  value={questionType}
                  onChange={(event) => {
                    setQuestionType(
                      event.target.value as "single_choice" | "fill_blank",
                    );
                    setAnswerId("a");
                  }}
                >
                  <option value="single_choice">Múltipla escolha</option>
                  <option value="fill_blank">Completar lacuna</option>
                </select>
              </label>
            </div>
            <label>
              Enunciado
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={promptPlaceholder}
                required
              />
            </label>
            <fieldset>
              <legend>
                Alternativas{" "}
                {questionType === "fill_blank" ? "(hanzi · pinyin)" : ""}
              </legend>
              {visibleChoices.map((choice, index) => (
                <label className="quiz-question-choice" key={choiceIds[index]}>
                  <input
                    type="radio"
                    name="correct-answer"
                    value={choiceIds[index]}
                    checked={answerId === choiceIds[index]}
                    onChange={() => setAnswerId(choiceIds[index])}
                    aria-label={`Alternativa ${index + 1} é a correta`}
                  />
                  <input
                    value={choice}
                    onChange={(event) =>
                      setChoices((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? event.target.value : item,
                        ),
                      )
                    }
                    placeholder={
                      questionType === "fill_blank"
                        ? `Alternativa ${index + 1}, ex.: 是 · shì`
                        : `Alternativa ${index + 1}`
                    }
                    required
                  />
                </label>
              ))}
            </fieldset>
            <button type="submit" disabled={savingQuestion}>
              {savingQuestion ? "Salvando…" : "Adicionar questão"}
            </button>
          </form>
          <div className="quiz-question-list">
            <h3>Questões cadastradas ({questions.length})</h3>
            {questions.length ? (
              <ul>
                {questions.map((question) => (
                  <li key={question.id}>
                    <div>
                      <small>
                        HSK {question.hsk_level} ·{" "}
                        {question.mode === "hsk-mock"
                          ? "Simulado HSK"
                          : "Reconhecimento"}{" "}
                        ·{" "}
                        {question.question_type === "fill_blank"
                          ? "Completar lacuna"
                          : "Múltipla escolha"}
                      </small>
                      <strong>{question.prompt}</strong>
                      <span>
                        Gabarito:{" "}
                        {
                          question.choices.find(
                            (choice) => choice.id === question.answer_id,
                          )?.text
                        }
                      </span>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void removeQuestion(question.id)}
                      disabled={removingQuestion === question.id}
                    >
                      {removingQuestion === question.id
                        ? "Removendo…"
                        : "Remover"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">Ainda não há questões cadastradas.</p>
            )}
          </div>
        </section>
        <section
          className="quiz-syntax-import"
          aria-labelledby="quiz-syntax-title"
        >
          <div>
            <p className="eyebrow">IMPORTAR SINTAXE</p>
            <h2 id="quiz-syntax-title">Cole uma questão em JSON</h2>
            <p>
              Você pode importar um objeto único ou uma lista de objetos na
              sintaxe do Quiz.
            </p>
          </div>
          <form onSubmit={(event) => void importQuestionSyntax(event)}>
            <textarea
              value={questionSyntax}
              onChange={(event) => setQuestionSyntax(event.target.value)}
              placeholder={
                '{\n  "hsk_level": "1",\n  "mode": "hsk-mock",\n  "type": "fill_blank",\n  "prompt": { "text": "我___学生。" },\n  "choices": [\n    { "id": "a", "text": "是 · shì" },\n    { "id": "b", "text": "有 · yǒu" },\n    { "id": "c", "text": "在 · zài" }\n  ],\n  "answer": "a"\n}'
              }
              spellCheck={false}
              required
            />
            <button type="submit" disabled={importingQuestions}>
              {importingQuestions ? "Importando…" : "Importar questão"}
            </button>
          </form>
        </section></>}
        {adminSection === "curation" && !report && !error && <p className="empty">Preparando relatório…</p>}
        {adminSection === "curation" && report && (
          <>
            <section className="curation-summary">
              <div>
                <strong>{report.summary.total_terms}</strong>
                <span>no catálogo</span>
              </div>
              <div>
                <strong>{report.summary.used_terms}</strong>
                <span>já usados</span>
              </div>
              <div>
                <strong>{report.summary.unseen_terms}</strong>
                <span>nunca usados</span>
              </div>
            </section>
            <section className="curation-grid">
              <Terms
                title="Nunca apareceram"
                description="LACUNAS"
                terms={report.unseen}
              />
              <Terms
                title="Pouco expostas"
                description="REFORÇO"
                terms={report.low_exposure}
              />
              <Terms
                title="Recorrentes"
                description="MAIOR EXPOSIÇÃO"
                terms={report.recurring}
              />
            </section>
          </>
        )}
      </section>
    </main>
  );
}

export default ChineseAdmin;
