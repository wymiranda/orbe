import { createElement, lazy, type ComponentType } from 'react'
import type { QuizSource } from '../modules/quiz/QuizModule'
import type { PictureGameSource } from '../modules/scene-certa/SceneCertaModule'
import type { ListeningSource } from '../modules/listen-build/ListenBuildModule'
import type { SpeakingSource } from '../modules/speak-aloud/SpeakAloudModule'
import type { FlashcardSource } from '../modules/study/flashcard-source'
import { createProgressStore } from '../modules/study/engine/progress-store'

// Every module and workspace is loaded on demand, so opening one workspace
// never downloads the code of the others.
const ReadingsModule = lazy(() => import('../modules/readings/ReadingsModule'))
const StudyModule = lazy(() => import('../modules/study/StudyModule'))
const WritingModule = lazy(() => import('../modules/writing/WritingModule'))
const QuizModule = lazy(() => import('../modules/quiz/QuizModule'))
const SceneCertaModule = lazy(() => import('../modules/scene-certa/SceneCertaModule'))
const ListenBuildModule = lazy(() => import('../modules/listen-build/ListenBuildModule'))
const SpeakAloudModule = lazy(() => import('../modules/speak-aloud/SpeakAloudModule'))
const ChineseWorkspace = lazy(() => import('../experiences/chinese/ChineseWorkspace'))
const EnglishWorkspace = lazy(() => import('../experiences/english/EnglishWorkspace'))
const TeachingWorkspace = lazy(() => import('../experiences/teaching/TeachingWorkspace'))

export type ModuleKind = 'module' | 'experience'
export type NiorbModule = {
  id: string
  name: string
  kind: ModuleKind
  component: ComponentType<any>
  enabledByDefault: boolean
  exposedInNavigation: boolean
  requiresTeacher?: boolean
  uses?: string[]
}

const unconfiguredQuizSource: QuizSource = {
  id: 'unconfigured',
  title: 'Quiz',
  description: 'Este módulo precisa receber um conjunto de questões de uma experiência.',
  loadSets: async () => [],
  createSession: async () => ({ id: 'unconfigured', title: 'Quiz', questions: [] }),
}

// Games receive their content from an experience; standalone they have nothing to play.
const unconfiguredPictureSource: PictureGameSource = { language: 'und', label: '', intro: '', loadTerms: async () => [] }
const unconfiguredListeningSource: ListeningSource = { language: 'und', label: '', intro: '', missingVoiceMessage: '', loadSentences: async () => [], voiceStatus: async () => 'unknown', speak: () => {} }
// Flashcards too: the engine works on the words and the store a workspace gives it.
const unconfiguredFlashcardSource: FlashcardSource<{ id: string }> = { language: 'und', store: createProgressStore({ storageKey: 'niorb:unconfigured-flashcards:v1', changeEvent: 'niorb:unconfigured-flashcards' }), loadVocabulary: async () => [], cachedVocabulary: () => [], face: () => ({ front: '', meaning: '' }), speak: () => false }
const unconfiguredSpeakingSource: SpeakingSource = { language: 'und', recognitionLanguage: 'und', segmentation: 'words', label: '', intro: '', loadItems: async () => [] }

export const moduleRegistry: NiorbModule[] = [
  {
    id: 'readings',
    name: 'Leituras',
    kind: 'module',
    component: ReadingsModule,
    enabledByDefault: true,
    exposedInNavigation: false,
  },
  {
    id: 'study',
    name: 'Flashcards',
    kind: 'module',
    component: () => createElement(StudyModule, { source: unconfiguredFlashcardSource }),
    enabledByDefault: true,
    exposedInNavigation: false,
  },
  {
    id: 'writing',
    name: 'Escrita',
    kind: 'module',
    component: () => createElement(WritingModule, { items: [] }),
    enabledByDefault: true,
    exposedInNavigation: false,
  },
  {
    id: 'quiz',
    name: 'Quiz',
    kind: 'module',
    component: () => createElement(QuizModule, { source: unconfiguredQuizSource }),
    enabledByDefault: true,
    exposedInNavigation: false,
  },
  {
    id: 'scene-certa',
    name: 'Bate-olho',
    kind: 'module',
    component: () => createElement(SceneCertaModule, { source: unconfiguredPictureSource }),
    enabledByDefault: true,
    exposedInNavigation: false,
  },
  {
    id: 'listen-build',
    name: 'Ouça e monte',
    kind: 'module',
    component: () => createElement(ListenBuildModule, { source: unconfiguredListeningSource }),
    enabledByDefault: true,
    exposedInNavigation: false,
  },
  {
    id: 'speak-aloud',
    name: 'Solte a Voz',
    kind: 'module',
    component: () => createElement(SpeakAloudModule, { source: unconfiguredSpeakingSource }),
    enabledByDefault: true,
    exposedInNavigation: false,
  },
  {
    id: 'chinese',
    name: 'Chinês',
    kind: 'experience',
    component: ChineseWorkspace,
    enabledByDefault: true,
    exposedInNavigation: true,
    uses: ['readings', 'study', 'writing', 'quiz', 'scene-certa', 'listen-build', 'speak-aloud'],
  },
  {
    id: 'english',
    name: 'Inglês',
    kind: 'experience',
    component: EnglishWorkspace,
    enabledByDefault: true,
    exposedInNavigation: true,
    uses: ['readings', 'study', 'writing', 'quiz'],
  },
  {
    id: 'teacher',
    name: 'Professor',
    kind: 'experience',
    component: TeachingWorkspace,
    enabledByDefault: true,
    exposedInNavigation: true,
    requiresTeacher: true,
    uses: ['readings', 'study', 'writing', 'quiz'],
  },
]
