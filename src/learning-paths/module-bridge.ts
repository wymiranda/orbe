import { applyActivityResult, declareKnowledge } from './knowledge'
import { KnowledgeRepository } from './repository'
import type { ActivityResult } from './types'

const repository = new KnowledgeRepository()

/** Accept results from any module, including activities not started by a trail. */
export async function recordModuleActivity(result: ActivityResult) {
  const current = await repository.load()
  await repository.save(applyActivityResult(current, result))
  window.dispatchEvent(new Event('niorb:learning-knowledge'))
}

/** Explicit learner declarations stay separate from mastery inferred from results. */
export async function declareModuleKnowledge(contentId: string, declared: 'known' | 'unknown') {
  const current = await repository.load()
  await repository.save(declareKnowledge(current, contentId, declared))
  window.dispatchEvent(new Event('niorb:learning-knowledge'))
}

export { KnowledgeRepository } from './repository'
export { createKnowledgeSnapshot, declareKnowledge, isDue, isKnown, isIntroduced, mergeKnowledgeSnapshots } from './knowledge'
export { selectNextActivity } from './engine'
export { learningTrails, trailById } from './trails'
export { chineseCatalogue } from './catalogue'
export { LearningPathService } from './service'
export type * from './types'
