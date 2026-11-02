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

type GameCover = "construa" | "bate-olho" | "ouca-e-monte" | "solte-a-voz";

/** Picture of a catalogue card: the cover chosen by an administrator, else the game's own picture or glyph (remounted when the cover changes). */
function GameCoverImage({ url, fallback, alt, glyph }: { url: string | null; fallback?: string; alt: string; glyph: string }) {
  const [failed, setFailed] = useState(false);
  const src = url && !failed ? url : fallback;
  return src ? <img className="game-catalog-image game-catalog-image-upload" src={src} alt={alt} onError={() => setFailed(true)} /> : <span className="game-catalog-image" aria-hidden="true" lang="zh-Hans">{glyph}</span>;
}

export function GamesHome({ isAdmin = false, onOpenSceneCerta, onOpenListening, onOpenMultiplayer, onOpenSpeaking }: { isAdmin?: boolean; onOpenSceneCerta: () => void; onOpenListening: () => void; onOpenMultiplayer: () => void; onOpenSpeaking: () => void }) {
  const [covers, setCovers] = useState<Partial<Record<GameCover, string | null>>>({});
  // Solte a Voz needs speech recognition: without it the game does not open, and the reason is shown here at once.
  const [speakingUnsupported, setSpeakingUnsupported] = useState(false);
  const openSpeaking = () => { if (webSpeechEngine.supported) onOpenSpeaking(); else setSpeakingUnsupported(true); };
  // Cover editor of the administrator, one game at a time.
  const [editing, setEditing] = useState<GameCover | null>(null);
  const [imageDraft, setImageDraft] = useState("");
  const [imageError, setImageError] = useState("");
  const [imageSaving, setImageSaving] = useState(false);
  useEffect(() => { void fetch("/api/games/cover-images").then(async (response) => response.ok ? response.json() as Promise<Partial<Record<GameCover, string | null>>> : {}).then(setCovers).catch(() => setCovers({})); }, []);
  const games: { id: GameCover; title: string; description: string; fallback?: string; glyph: string; onOpen: () => void }[] = [
    { id: "construa", title: "Construam uma frase juntos", description: "Monte frases em uma sala com outra pessoa.", glyph: "造句", onOpen: onOpenMultiplayer },
    { id: "bate-olho", title: "Bate-olho", description: "Veja a palavra em chinês e escolha a imagem certa.", fallback: "/images/games/bate-olho.svg", glyph: "一眼", onOpen: onOpenSceneCerta },
    { id: "ouca-e-monte", title: "Ouça e monte", description: "Ouça a frase em chinês e monte com as cartas certas.", fallback: "/images/games/ouca-e-monte.svg", glyph: "听写", onOpen: onOpenListening },
    { id: "solte-a-voz", title: "Solte a Voz", description: "Fale a palavra ou a frase em chinês e veja o que foi reconhecido.", fallback: "/images/games/solte-a-voz.svg", glyph: "说", onOpen: openSpeaking },
  ];
  function openEditor(game: GameCover) { setImageDraft(covers[game] ?? ""); setImageError(""); setEditing(game); }
  async function saveCover() {
    if (!editing) return;
    const imageUrl = imageDraft.trim();
    if (imageUrl) {
      // A path of this site ("/images/...") works from any address the app is opened at.
      const sitePath = imageUrl.startsWith("/") && !imageUrl.startsWith("//");
      if (!sitePath && !/^https?:\/\/\S+$/i.test(imageUrl)) { setImageError("Use um link de imagem válido do ImgBB."); return; }
    }
    setImageSaving(true);
    try {
      const response = await fetch("/api/games/cover-images", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ game: editing, imageUrl }) });
      const payload = await response.json() as { imageUrl?: string | null; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar a imagem.");
      setCovers((current) => ({ ...current, [editing]: payload.imageUrl ?? null }));
      setEditing(null);
    } catch (cause) { setImageError(cause instanceof Error ? cause.message : "Não foi possível salvar a imagem."); } finally { setImageSaving(false); }
  }
  return <main className="workspace-view"><section className="welcome games-home"><p className="eyebrow">JOGAR</p><h1>Escolha um jogo.</h1><p className="intro">Pratique mandarin em desafios rápidos.</p>{speakingUnsupported && <p className="error" role="alert">{recognitionErrors.unsupported}</p>}<div className="game-catalog games-home-grid">{games.map((game) => <article className="game-catalog-entry" key={game.id}><button type="button" className="game-catalog-card" onClick={game.onOpen}><GameCoverImage key={covers[game.id] ?? ""} url={covers[game.id] ?? null} fallback={game.fallback} alt={game.title} glyph={game.glyph} /><strong>{game.title}</strong><small>{game.description}</small></button>{isAdmin && <button type="button" className="secondary game-cover-edit" onClick={() => openEditor(game.id)}>Alterar imagem</button>}</article>)}</div>
    {editing && <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditing(null)}><section className="new-reading module-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="game-image-editor-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><h2 id="game-image-editor-title">Imagem do jogo</h2><button type="button" className="modal-close" aria-label="Fechar" onClick={() => setEditing(null)}>×</button></div><label>Link direto do ImgBB<input type="url" value={imageDraft} placeholder="https://i.ibb.co/.../imagem.jpg" onChange={(event) => setImageDraft(event.target.value)} /></label>{editing === "construa" && <p className="form-note">Se apagar o link, o desenho vermelho com 造句 volta a ser usado.</p>}{imageError && <p className="error" role="alert">{imageError}</p>}<div className="form-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button><button type="button" disabled={imageSaving} onClick={() => void saveCover()}>{imageSaving ? "Salvando…" : "Salvar imagem"}</button></div></section></div>}
  </section></main>;
}

export function TrailActivityIntroduction({ activity, onStart }: { activity: ActivityRequest; onStart: () => void }) {
  const introduction = activity.introduction;
  if (!introduction) return null;
  return <main className="workspace-view"><section className="study-session" aria-label="Introdução da trilha"><section className="study-session-content"><div className="study-phase-banner"><p className="eyebrow">PRÓXIMA ETAPA</p><h1>{introduction.title}</h1><p>{introduction.description}</p><button type="button" onClick={onStart}>Começar</button></div></section></section></main>;
}
