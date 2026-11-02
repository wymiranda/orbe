import hsk1Foundations from './trails/zh-hans-hsk1-foundations.json'
import type { LearningTrail } from './types'

export const learningTrails: LearningTrail[] = [hsk1Foundations as LearningTrail]
export function trailById(id: string) { return learningTrails.find((trail) => trail.id === id) }
