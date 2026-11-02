import { isIntroduced, isKnown } from "../../learning-paths/knowledge";
import type { KnowledgeSnapshot } from "../../learning-paths/types";
import type { DeviceProgress } from "./device-progress";

export type WordStatus = "mastered" | "learning" | "new";

/**
 * Colour of a word on the character maps.
 * - mastered: marked as learned by the learner, or mastered according to the
 *   answers recorded so far (the knowledge engine decides it on its own).
 * - learning: actually studied — presented or answered in a session or a
 *   flashcard. A card only sitting in the deck does not count.
 * - new: everything else.
 */
export function wordStatus(id: string, progress: DeviceProgress, knowledge: KnowledgeSnapshot | null): WordStatus {
  const content = knowledge?.contents[id];
  if (progress.vocabulary[id] === "learned" || isKnown(content)) return "mastered";
  if (isIntroduced(content) || progress.cards.some((card) => card.vocabularyId === id && !card.isNew)) return "learning";
  return "new";
}
