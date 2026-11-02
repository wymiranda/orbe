import "../../../App.css";
import type { StudyDifficulty, StudySuggestion } from "../study-difficulty";

export type HskProgress = { hsk_level: string; total: number; learned: number };

export type OverviewTerm = { id: string; hanzi: string; pinyin: string; portuguese: string; hsk_level: string };

export type StudyOverview = {
  coverage: { learned: number; total: number };
  hsk: HskProgress[];
  dueCount: number;
  vocabulary: OverviewTerm[];
};

export type CurrentUser = {
  id: string;
  email: string;
  role: "admin" | "user";
  display_name: string | null;
  self_assessed_hsk_level: string | null;
  session_duration_minutes: number | null;
  study_difficulty?: StudyDifficulty;
  /** 0: locked; 1: just unlocked, not announced yet; 2: unlocked. */
  brutal_unlocked?: number;
  study_suggestion?: StudySuggestion;
} | null;

export { sessionHskLevels, studyDifficultyLabels, withinDifficulty, type StudyDifficulty, type StudySuggestion } from "../study-difficulty";

export type Section =
  | "home"
  | "progress"
  | "readings"
  | "flashcards"
  | "writing"
  | "quiz"
  | "scene-certa"
  | "listen-build"
  | "multiplayer"
  | "admin"
  | "profile";

export type NavigationSection = Exclude<Section, "profile">;

export function levelNumber(level: string) {
  return Number(level.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
}

export function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}
