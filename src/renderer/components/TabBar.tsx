import { NavLink } from "react-router-dom";
import type { LcuStatus, UpdateInfo } from "../lib/types";
import { useLiveGame } from "../hooks/useLiveGame";

const tabs: { to: string; label: string }[] = [
  { to: "/", label: "Overview" },
  { to: "/matches", label: "Matches" },
  { to: "/champions", label: "Champions" },
  { to: "/augments", label: "Augments" },
  { to: "/friends", label: "Friends" },
  { to: "/settings", label: "Settings" },
];

const statusColors: Record<LcuStatus, string> = {
  connected: "bg-lol-win",
  connecting: "bg-amber-400",
  disconnected: "bg-lol-loss",
};

const statusLabels: Record<LcuStatus, string> = {
  connected: "Connected to client",
  connecting: "Connecting...",
  disconnected: "Disconnected",
};

// Website-style tab row shared by every page, with the League client
// connection state (and any pending update) on the right.
export default function TabBar({
  status,
  update,
  onShowUpdate,
}: {
  status: LcuStatus;
  update: UpdateInfo | null;
  onShowUpdate: () => void;
}) {
  const live = useLiveGame();
  return (
    <div className="shrink-0 flex items-center bg-lol-title-bar border-b border-lol-border/60 px-2">
      {/* Only while a game is running. A tab that says "no game" for the
          twenty-three hours a day nobody is in one is a tab in the way. */}
      {live?.inGame && (
        <NavLink
          to="/live"
          className={({ isActive }) =>
            `flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${
              isActive
                ? "text-lol-gold-light shadow-[inset_0_-2px_0_var(--color-lol-gold)]"
                : "text-lol-gold hover:text-lol-gold-light"
            }`
          }
        >
          <span className="w-[7px] h-[7px] rounded-full bg-lol-win animate-pulse" />
          In game
        </NavLink>
      )}
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === "/"}
          className={({ isActive }) =>
            `flex items-center px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${
              isActive
                ? "text-lol-gold-light shadow-[inset_0_-2px_0_var(--color-lol-gold)]"
                : "text-lol-text hover:text-lol-gold-light"
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
      <div className="ml-auto flex items-center gap-3 pr-2">
        {update?.hasUpdate && (
          <button
            onClick={onShowUpdate}
            className="text-xs text-lol-gold hover:text-lol-gold-light transition-colors cursor-pointer"
          >
            v{update.latest} available
          </button>
        )}
        <span className="flex items-center gap-1.5 text-xs text-lol-text">
          <span className={`w-[7px] h-[7px] rounded-full ${statusColors[status]}`} />
          {statusLabels[status]}
        </span>
      </div>
    </div>
  );
}
