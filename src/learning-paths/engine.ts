import { applyActivityResult, isIntroduced } from './knowledge'
import type { ActivityRequest, ActivityResult, KnowledgeSnapshot, LearningTrail, TrailActivity } from './types'

function request(trail: LearningTrail, unitId: string, activity: TrailActivity, mode = activity.mode): ActivityRequest {
  return { id: `${trail.id}:${unitId}:${activity.id}`, language: trail.language, moduleId: activity.moduleId, objective: activity.objective, skill: activity.skill, content: activity.contentIds.map((id) => ({ id, kind: id.includes(':sentence:') ? 'sentence' : 'lexeme' })), mode, introduction: activity.introduction, trailId: trail.id, unitId }
}
function activityComplete(activity: TrailActivity, state: KnowledgeSnapshot) { return activity.contentIds.every((id) => isIntroduced(state.contents[id])) }

/** Selects one small next activity; modules remain responsible for its execution. */
export function selectNextActivity(trail: LearningTrail, state: KnowledgeSnapshot): ActivityRequest | null {
  for (const unit of trail.units) {
    // A unit without prerequisites (the first one) is always open.
    if (unit.prerequisites && !unit.prerequisites.every((id) => isIntroduced(state.contents[id]))) continue
    const activity = unit.activities.find((item) => !activityComplete(item, state))
    if (!activity) continue
    return request(trail, unit.id, activity, activity.mode)
  }
  // A finished trail remains available as a lightweight verification session.
  // This avoids a dead end for learners who arrive with imported/manual state.
  const first = trail.units[0]?.activities[0]
  return first ? request(trail, trail.units[0].id, first, 'verify') : null
}

export function recordResult(state: KnowledgeSnapshot, result: ActivityResult) { return applyActivityResult(state, result) }
