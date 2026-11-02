import { useEffect, useState } from "react";
import "../../../App.css";
import type { ActivityRequest } from "../../../learning-paths/types";
import { recognitionErrors } from "../../../modules/speak-aloud/messages";
import { webSpeechEngine } from "../../../modules/speak-aloud/speech-engine";

export type SessionStep = "Aprender" | "Escrita" | "Revisar" | "Jogar";

/** Steps of the session bar; a session without new words (a finished trail) only reviews and plays. */
export function SessionProgress({ steps, current, onSkip }: { steps: SessionStep[]; current: SessionStep; onSkip: () => void }) {
  const step = steps.indexOf(current) + 1;
  return <aside className="session-orchestration-progress" aria-label={`Sessão: etapa ${step} de ${steps.length}`}><header><span>Sessão</span><strong>{step} de {steps.length}</strong><button type="button" className="session-orchestration-skip" onClick={onSkip}>Pular etapa</button></header><div className="session-orchestration-track" aria-hidden="true"><i style={{ width: `${(step / steps.length) * 100}%` }} /></div><ol>{steps.map((label, index) => <li key={label} className={index + 1 <= step ? "done" : ""}>{label}</li>)}</ol></aside>;
}

export function TrailSentenceAnchor({ anchor, onStart }: { anchor: NonNullable<ActivityRequest['anchor']>; onStart: () => void }) {
  return <main className="workspace-view"><section className="study-session" aria-label="Frase de hoje"><section className="study-session-content"><div className="study-phase-banner trail-sentence-anchor"><p className="focus-hanzi">{anchor.hanzi}</p><p>{anchor.pinyin}</p><h1>{anchor.translation}</h1><button type="button" onClick={onStart}>Começar</button></div></section></section></main>;
}

export function GamesHome({ onOpenSceneCerta, onOpenListening, onOpenMultiplayer, onOpenSpeaking }: { onOpenSceneCerta: () => void; onOpenListening: () => void; onOpenMultiplayer: () => void; onOpenSpeaking: () => void }) {
  const [sentenceImageUrl, setSentenceImageUrl] = useState<string | null>(null);
  const [sentenceImageFailed, setSentenceImageFailed] = useState(false);
  // Solte a Voz needs speech recognition: without it the game does not open, and the reason is shown here at once.
  const [speakingUnsupported, setSpeakingUnsupported] = useState(false);
  const openSpeaking = () => { if (webSpeechEngine.supported) onOpenSpeaking(); else setSpeakingUnsupported(true); };
  useEffect(() => { void fetch("/api/multiplayer/catalog/sentence-image").then(async (response) => response.ok ? response.json() as Promise<{ imageUrl?: string | null }> : { imageUrl: null }).then(({ imageUrl }) => { setSentenceImageUrl(imageUrl ?? null); setSentenceImageFailed(false); }).catch(() => setSentenceImageUrl(null)); }, []);
  return <main className="workspace-view"><section className="welcome games-home"><p className="eyebrow">JOGAR</p><h1>Escolha um jogo.</h1><p className="intro">Pratique mandarin em desafios rápidos.</p>{speakingUnsupported && <p className="error" role="alert">{recognitionErrors.unsupported}</p>}<div className="game-catalog games-home-grid"><article className="game-catalog-entry"><button type="button" className="game-catalog-card" onClick={onOpenMultiplayer}>{sentenceImageUrl && !sentenceImageFailed ? <img className="game-catalog-image game-catalog-image-upload" src={sentenceImageUrl} alt="Construam uma frase juntos" onError={() => setSentenceImageFailed(true)} /> : <span className="game-catalog-image" aria-hidden="true">造句</span>}<strong>Construam uma frase juntos</strong><small>Monte frases em uma sala com outra pessoa.</small></button></article><article className="game-catalog-entry"><button type="button" className="game-catalog-card" onClick={onOpenSceneCerta}><img className="game-catalog-image game-catalog-image-upload" src="/images/games/bate-olho.svg" alt="Bate-olho" /><strong>Bate-olho</strong><small>Veja a palavra em chinês e escolha a imagem certa.</small></button></article><article className="game-catalog-entry"><button type="button" className="game-catalog-card" onClick={onOpenListening}><img className="game-catalog-image game-catalog-image-upload" src="/images/games/ouca-e-monte.svg" alt="Ouça e monte" /><strong>Ouça e monte</strong><small>Ouça a frase em chinês e monte com as cartas certas.</small></button></article><article className="game-catalog-entry"><button type="button" className="game-catalog-card" onClick={openSpeaking}><span className="game-catalog-image" aria-hidden="true" lang="zh-Hans">说</span><strong>Solte a Voz</strong><small>Fale a palavra ou a frase em chinês e veja o que foi reconhecido.</small></button></article></div></section></main>;
}

export function TrailActivityIntroduction({ activity, onStart }: { activity: ActivityRequest; onStart: () => void }) {
  const introduction = activity.introduction;
  if (!introduction) return null;
  return <main className="workspace-view"><section className="study-session" aria-label="Introdução da trilha"><section className="study-session-content"><div className="study-phase-banner"><p className="eyebrow">PRÓXIMA ETAPA</p><h1>{introduction.title}</h1><p>{introduction.description}</p><button type="button" onClick={onStart}>Começar</button></div></section></section></main>;
}
