import type { ReactNode } from 'react'
import type { DeviceProgress, ProgressStore } from './engine/progress-store'

/** What one card shows; the flashcard module lays it out the same way for every language. */
export type FlashcardFace = {
  front: string
  /** Pronunciation shown with the answer (pinyin, respelling…). */
  reading?: string | null
  meaning: string
  /** Small line under the meaning (level, part of speech…); hidden when empty. */
  detail?: string | null
  /** Text read aloud by the speak button; no button without it. */
  speech?: string | null
  visual?: { kind: 'emoji' | 'svg' | 'image'; value: string } | null
  /** How to use a word that works as grammar, shown when the card presents the word; examples can be heard. */
  explanation?: { text: string; examples: { text: string; reading: string; meaning: string }[] } | null
  /** Extra classes for long or Latin-script texts. */
  frontClassName?: string
  meaningClassName?: string
}

/** Passed to the dashboard parts a workspace adds around the flashcard metrics. */
export type FlashcardDashboardContext<T> = {
  vocabulary: T[]
  progress: DeviceProgress
  canStudy: boolean
  dueCount: number
  newCount: number
  learningCount: number
  startSession: () => void
  /** Rereads the store after the workspace changed it. */
  refresh: () => void
}

/**
 * Everything language-specific about flashcards. The module owns the engine
 * (scheduling, deck sessions, learned/removed cards, activity); a workspace
 * provides its words, its store and how a card looks.
 *
 * Callbacks are methods so a source of any word type fits the lazily loaded module.
 */
export type FlashcardSource<T extends { id: string }> = {
  /** Language of the learning-path contract ('zh-Hans', 'en'…). */
  language: string
  store: ProgressStore
  /** Fresh catalogue; rejects when it cannot be downloaded. */
  loadVocabulary(): Promise<T[]>
  /** Catalogue kept on the device, used offline. */
  cachedVocabulary(): T[]
  /** Dispatched when the cached catalogue changes elsewhere. */
  vocabularyEvent?: string
  face(item: T): FlashcardFace
  /** Speaks a text; false when the browser cannot. */
  speak(text: string): boolean
  dashboardTop?(context: FlashcardDashboardContext<T>): ReactNode
  dashboardBottom?(context: FlashcardDashboardContext<T>): ReactNode
  /** Extra content on the end screen of a deck session, given the cards it introduced. */
  sessionComplete?(introduced: T[], vocabulary: T[]): ReactNode
}
