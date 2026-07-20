import { NavLink } from "react-router-dom";
import { useState, useCallback, useEffect, type ComponentType, type SVGProps } from "react";
import { useLcuStatus } from "../hooks/useLcuStatus";
import {
  SwordsIcon,
  TrophyIcon,
  CrosshairIcon,
  UsersIcon,
  GlobeIcon,
  SettingsIcon,
  RefreshIcon,
} from "./icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const links: { to: string; label: string; icon: IconComponent }[] = [
  { to: "/", label: "Match History", icon: SwordsIcon },
  { to: "/champions", label: "Champions", icon: TrophyIcon },
  { to: "/augments", label: "Augments", icon: CrosshairIcon },
  { to: "/friends", label: "Friends", icon: UsersIcon },
  { to: "/global", label: "Total Stats", icon: GlobeIcon },
];

const statusColors = {
  connected: "bg-lol-win",
  connecting: "bg-amber-500",
  disconnected: "bg-lol-loss",
};

const statusLabels = {
  connected: "Connected",
  connecting: "Connecting...",
  disconnected: "Disconnected",
};

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: IconComponent }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
          isActive
            ? "bg-lol-gold/10 text-lol-gold"
            : "text-lol-text hover:bg-white/5 hover:text-lol-text-bright"
        }`
      }
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const status = useLcuStatus();
  const [refreshing, setRefreshing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [update, setUpdate] = useState<{
    hasUpdate: boolean;
    latest?: string;
    url?: string;
  } | null>(null);

  useEffect(() => {
    window.api.getVersion().then(setVersion);
    window.api.checkForUpdate().then(setUpdate);
  }, []);

  useEffect(() => {
    if (!lastResult) return;
    const timer = setTimeout(() => setLastResult(null), 10_000);
    return () => clearTimeout(timer);
  }, [lastResult]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setLastResult(null);
    try {
      const result = await window.api.refreshGames();
      setLastResult(result.newGames > 0 ? `Found ${result.newGames} new game(s)` : "No new games");
    } catch (err: any) {
      setLastResult(`Error: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <nav className="w-56 bg-lol-card/60 border-r border-lol-border/60 flex flex-col shrink-0">
      <div className="titlebar-drag h-14 shrink-0 flex items-center gap-2.5 px-4 border-b border-lol-border/40">
        <div className="w-7 h-7 rounded-lg border border-lol-gold/40 bg-lol-gold/10 flex items-center justify-center shrink-0">
          <SwordsIcon className="w-4 h-4 text-lol-gold" />
        </div>
        <div className="flex flex-col justify-center leading-none">
          <span className="font-bold text-[15px] tracking-[0.02em] text-lol-text-bright">
            Mayhem
          </span>
          <span className="text-[8px] font-semibold uppercase tracking-[0.35em] text-lol-text/80 mt-1">
            Tracker
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 p-3 mt-1 flex-1">
        {links.map((link) => (
          <NavItem key={link.to} {...link} />
        ))}
      </div>
      <div className="px-3 pb-1">
        <NavItem to="/settings" label="Settings" icon={SettingsIcon} />
      </div>
      <div className="p-3 border-t border-lol-border/60 flex flex-col gap-2">
        {lastResult && <span className="text-xs text-lol-text truncate">{lastResult}</span>}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
            <span className="text-xs text-lol-text">{statusLabels[status]}</span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-lol-gold/25 bg-lol-gold/10 text-lol-gold hover:bg-lol-gold/20 disabled:opacity-50 transition-colors"
          >
            <RefreshIcon className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Syncing..." : "Sync"}
          </button>
        </div>
        <div className="flex items-center justify-between mt-1">
          <button
            onClick={() =>
              window.api.openUrl(
                `https://github.com/Yhprum/mayhem-tracker/releases/tag/v${version}`,
              )
            }
            className="text-[10px] text-lol-text/50 hover:text-lol-text transition-colors cursor-pointer"
          >
            v{version}
          </button>
          {update?.hasUpdate && (
            <button
              onClick={() => window.api.openUrl(update.url!)}
              className="text-[10px] text-lol-gold hover:text-lol-gold-light transition-colors cursor-pointer"
            >
              v{update.latest} available
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
