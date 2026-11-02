import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Menu,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import "../../App.css";
import type { WritingPracticeItem } from "../../modules/writing/WritingModule";
import type { QuizQuestion, QuizSource } from "../../modules/quiz/QuizModule";
import { createCardsForVocabulary, loadDeviceProgress } from "./device-progress";
import { startStudySync } from "./study-sync";
import { chineseQuizSource } from "./quiz-source";
import { KnowledgeRepository } from "../../learning-paths/repository";
import type { ActivityRequest, ActivityResult, KnowledgeSnapshot } from "../../learning-paths/types";
import { LearningPathService } from "../../learning-paths/service";
import { trailById } from "../../learning-paths/trails";
import { recordModuleActivity } from "../../learning-paths/module-bridge";
import { isIntroduced, isKnown } from "../../learning-paths/knowledge";
import { practiceGamePlan, sessionGameOrder, type SessionGame } from "./session-games";
import { buildableSentences, nextSessionKind, weakWords } from "./session-plan";
import type { ListeningSource } from "../../modules/listen-build/ListenBuildModule";
import { chinesePictureSource, createChinesePictureSource } from "./picture-source";
import { createChineseListeningSource } from "./listening-source";
import { createChineseSpeakingSource } from "./speaking-source";
import { sentenceGameVocabulary } from "./sentence-game-vocabulary";
import { type HskProgress, type OverviewTerm, type StudyOverview, type CurrentUser, type Section, type StudyDifficulty, sessionHskLevels, withinDifficulty } from "./workspace/shared";
import { tabbar, WorkspaceNavigation } from "./workspace/navigation";
import { ProfilePage, NameOnboarding, SessionDurationOnboarding } from "./workspace/profile";
import { SessionProgress, TrailSentenceAnchor, GamesHome, TrailActivityIntroduction, type SessionStep } from "./workspace/session-screens";
import { ChineseWriting } from "./workspace/ChineseWriting";
import { DailySessionHome } from "./workspace/home";
import { ProgressDashboardV2 } from "./workspace/progress";
import { SessionSummary } from "./workspace/session-summary";

// Each area of the workspace is downloaded only when it is opened.
const ReadingsModule = lazy(() => import("../../modules/readings/ReadingsModule"));
const StudyModule = lazy(() => import("../../modules/study/StudyModule"));
const WritingModule = lazy(() => import("../../modules/writing/WritingModule"));
const QuizModule = lazy(() => import("../../modules/quiz/QuizModule"));
const SceneCertaModule = lazy(() => import("../../modules/scene-certa/SceneCertaModule"));
const ListenBuildModule = lazy(() => import("../../modules/listen-build/ListenBuildModule"));
const SpeakAloudModule = lazy(() => import("../../modules/speak-aloud/SpeakAloudModule"));
const ChineseAdmin = lazy(() => import("./ChineseAdmin"));
const MultiplayerModule = lazy(() => import("../../modules/multiplayer/MultiplayerModule"));
const MultiplayerPresence = lazy(() => import("../../modules/multiplayer/MultiplayerModule").then((module) => ({ default: module.MultiplayerPresence })));

/** Downloads every screen of the daily session up front, so moving from one step to the next never waits on the network. */
function preloadSessionModules() {
  void Promise.all([
    import("../../modules/study/StudyModule"),
    import("../../modules/writing/WritingModule"),
    import("../../modules/scene-certa/SceneCertaModule"),
    import("../../modules/listen-build/ListenBuildModule"),
    import("../../modules/multiplayer/MultiplayerModule"),
  ]).catch(() => undefined);
}

type ThemeChallenge = {
  theme: "light" | "dark";
  word: "lua" | "sol" | "claro" | "escuro" | "preto" | "branco" | "noite" | "dia" | "luz" | "sombra";
  answer: string;
};

function trailQuizSource(activity: ActivityRequest, onComplete?: () => void | Promise<void>): QuizSource {
  const sentences: Record<string, { prompt: string; tokens: string[] }> = {
    "zh-hans:sentence:我吃苹果": { prompt: "Monte a frase: eu como maçã.", tokens: ["我", "吃", "苹果"] },
    "zh-hans:sentence:我喝茶": { prompt: "Monte a frase: eu bebo chá.", tokens: ["我", "喝", "茶"] },
  };
  return {
    id: `trail:${activity.id}`,
    title: activity.objective,
    description: "Pratique a construção da frase indicada pela trilha.",
    loadSets: async () => [{ id: activity.id, label: "Próxima atividade" }],
    createSession: async () => ({ id: activity.id, title: activity.objective, questions: activity.content.flatMap((content): QuizQuestion[] => {
      const sentence = sentences[content.id];
      return sentence ? [{ id: content.id, contentIds: [content.id], type: "ordering", prompt: { text: sentence.prompt }, tokens: sentence.tokens.map((text, index) => ({ id: `${content.id}:${index}`, text })), answer: sentence.tokens.map((_text, index) => `${content.id}:${index}`) }] : [];
    }) }),
    onActivityResult: (result) => { void recordModuleActivity({ ...result, language: activity.language, requestId: activity.id }); },
    onComplete,
  };
}


const sessionSentencePlans = [
  { activityId: "introduce-i-drink-tea", roundIds: ["hsk1-i-drink-tea"] },
  { activityId: "introduce-want-and-not", roundIds: ["hsk1-i-want-drink-tea", "hsk1-i-not-drink-tea"] },
  { activityId: "introduce-i-eat-apple", roundIds: ["hsk1-i-eat-apple"] },
];

const themeChallenges: Record<ThemeChallenge["theme"], Omit<ThemeChallenge, "theme">[]> = {
  dark: [
    { word: "lua", answer: "月" },
    { word: "escuro", answer: "暗" },
    { word: "preto", answer: "黑" },
    { word: "noite", answer: "夜" },
    { word: "sombra", answer: "影" },
  ],
  light: [
    { word: "sol", answer: "日" },
    { word: "claro", answer: "明" },
    { word: "branco", answer: "白" },
    { word: "dia", answer: "日" },
    { word: "luz", answer: "光" },
  ],
};

function shuffleHanzi(options: string[]) {
  const shuffled = [...options];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function ChineseWorkspace({ onChooseWorkspace = () => {}, onLogout = () => {} }: { onChooseWorkspace?: () => void; onLogout?: () => void }) {
  const [section, setSection] = useState<Section>("home");
  const [overview, setOverview] = useState<StudyOverview | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeSnapshot | null>(null);
  const [trailActivity, setTrailActivity] = useState<ActivityRequest | null>(null);
  const [trailStudyStage, setTrailStudyStage] = useState<'learn' | 'review'>('learn');
  // Study results of the running session, recorded once at its end. A ref keeps
  // the latest value available to code that runs in the same tick as the update.
  const pendingStudyResult = useRef<ActivityResult | null>(null);
  const [sessionGameFallbacks, setSessionGameFallbacks] = useState<SessionGame[]>([]);
  // Plan of the running session. Refs, because the plan is read in the same
  // tick in which a session starts or a game ends.
  const sessionClock = useRef<number | null>(null);
  const sessionKind = useRef<"regular" | "practice">("regular");
  const practiceSentenceIds = useRef<string[]>([]);
  // Games and sentence rounds already played in this session; a ref, because a game may
  // report its end through a callback captured several renders earlier.
  const playedSessionGames = useRef<SessionGame[]>([]);
  const playedSessionSentenceRounds = useRef<string[]>([]);
  // Games of a practice session, chosen once when it starts.
  const practiceGames = useRef<SessionGame[]>([]);
  const sessionMainActivity = useRef<ActivityRequest | null>(null);
  // "Aprender" skipped with "Pular etapa": the words of the session were not learned.
  const learnSkipped = useRef(false);
  // Short review of the words the learner keeps getting wrong, at the start of a session.
  const [weakReview, setWeakReview] = useState<{ activity: ActivityRequest; stage: "cards" | "writing"; writingItems: WritingPracticeItem[] } | null>(null);
  const [studySessionLogId, setStudySessionLogId] = useState<string | null>(null);
  // End-of-session screen: the words introduced by the session that just ended.
  const [sessionSummary, setSessionSummary] = useState<{ words: string[]; reviewed: boolean } | null>(null);
  const [sessionWritingItems, setSessionWritingItems] = useState<WritingPracticeItem[] | null>(null);
  const [trailIntroductionSeen, setTrailIntroductionSeen] = useState(false);
  const [trailError, setTrailError] = useState("");
  const [overviewError, setOverviewError] = useState("");
  const [user, setUser] = useState<CurrentUser>(null);
  // Level of the session games: the learner's level, within the levels that have sentences.
  const sessionLevel = Math.min(Number(sessionHskLevels[sessionHskLevels.length - 1]), Math.max(1, Number(user?.self_assessed_hsk_level) || 1));
  const [gameRoom, setGameRoom] = useState("");
  const [activeGame, setActiveGame] = useState<"multiplayer" | "scene-certa" | "listen-build" | "speak-aloud" | null>(null);
  const [sessionPictureGame, setSessionPictureGame] = useState(false);
  const [sessionPictureSource, setSessionPictureSource] = useState(chinesePictureSource);
  // Each game of the session mounts fresh, even when the same game comes again.
  const [sessionGameRun, setSessionGameRun] = useState(0);
  const [sessionListeningSource, setSessionListeningSource] = useState<ListeningSource | null>(null);
  const [sessionSentenceRoundIds, setSessionSentenceRoundIds] = useState<string[] | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [savingStudySettings, setSavingStudySettings] = useState(false);
  // Answers given during the running session; its accuracy feeds the level-up suggestion.
  const sessionAnswers = useRef({ correct: 0, total: 0 });
  const [desktopMenuHidden, setDesktopMenuHidden] = useState(false);
  const [readingChapterOpen, setReadingChapterOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(
    () => window.localStorage.getItem("niorb-theme") === "dark" ? "dark" : "light",
  );
  const [themeChallenge, setThemeChallenge] = useState<ThemeChallenge | null>(null);
  const [themeChallengeOptions, setThemeChallengeOptions] = useState<string[]>([]);
  const [themeChallengeFailed, setThemeChallengeFailed] = useState(false);
  const [studiedHanzi, setStudiedHanzi] = useState<string[]>([]);
  const darkTheme = theme === "dark";
  useEffect(() => {
    if (section !== "readings") setReadingChapterOpen(false);
  }, [section]);
  function toggleTheme() {
    const nextTheme = darkTheme ? "light" : "dark";
    const availableChallenges = themeChallenges[nextTheme].filter((challenge) => studiedHanzi.includes(challenge.answer));
    if (!availableChallenges.length) {
      setTheme(nextTheme);
      window.localStorage.setItem("niorb-theme", nextTheme);
      return;
    }
    const challenge = availableChallenges[Math.floor(Math.random() * availableChallenges.length)];
    setThemeChallenge({ theme: nextTheme, ...challenge });
    setThemeChallengeOptions(shuffleHanzi(studiedHanzi));
    setThemeChallengeFailed(false);
  }
  function answerThemeChallenge(answer: string) {
    if (!themeChallenge) return;
    if (answer !== themeChallenge.answer) {
      setThemeChallengeFailed(true);
      return;
    }
    setTheme(themeChallenge.theme);
    window.localStorage.setItem("niorb-theme", themeChallenge.theme);
    setThemeChallenge(null);
  }
  function failThemeChallenge() {
    if (themeChallenge) setThemeChallengeFailed(true);
  }
  /** Answers with a right or wrong outcome; exposure-only results do not count. */
  function countSessionAnswers(result: ActivityResult | null | undefined) {
    if (!studySessionLogId || !result) return;
    const judged = result.assessments.filter((assessment) => assessment.correct !== undefined);
    sessionAnswers.current = { correct: sessionAnswers.current.correct + judged.filter((assessment) => assessment.correct).length, total: sessionAnswers.current.total + judged.length };
  }
  async function returnToTrailOrchestrator(completed = false) {
    if (completed && studySessionLogId) await fetch(`/api/study-sessions/${studySessionLogId}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answersCorrect: sessionAnswers.current.correct, answersTotal: sessionAnswers.current.total }) }).catch(() => undefined);
    sessionAnswers.current = { correct: 0, total: 0 };
    // Every completed session ends on the summary, where the words of its study activity fly to
    // the wall: new words, or the words reviewed when a finished trail replays its first activity.
    const main = sessionMainActivity.current;
    if (completed && studySessionLogId) setSessionSummary({ words: main?.moduleId === "study" && !learnSkipped.current ? main.content.map((content) => content.id) : [], reviewed: main?.mode === "verify" });
    learnSkipped.current = false;
    setStudySessionLogId(null);
    setSessionWritingItems(null);
    setTrailActivity(null);
    pendingStudyResult.current = null;
    setSessionGameFallbacks([]);
    sessionClock.current = null;
    sessionKind.current = "regular";
    practiceSentenceIds.current = [];
    practiceGames.current = [];
    playedSessionGames.current = [];
    sessionMainActivity.current = null;
    setWeakReview(null);
    setTrailStudyStage('learn');
    setSessionSentenceRoundIds(null);
    setSessionPictureGame(false);
    setSessionListeningSource(null);
    playedSessionSentenceRounds.current = [];
    setTrailIntroductionSeen(false);
    setSection("home");
  }
  async function completeTrailActivity(result: ActivityResult) {
    try {
      const activity = trailActivity;
      if (activity?.moduleId === "study" && trailStudyStage === 'learn') {
        pendingStudyResult.current = result;
        const items = await writingItemsFor(activity.content.map((content) => content.id));
        if (items.length) {
          setSessionWritingItems(items);
          setSection("writing");
          return;
        }
      }
      if (activity?.moduleId === "study" && trailStudyStage === 'review') {
        pendingStudyResult.current = { ...result, assessments: [...(pendingStudyResult.current?.assessments ?? []), ...result.assessments] };
        startSessionGame(sessionGameOrder());
        return;
      }
      countSessionAnswers(result);
      await recordModuleActivity(result);
      await returnToTrailOrchestrator(true);
    } catch (cause) {
      setTrailError(cause instanceof Error ? cause.message : "Não foi possível registrar a atividade concluída.");
    }
  }
  /** Words met before this session or in it (its results are recorded only at the end). */
  function studiedWord(snapshot: KnowledgeSnapshot | null, sessionResult: ActivityResult | null) {
    const inSession = new Set(sessionResult?.assessments.map((assessment) => assessment.contentId) ?? []);
    return (hanzi: string) => inSession.has(hanzi) || isIntroduced(snapshot?.contents[hanzi]) || isKnown(snapshot?.contents[hanzi]);
  }
  /** Plays the first available game of the queue; the rest are fallbacks. */
  function startSessionGame(queue: SessionGame[]) {
    const plannedMinutes = user?.session_duration_minutes ?? 15;
    const [game, ...fallbacks] = queue;
    if (!game || !sessionClock.current || Date.now() - sessionClock.current >= plannedMinutes * 60_000) { void finishSessionAfterGame(); return; }
    setSessionGameFallbacks(fallbacks);
    playedSessionGames.current = [...playedSessionGames.current, game];
    setSessionGameRun((run) => run + 1);
    if (game === "sentence") {
      const practiceRounds = practiceSentenceIds.current.filter((roundId) => !playedSessionSentenceRounds.current.includes(roundId)).slice(0, 2);
      const practicePlan = practiceRounds.length ? { roundIds: practiceRounds } : undefined;
      // A review-only session plays the trail sentences first, then any sentence the learner can build.
      const plan = sessionKind.current === "practice"
        ? practicePlan
        : sessionSentencePlans.find((candidate) => trailActivity?.id.endsWith(candidate.activityId) && candidate.roundIds.some((roundId) => !playedSessionSentenceRounds.current.includes(roundId))) ?? (reviewOnlySession() ? practicePlan : undefined);
      if (!plan) { startSessionGame(fallbacks); return; }
      playedSessionSentenceRounds.current = [...playedSessionSentenceRounds.current, ...plan.roundIds];
      setSessionSentenceRoundIds(plan.roundIds);
      setSection("multiplayer");
      return;
    }
    if (game === "listening") {
      setSessionListeningSource(createChineseListeningSource({ strict: true, maxLevel: sessionLevel, maxDifficulty: user?.study_difficulty, studiedWord: studiedWord(knowledge, pendingStudyResult.current) }));
      setSection("listen-build");
      return;
    }
    setSessionPictureSource(createChinesePictureSource({ studiedWord: studiedWord(knowledge, pendingStudyResult.current) }));
    setSessionPictureGame(true);
    setSection("scene-certa");
  }
  /** A finished trail only reviews its first activity: no new words and no writing, so games fill the time. */
  function reviewOnlySession() { return sessionKind.current === "regular" && sessionMainActivity.current?.mode === "verify"; }
  /**
   * A session game ended. A regular session ends here; a practice session
   * moves on to the next game of the plan drawn when it started (each game at
   * most once) while there is time left, and a review-only session keeps
   * drawing games until its time is up. A game under way is never cut: the
   * time is checked only when the next one would start.
   */
  function finishAfterSessionGame(result?: ActivityResult) {
    countSessionAnswers(result);
    if (result) void recordModuleActivity(result);
    if (sessionKind.current !== "practice" && !reviewOnlySession()) { void finishSessionAfterGame(); return; }
    setSessionPictureGame(false);
    setSessionListeningSource(null);
    setSessionSentenceRoundIds(null);
    startSessionGame(sessionKind.current === "practice" ? practiceGames.current.filter((game) => !playedSessionGames.current.includes(game)) : sessionGameOrder());
  }
  /** The learner left a game with "Sair": the session ends, keeping what was recorded. */
  function leaveSessionGame() { void finishSessionAfterGame(); }
  /** The drawn game had nothing to play: the next game of the queue takes its place. */
  function skipUnavailableSessionGame() {
    setSessionPictureGame(false);
    setSessionListeningSource(null);
    setSessionSentenceRoundIds(null);
    startSessionGame(sessionGameFallbacks);
  }
  async function finishSessionAfterGame() {
    try {
      countSessionAnswers(pendingStudyResult.current);
      if (pendingStudyResult.current) await recordModuleActivity(pendingStudyResult.current);
      await returnToTrailOrchestrator(true);
    } catch (cause) {
      setTrailError(cause instanceof Error ? cause.message : "Não foi possível registrar a atividade concluída.");
    }
  }
  /** "Pular etapa": the current step is left without a result and the session moves on to the next one. */
  async function skipSessionStep(step: SessionStep) {
    if (step === "Jogar") { finishAfterSessionGame(); return; }
    if (step === "Revisar") { startSessionGame(sessionGameOrder()); return; }
    if (step === "Escrita") { beginTrailReview(); return; }
    learnSkipped.current = true;
    const items = trailActivity ? await writingItemsFor(trailActivity.content.map((content) => content.id)).catch(() => []) : [];
    if (!items.length) { beginTrailReview(); return; }
    setSessionWritingItems(items);
    setSection("writing");
  }
  function beginTrailReview() {
    setSessionWritingItems(null);
    setTrailStudyStage('review');
    setSection('flashcards');
  }
  useEffect(() => {
    if (!themeChallengeFailed) return;
    const timeout = window.setTimeout(() => {
      setThemeChallenge(null);
      setThemeChallengeFailed(false);
    }, 1400);
    return () => window.clearTimeout(timeout);
  }, [themeChallengeFailed]);
  useEffect(() => {
    if (!themeChallenge || themeChallengeFailed) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      failThemeChallenge();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [themeChallenge, themeChallengeFailed]);
  useEffect(() => {
    void fetch("/api/auth/me")
      .then(async (response) =>
        response.ok
          ? (response.json() as Promise<{ user: CurrentUser }>)
          : { user: null },
      )
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null));
  }, []);
  useEffect(() => {
    if (!user) return;
    return startStudySync();
  }, [user]);
  useEffect(() => {
    const repository = new KnowledgeRepository();
    const refresh = () => { void repository.load().then(setKnowledge); };
    refresh();
    window.addEventListener("niorb:learning-knowledge", refresh);
    return () => window.removeEventListener("niorb:learning-knowledge", refresh);
  }, []);
  useEffect(() => {
    if (!user) return;
    void fetch("/api/auth/activity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ module: section }),
    });
  }, [section, user]);

  async function saveProfileName(displayName: string, selfAssessedHskLevel?: string, sessionDurationMinutes?: number) {
    const response = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, selfAssessedHskLevel, sessionDurationMinutes }),
    });
    const payload = (await response.json().catch(() => null)) as {
      user?: CurrentUser;
      error?: string;
    } | null;
    if (!response.ok || !payload?.user)
      throw new Error(payload?.error ?? "Não foi possível salvar seu nome.");
    setUser(payload.user);
  }
  /** Difficulty and level from the home card; the reply carries the refreshed suggestion. */
  async function updateStudySettings(path: string, init: RequestInit) {
    setSavingStudySettings(true);
    try {
      const response = await fetch(path, { ...init, headers: { "content-type": "application/json" } });
      const payload = (await response.json().catch(() => null)) as { user?: CurrentUser; error?: string } | null;
      if (payload?.user) setUser(payload.user);
      else if (payload?.error) setTrailError(payload.error);
    } catch { /* offline: the selection simply stays as it was */ } finally { setSavingStudySettings(false); }
  }
  async function saveSessionDuration(sessionDurationMinutes: number) {
    if (!user) return;
    await saveProfileName(user.display_name ?? "", undefined, sessionDurationMinutes);
  }
  async function writingItemsFor(contentIds: string[]): Promise<WritingPracticeItem[]> {
    const response = await fetch("/api/chinese/vocabulary");
    if (!response.ok) throw new Error("Não foi possível preparar a escrita guiada.");
    const vocabulary = (await response.json()) as { id: string; hanzi: string; pinyin: string; portuguese: string; hsk_level: string }[];
    const ids = new Set(contentIds);
    return vocabulary.filter((item) => ids.has(item.id)).map((item) => ({ id: item.id, glyph: item.hanzi, label: item.portuguese, detail: item.pinyin, hskLevel: item.hsk_level }));
  }
  async function startLearningPath() {
    setTrailError("");
    preloadSessionModules();
    const trail = trailById("zh-hans-hsk1-foundations");
    if (!trail) { setTrailError("A trilha inicial não está disponível."); return; }
    const studied = studiedWord(knowledge, null);
    let buildable: string[] = [];
    try {
      const response = await fetch("/api/chinese/sentences");
      const sentences = response.ok ? await response.json() as { id: string; level: string; difficulty: StudyDifficulty; tokens: string[] }[] : [];
      buildable = buildableSentences(sentences.filter((sentence) => Number(sentence.level) <= sessionLevel && withinDifficulty(sentence.difficulty, user?.study_difficulty)), studied).map((sentence) => sentence.id);
    } catch { /* without the sentence list the session is simply a regular one */ }
    const kind = nextSessionKind(buildable.length);
    const activity = kind === "regular" ? await new LearningPathService().next(trail) : null;
    if (kind === "regular" && !activity) { setTrailError("Você já concluiu as atividades disponíveis desta trilha."); return; }
    const logActivity = activity
      ? { requestId: activity.id, moduleId: activity.moduleId, objective: activity.objective, mode: activity.mode, contentIds: activity.content.map((content) => content.id) }
      : { requestId: `practice:${Date.now()}`, moduleId: "practice", objective: "Prática", mode: "verify", contentIds: [] as string[] };
    try {
      const response = await fetch("/api/study-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plannedDurationMinutes: user?.session_duration_minutes ?? 15, activity: logActivity }),
      });
      const payload = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!response.ok || !payload?.id) throw new Error(payload?.error ?? "Não foi possível registrar esta sessão.");
      setStudySessionLogId(payload.id);
      sessionAnswers.current = { correct: 0, total: 0 };
      sessionClock.current = Date.now();
      playedSessionSentenceRounds.current = [];
    } catch (cause) { setTrailError(cause instanceof Error ? cause.message : "Não foi possível iniciar a sessão."); return; }
    sessionKind.current = kind;
    practiceSentenceIds.current = buildable.sort(() => Math.random() - 0.5);
    sessionMainActivity.current = activity;
    // Words the learner keeps getting wrong come first: their card, then their writing.
    try {
      const vocabularyResponse = await fetch("/api/chinese/vocabulary");
      const available = vocabularyResponse.ok ? new Set(((await vocabularyResponse.json()) as { id: string }[]).map((term) => term.id)) : new Set<string>();
      const weak = weakWords(knowledge).filter((id) => available.has(id));
      if (weak.length) {
        createCardsForVocabulary(loadDeviceProgress(), weak);
        const review: ActivityRequest = { id: `weak-review:${Date.now()}`, language: "zh-Hans", moduleId: "study", objective: "Revisão", skill: "recognition", mode: "review", content: weak.map((id) => ({ id, kind: "lexeme" })) };
        setWeakReview({ activity: review, stage: "cards", writingItems: [] });
        setSection("flashcards");
        return;
      }
    } catch { /* the review is a bonus: without it the session goes on */ }
    await startSessionMain();
  }
  async function finishWeakCards(result: ActivityResult) {
    if (!weakReview) return;
    countSessionAnswers(result);
    try {
      await recordModuleActivity(result);
      const writingItems = await writingItemsFor(weakReview.activity.content.map((content) => content.id));
      if (writingItems.length) { setWeakReview({ ...weakReview, stage: "writing", writingItems }); setSection("writing"); return; }
    } catch { /* the writing step is skipped if the vocabulary cannot be loaded */ }
    setWeakReview(null);
    await startSessionMain();
  }
  async function finishWeakWriting() {
    setWeakReview(null);
    await startSessionMain();
  }
  /** The part of the session after the review: new words (regular) or only games (practice). */
  async function startSessionMain() {
    if (sessionKind.current === "practice") {
      practiceGames.current = practiceGamePlan(user?.session_duration_minutes ?? 15);
      startSessionGame(practiceGames.current);
      return;
    }
    const activity = sessionMainActivity.current;
    if (!activity) { await returnToTrailOrchestrator(); return; }
    if (activity.moduleId === "quiz") { setTrailActivity(activity); setTrailIntroductionSeen(false); setSection("quiz"); return; }
    if (activity.moduleId === "scene-certa") { setTrailActivity(activity); setSection("scene-certa"); return; }
    if (activity.moduleId === "listen-build") { setTrailActivity(activity); setSection("listen-build"); return; }
    if (activity.moduleId !== "study") { setTrailError("A próxima atividade desta trilha ainda não possui execução neste módulo."); return; }
    try {
      const response = await fetch("/api/chinese/vocabulary");
      if (!response.ok) throw new Error("Não foi possível preparar o vocabulário da trilha.");
      const vocabulary = await response.json() as { id: string }[];
      const available = new Set(vocabulary.map((term) => term.id));
      const contentIds = activity.content.map((content) => content.id).filter((id) => available.has(id));
      if (!contentIds.length) throw new Error("Os termos da próxima etapa ainda não estão no catálogo de vocabulário.");
      createCardsForVocabulary(loadDeviceProgress(), contentIds);
      setTrailActivity(activity);
      // Words already learned (a finished trail verifies its first activity) are reviewed, not presented again as new.
      setTrailStudyStage(activity.mode === "verify" ? 'review' : 'learn');
      setTrailIntroductionSeen(false);
      setSection("flashcards");
    } catch (cause) { setTrailError(cause instanceof Error ? cause.message : "Não foi possível iniciar a trilha."); }
  }
  useEffect(() => {
    if (section !== "home" && section !== "progress") return;
    let cancelled = false;
    void (async () => {
      try {
        const vocabularyResponse = await fetch("/api/chinese/vocabulary");
        if (!vocabularyResponse.ok)
          throw new Error("Não foi possível carregar seu progresso.");
        const vocabulary = (await vocabularyResponse.json()) as OverviewTerm[];
        const progress = loadDeviceProgress();
        const studiedCharacters = vocabulary
          .filter((item) => Boolean(progress.vocabulary[item.id]) && Array.from(item.hanzi).length === 1)
          .map((item) => item.hanzi);
        const hsk = Object.values(
          vocabulary.reduce(
            (levels, item) => {
              const level = levels[item.hsk_level] ?? {
                hsk_level: item.hsk_level,
                total: 0,
                learned: 0,
              };
              level.total += 1;
              if (progress.vocabulary[item.id] === "learned")
                level.learned += 1;
              levels[item.hsk_level] = level;
              return levels;
            },
            {} as Record<string, HskProgress>,
          ),
        );
        const learned = hsk.reduce((sum, level) => sum + level.learned, 0);
        const dueCount = progress.cards.filter(
          (card) => card.dueAt <= new Date().toISOString(),
        ).length;
        if (!cancelled)
          setOverview({
            coverage: { learned, total: vocabulary.length },
            hsk,
            dueCount,
            vocabulary,
          });
        if (!cancelled) setStudiedHanzi([...new Set(studiedCharacters)]);
      } catch (cause) {
        if (!cancelled)
          setOverviewError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar seu progresso.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [section]);
  const listeningMaxLevel = Number(user?.self_assessed_hsk_level) >= 2 ? 2 : 1;
  // The catalogue opens on the learner's level and difficulty; both can be changed before playing.
  const catalogListeningSource = useMemo(() => createChineseListeningSource({ maxLevel: listeningMaxLevel, choosable: { level: String(listeningMaxLevel), difficulty: user?.study_difficulty ?? "easy", brutalUnlocked: Boolean(user?.brutal_unlocked) } }), [listeningMaxLevel, user?.study_difficulty, user?.brutal_unlocked]);
  const catalogSpeakingSource = useMemo(() => createChineseSpeakingSource({ initial: { level: String(listeningMaxLevel), difficulty: user?.study_difficulty ?? "easy", brutalUnlocked: Boolean(user?.brutal_unlocked) } }), [listeningMaxLevel, user?.study_difficulty, user?.brutal_unlocked]);
  let content: React.ReactNode;
  if (sessionSummary && overview)
    content = <SessionSummary reviewed={sessionSummary.reviewed} newWords={sessionSummary.words.flatMap((id) => overview.vocabulary.filter((term) => term.id === id))} level={user?.self_assessed_hsk_level ?? "1"} vocabulary={overview.vocabulary} onDone={() => { setSessionSummary(null); setSection("home"); }} />;
  else if (section === "readings")
    content = <ReadingsModule embedded isAdmin={user?.role === "admin"} onReaderOpen={() => { setMenuVisible(false); setDesktopMenuHidden(true); }} onReadingChapterChange={setReadingChapterOpen} />;
  else if (section === "flashcards" && weakReview?.stage === "cards")
    content = <StudyModule key={weakReview.activity.id} embedded activity={weakReview.activity} activityStage="review" skipActivityIntroduction onComplete={finishWeakCards} onExit={returnToTrailOrchestrator} />;
  else if (section === "writing" && weakReview?.stage === "writing")
    content = <WritingModule key={weakReview.activity.id} items={weakReview.writingItems} embedded guidedOnly onComplete={finishWeakWriting} onExit={returnToTrailOrchestrator} />;
  else if (section === "flashcards") content = trailActivity?.anchor && !trailIntroductionSeen
    ? <TrailSentenceAnchor anchor={trailActivity.anchor} onStart={() => setTrailIntroductionSeen(true)} />
    : <StudyModule embedded activity={trailActivity} activityStage={trailStudyStage} skipActivityIntroduction wallLevel={user?.self_assessed_hsk_level ?? "1"} onComplete={completeTrailActivity} onExit={returnToTrailOrchestrator} />;
  else if (section === "writing") content = sessionWritingItems
    ? <WritingModule items={sessionWritingItems} embedded guidedOnly onComplete={beginTrailReview} onExit={returnToTrailOrchestrator} />
    : <ChineseWriting />;
  else if (section === "quiz")
    content = trailActivity?.moduleId === "quiz" && trailActivity.introduction && !trailIntroductionSeen
      ? <TrailActivityIntroduction activity={trailActivity} onStart={() => setTrailIntroductionSeen(true)} />
      : <QuizModule source={trailActivity?.moduleId === "quiz" ? trailQuizSource(trailActivity, () => returnToTrailOrchestrator(true)) : chineseQuizSource} embedded />;
  else if (section === "scene-certa" && sessionPictureGame)
    content = <SceneCertaModule key={`picture:${sessionGameRun}`} source={sessionPictureSource} embedded sessionMode onComplete={finishAfterSessionGame} onExit={leaveSessionGame} onUnavailable={skipUnavailableSessionGame} />;
  else if (section === "scene-certa")
    content = <SceneCertaModule source={chinesePictureSource} embedded activity={trailActivity?.moduleId === "scene-certa" ? trailActivity : null} onComplete={completeTrailActivity} onExit={returnToTrailOrchestrator} />;
  else if (section === "listen-build" && sessionListeningSource)
    content = <ListenBuildModule key={`listening:${sessionGameRun}`} source={sessionListeningSource} embedded sessionMode onComplete={finishAfterSessionGame} onExit={leaveSessionGame} onUnavailable={skipUnavailableSessionGame} />;
  else if (section === "listen-build")
    content = <ListenBuildModule source={catalogListeningSource} embedded activity={trailActivity?.moduleId === "listen-build" ? trailActivity : null} onComplete={completeTrailActivity} onExit={returnToTrailOrchestrator} />;
  else if (section === "multiplayer")
    content = sessionSentenceRoundIds
      ? <MultiplayerPresence onAcceptInvite={(code) => setGameRoom(code)}><MultiplayerModule vocabulary={sentenceGameVocabulary} key={sessionSentenceRoundIds.join(":")} sessionRoundIds={sessionSentenceRoundIds} sessionDifficulty={user?.study_difficulty} sessionLevel={String(sessionLevel)} embeddedSession onSessionComplete={() => finishAfterSessionGame()} userId={user?.id ?? ""} isAdmin={user?.role === "admin"} /></MultiplayerPresence>
      : activeGame === "scene-certa"
      ? <SceneCertaModule source={chinesePictureSource} embedded onExit={() => setActiveGame(null)} />
      : activeGame === "listen-build"
      ? <ListenBuildModule source={catalogListeningSource} embedded onExit={() => setActiveGame(null)} />
      : activeGame === "speak-aloud"
      ? <SpeakAloudModule source={catalogSpeakingSource} embedded onExit={() => setActiveGame(null)} />
      : activeGame === "multiplayer"
        ? <MultiplayerPresence onAcceptInvite={(code) => setGameRoom(code)}><MultiplayerModule vocabulary={sentenceGameVocabulary} key={gameRoom} initialRoomCode={gameRoom} startSentenceSetup userId={user?.id ?? ""} isAdmin={user?.role === "admin"} /></MultiplayerPresence>
        : <GamesHome isAdmin={user?.role === "admin"} onOpenSceneCerta={() => setActiveGame("scene-certa")} onOpenListening={() => setActiveGame("listen-build")} onOpenMultiplayer={() => setActiveGame("multiplayer")} onOpenSpeaking={() => setActiveGame("speak-aloud")} />;
  else if (section === "admin") content = <ChineseAdmin embedded />;
  else if (section === "profile")
    content = (
      <ProfilePage
        user={user}
        onSave={saveProfileName}
        onBack={() => setSection("home")}
      />
    );
  else if (section === "progress")
    content = (
      <main className="workspace-view">
        <section className="welcome chinese-dashboard">
          {overviewError && (
            <p className="error" role="alert">
              {overviewError}
            </p>
          )}
          {trailError && <p className="error" role="alert">{trailError}</p>}
          {overview && (
            <ProgressDashboardV2
              overview={overview}
              knowledge={knowledge}
            />
          )}
        </section>
      </main>
    );
  else
    content = (
      <main className="workspace-view">
        <section className="niorb-home" aria-label="Página inicial">
          {overviewError && (
            <p className="error" role="alert">
              {overviewError}
            </p>
          )}
          {trailError && <p className="error" role="alert">{trailError}</p>}
          {!overview && !overviewError && (
            <p className="empty dashboard-loading">Preparando seu panorama…</p>
          )}
          {overview && (
            <DailySessionHome
              user={user}
              overview={overview}
              onOpenSection={(next) => { setSection(next); if (next === "multiplayer") setActiveGame(null); }}
              onStartLearningPath={() => void startLearningPath()}
              onChangeStudySettings={(settings) => { setTrailError(""); void updateStudySettings("/api/auth/study-settings", { method: "PATCH", body: JSON.stringify(settings) }); }}
              onDismissSuggestion={() => void updateStudySettings("/api/auth/study-suggestion/dismiss", { method: "POST" })}
              onBrutalNoticeSeen={() => void fetch("/api/auth/brutal-notice/seen", { method: "POST" }).catch(() => undefined)}
              savingSettings={savingStudySettings}
            />
          )}
        </section>
      </main>
    );
  // The review of weak words and the practice session have no place in the step bar.
  const sessionProgressStep: SessionStep | null = !studySessionLogId || weakReview || sessionKind.current === "practice" ? null : section === "writing" ? "Escrita" : (section === "multiplayer" && sessionSentenceRoundIds) || (section === "scene-certa" && sessionPictureGame) || (section === "listen-build" && sessionListeningSource) ? "Jogar" : section === "flashcards" && trailStudyStage === "review" ? "Revisar" : "Aprender";
  const sessionSteps: SessionStep[] = trailActivity?.mode === "verify" ? ["Revisar", "Jogar"] : ["Aprender", "Escrita", "Revisar", "Jogar"];
  return (
      <div className={["workspace-layout", section === "home" ? "home-layout" : "", desktopMenuHidden ? "desktop-menu-hidden" : "", readingChapterOpen ? "reader-chapter-open" : "", darkTheme ? "theme-dark" : ""].filter(Boolean).join(" ")}>
        <header className="workspace-mobile-header">
          <button
            type="button"
            className="workspace-menu-toggle"
            aria-label={desktopMenuHidden ? "Mostrar menu" : "Abrir ou ocultar menu"}
            aria-expanded={
              window.matchMedia("(min-width: 48.0625rem)").matches
                ? !desktopMenuHidden
                : menuVisible
            }
            onClick={() => {
              if (window.matchMedia("(min-width: 48.0625rem)").matches)
                setDesktopMenuHidden((hidden) => !hidden);
              else setMenuVisible(true);
            }}
          >
            <Menu aria-hidden="true" size={21} strokeWidth={2.25} />
          </button>
          <div className="workspace-mobile-title">
            <strong>Chinês</strong>
          </div>
          <div className="workspace-mobile-actions">
            <button
              type="button"
              className="workspace-theme-toggle"
              aria-label={darkTheme ? "Ativar modo claro" : "Ativar modo escuro"}
              onClick={toggleTheme}
            >
              {darkTheme ? <Sun aria-hidden="true" size={19} strokeWidth={2.1} /> : <Moon aria-hidden="true" size={19} strokeWidth={2.1} />}
            </button>
            <details>
              <summary aria-label="Configurações"><Settings aria-hidden="true" size={20} strokeWidth={2.25} /></summary>
              <div className="workspace-settings-menu">
                <button
                  type="button"
                  onClick={(event) => {
                    setSection("profile");
                    event.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                >
                  Perfil
                </button>
                <button type="button" onClick={onChooseWorkspace}>Escolher workspace</button>
                <button type="button" onClick={onLogout}>Sair</button>
              </div>
            </details>
            <button
              type="button"
              className="workspace-back"
              onClick={() => setSection("home")}
              aria-label="Voltar ao início"
            >
              <ArrowLeft aria-hidden="true" size={20} strokeWidth={2.25} />
            </button>
          </div>
        </header>
        <WorkspaceNavigation
          section={section}
          onSelect={(next) => { setSection(next); if (next === "multiplayer") setActiveGame(null); }}
          onChooseWorkspace={onChooseWorkspace}
          isAdmin={user?.role === "admin"}
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
        />
        {!sessionProgressStep && !readingChapterOpen && !sessionSummary && (
          <nav className="workspace-tabbar" aria-label="Navegação principal">
            {tabbar.map(({ id, label, Icon }) => (
              <button
                type="button"
                key={id}
                className={section === id ? "active" : ""}
                aria-current={section === id ? "page" : undefined}
                onClick={() => { setSection(id); if (id === "multiplayer") setActiveGame(null); }}
              >
                <Icon aria-hidden="true" size={21} strokeWidth={section === id ? 2.3 : 1.9} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        )}
        <div className="workspace-main"><Suspense fallback={studySessionLogId
          // During a session the wait keeps the full-screen session look instead of uncovering the workspace behind it.
          ? <main className="study-session session-game-session" aria-busy="true"><section className="study-session-content"><div className="session-game-loading" /></section></main>
          : <main className="workspace-view app-loading" aria-busy="true" />}>{content}</Suspense></div>
        {sessionProgressStep && <SessionProgress steps={sessionSteps} current={sessionProgressStep} onSkip={() => void skipSessionStep(sessionProgressStep)} />}
        {user && !user.display_name?.trim() && (
          <NameOnboarding onSave={saveProfileName} />
        )}
        {user && user.display_name?.trim() && !user.session_duration_minutes && (
          <SessionDurationOnboarding onSave={saveSessionDuration} />
        )}
        {themeChallenge && (
          <div
            className="theme-challenge-backdrop"
            role="presentation"
            onMouseDown={failThemeChallenge}
          >
            <section
              className="theme-challenge"
              role="dialog"
              aria-modal="true"
              aria-labelledby="theme-challenge-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              {themeChallengeFailed ? (
                <h2 id="theme-challenge-title">Volte quando aprender...</h2>
              ) : (
                <>
                  <h2 id="theme-challenge-title">
                    Só te deixo mudar pro modo {themeChallenge.theme === "dark" ? "escuro" : "claro"} se você acertar o hanzi da palavra {themeChallenge.word}.
                  </h2>
                  <div className="theme-hanzi-options">
                    {themeChallengeOptions.map((hanzi) => (
                      <button
                        key={hanzi}
                        type="button"
                        onClick={() => answerThemeChallenge(hanzi)}
                        aria-label={`Escolher ${hanzi}`}
                      >
                        {hanzi}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
  );
}

export default ChineseWorkspace;
