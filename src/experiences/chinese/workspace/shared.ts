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
  /** HSK levels where Brutal is unlocked (10 Brutal rounds answered correctly there). */
  brutal_levels?: string[];
  /** A Brutal unlock not announced yet. */
  brutal_notice?: boolean;
  /** Above 85% in each of the last five Difícil sessions: surprise Brutal rounds are more frequent on Difícil. */
  brutal_boost?: boolean;
  study_suggestion?: StudySuggestion;
} | null;

export { choosableDifficulties, sessionHskLevels, studyDifficultyLabels, withinDifficulty, type StudyDifficulty, type StudySuggestion } from "../study-difficulty";

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
