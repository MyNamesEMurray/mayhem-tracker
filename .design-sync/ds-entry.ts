// Design-sync bundle entry: the curated component surface synced to
// claude.ai/design. Components in src/shared/ui are rendered by both
// surfaces, so reviewing one here reviews both; the rest come from the
// website (the canonical brand set) or the desktop renderer.

// Website (MayhemStats.com)
export { default as AugmentsTable } from "../website/src/components/AugmentsTable";
export { default as ChampionDetail } from "../website/src/components/ChampionDetail";
export { default as ChampionsTable } from "../website/src/components/ChampionsTable";
export { default as PatchRangeSelect } from "../website/src/components/PatchRangeSelect";
export { default as SearchField } from "../src/shared/ui/SearchField";

// Shared by both surfaces (src/shared/ui) — one component, not two copies,
// so a design review here covers what the app and the site actually render
export { default as AugmentIcon } from "../src/shared/ui/AugmentIcon";
export { default as ChampionIcon } from "../src/shared/ui/ChampionIcon";
export { default as ItemIcon } from "../src/shared/ui/ItemIcon";
export { GameDataProvider } from "../src/shared/ui/GameData";
export { default as RarityFilter } from "../src/shared/ui/RarityFilter";
export { Button, buttonClass, LABEL, PANEL, Panel, StatTile } from "../src/shared/ui/primitives";
export { default as TierBadge } from "../src/shared/ui/TierBadge";
export { default as WinRateBar } from "../src/shared/ui/WinRateBar";

// Desktop app (Mayhem Tracker renderer)
export { default as MatchScoreboard } from "../src/renderer/components/MatchScoreboard";
export { default as MultikillBadge } from "../src/renderer/components/MultikillBadge";
export { default as StatBars } from "../src/renderer/components/StatBars";
export { default as SummonerIcon } from "../src/renderer/components/SummonerIcon";

// Icon set (shared by both surfaces)
export {
  SwordsIcon,
  HourglassIcon,
  TrophyIcon,
  CrosshairIcon,
  UsersIcon,
  GlobeIcon,
  SettingsIcon,
  RefreshIcon,
  SearchIcon,
  MinusIcon,
  MaximizeIcon,
  RestoreIcon,
  ArrowDownIcon,
  XIcon,
  XCircleIcon,
  DownloadIcon,
  InfoIcon,
} from "../src/shared/ui/icons";
