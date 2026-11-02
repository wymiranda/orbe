import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { KnowledgeRepository } from "../../../learning-paths/repository";
import type { KnowledgeSnapshot } from "../../../learning-paths/types";
import { loadDeviceProgress } from "../device-progress";
import { wordStatus } from "../word-status";
import type { OverviewTerm } from "./shared";

/** A word as the wall needs it (catalogue entries of the session and of the flashcards both fit). */
export type WallWord = Pick<OverviewTerm, "id" | "hanzi" | "pinyin" | "portuguese" | "hsk_level">;

/** Timing of the end-of-session animation, in milliseconds. */
const flipStagger = 260;
const flipDuration = 700;
const pauseBeforeFlight = 900;
const flightStagger = 420;
const flightDuration = 1100;
/** Before the wall turns, the last cards of a page finish landing and stay in view this long. */
const pauseBeforePageSwitch = 1400;
/** Time for the wall to slide to the page of the next card before it flies. */
const pageSwitchDuration = 900;
/** Most words on one wall page: a larger level splits into pages of the same size (HSK 1, about 300 words, makes two of 150). */
const wallPageLimit = 200;

/** The level's words on as few pages as hold at most 200 each, all of about the same size. */
function wallPages<T>(terms: T[]): T[][] {
  const count = Math.max(1, Math.ceil(terms.length / wallPageLimit));
  const size = Math.ceil(terms.length / count);
  return Array.from({ length: count }, (_, page) => terms.slice(page * size, (page + 1) * size));
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** End of a daily session: its words (new, or reviewed once the trail is finished) fly to the wall of the learner's level. */
export function SessionSummary({ newWords, reviewed = false, level, vocabulary, onDone }: { newWords: WallWord[]; reviewed?: boolean; level: string; vocabulary: WallWord[]; onDone: () => void }) {
  return <main className="workspace-view session-summary">
    <section className="session-summary-content">
      {newWords.length > 0 && !reviewed && <h1>Palavras novas</h1>}
      <NewWordsWall newWords={newWords} level={level} vocabulary={vocabulary} />
      <button type="button" onClick={onDone}>Concluir</button>
    </section>
  </main>;
}

/**
 * The words learned flip over as cards, then fly to their place on the wall of
 * the learner's HSK level, which lights up. A large level is split into pages:
 * the wall opens on the page holding most of the words, and slides to another
 * page before the cards that belong there fly. Without motion (or without new
 * words) the wall is shown in its final state, on the page with the most words
 * learned. Used at the end of a daily session and of a flashcard study.
 */
export function NewWordsWall({ newWords, level, vocabulary }: { newWords: WallWord[]; level: string; vocabulary: WallWord[] }) {
  const progress = loadDeviceProgress();
  const [knowledge, setKnowledge] = useState<KnowledgeSnapshot | null>(null);
  useEffect(() => {
    const repository = new KnowledgeRepository();
    const refresh = () => { void repository.load().then(setKnowledge); };
    refresh();
    window.addEventListener("niorb:learning-knowledge", refresh);
    return () => window.removeEventListener("niorb:learning-knowledge", refresh);
  }, []);
  const levelTerms = vocabulary.filter((term) => term.hsk_level === level);
  const pages = wallPages(levelTerms);
  const pageOf = new Map(pages.flatMap((terms, page) => terms.map((term) => [term.id, page] as const)));
  const newIds = new Set(newWords.map((word) => word.id));
  // Pages holding the words of the session, most words first; the cards fly page by page in that order.
  const pageOrder = [...new Set(newWords.flatMap((word) => pageOf.has(word.id) ? [pageOf.get(word.id)!] : []))]
    .sort((left, right) => newWords.filter((word) => pageOf.get(word.id) === right).length - newWords.filter((word) => pageOf.get(word.id) === left).length || left - right);
  const flightOrder = [...newWords].sort((left, right) => pageOrder.indexOf(pageOf.get(left.id) ?? -1) - pageOrder.indexOf(pageOf.get(right.id) ?? -1));
  const [page, setPage] = useState<number | null>(() => pageOrder[0] ?? null);
  const [landed, setLanded] = useState<Set<string>>(() => new Set(prefersReducedMotion() ? newIds : []));
  const cards = useRef(new Map<string, HTMLElement>());
  const tiles = useRef(new Map<string, HTMLElement>());

  // A new word waits on the wall until its card lands; then it counts at least as studied.
  const statusOf = (term: WallWord) => {
    if (newIds.has(term.id) && !landed.has(term.id)) return "new";
    const status = wordStatus(term.id, progress, knowledge);
    return newIds.has(term.id) && status === "new" ? "learning" : status;
  };
  const masteredCount = levelTerms.filter((term) => statusOf(term) === "mastered").length;
  const learnedOn = (terms: WallWord[]) => terms.filter((term) => statusOf(term) !== "new").length;
  const mostLearnedPage = pages.reduce((best, terms, index) => learnedOn(terms) > learnedOn(pages[best]) ? index : best, 0);
  const shownPage = page ?? mostLearnedPage;

  // The first tile to be reached is brought into view, so the flight ends where the learner is looking.
  useLayoutEffect(() => {
    if (!flightOrder.length || prefersReducedMotion()) return;
    tiles.current.get(flightOrder[0].id)?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!newWords.length || prefersReducedMotion()) return;
    const timers: number[] = [];
    const animations: Animation[] = [];
    let time = newWords.length * flipStagger + flipDuration + pauseBeforeFlight;
    let currentPage = pageOrder[0];
    flightOrder.forEach((word) => {
      const wordPage = pageOf.get(word.id);
      if (wordPage !== undefined && wordPage !== currentPage) {
        currentPage = wordPage;
        // The cards already sent finish their flight and are seen landing before the wall turns.
        time += flightDuration - flightStagger + pauseBeforePageSwitch;
        timers.push(window.setTimeout(() => setPage(wordPage), time));
        time += pageSwitchDuration;
      }
      timers.push(window.setTimeout(() => {
        const card = cards.current.get(word.id);
        const tile = tiles.current.get(word.id);
        if (!card || !tile) { setLanded((current) => new Set(current).add(word.id)); return; }
        const from = card.getBoundingClientRect();
        const to = tile.getBoundingClientRect();
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        const scale = Math.max(to.width / from.width, .12);
        // A copy of the card flies, so the card itself stays as a recap of the session.
        const flying = card.cloneNode(true) as HTMLElement;
        flying.classList.add("session-summary-flying");
        Object.assign(flying.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, animationDelay: "0ms" });
        document.body.append(flying);
        card.classList.add("sent");
        const flight = flying.animate([
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          { transform: `translate(${dx * .55}px, ${dy * .55 - 60}px) scale(${(1 + scale) / 2})`, opacity: 1, offset: .6 },
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: .2 },
        ], { duration: flightDuration, easing: "cubic-bezier(.45, 0, .25, 1)", fill: "forwards" });
        animations.push(flight);
        flight.onfinish = () => { flying.remove(); setLanded((current) => new Set(current).add(word.id)); };
      }, time));
      time += flightStagger;
    });
    return () => { timers.forEach((timer) => window.clearTimeout(timer)); animations.forEach((animation) => animation.cancel()); document.querySelectorAll(".session-summary-flying").forEach((element) => element.remove()); };
    // The animation plays once, for the words of this session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>
      {newWords.length > 0 && <>
        <ul className="session-summary-cards">
          {newWords.map((word, index) => <li key={word.id} ref={(element) => { if (element) cards.current.set(word.id, element); }} style={{ animationDelay: `${index * flipStagger}ms` }}>
            <span className="session-summary-card-face" lang="zh-Hans">
              <strong>{word.hanzi}</strong>
              <small>{word.pinyin}</small>
              <em>{word.portuguese}</em>
            </span>
          </li>)}
        </ul>
      </>}
      <section className="session-summary-wall" aria-label={`HSK ${level}`}>
        {/* A new page slides in each time the wall turns. */}
        <ul key={shownPage}>
          {(pages[shownPage] ?? []).map((term) => <li key={term.id} ref={(element) => { if (element) tiles.current.set(term.id, element); else tiles.current.delete(term.id); }} className={[statusOf(term), newIds.has(term.id) && landed.has(term.id) ? "just-landed" : ""].filter(Boolean).join(" ")} title={`${term.hanzi} · ${term.pinyin} · ${term.portuguese}`} lang="zh-Hans">{term.hanzi}</li>)}
        </ul>
        {pages.length > 1 && <ol className="session-summary-wall-pages" aria-hidden="true">{pages.map((_, index) => <li key={index} className={index === shownPage ? "current" : ""} />)}</ol>}
        <p>{masteredCount} de {levelTerms.length} palavras do HSK {level}</p>
      </section>
  </>;
}
