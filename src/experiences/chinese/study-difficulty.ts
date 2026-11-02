/** Difficulty of the daily session, chosen on the home card (kept free of UI imports). */
export type StudyDifficulty = 'easy' | 'medium' | 'hard' | 'brutal'
export type StudySuggestion = { kind: 'difficulty'; difficulty: StudyDifficulty } | { kind: 'hsk'; hskLevel: string } | null

export const studyDifficultyLabels: Record<StudyDifficulty, string> = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil', brutal: 'Brutal' }
const difficultyRank: Record<StudyDifficulty, number> = { easy: 0, medium: 1, hard: 2, brutal: 3 }

/** A difficulty includes every easier one: Médio plays Fácil and Médio sentences. */
export function withinDifficulty(sentence: StudyDifficulty, chosen: StudyDifficulty = 'easy') { return difficultyRank[sentence] <= difficultyRank[chosen] }

/** HSK levels the session games have sentences for. */
export const sessionHskLevels = ['1', '2']
