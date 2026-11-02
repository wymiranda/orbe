/** Shared, module-agnostic contracts for learning paths. */
export type LearningSkill = 'exposure' | 'recognition' | 'comprehension' | 'production' | 'retention'
export type LearningModality = 'reading' | 'writing' | 'speaking' | 'listening'
export type ModuleId = 'study' | 'quiz' | 'writing' | 'readings' | 'multiplayer' | 'scene-certa' | 'listen-build' | 'speak-aloud' | (string & {})

export type ContentReference = {
  /** Stable identifier from the linguistic catalogue, never a display label. */
  id: string
  kind: 'lexeme' | 'sentence' | 'grammar'
}

export type ActivityRequest = {
  id: string
  language: string
  moduleId: ModuleId
  objective: string
  skill: LearningSkill
  content: ContentReference[]
  mode: 'introduce' | 'review' | 'verify'
  introduction?: { title: string; description: string }
  /** A complete sentence shown before its component cards are practiced. */
  anchor?: { hanzi: string; pinyin: string; translation: string }
  trailId?: string
  unitId?: string
}

export type ContentAssessment = {
  contentId: string
  skill: LearningSkill
  /** A module may omit correctness when it can only report exposure. */
  correct?: boolean
  score?: number
  usedHint?: boolean
}

/** The only payload a module needs to return to the learning engine. */
export type ActivityResult = {
  requestId?: string
  moduleId: ModuleId
  language: string
  completedAt: number
  assessments: ContentAssessment[]
}

export type DeclaredKnowledge = 'known' | 'unknown'
export type SkillKnowledge = {
  attempts: number
  successes: number
  hints: number
  strength: number
  dueAt: number
  updatedAt: number
  modalities?: Partial<Record<LearningModality, { attempts: number; successes: number; strength: number; updatedAt: number }>>
}
export type ContentKnowledge = {
  /** The learner has encountered this content in the guided path. */
  introduced?: boolean
  declared?: DeclaredKnowledge
  skills: Partial<Record<LearningSkill, SkillKnowledge>>
  /** Computed from evidence; it never overwrites the learner's declaration. */
  mastered: boolean
  updatedAt: number
}
export type KnowledgeSnapshot = {
  version: 1
  contents: Record<string, ContentKnowledge>
  /** Version last initialized for each guided trail. */
  trailVersions?: Record<string, number>
  updatedAt: number
}

export type TrailActivity = Omit<ActivityRequest, 'trailId' | 'unitId' | 'content'> & {
  contentIds: string[]
}
export type TrailUnit = {
  id: string
  title: string
  prerequisites?: string[]
  activities: TrailActivity[]
}
export type LearningTrail = {
  id: string
  version: number
  language: string
  level: string
  objective: string
  units: TrailUnit[]
}
