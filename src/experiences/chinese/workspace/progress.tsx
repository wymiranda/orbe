import { Fragment, useEffect, useState } from "react";
import { Info } from "lucide-react";
import "../../../App.css";
import { loadDeviceProgress, type DailyStudyActivity } from "../device-progress";
import { consistencyMetric, evidenceConfidence, skillMetric } from "../../../learning-paths/metrics";
import type { KnowledgeSnapshot } from "../../../learning-paths/types";
import { wordStatus } from "../word-status";
import { LearnedWordsPanel } from "../../../modules/study/LearnedWordsPanel";
import { type OverviewTerm, type StudyOverview, levelNumber, percent } from "./shared";

export function lastSevenDays(activity: Record<string, DailyStudyActivity>) {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - offset));
    const id = date.toISOString().slice(0, 10);
    return {
      id,
      label: date.toLocaleDateString("pt-BR", { weekday: "short" }).slice(0, 3),
      ...(activity[id] ?? { reviews: 0, retained: 0, learned: 0 }),
    };
  });
}

export function ProgressDashboard({
  overview,
  onOpenFlashcards,
}: {
  overview: StudyOverview;
  onOpenFlashcards: () => void;
}) {
  const levels = [...overview.hsk].sort(
    (first, second) =>
      levelNumber(first.hsk_level) - levelNumber(second.hsk_level),
  );
  const activeLevel =
    levels.find((level) => level.learned < level.total) ?? levels.at(-1);
  const overallPercent = percent(
    overview.coverage.learned,
    overview.coverage.total,
  );
  const remaining = activeLevel ? activeLevel.total - activeLevel.learned : 0;
  const days = lastSevenDays(loadDeviceProgress().activity);
  const maximumReviews = Math.max(...days.map((day) => day.reviews), 1);
  const totalReviews = days.reduce((total, day) => total + day.reviews, 0);
  const retained = days.reduce((total, day) => total + day.retained, 0);
  if (!levels.length)
    return (
      <section className="progress-empty">
        <strong>Seu mapa começa aqui.</strong>
        <p>
          Importe um catálogo de vocabulário com níveis HSK para acompanhar sua
          evolução.
        </p>
      </section>
    );
  return (
    <section
      className="progress-dashboard"
      aria-label="Panorama do progresso em chinês"
    >
      <div className="progress-hero-card">
        <div
          className="progress-ring"
          style={{ "--progress": `${overallPercent}%` } as React.CSSProperties}
        >
          <div>
            <strong>{overallPercent}%</strong>
            <span>coberto</span>
          </div>
        </div>
        <div>
          <p className="eyebrow">VOCABULÁRIO CONHECIDO</p>
          <h2>
            {overview.coverage.learned} de {overview.coverage.total}
          </h2>
          <p>Itens marcados como aprendidos no seu catálogo atual.</p>
        </div>
      </div>
      <div className="progress-insights">
        <article>
          <span>EM FOCO</span>
          <strong>HSK {activeLevel?.hsk_level ?? "—"}</strong>
          <p>
            {remaining === 0
              ? "Nível concluído. Continue para o próximo."
              : `Faltam ${remaining} itens para concluir este nível.`}
          </p>
        </article>
        <article>
          <span>REVISÃO</span>
          <strong>{overview.dueCount}</strong>
          <p>
            {overview.dueCount === 1
              ? "card esperando você hoje."
              : "cards esperando você hoje."}
          </p>
          <button
            type="button"
            className="secondary"
            onClick={onOpenFlashcards}
          >
            Revisar agora
          </button>
        </article>
      </div>
      <section className="progress-hsk-radials" aria-labelledby="progress-hsk-radials-title">
        <header>
          <div>
            <p className="eyebrow">MAPA HSK</p>
            <h2 id="progress-hsk-radials-title">Nível de referência</h2>
          </div>
          <strong>HSK {activeLevel?.hsk_level ?? "—"}</strong>
        </header>
        <ul aria-label="Cobertura por nível HSK">
          {levels.map((level) => {
            const levelPercent = percent(level.learned, level.total);
            return (
              <li
                key={level.hsk_level}
                className={level === activeLevel ? "active" : ""}
              >
                <div
                  className="hsk-radial"
                  style={{ "--progress": `${levelPercent}%` } as React.CSSProperties}
                  aria-label={`HSK ${level.hsk_level}: ${levelPercent}% concluído`}
                >
                  <div>
                    <strong>{levelPercent}%</strong>
                    <span>HSK {level.hsk_level}</span>
                  </div>
                </div>
                <small>{level.learned} de {level.total}</small>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="progress-week" aria-labelledby="progress-week-title">
        <div>
          <p className="eyebrow">ÚLTIMOS SETE DIAS</p>
          <h2 id="progress-week-title">Ritmo da semana</h2>
          <p>
            {totalReviews} revisões ·{" "}
            {totalReviews
              ? `${Math.round((retained / totalReviews) * 100)}% de retenção`
              : "Sua atividade aparecerá aqui quando revisar."}
          </p>
        </div>
        <div
          className="progress-bars"
          aria-label={`${totalReviews} revisões nos últimos sete dias`}
        >
          {days.map((day) => (
            <div key={day.id}>
              <span
                style={{
                  height: `${Math.max(day.reviews ? 12 : 2, (day.reviews / maximumReviews) * 100)}%`,
                }}
                title={`${day.reviews} revisões`}
              />
              <small>{day.label}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="hsk-path" aria-labelledby="hsk-path-title">
        <div>
          <p className="eyebrow">CAMINHO HSK</p>
          <h2 id="hsk-path-title">Seu avanço por nível</h2>
        </div>
        <ol>
          {levels.map((level) => {
            const levelPercent = percent(level.learned, level.total);
            return (
              <li
                key={level.hsk_level}
                className={
                  level === activeLevel
                    ? "active"
                    : levelPercent === 100
                      ? "complete"
                      : ""
                }
              >
                <div className="hsk-level-label">
                  <strong>HSK {level.hsk_level}</strong>
                  <span>
                    {level.learned} / {level.total}
                  </span>
                </div>
                <div
                  className="hsk-track"
                  aria-label={`HSK ${level.hsk_level}: ${levelPercent}% concluído`}
                >
                  <span style={{ width: `${levelPercent}%` }} />
                </div>
                <small>{levelPercent}%</small>
              </li>
            );
          })}
        </ol>
      </section>
      <p className="progress-note">
        A cobertura mostra o que você marcou como aprendido no catálogo
        importado; ela não equivale, por si só, a uma certificação HSK.
      </p>
    </section>
  );
}

void ProgressDashboard;

export type ProgressPeriod = "week" | "month" | "total";

export function formatStudyTime(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${String(rest).padStart(2, "0")}m` : `${hours}h`;
}

export function ProgressDashboardV2({
  overview,
  knowledge,
}: {
  overview: StudyOverview;
  knowledge: KnowledgeSnapshot | null;
}) {
  const levels = [...overview.hsk].sort((first, second) => levelNumber(first.hsk_level) - levelNumber(second.hsk_level));
  const activeLevel = levels.find((level) => level.learned < level.total) ?? levels.at(-1);
  const [period, setPeriod] = useState<ProgressPeriod>("week");
  const [mapLevel, setMapLevel] = useState(activeLevel?.hsk_level ?? "");
  // Row of the skill table whose explanation is open (one at a time).
  const [openSkill, setOpenSkill] = useState<string | null>(null);
  const [, setProgressRevision] = useState(0);
  useEffect(() => {
    // Keep the map in step with edits made in the learned-words list below.
    const refresh = () => setProgressRevision((revision) => revision + 1);
    window.addEventListener("niorb:chinese-progress", refresh);
    return () => window.removeEventListener("niorb:chinese-progress", refresh);
  }, []);
  const deviceProgress = loadDeviceProgress();

  // Period summary, from the activity recorded on this device.
  const since = new Date();
  since.setDate(since.getDate() - (period === "week" ? 6 : 29));
  const sinceId = since.toISOString().slice(0, 10);
  const periodDays = Object.entries(deviceProgress.activity).filter(([id]) => period === "total" || id >= sinceId).map(([, day]) => day);
  const newWords = periodDays.reduce((sum, day) => sum + day.learned, 0);
  const reviews = periodDays.reduce((sum, day) => sum + day.reviews, 0);
  const retained = periodDays.reduce((sum, day) => sum + day.retained, 0);
  const studyMinutes = reviews * 3;
  const accuracy = reviews ? Math.round((retained / reviews) * 100) : null;

  // Minutes per day, last seven days.
  const days = lastSevenDays(deviceProgress.activity).map((day) => ({ ...day, minutes: day.reviews * 3 }));
  const maximumMinutes = Math.max(...days.map((day) => day.minutes), 1);

  // Character map for the chosen level.
  const mapTerms = overview.vocabulary.filter((term) => term.hsk_level === mapLevel);
  const statusOf = (term: OverviewTerm) => wordStatus(term.id, deviceProgress, knowledge);

  // Skill × modality heatmap.
  const metricValues = (metric: ReturnType<typeof skillMetric>) => [metric.reading, metric.writing, metric.speaking, metric.listening];
  const noEvidence = { reading: 0, writing: 0, speaking: 0, listening: 0 };
  const recognition = knowledge ? skillMetric(knowledge, "recognition") : noEvidence;
  const comprehension = knowledge ? skillMetric(knowledge, "comprehension") : noEvidence;
  const production = knowledge ? skillMetric(knowledge, "production") : noEvidence;
  const retention = knowledge ? skillMetric(knowledge, "retention") : noEvidence;
  const consistency = knowledge ? consistencyMetric(knowledge) : noEvidence;
  const confidence = knowledge ? evidenceConfidence(knowledge) : noEvidence;
  // Where the points of each row come from, column by column (Ler, Escrever, Falar, Ouvir);
  // it mirrors the modules that record each skill (see modalityFor in learning-paths/knowledge).
  const skillColumns = ["Ler", "Escrever", "Falar", "Ouvir"];
  const everyColumn = (text: string) => [text, text, text, text];
  const skills: { name: string; detail: string; values: number[]; sources?: (string | null)[] }[] = [
    { name: "Reconhecimento", detail: "Identificar corretamente uma palavra ou conceito", values: metricValues(recognition), sources: ["Flashcards (Aprender e Revisar da sessão), perguntas de escolha do Quiz e Bate-olho", null, null, null] },
    { name: "Compreensão", detail: "Entender o significado em contexto", values: metricValues(comprehension), sources: [null, null, null, "Ouça e monte"] },
    { name: "Produção", detail: "Conseguir escrever, formar ou utilizar corretamente", values: metricValues(production), sources: ["Quiz (montar frase e resposta escrita)", "Escrita guiada", "Construam uma frase juntos e Solte a Voz", null] },
    { name: "Retenção", detail: "Capacidade de lembrar após algum tempo", values: metricValues(retention) },
    { name: "Velocidade de resposta", detail: "O tempo ainda não é registrado pelos módulos", values: metricValues(noEvidence) },
    { name: "Consistência", detail: "Regularidade dos acertos em diferentes ocasiões", values: metricValues(consistency), sources: everyColumn("Mesmas fontes acima, quando você pratica a mesma palavra pelo menos 2 vezes") },
    { name: "Transferência", detail: "Ainda sem evidências de aplicação em contexto novo", values: metricValues(noEvidence) },
    { name: "Confiança estatística", detail: "Quantidade de evidências disponíveis", values: metricValues(confidence), sources: everyColumn("Cada resposta das atividades acima; chega a 100% com 10 respostas") },
  ];
  // Only the columns where the learner already has points are explained.
  const scoredSources = (skill: (typeof skills)[number]) => skillColumns.flatMap((column, index) => skill.values[index] > 0 && skill.sources?.[index] ? [{ column, text: skill.sources[index]! }] : []);
  const toneFor = (value: number) => value === 0 ? "no-data" : value >= 80 ? "excellent" : value >= 70 ? "good" : value >= 50 ? "developing" : value >= 30 ? "focus" : "initial";
  const periods: { id: ProgressPeriod; label: string }[] = [{ id: "week", label: "Semana" }, { id: "month", label: "Mês" }, { id: "total", label: "Total" }];

  return <section className="progress-v3" aria-label="Meu progresso em chinês">
    <h1>Seu progresso</h1>

    <div className="progress-v3-periods" role="tablist" aria-label="Período">
      {periods.map((item) => <button key={item.id} type="button" role="tab" aria-selected={period === item.id} className={period === item.id ? "active" : ""} onClick={() => setPeriod(item.id)}>{item.label}</button>)}
    </div>

    <div className="progress-v3-stats">
      <article><strong>{newWords}</strong><span>palavras novas</span></article>
      <article><strong>{formatStudyTime(studyMinutes)}</strong><span>de estudo</span></article>
      <article className="accuracy"><strong>{accuracy === null ? "—" : `${accuracy}%`}</strong><span>de acerto</span></article>
    </div>

    <section className="progress-v3-card progress-v3-chart">
      <h2>Minutos por dia</h2>
      <div className="progress-v3-bars">
        {days.map((day, index) => <div key={day.id} className={index === days.length - 1 ? "today" : ""}>
          <small>{day.minutes || ""}</small>
          <i style={{ height: `${day.minutes ? Math.max(8, (day.minutes / maximumMinutes) * 100) : 3}%` }} />
          <span>{day.label.replace(".", "")}</span>
        </div>)}
      </div>
    </section>

    {activeLevel && <section className="progress-v3-card progress-v3-goal">
      <header><h2>Rumo ao HSK {activeLevel.hsk_level}</h2><span>{activeLevel.learned} / {activeLevel.total} palavras</span></header>
      <i><em style={{ width: `${percent(activeLevel.learned, activeLevel.total)}%` }} /></i>
    </section>}

    <section className="progress-v3-card progress-v3-map-card">
      <header className="progress-v3-map-header">
        <h2>Mapa de caracteres</h2>
        {levels.length > 1 && <div className="progress-v3-levels">{levels.map((level) => <button key={level.hsk_level} type="button" className={mapLevel === level.hsk_level ? "active" : ""} onClick={() => setMapLevel(level.hsk_level)}>HSK {level.hsk_level}</button>)}</div>}
      </header>
      <ul className="progress-v3-map">
        {mapTerms.map((term) => <li key={term.id} className={statusOf(term)} title={`${term.hanzi} · ${term.pinyin} · ${term.portuguese}`} lang="zh-Hans">{term.hanzi}</li>)}
      </ul>
      <footer className="progress-v3-legend"><span><i className="mastered" />Dominado</span><span><i className="learning" />Aprendendo</span><span><i className="new" />Novo</span></footer>
    </section>

    <LearnedWordsPanel />

    <section className="progress-skill-panel" aria-labelledby="skill-panel-title"><header><div><h2 id="skill-panel-title">Desempenho por habilidade e modalidade</h2><p>Indicadores de prática do seu percurso atual.</p></div></header><div className="progress-skill-table"><div className="progress-skill-columns"><span>Habilidade</span><b>Ler</b><b>Escrever</b><b>Falar</b><b>Ouvir</b></div>{skills.map((skill) => { const sources = scoredSources(skill); const open = openSkill === skill.name; return <Fragment key={skill.name}><div className="progress-skill-row"><div><strong>{skill.name}{sources.length > 0 && <button type="button" className="progress-skill-info" aria-label="De onde vêm os pontos" aria-expanded={open} onClick={() => setOpenSkill(open ? null : skill.name)}><Info aria-hidden="true" size={14} strokeWidth={2.2} /></button>}</strong><small>{skill.detail}</small></div>{skill.values.map((value, index) => <span key={index} className={toneFor(value)}>{value}%</span>)}</div>{open && <div className="progress-skill-sources"><p>{skill.detail}</p><dl>{sources.map((source) => <Fragment key={source.column}><dt>{source.column}</dt><dd>{source.text}</dd></Fragment>)}</dl></div>}</Fragment>; })}</div><footer><span><i className="excellent" />90–100% Excelente</span><span><i className="good" />70–89% Bom</span><span><i className="developing" />50–69% Em desenvolvimento</span><span><i className="focus" />30–49% Precisa de reforço</span></footer></section>
  </section>;
}
