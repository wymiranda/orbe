import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Flame,
  Gamepad2,
  Play,
  Layers3,
  PenLine,
  type LucideIcon,
} from "lucide-react";
import "../../../App.css";
import { loadDeviceProgress, type DailyStudyActivity } from "../device-progress";
import { type StudyOverview, type CurrentUser, type Section, type StudyDifficulty, choosableDifficulties, levelNumber, sessionHskLevels, studyDifficultyLabels } from "./shared";

export function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return { hanzi: "早上好", text: "Bom dia" };
  if (hour < 18) return { hanzi: "下午好", text: "Boa tarde" };
  return { hanzi: "晚上好", text: "Boa noite" };
}

export function beijingNow() {
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "long" }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(value("hour"));
  const greeting = hour < 5
    ? { hanzi: "凌晨好", pinyin: "língchén hǎo", text: "Boa madrugada" }
    : hour < 12
      ? { hanzi: "早上好", pinyin: "zǎoshang hǎo", text: "Bom dia" }
      : hour < 18
        ? { hanzi: "下午好", pinyin: "xiàwǔ hǎo", text: "Boa tarde" }
        : { hanzi: "晚上好", pinyin: "wǎnshang hǎo", text: "Boa noite" };
  return { time: `${value("hour")}:${value("minute")}`, weekday: value("weekday"), greeting };
}

export function BeijingClock() {
  const [now, setNow] = useState(beijingNow);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(beijingNow()), 15_000);
    return () => window.clearInterval(interval);
  }, []);
  return (
    <section className="today-beijing" aria-label={`Agora em Pequim: ${now.time}, ${now.greeting.text}`}>
      <div className="today-beijing-time">
        <small><span lang="zh-Hans">北京</span> · Pequim</small>
        <strong>{now.time}</strong>
        <small>{now.weekday}</small>
      </div>
      <div className="today-beijing-greeting">
        <strong lang="zh-Hans">{now.greeting.hanzi}</strong>
        <span>{now.greeting.pinyin}</span>
        <small>{now.greeting.text} de Pequim</small>
      </div>
    </section>
  );
}

export function studyStreak(activity: Record<string, DailyStudyActivity>) {
  let streak = 0;
  const date = new Date();
  const todayId = date.toISOString().slice(0, 10);
  for (let offset = 0; offset < 366; offset += 1) {
    const id = date.toISOString().slice(0, 10);
    const day = activity[id];
    if (day && (day.reviews || day.learned)) streak += 1;
    else if (id !== todayId) break;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}

export const sessionActivities = [
  { glyph: "字", title: "Revisão de caracteres", description: "4 caracteres que precisam de reforço" },
  { glyph: "写", title: "Escrita", description: "Pratique traço por traço." },
  { glyph: "句", title: "Construa frases juntos", description: "3 frases com estruturas que você erra" },
  { glyph: "听", title: "Compreensão auditiva", description: "2 frases com vocabulário conhecido" },
  { glyph: "读", title: "Leitura contextual", description: "Um texto curto para consolidar" },
];

export function DailySessionHome({
  user,
  overview,
  onOpenSection,
  onStartLearningPath,
  onChangeStudySettings,
  onDismissSuggestion,
  onBrutalNoticeSeen,
  savingSettings = false,
}: {
  user: CurrentUser;
  overview: StudyOverview;
  onOpenSection: (section: Section) => void;
  onStartLearningPath: () => void;
  onChangeStudySettings: (settings: { hskLevel?: string; difficulty?: StudyDifficulty }) => void;
  onDismissSuggestion: () => void;
  onBrutalNoticeSeen: () => void;
  savingSettings?: boolean;
}) {
  const difficulty = user?.study_difficulty ?? "easy";
  const suggestion = user?.study_suggestion ?? null;
  // Announced once: the server is told right away, the notice stays until the page changes.
  const [brutalNotice] = useState(Boolean(user?.brutal_notice));
  useEffect(() => { if (brutalNotice) onBrutalNoticeSeen(); }, [brutalNotice]);
  const name = user?.display_name?.trim().split(/\s+/)[0] ?? "";
  const activeLevel = [...overview.hsk]
    .sort((first, second) => levelNumber(first.hsk_level) - levelNumber(second.hsk_level))
    .find((level) => level.learned < level.total) ?? overview.hsk[0];
  const sessionDuration = user?.session_duration_minutes ?? 15;
  const referenceLevel = user?.self_assessed_hsk_level ?? activeLevel?.hsk_level ?? "1";
  const difficulties = choosableDifficulties(Boolean(user?.brutal_levels?.includes(referenceLevel)));
  const activity = loadDeviceProgress().activity;
  const streak = studyStreak(activity);
  const reviewMinutes = Math.max(1, Math.ceil((overview.dueCount * 20) / 60));
  const greeting = greetingForNow();
  const shortcuts: { section: Section; label: string; hanzi: string; Icon: LucideIcon; tone: string }[] = [
    { section: "flashcards", label: "Flashcards", hanzi: "卡", Icon: Layers3, tone: "accent" },
    { section: "multiplayer", label: "Jogos", hanzi: "玩", Icon: Gamepad2, tone: "gold" },
    { section: "readings", label: "Leitura", hanzi: "读", Icon: BookOpen, tone: "ok" },
    { section: "writing", label: "Escrita", hanzi: "写", Icon: PenLine, tone: "info" },
  ];
  return (
    <div className="niorb-today">
      <header className="today-greeting">
        <div>
          <p><span lang="zh-Hans">{greeting.hanzi}</span> · {greeting.text}{name ? `, ${name}` : ""}</p>
          <h1>Vamos estudar?</h1>
        </div>
        <span className="today-streak" aria-label={`${streak} ${streak === 1 ? "dia" : "dias"} seguidos de estudo`}>
          <Flame aria-hidden="true" size={20} strokeWidth={2.25} />
          {streak} {streak === 1 ? "dia" : "dias"}
        </span>
      </header>

      <BeijingClock />

      <section className="today-session" aria-labelledby="today-session-title">
        <header>
          <p id="today-session-title">SUA SESSÃO DE HOJE</p>
          <button type="button" onClick={onStartLearningPath} aria-label="Iniciar sessão">
            <Play aria-hidden="true" size={18} strokeWidth={2.25} />
          </button>
        </header>
        <div className="today-session-main">
          <strong lang="zh-Hans" aria-hidden="true">{sessionActivities.map((item) => item.glyph).join("")}</strong>
          <div>
            <em>{sessionDuration} min</em>
            <span>{sessionActivities.length} atividades · HSK {referenceLevel}</span>
          </div>
        </div>
        <div className="today-session-settings">
          <div role="group" aria-label="Dificuldade">
            {difficulties.map((value) => (
              <button type="button" key={value} aria-pressed={difficulty === value} disabled={savingSettings} onClick={() => onChangeStudySettings({ difficulty: value })}>
                {studyDifficultyLabels[value]}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Nível HSK">
            {sessionHskLevels.map((level) => (
              <button type="button" key={level} aria-pressed={referenceLevel === level} disabled={savingSettings} onClick={() => onChangeStudySettings({ hskLevel: level })}>
                HSK {level}
              </button>
            ))}
          </div>
        </div>
        {brutalNotice && <p className="today-session-notice" role="status">Nível Brutal liberado.</p>}
        {suggestion && (
          <div className="today-session-suggestion" role="status">
            <p>
              {suggestion.kind === "difficulty"
                ? `Você está indo bem no ${studyDifficultyLabels[difficulty]}. Quer subir para ${studyDifficultyLabels[suggestion.difficulty]}?`
                : `Você domina o ${studyDifficultyLabels[difficulty]} do HSK ${referenceLevel}. Quer ir para o HSK ${suggestion.hskLevel}?`}
            </p>
            <div>
              <button
                type="button"
                disabled={savingSettings}
                onClick={() => onChangeStudySettings(suggestion.kind === "difficulty" ? { difficulty: suggestion.difficulty } : { hskLevel: suggestion.hskLevel, difficulty: "easy" })}
              >
                Subir
              </button>
              <button type="button" className="secondary" disabled={savingSettings} onClick={onDismissSuggestion}>Agora não</button>
            </div>
          </div>
        )}
      </section>

      <button type="button" className="today-review" onClick={() => onOpenSection("flashcards")}>
        <span>
          <strong>Revisar {overview.dueCount} {overview.dueCount === 1 ? "cartão" : "cartões"}</strong>
          <small>Cerca de {reviewMinutes} min · repetição espaçada</small>
        </span>
        <ArrowRight aria-hidden="true" size={20} strokeWidth={2.25} />
      </button>

      <nav className="today-shortcuts" aria-label="Atalhos de estudo">
        {shortcuts.map(({ section, label, hanzi, Icon, tone }) => (
          <button type="button" key={section} className={`tone-${tone}`} onClick={() => onOpenSection(section)}>
            <Icon aria-hidden="true" size={24} strokeWidth={2} />
            <strong>{label}</strong>
            <span lang="zh-Hans" aria-hidden="true">{hanzi}</span>
          </button>
        ))}
      </nav>

      <p className="today-motto">Estude com a determinação dos planos quinquenais chineses</p>
    </div>
  );
}
