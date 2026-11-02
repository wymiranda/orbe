import {
  BookOpen,
  ChartNoAxesColumn,
  ChartNoAxesCombined,
  CircleHelp,
  Gamepad2,
  Headphones,
  House,
  Layers3,
  PenLine,
  Settings,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import "../../../App.css";
import { type Section, type NavigationSection } from "./shared";

export const navigation: { id: NavigationSection; label: string; icon: string }[] = [
  { id: "home", label: "Início", icon: "⌂" },
  { id: "readings", label: "Leituras", icon: "" },
  { id: "multiplayer", label: "Jogar", icon: "♙" },
  { id: "progress", label: "Progresso", icon: "↗" },
  { id: "flashcards", label: "Flashcards", icon: "▤" },
  { id: "writing", label: "Escrita", icon: "✎" },
  { id: "quiz", label: "Quiz", icon: "?" },
  { id: "admin", label: "Administração", icon: "⚙" },
];

export const navigationIcons: Record<NavigationSection, LucideIcon> = {
  home: House,
  readings: BookOpen,
  multiplayer: UsersRound,
  progress: ChartNoAxesCombined,
  flashcards: Layers3,
  writing: PenLine,
  quiz: CircleHelp,
  "scene-certa": Sparkles,
  "listen-build": Headphones,
  admin: Settings,
};

export const tabbar: { id: NavigationSection; label: string; Icon: LucideIcon }[] = [
  { id: "home", label: "Início", Icon: House },
  { id: "flashcards", label: "Revisar", Icon: Layers3 },
  { id: "multiplayer", label: "Jogos", Icon: Gamepad2 },
  { id: "readings", label: "Ler", Icon: BookOpen },
  { id: "progress", label: "Progresso", Icon: ChartNoAxesColumn },
];

export function WorkspaceNavigation({
  section,
  onSelect,
  onChooseWorkspace,
  isAdmin,
  visible,
  onClose,
}: {
  section: Section;
  onSelect: (section: Section) => void;
  onChooseWorkspace: () => void;
  isAdmin: boolean;
  visible: boolean;
  onClose: () => void;
}) {
  const links = navigation.filter((item) => item.id !== "admin");
  const adminLink = navigation.find((item) => item.id === "admin");

  const renderMenuItem = (item: (typeof navigation)[number], className: string) => {
    const Icon = navigationIcons[item.id];
    return <button
      key={item.id}
      type="button"
      className={[
        item.id === section ? "active" : "",
        "menu-item-" + item.id,
        className,
      ].filter(Boolean).join(" ")}
      onClick={() => {
        onSelect(item.id);
        onClose();
      }}
    >
      <span aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>
      <b>{item.label}</b>
    </button>
  };
  return (
    <aside
      className={visible ? "workspace-sidebar is-open" : "workspace-sidebar"}
    >
      <span className="workspace-menu-decoration">
        <span className="workspace-menu-circle workspace-menu-circle-left" />
        <span className="workspace-menu-circle workspace-menu-circle-right" />
        <span className="workspace-menu-pagoda" />
        <span className="workspace-menu-cloud workspace-menu-cloud-left" />
        <span className="workspace-menu-cloud workspace-menu-cloud-right" />
        <span className="workspace-menu-cloud workspace-menu-cloud-left workspace-menu-cloud-loop" />
        <span className="workspace-menu-cloud workspace-menu-cloud-right workspace-menu-cloud-loop" />
      </span>
      <span className="workspace-menu-scrim" aria-hidden="true" onClick={onClose} />
      <section className="workspace-menu-content" aria-label="Menu do niorb">
        <header>
          <strong>nǐorb</strong>
        </header>
        <nav aria-label="Navegação">
          {links.map((item) => renderMenuItem(item, ""))}
          <button type="button" className="menu-item-workspaces" onClick={onChooseWorkspace}><span aria-hidden="true"><Layers3 size={18} strokeWidth={2} /></span><b>Escolher workspace</b></button>
        </nav>
        {isAdmin && adminLink && (
          <section className="workspace-menu-admin" aria-label="Administração">
            <button
              type="button"
              className={"menu-item-" + adminLink.id}
              onClick={() => {
                onSelect(adminLink.id);
                onClose();
              }}
            >
              <span aria-hidden="true"><Settings size={17} strokeWidth={2} /></span>
              <b>{adminLink.label}</b>
            </button>
          </section>
        )}
      </section>
    </aside>
  );
}
