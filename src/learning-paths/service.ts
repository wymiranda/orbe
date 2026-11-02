import { declareKnowledge } from './knowledge'
import { selectNextActivity } from './engine'
import { KnowledgeRepository } from './repository'
import type { ActivityRequest, ActivityResult, DeclaredKnowledge, LearningTrail } from './types'
import { applyActivityResult } from './knowledge'

/** Small application-facing facade; UI/workspaces do not contain pedagogical rules. */
export class LearningPathService {
  private readonly repository: KnowledgeRepository
  constructor(repository = new KnowledgeRepository()) { this.repository = repository }

  async next(trail: LearningTrail): Promise<ActivityRequest | null> {
    const snapshot = await this.repository.load()
    if ((snapshot.trailVersions?.[trail.id] ?? 0) < trail.version) {
      const firstContentIds = trail.units[0]?.activities[0]?.contentIds ?? []
      const contents = { ...snapshot.contents }
      for (const contentId of firstContentIds) {
        const current = contents[contentId]
        if (current) contents[contentId] = { ...current, introduced: false }
      }
      const initialized = { ...snapshot, contents, trailVersions: { ...snapshot.trailVersions, [trail.id]: trail.version }, updatedAt: Date.now() }
      await this.repository.save(initialized)
      return selectNextActivity(trail, initialized)
    }
    return selectNextActivity(trail, snapshot)
  }
  async record(result: ActivityResult) {
    const next = applyActivityResult(await this.repository.load(), result)
    await this.repository.save(next)
    return next
  }
  async declare(contentId: string, value: DeclaredKnowledge) {
    const next = declareKnowledge(await this.repository.load(), contentId, value)
    await this.repository.save(next)
    return next
  }
}
