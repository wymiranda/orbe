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
import { createCardsForVocabulary, loadDeviceProgress, loadOfflineVocabulary, rateCard, saveDeviceProgress, setVocabularyLearned } from "./device-progress";
import { startStudySync } from "./study-sync";
import { chineseFlashcardSource } from "./flashcard-source";
import { SaveSentenceButton, StudySentencesButton, sentenceFlashcardSource } from "./saved-sentences";
import { chineseQuizSource } from "./quiz-source";
import { KnowledgeRepository } from "../../learning-paths/repository";
import type { ActivityRequest, ActivityResult, KnowledgeSnapshot } from "../../learning-paths/types";
import { LearningPathService } from "../../learning-paths/service";
import { trailById } from "../../learning-paths/trails";
import { declareModuleKnowledge, onModuleActivity, recordModuleActivity } from "../../learning-paths/module-bridge";
import { isIntroduced, isKnown } from "../../learning-paths/knowledge";
import { practiceGamePlan, sessionGameOrder, type SessionGame } from "./session-games";
import { buildableSentences, difficultWords, focusFirst, fragileWord, newWordsPerSession, placementSentenceOrder, placementStatus, placementWords, lastSessionWords, nextSessionKind, nextWordsToLearn, overdueReview, rememberSessionWords, sessionPace, starterWords, recentSessionSentences, rememberSessionSentences, reviewCatchUpTurn, weakWords, wordsReviewedBySentences } from "./session-plan";
import type { ListeningSource } from "../../modules/listen-build/ListenBuildModule";
import { chinesePictureSource, createChinesePictureSource } from "./picture-source";
import { createChineseListeningSource, sentenceContentId } from "./listening-source";
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


/** A free round in a session's "Construam uma frase": its chance, and the words needed to build freely. */
const freeRoundChance = 0.5;
const freeRoundMinimumWords = 8;

/** The bookmark of the sentence games: saves the sentence for Flashcards → Estudar frases. */
const saveSentenceAction = (sentence: { id: string }) => <SaveSentenceButton sentenceId={sentence.id} />;
const saveRoundAction = (roundId: string) => <SaveSentenceButton sentenceId={roundId} />;

/** A sentence heard in "Ouça e monte" this recently goes to the end of the next session's queue. */
const playedLatelyMs = 2 * 86_400_000;

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
  // Sentences of the session's level and difficulty; the games play those the learner can build when they start.
  const sessionSentences = useRef<{ id: string; level: string; tokens: string[] }[]>([]);
  // A learner who jumped to a level: the words up to it still taken as known, playable in the games.
  const sessionAssumed = useRef<Set<string>>(new Set());
  // Words proven during this session (placement): they fly to the wall at its end.
  const provenThisSession = useRef<string[]>([]);
  // Catalogue words of the session's level: the sentence game's hand holds only those already learned.
  const sessionVocabulary = useRef<string[]>([]);
  // Every catalogue word: overdue flashcards of any level can join the session's review.
  const sessionCatalogue = useRef<Set<string>>(new Set());
  const [sessionKnownWords, setSessionKnownWords] = useState<string[]>([]);
  // "Construam uma frase" in a session: at most one free round (any sentence) per session, and only sometimes.
  const [sessionFreeRound, setSessionFreeRound] = useState(false);
  const freeRoundPlayed = useRef(false);
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
    const proven = provenThisSession.current;
    if (completed && studySessionLogId) setSessionSummary({ words: [...new Set([...(main?.moduleId === "study" && !learnSkipped.current ? main.content.map((content) => content.id) : []), ...proven])], reviewed: (main?.mode === "verify" || main?.mode === "review") && !proven.length });
    provenThisSession.current = [];
    sessionAssumed.current = new Set();
    learnSkipped.current = false;
    setStudySessionLogId(null);
    setSessionWritingItems(null);
    setTrailActivity(null);
    pendingStudyResult.current = null;
    setSessionGameFallbacks([]);
    sessionClock.current = null;
    sessionKind.current = "regular";
    sessionSentences.current = [];
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
  /** The words this session is about: its new words, or the words a focus session works on (none in a practice session). */
  function sessionFocusWords() {
    const main = sessionMainActivity.current;
    const own = main?.moduleId === "study" && (main.mode === "introduce" || main.mode === "review") && !learnSkipped.current ? main.content.map((content) => content.id) : [];
    // After a jump, the words still to prove come first.
    return own.length ? own : [...sessionAssumed.current];
  }
  /** Words learned, plus, after a jump, the words still taken as known: what the session games may use. */
  function sessionPlayable(snapshot: KnowledgeSnapshot | null, sessionResult: ActivityResult | null) {
    const studied = studiedWord(snapshot, sessionResult);
    return (hanzi: string) => studied(hanzi) || sessionAssumed.current.has(hanzi);
  }
  /** Words the learner finds hard right now (flashcards marked hard, words often missed): the games bring them back. */
  function sessionDifficultWords() { return difficultWords(loadDeviceProgress().cards, knowledge); }
  /** Sentences the learner can build now, words learned in this session included; those with its new words first. */
  function sessionPracticeSentenceIds() {
    const ordered = focusFirst(buildableSentences(sessionSentences.current, sessionPlayable(knowledge, pendingStudyResult.current)), sessionFocusWords(), Math.random, recentSessionSentences(), sessionDifficultWords());
    const placement = Math.min(Number(user?.placement_level ?? 0) || 0, sessionLevel);
    return (placement && sessionAssumed.current.size ? placementSentenceOrder(ordered, String(placement), [...sessionAssumed.current]) : ordered).map((sentence) => sentence.id);
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
      const practiceRounds = sessionPracticeSentenceIds().filter((roundId) => !playedSessionSentenceRounds.current.includes(roundId)).slice(0, 2);
      const practicePlan = practiceRounds.length ? { roundIds: practiceRounds } : undefined;
      // The sentences of the trail activity first, then any sentence the learner can build.
      const plan = sessionKind.current === "practice"
        ? practicePlan
        : sessionSentencePlans.find((candidate) => trailActivity?.id.endsWith(candidate.activityId) && candidate.roundIds.some((roundId) => !playedSessionSentenceRounds.current.includes(roundId))) ?? practicePlan;
      if (!plan) { startSessionGame(fallbacks); return; }
      playedSessionSentenceRounds.current = [...playedSessionSentenceRounds.current, ...plan.roundIds];
      rememberSessionSentences(plan.roundIds);
      const known = sessionPlayable(knowledge, pendingStudyResult.current);
      const knownWords = sessionVocabulary.current.filter((word) => known(word));
      setSessionKnownWords(knownWords);
      // Half the time, if none was played yet, the game keeps a mission, and there are words enough to build freely.
      const free = !freeRoundPlayed.current && plan.roundIds.length >= 2 && knownWords.length >= freeRoundMinimumWords && Math.random() < freeRoundChance;
      if (free) freeRoundPlayed.current = true;
      setSessionFreeRound(free);
      setSessionSentenceRoundIds(plan.roundIds);
      setSection("multiplayer");
      return;
    }
    if (game === "listening") {
      setSessionListeningSource(createChineseListeningSource({ strict: true, maxLevel: sessionLevel, maxDifficulty: user?.study_difficulty, studiedWord: sessionPlayable(knowledge, pendingStudyResult.current), focusWords: sessionFocusWords(), difficultWords: sessionDifficultWords(), playedLately: (sentence) => (knowledge?.contents[sentence.contentIds[0]]?.updatedAt ?? 0) > Date.now() - playedLatelyMs, brutalBoost: Boolean(user?.brutal_boost), sentenceAction: saveSentenceAction, onBrutalCorrect: recordBrutalCorrect }));
      setSection("listen-build");
      return;
    }
    setSessionPictureSource(createChinesePictureSource({ studiedWord: sessionPlayable(knowledge, pendingStudyResult.current), focusWords: sessionFocusWords(), difficultWords: sessionDifficultWords() }));
    setSessionPictureGame(true);
    setSection("scene-certa");
  }
  /** A finished trail with no new word left only reviews its first activity: no writing, so games fill the time. */
  function reviewOnlySession() { return sessionKind.current === "regular" && (sessionMainActivity.current?.mode === "verify" || sessionMainActivity.current?.mode === "review"); }
  /**
   * A session game ended. A regular session ends here; a practice session
   * moves on to the next game of the plan drawn when it started (each game at
   * most once) while there is time left, and so does a review-only session:
   * it ends early rather than repeat a game. A game under way is never cut:
   * the time is checked only when the next one would start.
   */
  function finishAfterSessionGame(result?: ActivityResult) {
    countSessionAnswers(result);
    if (result) void recordModuleActivity(result);
    if (sessionKind.current !== "practice" && !reviewOnlySession()) { void finishSessionAfterGame(); return; }
    setSessionPictureGame(false);
    setSessionListeningSource(null);
    setSessionSentenceRoundIds(null);
    startSessionGame((sessionKind.current === "practice" ? practiceGames.current : sessionGameOrder()).filter((game) => !playedSessionGames.current.includes(game)));
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
    // The review of weak words that opens a session: its cards go on to its writing, its writing to the session itself.
    if (weakReview) {
      if (weakReview.stage === "writing") { await finishWeakWriting(); return; }
      const writingItems = await writingItemsFor(weakReview.activity.content.map((content) => content.id)).catch(() => []);
      if (writingItems.length) { setWeakReview({ ...weakReview, stage: "writing", writingItems }); setSection("writing"); return; }
      setWeakReview(null);
      await startSessionMain();
      return;
    }
    if (step === "Jogar") { finishAfterSessionGame(); return; }
    if (step === "Revisar") { startSessionGame(sessionGameOrder()); return; }
    if (step === "Escrita") { beginTrailReview(); return; }
    learnSkipped.current = true;
    const items = trailActivity ? await writingItemsFor(trailActivity.content.map((content) => content.id)).catch(() => []) : [];
    if (!items.length) { beginTrailReview(); return; }
    setSessionWritingItems(items);
    setSection("writing");
  }
  /** The session's words, then the overdue flashcards this session takes on (see overdueReview). */
  function withOverdueReviews(activity: ActivityRequest): ActivityRequest {
    const turn = reviewCatchUpTurn();
    const own = activity.content.map((content) => content.id);
    const cards = loadDeviceProgress().cards.filter((card) => sessionCatalogue.current.has(card.vocabularyId));
    const { ids, catchUp } = overdueReview(cards, { exclude: own, catchUpTurn: turn.due });
    turn.record(catchUp);
    return ids.length ? { ...activity, content: [...activity.content, ...ids.map((id) => ({ id, kind: "lexeme" as const }))] } : activity;
  }
  function beginTrailReview() {
    setSessionWritingItems(null);
    if (trailActivity) setTrailActivity(withOverdueReviews(trailActivity));
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
  // After a jump, a word proven in the sentence games (see placementStatus) becomes a learned word;
  // during a session it also flies to the wall at the end.
  useEffect(() => {
    const placement = Number(user?.placement_level ?? 0) || 0;
    if (!placement || !knowledge) return;
    const progress = loadDeviceProgress();
    const learned = studiedWord(knowledge, null);
    const proven = loadOfflineVocabulary().filter((term) => Number(term.hsk_level) <= placement && progress.vocabulary[term.id] !== "learned" && !learned(term.id) && placementStatus(knowledge, term.id) === "proven").map((term) => term.id);
    if (!proven.length) return;
    for (const id of proven) { setVocabularyLearned(progress, id); sessionAssumed.current.delete(id); void declareModuleKnowledge(id, "known"); }
    saveDeviceProgress(progress);
    if (studySessionLogId) provenThisSession.current = [...new Set([...provenThisSession.current, ...proven])];
  }, [knowledge, user?.placement_level, studySessionLogId]);
  // A word used right in a sentence game while its flashcard is overdue counts as reviewed ("good").
  useEffect(() => onModuleActivity((result) => {
    if (result.language !== "zh-Hans") return;
    for (const id of wordsReviewedBySentences(result, loadDeviceProgress().cards)) rateCard(loadDeviceProgress(), id, "good");
  }), []);
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
  /** A surprise Brutal round answered correctly; the user is refreshed only when it unlocks Brutal somewhere new. */
  function recordBrutalCorrect(sentenceId: string) {
    void fetch("/api/auth/brutal-progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sentenceId }) })
      .then(async (response) => response.ok ? (await response.json() as { user?: CurrentUser }).user : null)
      .then((next) => { if (next) setUser((current) => (current?.brutal_levels ?? []).join() === (next.brutal_levels ?? []).join() ? current : next); })
      .catch(() => undefined);
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
    const vocabulary = await fetch("/api/chinese/vocabulary").then(async (response) => response.ok ? await response.json() as { id: string; hsk_level: string }[] : []).catch(() => []);
    // A learner who jumped to a level plays that level at once: the words up to it count as known
    // until the games prove otherwise; failed words are taught again; no trail (see placementWords).
    const placementLevel = Math.min(Number(user?.placement_level ?? 0) || 0, sessionLevel);
    const placing = placementLevel ? placementWords({ vocabulary, placement: placementLevel, learned: (id) => studied(id) || loadDeviceProgress().vocabulary[id] === "learned", snapshot: knowledge }) : { assumed: [], failed: [] };
    const placingActive = placing.assumed.length > 0 || placing.failed.length > 0;
    sessionAssumed.current = new Set(placing.assumed);
    provenThisSession.current = [];
    freeRoundPlayed.current = false;
    const playable = (id: string) => studied(id) || sessionAssumed.current.has(id);
    let buildable: string[] = [];
    // Only the sentences of the learner's level and difficulty: those are the ones the games play.
    let playedSentences: { id: string; level: string; difficulty: StudyDifficulty; tokens: string[] }[] = [];
    try {
      const response = await fetch("/api/chinese/sentences");
      const catalogSentences = response.ok ? await response.json() as typeof playedSentences : [];
      playedSentences = catalogSentences.filter((sentence) => Number(sentence.level) <= sessionLevel && withinDifficulty(sentence.difficulty, user?.study_difficulty));
      buildable = buildableSentences(playedSentences, playable).map((sentence) => sentence.id);
    } catch { /* without the sentence list the session is simply a regular one */ }
    const kind = placingActive ? (placing.failed.length ? "regular" : "practice") : nextSessionKind(buildable.length, window.localStorage, vocabulary.filter((term) => studied(term.id)).length);
    const placementActivity: ActivityRequest = { id: `zh-hans:placement-words:${Date.now()}`, language: "zh-Hans", moduleId: "study", objective: "Palavras novas", skill: "recognition", mode: "introduce", content: placing.failed.slice(0, newWordsPerSession).map((id) => ({ id, kind: "lexeme" })) };
    let activity = kind !== "regular" ? null : placingActive ? placementActivity : await new LearningPathService().next(trail);
    // A finished trail would replay its first activity: the session's pace decides instead between
    // new words of the learner's level and a session on the words that need it (see sessionPace).
    let focusSession = false;
    // A trail step whose words the learner already knows (proven after a jump, or marked as known) is done too.
    const trailStepKnown = activity?.mode === "introduce" && !placingActive && activity.id.startsWith(trail.id) && activity.content.every((content) => studied(content.id));
    if (activity?.mode === "verify" || trailStepKnown) {
      const deckCards = new Map(loadDeviceProgress().cards.map((card) => [card.vocabularyId, card]));
      const known = (id: string) => studied(id) || deckCards.get(id)?.isNew === false;
      const catalogued = new Set(vocabulary.map((term) => term.id));
      const now = new Date().toISOString();
      const weak = weakWords(knowledge, { scheduledLater: (id) => { const card = deckCards.get(id); return Boolean(card && !card.isNew && card.dueAt > now); } }).filter((id) => catalogued.has(id));
      const lastWords = lastSessionWords();
      // A word just learned stays fragile for a while, but its card waits its interval: it only counts once due.
      const dueNow = (id: string) => { const card = deckCards.get(id); return !card || card.isNew || card.dueAt <= now; };
      const fragile = (lastWords ?? []).filter((id) => fragileWord(knowledge, id) && dueNow(id));
      const recent = recentSessionSentences();
      const buildableIds = new Set(buildable);
      const freshSentences = playedSentences.filter((sentence) => buildableIds.has(sentence.id) && !recent.includes(sentence.id) && !knowledge?.contents[sentenceContentId(sentence.tokens)]).length;
      const pace = sessionPace({ starterLeft: starterWords.filter((word) => catalogued.has(word) && !known(word)).length, weakCount: weak.length, lastNewWords: lastWords?.length ?? null, lastWordsFragile: fragile.length > 0, freshSentences, knownWords: vocabulary.filter((term) => known(term.id)).length });
      const words = pace.newWords ? nextWordsToLearn({ vocabulary, sentences: playedSentences, level: sessionLevel, studied: known, limit: pace.newWords }) : [];
      const focus = pace.focus === "weak" ? weak : pace.focus === "recent" ? fragile : [];
      if (words.length) activity = { id: `zh-hans:new-words:${Date.now()}`, language: "zh-Hans", moduleId: "study", objective: "Palavras novas", skill: "recognition", mode: "introduce", content: words.map((id) => ({ id, kind: "lexeme" })) };
      else if (focus.length) { activity = { id: `zh-hans:focus:${Date.now()}`, language: "zh-Hans", moduleId: "study", objective: "Revisão", skill: "recognition", mode: "review", content: focus.map((id) => ({ id, kind: "lexeme" })) }; focusSession = pace.focus === "weak"; }
      rememberSessionWords(words);
      // Nothing new to teach: the known step is reviewed rather than taught again.
      if (activity?.mode === "introduce" && !words.length) activity = { ...activity, mode: "review" };
    }
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
    sessionSentences.current = playedSentences;
    sessionVocabulary.current = vocabulary.filter((term) => Number(term.hsk_level) <= sessionLevel).map((term) => term.id);
    sessionCatalogue.current = new Set(vocabulary.map((term) => term.id));
    sessionMainActivity.current = activity;
    // Words the learner keeps getting wrong and that are due come first: their card, then their writing.
    try {
      const available = new Set(vocabulary.map((term) => term.id));
      const now = new Date().toISOString();
      const cards = loadDeviceProgress().cards;
      const scheduledLater = (id: string) => cards.some((card) => card.vocabularyId === id && !card.isNew && card.dueAt > now);
      // A session already about the weak words does not open with them again.
      const weak = focusSession ? [] : weakWords(knowledge, { scheduledLater }).filter((id) => available.has(id));
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
      const catalogued = activity.content.map((content) => content.id).filter((id) => available.has(id));
      if (!catalogued.length) throw new Error("Os termos da próxima etapa ainda não estão no catálogo de vocabulário.");
      // A step that grew (水 joined 想 and 不) teaches only the words still new to the learner.
      // Same test as the trail uses to call a step done, so the step always completes.
      const fresh = activity.mode === "introduce" ? catalogued.filter((id) => !isIntroduced(knowledge?.contents[id])) : catalogued;
      const contentIds = fresh.length ? fresh : catalogued;
      const taught = contentIds.length === activity.content.length ? activity : { ...activity, content: activity.content.filter((content) => contentIds.includes(content.id)) };
      sessionMainActivity.current = taught;
      const reviewing = activity.mode === "verify" || activity.mode === "review";
      if (reviewing) {
        // A review only shows cards whose review is due (and the overdue ones): a card studied a
        // moment ago waits its interval. Nothing due: the session goes straight to its games.
        const now = new Date().toISOString();
        const cards = new Map(loadDeviceProgress().cards.map((card) => [card.vocabularyId, card]));
        const due = taught.content.filter((content) => { const card = cards.get(content.id); return !card || card.isNew || card.dueAt <= now; });
        const review = withOverdueReviews({ ...taught, content: due });
        setTrailActivity(review);
        if (!review.content.length) { startSessionGame(sessionGameOrder()); return; }
        createCardsForVocabulary(loadDeviceProgress(), review.content.map((content) => content.id));
        setTrailStudyStage('review');
        setTrailIntroductionSeen(false);
        setSection("flashcards");
        return;
      }
      createCardsForVocabulary(loadDeviceProgress(), contentIds);
      setTrailActivity(taught);
      // Words already learned (a finished trail verifies its first activity) are reviewed, not presented again as new.
      setTrailStudyStage(activity.mode === "verify" || activity.mode === "review" ? 'review' : 'learn');
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
  // Kept stable while the levels are the same: a new source would reload the game being played.
  const brutalLevelsKey = (user?.brutal_levels ?? []).join();
  const brutalLevels = useMemo(() => brutalLevelsKey ? brutalLevelsKey.split(",") : [], [brutalLevelsKey]);
  // The catalogue opens on the learner's level and difficulty; both can be changed before playing.
  // The Flashcards tab studies words; "Estudar frases" opens straight on the sentences saved from
  // the games, and leaving that study comes back here. Its own dashboard only shows when there is
  // nothing to study, with the way back to the words.
  const [flashcardDeck, setFlashcardDeck] = useState<"words" | "sentences">("words");
  const flashcardSource = useMemo(() => chineseFlashcardSource(user?.self_assessed_hsk_level ?? "1", () => <StudySentencesButton onStudy={() => setFlashcardDeck("sentences")} />), [user?.self_assessed_hsk_level]);
  const sentenceDeckSource = useMemo(() => sentenceFlashcardSource(() => <div className="flashcard-deck-switch"><button type="button" className="secondary" onClick={() => setFlashcardDeck("words")}>Estudar palavras</button></div>), []);
  // The catalogue games play only words the learner has learned too; read through a ref so a new
  // result does not rebuild the game being played.
  const learnedWord = useRef<(hanzi: string) => boolean>(() => false);
  useEffect(() => { learnedWord.current = studiedWord(knowledge, null); }, [knowledge]);
  const catalogPictureSource = useMemo(() => createChinesePictureSource({ studiedWord: (hanzi) => learnedWord.current(hanzi) }), []);
  const catalogListeningSource = useMemo(() => createChineseListeningSource({ maxLevel: listeningMaxLevel, studiedWord: (hanzi) => learnedWord.current(hanzi), choosable: { level: String(listeningMaxLevel), difficulty: user?.study_difficulty ?? "easy", brutalLevels }, brutalBoost: Boolean(user?.brutal_boost), sentenceAction: saveSentenceAction, onBrutalCorrect: recordBrutalCorrect }), [listeningMaxLevel, user?.study_difficulty, brutalLevels, user?.brutal_boost]);
  const catalogSpeakingSource = useMemo(() => createChineseSpeakingSource({ studiedWord: (hanzi) => learnedWord.current(hanzi), initial: { level: String(listeningMaxLevel), difficulty: user?.study_difficulty ?? "easy", brutalLevels } }), [listeningMaxLevel, user?.study_difficulty, brutalLevels]);
  let content: React.ReactNode;
  if (sessionSummary && overview)
    content = <SessionSummary reviewed={sessionSummary.reviewed} newWords={sessionSummary.words.flatMap((id) => overview.vocabulary.filter((term) => term.id === id))} level={user?.self_assessed_hsk_level ?? "1"} vocabulary={overview.vocabulary} onDone={() => { setSessionSummary(null); setSection("home"); }} />;
  else if (section === "readings")
    content = <ReadingsModule embedded isAdmin={user?.role === "admin"} onReaderOpen={() => { setMenuVisible(false); setDesktopMenuHidden(true); }} onReadingChapterChange={setReadingChapterOpen} />;
  else if (section === "flashcards" && weakReview?.stage === "cards")
    content = <StudyModule key={weakReview.activity.id} source={flashcardSource} embedded activity={weakReview.activity} activityStage="review" skipActivityIntroduction onComplete={finishWeakCards} onExit={returnToTrailOrchestrator} />;
  else if (section === "writing" && weakReview?.stage === "writing")
    content = <WritingModule key={weakReview.activity.id} items={weakReview.writingItems} embedded guidedOnly onComplete={finishWeakWriting} onExit={returnToTrailOrchestrator} />;
  else if (section === "flashcards") content = trailActivity?.anchor && !trailIntroductionSeen
    ? <TrailSentenceAnchor anchor={trailActivity.anchor} onStart={() => setTrailIntroductionSeen(true)} />
    : !trailActivity && flashcardDeck === "sentences"
      ? <StudyModule key="sentences" source={sentenceDeckSource} embedded autoStart onExit={() => setFlashcardDeck("words")} />
      : <StudyModule source={flashcardSource} embedded activity={trailActivity} activityStage={trailStudyStage} skipActivityIntroduction onComplete={completeTrailActivity} onExit={returnToTrailOrchestrator} />;
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
    content = <SceneCertaModule source={catalogPictureSource} embedded activity={trailActivity?.moduleId === "scene-certa" ? trailActivity : null} onComplete={completeTrailActivity} onExit={returnToTrailOrchestrator} />;
  else if (section === "listen-build" && sessionListeningSource)
    content = <ListenBuildModule key={`listening:${sessionGameRun}`} source={sessionListeningSource} embedded sessionMode onComplete={finishAfterSessionGame} onExit={leaveSessionGame} onUnavailable={skipUnavailableSessionGame} />;
  else if (section === "listen-build")
    content = <ListenBuildModule source={catalogListeningSource} embedded activity={trailActivity?.moduleId === "listen-build" ? trailActivity : null} onComplete={completeTrailActivity} onExit={returnToTrailOrchestrator} />;
  else if (section === "multiplayer")
    content = sessionSentenceRoundIds
      ? <MultiplayerPresence onAcceptInvite={(code) => setGameRoom(code)}><MultiplayerModule vocabulary={sentenceGameVocabulary} key={sessionSentenceRoundIds.join(":")} sessionRoundIds={sessionSentenceRoundIds} sessionDifficulty={user?.study_difficulty} sessionLevel={String(sessionLevel)} sessionKnownWords={sessionKnownWords} sessionFreeRound={sessionFreeRound} sentenceAction={saveRoundAction} embeddedSession onSessionComplete={() => finishAfterSessionGame()} userId={user?.id ?? ""} isAdmin={user?.role === "admin"} /></MultiplayerPresence>
      : activeGame === "scene-certa"
      ? <SceneCertaModule source={catalogPictureSource} embedded onExit={() => setActiveGame(null)} />
      : activeGame === "listen-build"
      ? <ListenBuildModule source={catalogListeningSource} embedded onExit={() => setActiveGame(null)} />
      : activeGame === "speak-aloud"
      ? <SpeakAloudModule source={catalogSpeakingSource} embedded onExit={() => setActiveGame(null)} />
      : activeGame === "multiplayer"
        ? <MultiplayerPresence onAcceptInvite={(code) => setGameRoom(code)}><MultiplayerModule vocabulary={sentenceGameVocabulary} key={gameRoom} initialRoomCode={gameRoom} sentenceAction={saveRoundAction} startSentenceSetup userId={user?.id ?? ""} isAdmin={user?.role === "admin"} /></MultiplayerPresence>
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
  const sessionProgressStep: SessionStep | null = !studySessionLogId || sessionKind.current === "practice" ? null : weakReview ? (weakReview.stage === "writing" ? "Escrita" : "Revisar") : section === "writing" ? "Escrita" : (section === "multiplayer" && sessionSentenceRoundIds) || (section === "scene-certa" && sessionPictureGame) || (section === "listen-build" && sessionListeningSource) ? "Jogar" : section === "flashcards" && trailStudyStage === "review" ? "Revisar" : "Aprender";
  const sessionSteps: SessionStep[] = trailActivity?.mode === "verify" || trailActivity?.mode === "review" ? ["Revisar", "Jogar"] : ["Aprender", "Escrita", "Revisar", "Jogar"];
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
