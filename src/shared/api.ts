// The contract between the main process and the renderer: the shapes that
// cross the bridge, and the bridge's own surface.
//
// It sits in shared rather than under src/renderer because both ends need it.
// The renderer used to own it alone, and src/preload/index.ts built its object
// freehand against nothing - so the two could disagree, and did: widening the
// patch filter to a list left the renderer still describing a single string,
// and nothing failed. The preload now declares `const api: ElectronAPI`, which
// makes the compiler check one against the other.
//
// The return types are the reason this is written out rather than inferred
// from the preload: every method there returns ipcRenderer.invoke(...), which
// is Promise<any>, so inferring would hand every call site an any.

export interface GameRecord {
  game_id: number;
  queue_id: number;
  game_mode: string;
  game_creation: number;
  game_duration: number;
  puuid?: string;
  game_version?: string | null;
  raw_json?: string;
}

export interface PlayerStatsRecord {
  game_id: number;
  champion_id: number;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
  double_kills: number;
  triple_kills: number;
  quadra_kills: number;
  penta_kills: number;
  total_damage_dealt: number;
  total_damage_taken: number;
  gold_earned: number;
  total_heal: number;
  largest_killing_spree: number;
  item0: number | null;
  item1: number | null;
  item2: number | null;
  item3: number | null;
  item4: number | null;
  item5: number | null;
  item6: number | null;
}

export interface GameAugment {
  game_id: number;
  slot: number;
  augment_id: number;
}

export interface MatchListItem {
  game_id: number;
  queue_id: number;
  game_creation: number;
  game_duration: number;
  is_remake: number;
  favorite: number;
  champion_id: number;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
  double_kills: number;
  triple_kills: number;
  quadra_kills: number;
  penta_kills: number;
  total_damage_dealt: number;
  total_damage_taken: number;
  total_heal: number;
  gold_earned: number;
  item0: number | null;
  item1: number | null;
  item2: number | null;
  item3: number | null;
  item4: number | null;
  item5: number | null;
  score: number | null;
  score_badge: "MVP" | "ACE" | null;
  augment_ids: string | null;
  game_version: string | null;
  game_max_dmg: number;
  game_max_taken: number;
  game_max_heal: number;
}

export type MatchSort = "date" | "kda" | "kills" | "duration" | "score";

export type MatchSortDir = "asc" | "desc";

export type MultikillType = "doubles" | "triples" | "quadras" | "pentas";

export interface MatchFilters {
  championId?: number;
  patches?: string[];
  queue?: number;
  sort?: MatchSort;
  sortDir?: MatchSortDir;
  multikills?: MultikillType[];
}

export interface MatchFilterOptions {
  patches: string[];
  champions: number[];
  queues: number[];
}

export interface MatchDetail {
  game: GameRecord;
  stats: PlayerStatsRecord;
  augments: GameAugment[];
  itemEvents?: ItemEventRow[];
  raw: any;
}

// A build-order event captured live during the game
export interface ItemEventRow {
  participant_id: number;
  game_time: number;
  action: string;
  item_id: number | null;
  count: number;
  detail: string | null;
}

export interface ChampionStats {
  champion_id: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  avg_damage: number;
  avg_gold: number;
  double_kills: number;
  triple_kills: number;
  quadra_kills: number;
  penta_kills: number;
}

// A game in progress, for the panel that recommends augments while it runs.
// inGame is false whenever there is nothing to show: no game, or build-order
// tracking switched off in settings.
export interface LiveGameState {
  inGame: boolean;
  // Riot's internal champion name ("Ziggs", "MonkeyKing"), which is what the
  // Live Client Data API gives. Null for the moment between a game being
  // detected and the first snapshot that names the player.
  championName?: string | null;
  gameMode?: string | null;
  gameTime?: number;
  // Augment display names, in pickup order. The live API never says which
  // three augments are being offered - it only reveals one after it is taken,
  // by replacing a summoner spell's name - so this is what to strike off the
  // board, not what to choose between.
  takenAugments?: string[];
}

// What the local cache of the shared database currently holds
export interface CommunityMeta {
  fetchedAt: number;
  patches: string[];
  queues: number[];
  games: number;
}

export interface AugmentStats {
  augment_id: number;
  picks: number;
  wins: number;
}

export interface ItemStats {
  item_id: number;
  picks: number;
  wins: number;
}

// One champion's record against one opponent, summed over the current
// filters. Wins is from this champion's side.
export interface MatchupStats {
  opponent_id: number;
  games: number;
  wins: number;
}

export interface AugmentStatsDetailed {
  augment_id: number;
  picks: number;
  wins: number;
  // Combat sums across every pick of the augment, for the KDA and damage
  // columns - the same ones the website's augment table shows
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  champions: { champion_id: number; picks: number; wins: number }[];
}

export interface DashboardData {
  totalGames: number;
  wins: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  recentForm: { win: number; game_id: number }[];
  topChampions: ChampionStats[];
  multikills: {
    doubles: number;
    triples: number;
    quadras: number;
    pentas: number;
  };
  topAugments: AugmentStats[];
}

export interface ChampionData {
  [id: number]: {
    name: string;
    key: string;
    class?: string;
  };
}

export interface AugmentData {
  [id: number]: {
    name: string;
    desc: string;
    iconPath: string;
    rarity: string;
  };
}

export interface ItemData {
  [id: number]: {
    name: string;
    iconPath: string;
    branch: string;
    // A purchase in its own right rather than a part on the way to one; see
    // isCompleted() in src/main/dragon.ts
    completed: boolean;
  };
}

export interface TeammateStats {
  // Stable id for routing - the teammate's puuid, or their name when unknown
  key: string;
  name: string;
  puuid: string | null;
  profileIcon: number | null;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  champions: { champion_id: number; games: number }[];
  lastPlayed: number;
}

// A shared game, seen from both sides: our stats on the row itself, theirs
// under `friend`.
export interface TeammateMatch extends MatchListItem {
  friend: {
    champion_id: number;
    win: number;
    kills: number;
    deaths: number;
    assists: number;
    total_damage_dealt: number;
    total_damage_taken: number;
    total_heal: number;
    score: number | null;
    score_badge: "MVP" | "ACE" | null;
  };
}

export interface TeammateChampionStats {
  champion_id: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
}

// The list view only needs a teammate's most-played champions; their profile
// breaks every champion down.
export interface TeammateProfile extends Omit<TeammateStats, "champions"> {
  champions: TeammateChampionStats[];
}

export interface TeammateDetail {
  player: TeammateProfile;
  matches: TeammateMatch[];
}

export interface StartupStatus {
  // False in dev builds, where there is no installed exe to register
  supported: boolean;
  enabled: boolean;
}

export interface LiveDebugStatus {
  enabled: boolean;
  recording: boolean;
  dir: string;
  lastFile: string | null;
}

export interface ParsedParticipant {
  participantId: number;
  championId: number;
  teamId: number;
  puuid: string | null;
  summonerName: string;
  kills: number;
  deaths: number;
  assists: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  goldEarned: number;
  totalHeal: number;
  largestKillingSpree: number;
  items: number[];
  augments: number[];
  win: boolean;
  isSelf: boolean;
}

export type LcuStatus = "disconnected" | "connecting" | "connected";

export interface BackfillProgress {
  current: number;
  total: number;
  added: number;
}

export interface BackfillResult {
  added: number;
  scanned: number;
  checked: number;
  totalGames: number;
  truncated: boolean;
  cancelled: boolean;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  latest?: string;
  current?: string;
  url?: string;
  assetUrl?: string;
  notes?: string;
  assetSize?: number;
  error?: string;
}

export interface UploadStatus {
  enabled: boolean;
  running: boolean;
  lastError: string | null;
  uploaded: number;
  rejected: number;
  pending: number;
}

export interface ElectronAPI {
  getMatchHistory: (
    limit: number,
    offset: number,
    filters?: MatchFilters,
  ) => Promise<{ matches: MatchListItem[]; total: number }>;
  getMatchFilterOptions: (
    filters?: Pick<MatchFilters, "championId" | "patches" | "queue">,
  ) => Promise<MatchFilterOptions>;
  getMatchDetail: (gameId: number) => Promise<MatchDetail>;
  toggleFavorite: (gameId: number) => Promise<boolean>;
  getChampionStats: (patches?: string[], queue?: number) => Promise<ChampionStats[]>;
  getAugmentStats: (
    championId?: number,
    patches?: string[],
    queue?: number,
  ) => Promise<AugmentStats[]>;
  getAugmentStatsDetailed: (patches?: string[], queue?: number) => Promise<AugmentStatsDetailed[]>;
  getDashboard: (
    filters?: Pick<MatchFilters, "championId" | "patches" | "queue">,
  ) => Promise<DashboardData>;
  getChampionMatchHistory: (
    championId: number,
    limit: number,
    offset: number,
    patches?: string[],
    queue?: number,
  ) => Promise<{ matches: MatchListItem[]; total: number }>;
  getChampionItemStats: (
    championId: number,
    patches?: string[],
    queue?: number,
  ) => Promise<ItemStats[]>;
  getTeammateStats: () => Promise<TeammateStats[]>;
  getTeammateDetail: (key: string) => Promise<TeammateDetail | null>;
  getCommunityChampionStats: (patches?: string[], queue?: number) => Promise<ChampionStats[]>;
  getCommunityChampionDetail: (
    championId: number,
    patches?: string[],
    queue?: number,
  ) => Promise<{ augments: AugmentStats[]; items: ItemStats[]; matchups: MatchupStats[] }>;
  getCommunityAugmentStats: (
    patches?: string[],
    queue?: number,
  ) => Promise<Omit<AugmentStatsDetailed, "champions">[]>;
  getCommunityAugmentChampions: (
    augmentId: number,
    patches?: string[],
    queue?: number,
  ) => Promise<{ champion_id: number; picks: number; wins: number }[]>;
  getContributorId: () => Promise<string | null>;
  setContributorId: (token: string) => Promise<{ success: boolean; error?: string }>;
  rotateContributorId: () => Promise<{
    success: boolean;
    newId?: string;
    removedMatches?: number;
    error?: string;
  }>;
  getCommunityMeta: () => Promise<CommunityMeta>;
  refreshCommunity: () => Promise<CommunityMeta>;
  getSummonerPuuid: () => Promise<string | null>;
  getAllSummonerPuuids: () => Promise<string[]>;
  refreshGames: () => Promise<{ newGames: number; totalGames: number } | { error: string }>;
  backfillHistory: () => Promise<BackfillResult | { error: string }>;
  cancelBackfill: () => Promise<void>;
  isBackfillRunning: () => Promise<boolean>;
  onBackfillProgress: (callback: (progress: BackfillProgress) => void) => () => void;
  onBackfillDone: (result: (result: BackfillResult | { error: string }) => void) => () => void;
  getLcuStatus: () => Promise<LcuStatus>;
  getChampionData: () => Promise<ChampionData>;
  getAugmentData: () => Promise<AugmentData>;
  getItemData: (patch?: string) => Promise<ItemData>;
  onStatusChanged: (callback: (status: LcuStatus) => void) => () => void;
  onGamesUpdated: (callback: () => void) => () => void;

  getLiveGame: () => Promise<LiveGameState>;
  onLiveGame: (callback: (state: LiveGameState) => void) => () => void;
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<void>;
  exportData: () => Promise<{ success: boolean; path?: string }>;
  importData: () => Promise<{ success: boolean; imported?: number }>;
  repairPuuids: () => Promise<{
    repairedGames: number;
    discoveredAccounts: number;
    rebuiltGames: number;
  }>;
  getUploadStatus: () => Promise<UploadStatus>;
  setUploadEnabled: (enabled: boolean) => Promise<void>;
  syncUpload: () => Promise<{ uploaded: number; rejected: number; error?: string }>;
  deleteContributions: () => Promise<{
    success: boolean;
    removedMatches?: number;
    error?: string;
  }>;
  onUploadChanged: (callback: () => void) => () => void;
  getDiagnostics: () => Promise<any>;
  getStartupStatus: () => Promise<StartupStatus>;
  setStartupEnabled: (enabled: boolean) => Promise<StartupStatus>;
  getLiveDebugStatus: () => Promise<LiveDebugStatus>;
  setLiveDebugEnabled: (enabled: boolean) => Promise<LiveDebugStatus>;
  openLiveDebugFolder: () => Promise<void>;
  getVersion: () => Promise<string>;
  checkForUpdate: () => Promise<UpdateInfo>;
  downloadUpdate: (assetUrl: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateProgress: (callback: (percent: number) => void) => () => void;
  openUrl: (url: string) => Promise<void>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  onMaximizedChanged: (callback: (maximized: boolean) => void) => () => void;
}
