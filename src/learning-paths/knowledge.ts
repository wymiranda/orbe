import type { ActivityResult, ContentKnowledge, DeclaredKnowledge, KnowledgeSnapshot, LearningModality, LearningSkill, ModuleId, SkillKnowledge } from './types'

const day = 86_400_000
const emptySnapshot = (): KnowledgeSnapshot => ({ version: 1, contents: {}, trailVersions: {}, updatedAt: 0 })

export function createKnowledgeSnapshot(): KnowledgeSnapshot { return emptySnapshot() }

function clone(snapshot: KnowledgeSnapshot): KnowledgeSnapshot {
  return { version: 1, updatedAt: snapshot.updatedAt, trailVersions: { ...snapshot.trailVersions }, contents: Object.fromEntries(Object.entries(snapshot.contents).map(([id, item]) => [id, { ...item, skills: Object.fromEntries(Object.entries(item.skills).map(([skill, value]) => [skill, value ? { ...value } : value])) }])) }
}
function scoreFor(assessment: { correct?: boolean; score?: number; usedHint?: boolean }) {
  const base = assessment.score === undefined ? (assessment.correct === false ? 0 : 1) : Math.max(0, Math.min(1, assessment.score))
  return assessment.usedHint ? Math.min(base, 0.65) : base
}
function interval(strength: number, score: number) {
  if (score < .6) return day
  if (strength < 35) return day
  if (strength < 60) return 3 * day
  if (strength < 80) return 7 * day
  return 21 * day
}
function modalityFor(moduleId: ModuleId): LearningModality | null {
  if (moduleId === 'writing') return 'writing'
  if (moduleId === 'multiplayer' || moduleId === 'speak-aloud') return 'speaking'
  if (moduleId === 'listen-build') return 'listening'
  if (moduleId === 'study' || moduleId === 'quiz' || moduleId === 'readings' || moduleId === 'scene-certa') return 'reading'
  return null
}
function mastered(skills: Partial<Record<LearningSkill, SkillKnowledge>>) {
  const evidence = Object.values(skills).filter((value): value is SkillKnowledge => Boolean(value))
  const attempts = evidence.reduce((total, value) => total + value.attempts, 0)
  const successes = evidence.reduce((total, value) => total + value.successes, 0)
  const productive = skills.production
  return attempts >= 3 && successes / attempts >= .8 && evidence.some((value) => value.strength >= 75) && (!productive || productive.strength >= 60)
}

/** Incrementally folds a module result into compact per-content knowledge. */
export function applyActivityResult(snapshot: KnowledgeSnapshot, result: ActivityResult): KnowledgeSnapshot {
  const next = clone(snapshot)
  for (const assessment of result.assessments) {
    if (!assessment.contentId) continue
    const current: ContentKnowledge = next.contents[assessment.contentId] ?? { skills: {}, mastered: false, updatedAt: 0 }
    const old = current.skills[assessment.skill]
    const score = scoreFor(assessment)
    const attempts = (old?.attempts ?? 0) + 1
    const successes = (old?.successes ?? 0) + Number(score >= .6)
    const hints = (old?.hints ?? 0) + Number(assessment.usedHint)
    const strength = Math.round(Math.max(0, Math.min(100, (old?.strength ?? 0) * .72 + score * 28 - (assessment.usedHint ? 5 : 0))))
    const modality = modalityFor(result.moduleId)
    const previousModality = modality ? old?.modalities?.[modality] : undefined
    const modalityStrength = previousModality === undefined ? Math.round(score * 100) : Math.round(Math.max(0, Math.min(100, previousModality.strength * .72 + score * 28 - (assessment.usedHint ? 5 : 0))))
    const modalities = modality ? { ...old?.modalities, [modality]: { attempts: (previousModality?.attempts ?? 0) + 1, successes: (previousModality?.successes ?? 0) + Number(score >= .6), strength: modalityStrength, updatedAt: result.completedAt } } : old?.modalities
    const skill: SkillKnowledge = { attempts, successes, hints, strength, dueAt: result.completedAt + interval(strength, score), updatedAt: result.completedAt, modalities }
    const skills = { ...current.skills, [assessment.skill]: skill }
    next.contents[assessment.contentId] = { ...current, introduced: true, skills, mastered: mastered(skills), updatedAt: result.completedAt }
  }
  next.updatedAt = Math.max(next.updatedAt, result.completedAt)
  return next
}

export function declareKnowledge(snapshot: KnowledgeSnapshot, contentId: string, declared: DeclaredKnowledge, updatedAt = Date.now()): KnowledgeSnapshot {
  const next = clone(snapshot)
  const current = next.contents[contentId] ?? { skills: {}, mastered: false, updatedAt: 0 }
  next.contents[contentId] = { ...current, declared, updatedAt }
  next.updatedAt = Math.max(next.updatedAt, updatedAt)
  return next
}

export function isKnown(item: ContentKnowledge | undefined) { return item?.declared === 'known' || item?.mastered === true }
/** Available in the guided path only after that path has presented it. */
export function isIntroduced(item: ContentKnowledge | undefined) { return item?.introduced === true }
export function isDue(item: ContentKnowledge | undefined, now = Date.now()) { return Object.values(item?.skills ?? {}).some((skill) => skill && skill.dueAt <= now) }

/** Last-write-wins per content/skill keeps snapshots mergeable across devices. */
export function mergeKnowledgeSnapshots(local: KnowledgeSnapshot, remote: KnowledgeSnapshot): KnowledgeSnapshot {
  const merged = createKnowledgeSnapshot()
  for (const id of new Set([...Object.keys(local.contents), ...Object.keys(remote.contents)])) {
    const left = local.contents[id]; const right = remote.contents[id]
    if (!left) { merged.contents[id] = right!; continue }
    if (!right) { merged.contents[id] = left; continue }
    const skills = Object.fromEntries(Array.from(new Set([...Object.keys(left.skills), ...Object.keys(right.skills)])).map((skill) => {
      const l = left.skills[skill as LearningSkill]; const r = right.skills[skill as LearningSkill]
      return [skill, !l || (r && r.updatedAt > l.updatedAt) ? r : l]
    })) as ContentKnowledge['skills']
    const latest = left.updatedAt >= right.updatedAt ? left : right
    merged.contents[id] = { declared: latest.declared, skills, mastered: mastered(skills), updatedAt: Math.max(left.updatedAt, right.updatedAt) }
  }
  merged.trailVersions = { ...local.trailVersions, ...remote.trailVersions }
  merged.updatedAt = Math.max(local.updatedAt, remote.updatedAt)
  return merged
}
