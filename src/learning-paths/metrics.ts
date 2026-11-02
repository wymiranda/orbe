import type { KnowledgeSnapshot, LearningModality, LearningSkill } from './types'

export type SkillMetric = Record<LearningModality, number>
const modalities: LearningModality[] = ['reading', 'writing', 'speaking', 'listening']
const empty = (): SkillMetric => ({ reading: 0, writing: 0, speaking: 0, listening: 0 })

/** Evidence-weighted strengths for display. Zero means there is no evidence for that modality. */
export function skillMetric(snapshot: KnowledgeSnapshot, skill: LearningSkill): SkillMetric {
  const totals = Object.fromEntries(modalities.map((modality) => [modality, { weighted: 0, attempts: 0 }])) as Record<LearningModality, { weighted: number; attempts: number }>
  for (const content of Object.values(snapshot.contents)) {
    const evidence = content.skills[skill]
    for (const modality of modalities) {
      const value = evidence?.modalities?.[modality]
      if (value) { totals[modality].weighted += value.strength * value.attempts; totals[modality].attempts += value.attempts }
    }
  }
  return Object.fromEntries(modalities.map((modality) => [modality, totals[modality].attempts ? Math.round(totals[modality].weighted / totals[modality].attempts) : 0])) as SkillMetric
}

/** One strength per modality across every skill, weighted by the evidence (attempts) behind it; zero without evidence. */
export function modalityMetric(snapshot: KnowledgeSnapshot): SkillMetric {
  const totals = Object.fromEntries(modalities.map((modality) => [modality, { weighted: 0, attempts: 0 }])) as Record<LearningModality, { weighted: number; attempts: number }>
  for (const content of Object.values(snapshot.contents)) for (const skill of Object.values(content.skills)) for (const modality of modalities) {
    const value = skill?.modalities?.[modality]
    if (value) { totals[modality].weighted += value.strength * value.attempts; totals[modality].attempts += value.attempts }
  }
  return Object.fromEntries(modalities.map((modality) => [modality, totals[modality].attempts ? Math.round(totals[modality].weighted / totals[modality].attempts) : 0])) as SkillMetric
}

export function evidenceConfidence(snapshot: KnowledgeSnapshot): SkillMetric {
  const totals = Object.fromEntries(modalities.map((modality) => [modality, 0])) as Record<LearningModality, number>
  for (const content of Object.values(snapshot.contents)) for (const skill of Object.values(content.skills)) for (const modality of modalities) totals[modality] += skill?.modalities?.[modality]?.attempts ?? 0
  return Object.fromEntries(modalities.map((modality) => [modality, totals[modality] ? Math.min(100, Math.round(totals[modality] / 10 * 100)) : 0])) as SkillMetric
}

export function consistencyMetric(snapshot: KnowledgeSnapshot): SkillMetric {
  const values = empty()
  for (const modality of modalities) {
    const strengths: number[] = []
    for (const content of Object.values(snapshot.contents)) for (const skill of Object.values(content.skills)) { const evidence = skill?.modalities?.[modality]; if (evidence?.attempts && evidence.attempts >= 2) strengths.push(evidence.strength) }
    if (strengths.length) { const mean = strengths.reduce((sum, value) => sum + value, 0) / strengths.length; const deviation = Math.sqrt(strengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / strengths.length); values[modality] = Math.round(Math.max(0, 100 - deviation * 2)) }
  }
  return values
}
