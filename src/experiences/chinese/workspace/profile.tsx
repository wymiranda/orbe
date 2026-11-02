import { useState } from "react";
import "../../../App.css";
import PageHeader from "../../../core/PageHeader";
import { clearAccountHistory } from "../../../core/offline";
import { type CurrentUser } from "./shared";

export function ProfilePage({
  user,
  onSave,
  onBack,
}: {
  user: CurrentUser;
  onSave: (displayName: string, selfAssessedHskLevel?: string, sessionDurationMinutes?: number) => Promise<void>;
  onBack: () => void;
}) {
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [selfAssessedHskLevel, setSelfAssessedHskLevel] = useState(user?.self_assessed_hsk_level ?? "1");
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(user?.session_duration_minutes ?? 15);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [clearHistoryError, setClearHistoryError] = useState("");

  function clearHistory() {
    setClearingHistory(true);
    setClearHistoryError("");
    // A reload drops every screen still holding the erased progress in memory.
    clearAccountHistory().then(() => window.location.reload(), (cause: unknown) => {
      setClearHistoryError(cause instanceof Error && cause.message ? cause.message : "Não foi possível limpar o histórico.");
      setClearingHistory(false);
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSaving(true);
    try {
      await onSave(displayName, selfAssessedHskLevel, sessionDurationMinutes);
      setMessage("Nome salvo.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não foi possível salvar seu nome.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="workspace-view">
      <section className="welcome profile-page">
        <PageHeader
          eyebrow="PERFIL"
          title="Seu espaço, do seu jeito."
          description="Escolha o nome pelo qual você quer ser chamado no niorb."
        />
        <form onSubmit={submit}>
          <label>
            Seu nome
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={64}
              autoComplete="name"
              placeholder="Como devemos te chamar?"
            />
          </label>
          <label>
            Nível que você acredita ter
            <select value={selfAssessedHskLevel} onChange={(event) => setSelfAssessedHskLevel(event.target.value)}>
              <option value="0">Ainda estou começando</option>
              {["1", "2", "3", "4", "5", "6"].map((level) => <option key={level} value={level}>HSK {level}</option>)}
            </select>
          </label>
          <label>
            Duração da sessão
            <select value={sessionDurationMinutes} onChange={(event) => setSessionDurationMinutes(Number(event.target.value))}>
              <option value={5}>5 min</option>
              <option value={10}>10 min</option>
              <option value={15}>15 min (recomendado)</option>
              <option value={20}>20 min</option>
              <option value={30}>30 min</option>
            </select>
          </label>
          <small>{user?.email}</small>
          <div className="actions">
            <button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar nome"}
            </button>
            <button type="button" className="secondary" onClick={onBack}>Voltar ao início</button>
          </div>
          {message && <p className="profile-message" role="status">{message}</p>}
        </form>
        <details className="profile-advanced">
          <summary>Avançado</summary>
          <button type="button" className="secondary" onClick={() => { setClearHistoryError(""); setClearHistoryOpen(true); }}>Limpar todo histórico</button>
        </details>
      </section>
      {clearHistoryOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !clearingHistory && setClearHistoryOpen(false)}>
          <section className="new-reading" role="alertdialog" aria-modal="true" aria-labelledby="clear-history-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><h2 id="clear-history-title">Limpar todo histórico?</h2></div>
            {clearHistoryError && <p className="auth-error" role="alert">{clearHistoryError}</p>}
            <div className="actions">
              <button type="button" disabled={clearingHistory} onClick={clearHistory}>Sim</button>
              <button type="button" className="secondary" disabled={clearingHistory} autoFocus onClick={() => setClearHistoryOpen(false)}>Não</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export function NameOnboarding({
  onSave,
}: {
  onSave: (displayName: string, selfAssessedHskLevel?: string, sessionDurationMinutes?: number) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [selfAssessedHskLevel, setSelfAssessedHskLevel] = useState("1");
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(15);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = name.trim().replace(/\s+/g, " ");
    if (!displayName) {
      setError("Digite seu nome para continuar.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onSave(displayName, selfAssessedHskLevel, sessionDurationMinutes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar seu nome.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="name-onboarding-backdrop">
      <section className="name-onboarding" role="dialog" aria-modal="true" aria-labelledby="name-onboarding-title">
        <span className="name-onboarding-mark" aria-hidden="true" />
        <h2 id="name-onboarding-title">Como você gostaria de ser chamado?</h2>
        <p>Usaremos seu nome para personalizar seu espaço de estudo.</p>
        <form onSubmit={submit}>
          <label>
            Seu nome
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={64}
              autoComplete="name"
              autoFocus
              placeholder="Digite seu nome"
            />
          </label>
          <label>
            Em qual nível você acha que está?
            <select value={selfAssessedHskLevel} onChange={(event) => setSelfAssessedHskLevel(event.target.value)}>
              <option value="0">Ainda estou começando</option>
              {["1", "2", "3", "4", "5", "6"].map((level) => <option key={level} value={level}>HSK {level}</option>)}
            </select>
          </label>
          <label>
            Por quanto tempo você quer que sua sessão dure?
            <select value={sessionDurationMinutes} onChange={(event) => setSessionDurationMinutes(Number(event.target.value))}>
              <option value={5}>5 min</option>
              <option value={10}>10 min</option>
              <option value={15}>15 min (recomendado)</option>
              <option value={20}>20 min</option>
              <option value={30}>30 min</option>
            </select>
          </label>
          {error && <p className="name-onboarding-error" role="alert">{error}</p>}
          <button type="submit" disabled={saving}>{saving ? "Salvando…" : "Continuar"}</button>
        </form>
      </section>
    </div>
  );
}

export function SessionDurationOnboarding({ onSave }: { onSave: (sessionDurationMinutes: number) => Promise<void> }) {
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(15);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSave(sessionDurationMinutes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a duração da sessão.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="name-onboarding-backdrop"><section className="name-onboarding" role="dialog" aria-modal="true" aria-labelledby="session-duration-title"><span className="name-onboarding-mark" aria-hidden="true" /><h2 id="session-duration-title">Por quanto tempo você quer que sua sessão dure?</h2><p>Você pode mudar isso depois.</p><form onSubmit={submit}><label>Duração da sessão<select value={sessionDurationMinutes} onChange={(event) => setSessionDurationMinutes(Number(event.target.value))} autoFocus><option value={5}>5 min</option><option value={10}>10 min</option><option value={15}>15 min (recomendado)</option><option value={20}>20 min</option><option value={30}>30 min</option></select></label>{error && <p className="name-onboarding-error" role="alert">{error}</p>}<button type="submit" disabled={saving}>{saving ? "Salvando…" : "Continuar"}</button></form></section></div>;
}
