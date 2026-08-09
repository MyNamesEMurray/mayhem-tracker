import Database from "better-sqlite3";
import path from "path";
import { SCORE_FORMULA_VERSION, computeMatchScores } from "../shared/opScore";
import { AUGMENT_SLOTS, MAYHEM_QUEUE_IDS, QUEUE_ID_MAYHEM_CLASSIC } from "../shared/queues";
import { getDataDir } from "./paths";
import { getChampionClasses, getChampionDataVersion } from "./dragon";

// Poro-Snax (base and upgraded) is handed out for free, so it skews item stats
const EXCLUDED_ITEM_IDS = [2052, 220013];

let db: Database.Database;

function getDbPath() {
  return path.join(getDataDir(), "matches.db");
}

export function initDatabase() {
  const dbPath = getDbPath();
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  createTables();

  // Refresh stale planner statistics as the tables grow between launches
  db.pragma("optimize");
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      game_id       INTEGER PRIMARY KEY,
      queue_id      INTEGER NOT NULL,
      game_mode     TEXT NOT NULL,
      game_creation INTEGER NOT NULL,
      game_duration INTEGER NOT NULL,
      is_remake     INTEGER NOT NULL DEFAULT 0,
      puuid         TEXT NOT NULL DEFAULT '',
      game_version  TEXT,
      raw_json      TEXT
    );

    CREATE TABLE IF NOT EXISTS player_stats (
      game_id              INTEGER PRIMARY KEY REFERENCES games(game_id),
      champion_id          INTEGER NOT NULL,
      win                  INTEGER NOT NULL,
      kills                INTEGER NOT NULL DEFAULT 0,
      deaths               INTEGER NOT NULL DEFAULT 0,
      assists              INTEGER NOT NULL DEFAULT 0,
      double_kills         INTEGER NOT NULL DEFAULT 0,
      triple_kills         INTEGER NOT NULL DEFAULT 0,
      quadra_kills         INTEGER NOT NULL DEFAULT 0,
      penta_kills          INTEGER NOT NULL DEFAULT 0,
      total_damage_dealt   INTEGER NOT NULL DEFAULT 0,
      total_damage_taken   INTEGER NOT NULL DEFAULT 0,
      gold_earned          INTEGER NOT NULL DEFAULT 0,
      total_heal           INTEGER NOT NULL DEFAULT 0,
      largest_killing_spree INTEGER NOT NULL DEFAULT 0,
      item0 INTEGER, item1 INTEGER, item2 INTEGER,
      item3 INTEGER, item4 INTEGER, item5 INTEGER, item6 INTEGER
    );

    CREATE TABLE IF NOT EXISTS game_augments (
      game_id    INTEGER NOT NULL REFERENCES games(game_id),
      slot       INTEGER NOT NULL,
      augment_id INTEGER NOT NULL,
      PRIMARY KEY (game_id, slot)
    );

    CREATE TABLE IF NOT EXISTS summoner (
      puuid       TEXT PRIMARY KEY,
      game_name   TEXT,
      tag_line    TEXT,
      summoner_id INTEGER,
      account_id  INTEGER,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Games seen during a backfill that aren't Mayhem. Remembering them keeps
    -- repeat backfills from re-fetching every ARAM/Arena game each time.
    CREATE TABLE IF NOT EXISTS ignored_games (
      game_id INTEGER PRIMARY KEY
    );

    -- Games already sent to (or permanently rejected by) the community stats
    -- service, so the opt-in upload only ever sends each game once.
    CREATE TABLE IF NOT EXISTS uploaded_games (
      game_id     INTEGER PRIMARY KEY,
      status      TEXT NOT NULL,
      uploaded_at INTEGER NOT NULL
    );

    -- Every player in every stored game, one row each, extracted from raw_json
    -- at insert time. Global/friends stats aggregate over this instead of
    -- re-parsing raw_json, and its shape is the payload a future opt-in stats
    -- upload would send.
    CREATE TABLE IF NOT EXISTS participants (
      game_id               INTEGER NOT NULL REFERENCES games(game_id),
      participant_id        INTEGER NOT NULL,
      team_id               INTEGER NOT NULL,
      puuid                 TEXT,
      game_name             TEXT,
      tag_line              TEXT,
      profile_icon          INTEGER,
      champion_id           INTEGER NOT NULL,
      win                   INTEGER NOT NULL,
      kills                 INTEGER NOT NULL DEFAULT 0,
      deaths                INTEGER NOT NULL DEFAULT 0,
      assists               INTEGER NOT NULL DEFAULT 0,
      double_kills          INTEGER NOT NULL DEFAULT 0,
      triple_kills          INTEGER NOT NULL DEFAULT 0,
      quadra_kills          INTEGER NOT NULL DEFAULT 0,
      penta_kills           INTEGER NOT NULL DEFAULT 0,
      largest_killing_spree INTEGER NOT NULL DEFAULT 0,
      total_damage_dealt    INTEGER NOT NULL DEFAULT 0,
      total_damage_taken    INTEGER NOT NULL DEFAULT 0,
      gold_earned           INTEGER NOT NULL DEFAULT 0,
      total_heal            INTEGER NOT NULL DEFAULT 0,
      -- Extended combat detail (schema v2). Nullable: the SGP backfill shape
      -- doesn't carry these, so NULL means "not recorded", never zero.
      physical_damage       INTEGER,
      magic_damage          INTEGER,
      true_damage           INTEGER,
      damage_self_mitigated INTEGER,
      damage_to_turrets     INTEGER,
      cc_time               INTEGER,
      longest_time_alive    INTEGER,
      gold_spent            INTEGER,
      minions_killed        INTEGER,
      first_blood           INTEGER,
      spell1_id             INTEGER,
      spell2_id             INTEGER,
      champ_level           INTEGER,
      item0 INTEGER, item1 INTEGER, item2 INTEGER,
      item3 INTEGER, item4 INTEGER, item5 INTEGER, item6 INTEGER,
      score       REAL,
      score_badge TEXT,
      PRIMARY KEY (game_id, participant_id)
    );

    -- champion_id and win are copied from the participant row so augment
    -- aggregates never need the (much wider) participants table.
    CREATE TABLE IF NOT EXISTS participant_augments (
      game_id        INTEGER NOT NULL,
      participant_id INTEGER NOT NULL,
      slot           INTEGER NOT NULL,
      augment_id     INTEGER NOT NULL,
      champion_id    INTEGER NOT NULL DEFAULT 0,
      win            INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (game_id, participant_id, slot)
    );

    CREATE INDEX IF NOT EXISTS idx_games_creation ON games(game_creation DESC);
    CREATE INDEX IF NOT EXISTS idx_player_stats_champion ON player_stats(champion_id);
    CREATE INDEX IF NOT EXISTS idx_game_augments_augment ON game_augments(augment_id);
    CREATE INDEX IF NOT EXISTS idx_participants_champion ON participants(champion_id);
    CREATE INDEX IF NOT EXISTS idx_participants_puuid ON participants(puuid);
    CREATE INDEX IF NOT EXISTS idx_participant_augments_augment ON participant_augments(augment_id);
    CREATE INDEX IF NOT EXISTS idx_participant_augments_champion ON participant_augments(champion_id);
  `);

  // Migration: add is_remake column to existing databases
  try {
    db.exec("ALTER TABLE games ADD COLUMN is_remake INTEGER NOT NULL DEFAULT 0");
    // Retroactively detect remakes for existing games
    const games = db.prepare("SELECT game_id, game_duration, raw_json FROM games").all() as {
      game_id: number;
      game_duration: number;
      raw_json: string | null;
    }[];
    const updateStmt = db.prepare("UPDATE games SET is_remake = 1 WHERE game_id = ?");
    for (const game of games) {
      let raw: any = null;
      try {
        raw = game.raw_json ? JSON.parse(game.raw_json) : null;
      } catch {
        /* ignore parse errors */
      }
      if (detectRemake(game.game_duration, raw)) {
        updateStmt.run(game.game_id);
      }
    }
  } catch {
    // Column already exists
  }

  // Migration: add puuid column to games for multi-account support
  try {
    db.exec("ALTER TABLE games ADD COLUMN puuid TEXT NOT NULL DEFAULT ''");
    db.exec("CREATE INDEX IF NOT EXISTS idx_games_puuid ON games(puuid)");
    // Backfill puuid by matching stored player_stats against raw_json participants
    const gamesToBackfill = db
      .prepare(`
        SELECT g.game_id, g.raw_json,
               ps.champion_id, ps.kills, ps.deaths, ps.assists
        FROM games g
        JOIN player_stats ps ON g.game_id = ps.game_id
        WHERE g.puuid = '' AND g.raw_json IS NOT NULL
      `)
      .all() as {
      game_id: number;
      raw_json: string;
      champion_id: number;
      kills: number;
      deaths: number;
      assists: number;
    }[];

    const updateStmt = db.prepare("UPDATE games SET puuid = ? WHERE game_id = ?");
    const upsertStmt = db.prepare(`
      INSERT OR IGNORE INTO summoner (puuid, game_name, tag_line, summoner_id, account_id, updated_at)
      VALUES (?, ?, ?, NULL, NULL, ?)
    `);

    for (const game of gamesToBackfill) {
      try {
        const raw = JSON.parse(game.raw_json);
        const participants = raw.participants || [];
        const identities = raw.participantIdentities || [];

        for (let i = 0; i < participants.length; i++) {
          const p = participants[i];
          const identity = identities[i];
          const s = p.stats || p;
          const championId = p.championId ?? s.championId ?? 0;

          if (
            championId === game.champion_id &&
            (s.kills ?? 0) === game.kills &&
            (s.deaths ?? 0) === game.deaths &&
            (s.assists ?? 0) === game.assists
          ) {
            const pPuuid = p.puuid || identity?.player?.puuid;
            if (pPuuid) {
              updateStmt.run(pPuuid, game.game_id);
              const gameName =
                identity?.player?.gameName ||
                identity?.player?.summonerName ||
                p.summonerName ||
                p.riotIdGameName ||
                null;
              const tagLine = identity?.player?.tagLine || p.riotIdTagline || null;
              upsertStmt.run(pPuuid, gameName, tagLine, Date.now());
            }
            break;
          }
        }
      } catch {
        /* ignore parse errors */
      }
    }
  } catch {
    // Column already exists
  }

  // Migration: add game_version (patch) column and backfill from raw_json
  try {
    db.exec("ALTER TABLE games ADD COLUMN game_version TEXT");
    const games = db
      .prepare("SELECT game_id, raw_json FROM games WHERE raw_json IS NOT NULL")
      .all() as { game_id: number; raw_json: string }[];
    const updateStmt = db.prepare("UPDATE games SET game_version = ? WHERE game_id = ?");
    for (const game of games) {
      try {
        const raw = JSON.parse(game.raw_json);
        const patch = parsePatch(raw.gameVersion);
        if (patch) updateStmt.run(patch, game.game_id);
      } catch {
        /* ignore parse errors */
      }
    }
  } catch {
    // Column already exists
  }

  // Migration: add favorite column for pinning games to the top of match history
  try {
    db.exec("ALTER TABLE games ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0");
  } catch {
    // Column already exists
  }

  // Migration: add platform_id (e.g. "NA1") and backfill from raw_json. Game
  // ids are only unique per platform, so it's half of the community upload's
  // dedup key.
  try {
    db.exec("ALTER TABLE games ADD COLUMN platform_id TEXT");
  } catch {
    // Column already exists
  }
  if (getSetting("platform_backfill") !== "1") {
    const games = db
      .prepare(
        "SELECT game_id, raw_json FROM games WHERE platform_id IS NULL AND raw_json IS NOT NULL",
      )
      .all() as { game_id: number; raw_json: string }[];
    const updateStmt = db.prepare("UPDATE games SET platform_id = ? WHERE game_id = ?");
    const tx = db.transaction(() => {
      for (const game of games) {
        try {
          const raw = JSON.parse(game.raw_json);
          if (typeof raw.platformId === "string" && raw.platformId) {
            updateStmt.run(raw.platformId.toUpperCase(), game.game_id);
          }
        } catch {
          /* ignore parse errors */
        }
      }
    });
    tx();
    setSetting("platform_backfill", "1");
  }

  // Migration: add performance score columns to player_stats
  try {
    db.exec("ALTER TABLE player_stats ADD COLUMN score REAL");
    db.exec("ALTER TABLE player_stats ADD COLUMN score_badge TEXT");
  } catch {
    // Columns already exist
  }

  // Backfill bonus augment slots (5+) from raw_json for games stored
  // when only 4 slots were captured.
  if (getSetting("augment_slots") !== String(AUGMENT_SLOTS)) {
    backfillAugmentSlots();
    setSetting("augment_slots", String(AUGMENT_SLOTS));
  }

  // Populate the participants tables from raw_json for databases created
  // before they existed (or when their schema/extraction changes).
  if (getSetting("participants_version") !== PARTICIPANTS_SCHEMA_VERSION) {
    // v1 -> v2 widens the table; ADD COLUMN only for columns not yet present
    // so fresh installs (created with the full DDL) skip straight through
    const existing = new Set(
      (db.prepare("PRAGMA table_info(participants)").all() as { name: string }[]).map(
        (c) => c.name,
      ),
    );
    for (const col of [
      "physical_damage",
      "magic_damage",
      "true_damage",
      "damage_self_mitigated",
      "damage_to_turrets",
      "cc_time",
      "longest_time_alive",
      "gold_spent",
      "minions_killed",
      "first_blood",
      "spell1_id",
      "spell2_id",
      "champ_level",
    ]) {
      if (!existing.has(col)) db.exec(`ALTER TABLE participants ADD COLUMN ${col} INTEGER`);
    }
    backfillParticipants();
    setSetting("participants_version", PARTICIPANTS_SCHEMA_VERSION);
    // Participant scores need champion class data, which isn't loaded this
    // early; clearing the score key makes the startup score backfill run and
    // fill them in.
    db.prepare("DELETE FROM settings WHERE key = 'score_formula_version'").run();
  }
}

function backfillAugmentSlots() {
  const games = db
    .prepare("SELECT game_id, puuid, raw_json FROM games WHERE raw_json IS NOT NULL")
    .all() as { game_id: number; puuid: string; raw_json: string }[];
  const insertStmt = db.prepare(
    "INSERT OR IGNORE INTO game_augments (game_id, slot, augment_id) VALUES (?, ?, ?)",
  );
  const tx = db.transaction(() => {
    for (const game of games) {
      try {
        const raw = JSON.parse(game.raw_json);
        const participants = raw.participants || [];
        const identities = raw.participantIdentities || [];
        let participant = participants.find((p: any) => p.puuid === game.puuid);
        if (!participant) {
          const identity = identities.find((pi: any) => pi.player?.puuid === game.puuid);
          if (identity) {
            participant = participants.find((p: any) => p.participantId === identity.participantId);
          }
        }
        if (!participant) continue;
        const s = participant.stats || participant;
        for (let i = 1; i <= AUGMENT_SLOTS; i++) {
          const augId = s[`playerAugment${i}`];
          if (augId && augId > 0) {
            insertStmt.run(game.game_id, i, augId);
          }
        }
      } catch {
        /* ignore parse errors */
      }
    }
  });
  tx();
}

// ---- Participants ----

// Bump when the participants schema or the extraction below changes, so
// existing databases rebuild the tables from raw_json on next launch.
// v2: extended combat detail columns (damage splits, CC, spells, ...)
const PARTICIPANTS_SCHEMA_VERSION = "2";

// Bot/placeholder puuids come through as all zeroes
const PLACEHOLDER_PUUID = /^0+(-0+)*$/;

interface ParticipantRow {
  participantId: number;
  teamId: number;
  puuid: string | null;
  gameName: string | null;
  tagLine: string | null;
  profileIcon: number | null;
  championId: number;
  win: number;
  kills: number;
  deaths: number;
  assists: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  largestKillingSpree: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
  goldEarned: number;
  totalHeal: number;
  physicalDamage: number | null;
  magicDamage: number | null;
  trueDamage: number | null;
  damageSelfMitigated: number | null;
  damageToTurrets: number | null;
  ccTime: number | null;
  longestTimeAlive: number | null;
  goldSpent: number | null;
  minionsKilled: number | null;
  firstBlood: number | null;
  spell1Id: number | null;
  spell2Id: number | null;
  champLevel: number | null;
  items: (number | null)[];
  augments: { slot: number; augmentId: number }[];
  score: number | null;
  scoreBadge: string | null;
}

// One row per player from a raw game JSON (LCU shape, both the old
// participantIdentities and the new flat variants).
function extractParticipants(raw: any): ParticipantRow[] {
  if (!raw?.participants) return [];
  const identities = raw.participantIdentities || [];
  return raw.participants.map((p: any, i: number) => {
    const s = p.stats || p;
    const identity =
      identities.find((pi: any) => pi.participantId === p.participantId) ?? identities[i];
    const rawPuuid = p.puuid || identity?.player?.puuid || null;
    const icon = identity?.player?.profileIcon;
    const augments: { slot: number; augmentId: number }[] = [];
    for (let slot = 1; slot <= AUGMENT_SLOTS; slot++) {
      const augId = s[`playerAugment${slot}`];
      if (augId && augId > 0) augments.push({ slot, augmentId: augId });
    }
    return {
      participantId: p.participantId ?? i + 1,
      teamId: p.teamId ?? s.teamId ?? 100,
      puuid: rawPuuid && !PLACEHOLDER_PUUID.test(rawPuuid) ? rawPuuid : null,
      gameName:
        identity?.player?.gameName ||
        identity?.player?.summonerName ||
        p.summonerName ||
        p.riotIdGameName ||
        null,
      tagLine: identity?.player?.tagLine || p.riotIdTagline || null,
      profileIcon: typeof icon === "number" && icon > 0 ? icon : null,
      championId: p.championId ?? s.championId ?? 0,
      win: s.win ? 1 : 0,
      kills: s.kills ?? 0,
      deaths: s.deaths ?? 0,
      assists: s.assists ?? 0,
      doubleKills: s.doubleKills ?? 0,
      tripleKills: s.tripleKills ?? 0,
      quadraKills: s.quadraKills ?? 0,
      pentaKills: s.pentaKills ?? 0,
      largestKillingSpree: s.largestKillingSpree ?? 0,
      totalDamageDealt: s.totalDamageDealtToChampions ?? s.totalDamageDealt ?? 0,
      totalDamageTaken: s.totalDamageTaken ?? 0,
      goldEarned: s.goldEarned ?? 0,
      totalHeal: s.totalHeal ?? 0,
      physicalDamage: num(s.physicalDamageDealtToChampions),
      magicDamage: num(s.magicDamageDealtToChampions),
      trueDamage: num(s.trueDamageDealtToChampions),
      damageSelfMitigated: num(s.damageSelfMitigated),
      damageToTurrets: num(s.damageDealtToTurrets),
      ccTime: num(s.timeCCingOthers),
      longestTimeAlive: num(s.longestTimeSpentLiving),
      goldSpent: num(s.goldSpent),
      minionsKilled: num(s.totalMinionsKilled),
      firstBlood: typeof s.firstBloodKill === "boolean" ? (s.firstBloodKill ? 1 : 0) : null,
      spell1Id: num(s.spell1Id),
      spell2Id: num(s.spell2Id),
      champLevel: num(s.champLevel),
      items: [0, 1, 2, 3, 4, 5, 6].map((n) => s[`item${n}`] ?? null),
      augments,
      score: null,
      scoreBadge: null,
    };
  });
}

// Extended fields exist only in the LCU shape — NULL (not zero) when absent
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Score every participant in place with the current formula and champion
// classes. Not called for remakes — their scores stay null.
function scoreParticipants(rows: ParticipantRow[]) {
  const scores = computeMatchScores(
    rows.map((r) => ({
      participantId: r.participantId,
      teamId: r.teamId,
      championId: r.championId,
      kills: r.kills,
      deaths: r.deaths,
      assists: r.assists,
      doubleKills: r.doubleKills,
      tripleKills: r.tripleKills,
      quadraKills: r.quadraKills,
      pentaKills: r.pentaKills,
      totalDamageDealtToChampions: r.totalDamageDealt,
      totalDamageTaken: r.totalDamageTaken,
      goldEarned: r.goldEarned,
      totalHeal: r.totalHeal,
      win: !!r.win,
    })),
    getChampionClasses(),
  );
  for (const r of rows) {
    const s = scores.get(r.participantId);
    if (s) {
      r.score = s.score;
      r.scoreBadge = s.badge;
    }
  }
}

// The owner's row: puuid match first, then the same stored-stats fallback the
// puuid backfill migration uses for games that predate puuids.
function findOwnerRow(
  rows: ParticipantRow[],
  puuid: string | null,
  fallback?: {
    champion_id: number | null;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
  },
): ParticipantRow | undefined {
  let owner = puuid ? rows.find((r) => r.puuid === puuid) : undefined;
  if (!owner && fallback && fallback.champion_id != null) {
    owner = rows.find(
      (r) =>
        r.championId === fallback.champion_id &&
        r.kills === fallback.kills &&
        r.deaths === fallback.deaths &&
        r.assists === fallback.assists,
    );
  }
  return owner;
}

function replaceParticipantRows(gameId: number, rows: ParticipantRow[]) {
  db.prepare("DELETE FROM participants WHERE game_id = ?").run(gameId);
  db.prepare("DELETE FROM participant_augments WHERE game_id = ?").run(gameId);
  const insertRow = db.prepare(`
    INSERT OR REPLACE INTO participants (
      game_id, participant_id, team_id, puuid, game_name, tag_line, profile_icon,
      champion_id, win, kills, deaths, assists,
      double_kills, triple_kills, quadra_kills, penta_kills, largest_killing_spree,
      total_damage_dealt, total_damage_taken, gold_earned, total_heal,
      physical_damage, magic_damage, true_damage, damage_self_mitigated,
      damage_to_turrets, cc_time, longest_time_alive, gold_spent,
      minions_killed, first_blood, spell1_id, spell2_id, champ_level,
      item0, item1, item2, item3, item4, item5, item6,
      score, score_badge
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAug = db.prepare(
    "INSERT OR REPLACE INTO participant_augments (game_id, participant_id, slot, augment_id, champion_id, win) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const r of rows) {
    insertRow.run(
      gameId,
      r.participantId,
      r.teamId,
      r.puuid,
      r.gameName,
      r.tagLine,
      r.profileIcon,
      r.championId,
      r.win,
      r.kills,
      r.deaths,
      r.assists,
      r.doubleKills,
      r.tripleKills,
      r.quadraKills,
      r.pentaKills,
      r.largestKillingSpree,
      r.totalDamageDealt,
      r.totalDamageTaken,
      r.goldEarned,
      r.totalHeal,
      r.physicalDamage,
      r.magicDamage,
      r.trueDamage,
      r.damageSelfMitigated,
      r.damageToTurrets,
      r.ccTime,
      r.longestTimeAlive,
      r.goldSpent,
      r.minionsKilled,
      r.firstBlood,
      r.spell1Id,
      r.spell2Id,
      r.champLevel,
      ...r.items,
      r.score,
      r.scoreBadge,
    );
    for (const a of r.augments) {
      insertAug.run(gameId, r.participantId, a.slot, a.augmentId, r.championId, r.win);
    }
  }
}

// One-time migration: fill the participants tables from every stored
// raw_json. Scores are left null — the startup score backfill computes them
// once champion class data is available.
function backfillParticipants() {
  const games = db
    .prepare("SELECT game_id, raw_json FROM games WHERE raw_json IS NOT NULL")
    .all() as { game_id: number; raw_json: string }[];
  const tx = db.transaction(() => {
    for (const game of games) {
      try {
        replaceParticipantRows(game.game_id, extractParticipants(JSON.parse(game.raw_json)));
      } catch {
        /* ignore parse errors */
      }
    }
  });
  tx();
  // Fresh table statistics so the query planner picks good join orders
  db.exec("ANALYZE");
}

// Appends queue conditions to a query's WHERE list. An explicit queue filter
// wins; otherwise the hide-classic setting excludes Mayhem Classic everywhere.
function applyQueueFilter(where: string[], params: any[], queue?: number, alias = "g") {
  if (queue != null) {
    where.push(`${alias}.queue_id = ?`);
    params.push(queue);
  } else if (getSetting("hide_classic_games") === "true") {
    where.push(`${alias}.queue_id != ?`);
    params.push(QUEUE_ID_MAYHEM_CLASSIC);
  }
}

// Score backfills are keyed on formula version + champion data version, so
// stored scores recompute when either changes (new formula, new patch,
// re-tagged champion).
function scoreFormulaKey() {
  return `${SCORE_FORMULA_VERSION}@${getChampionDataVersion()}`;
}

// Recompute stored scores from raw_json. Runs whenever the formula version or
// the champion class data changes (new patch, re-tagged champion) so stored
// scores never go stale. Call after champion data has loaded; returns whether
// a backfill ran so the caller can refresh the renderer.
export function checkScoreBackfill(): boolean {
  if (getSetting("score_formula_version") === scoreFormulaKey()) return false;
  backfillScores();
  setSetting("score_formula_version", scoreFormulaKey());
  return true;
}

// Recompute every stored score (all participants plus the owner's
// player_stats row) from the participants tables — no raw_json parsing.
function backfillScores() {
  const games = db
    .prepare(`
      SELECT g.game_id, g.puuid, g.is_remake,
             ps.champion_id, ps.kills, ps.deaths, ps.assists
      FROM games g
      LEFT JOIN player_stats ps ON g.game_id = ps.game_id
    `)
    .all() as {
    game_id: number;
    puuid: string;
    is_remake: number;
    champion_id: number | null;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
  }[];

  const parts = db
    .prepare(`
      SELECT game_id, participant_id, team_id, puuid, champion_id, win,
             kills, deaths, assists,
             double_kills, triple_kills, quadra_kills, penta_kills,
             total_damage_dealt, total_damage_taken, gold_earned, total_heal
      FROM participants
    `)
    .all() as any[];
  const byGame = new Map<number, any[]>();
  for (const p of parts) {
    let list = byGame.get(p.game_id);
    if (!list) byGame.set(p.game_id, (list = []));
    list.push(p);
  }

  const classes = getChampionClasses();
  const updatePart = db.prepare(
    "UPDATE participants SET score = ?, score_badge = ? WHERE game_id = ? AND participant_id = ?",
  );
  const updateOwner = db.prepare(
    "UPDATE player_stats SET score = ?, score_badge = ? WHERE game_id = ?",
  );
  const tx = db.transaction(() => {
    for (const game of games) {
      const rows = byGame.get(game.game_id);
      if (!rows || rows.length === 0) continue;

      if (game.is_remake) {
        for (const r of rows) updatePart.run(null, null, game.game_id, r.participant_id);
        updateOwner.run(null, null, game.game_id);
        continue;
      }

      const scores = computeMatchScores(
        rows.map((r) => ({
          participantId: r.participant_id,
          teamId: r.team_id,
          championId: r.champion_id,
          kills: r.kills,
          deaths: r.deaths,
          assists: r.assists,
          doubleKills: r.double_kills,
          tripleKills: r.triple_kills,
          quadraKills: r.quadra_kills,
          pentaKills: r.penta_kills,
          totalDamageDealtToChampions: r.total_damage_dealt,
          totalDamageTaken: r.total_damage_taken,
          goldEarned: r.gold_earned,
          totalHeal: r.total_heal,
          win: !!r.win,
        })),
        classes,
      );
      for (const r of rows) {
        const s = scores.get(r.participant_id);
        updatePart.run(s?.score ?? null, s?.badge ?? null, game.game_id, r.participant_id);
      }

      let owner = game.puuid ? rows.find((r) => r.puuid === game.puuid) : undefined;
      if (!owner && game.champion_id != null) {
        owner = rows.find(
          (r) =>
            r.champion_id === game.champion_id &&
            r.kills === game.kills &&
            r.deaths === game.deaths &&
            r.assists === game.assists,
        );
      }
      const ownerScore = owner ? scores.get(owner.participant_id) : undefined;
      updateOwner.run(ownerScore?.score ?? null, ownerScore?.badge ?? null, game.game_id);
    }
  });
  tx();
}

function parsePatch(version: unknown): string | null {
  if (typeof version !== "string") return null;
  const m = version.match(/^(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}` : null;
}

function detectRemake(gameDuration: number, raw: any | null): boolean {
  // Very short games are always remakes
  if (gameDuration < 300) return true;
  // Check for early surrender flag in participant data
  if (raw?.participants) {
    for (const p of raw.participants) {
      const s = p.stats || p;
      if (s.gameEndedInEarlySurrender && gameDuration < 600) return true;
    }
  }
  return false;
}

// ---- Helpers ----

// Lobby-wide maxima for a match row's stat bars, from the participants table.
// MAX(..., 1) covers both a missing lobby (NULL) and an all-zero stat.
const MAX_STAT_COLUMNS = `
  MAX(COALESCE((SELECT MAX(p.total_damage_dealt) FROM participants p WHERE p.game_id = g.game_id), 0), 1) AS game_max_dmg,
  MAX(COALESCE((SELECT MAX(p.total_damage_taken) FROM participants p WHERE p.game_id = g.game_id), 0), 1) AS game_max_taken,
  MAX(COALESCE((SELECT MAX(p.total_heal) FROM participants p WHERE p.game_id = g.game_id), 0), 1) AS game_max_heal`;

// ---- Query functions ----

const MATCH_SORT_COLUMNS: Record<string, string> = {
  date: "g.game_creation",
  kda: "(ps.kills + ps.assists) * 1.0 / MAX(ps.deaths, 1)",
  kills: "ps.kills",
  duration: "g.game_duration",
  score: "ps.score",
};

function matchOrderBy(sort?: string, sortDir?: string): string {
  const key = sort && MATCH_SORT_COLUMNS[sort] ? sort : "date";
  const dir = sortDir === "asc" ? "ASC" : "DESC";
  const parts: string[] = [];
  // Games without a score belong at the bottom whichever way we're sorting
  if (key === "score") parts.push("ps.score IS NULL");
  parts.push(`${MATCH_SORT_COLUMNS[key]} ${dir}`);
  if (key !== "date") parts.push("g.game_creation DESC");
  return parts.join(", ");
}

const MULTIKILL_COLUMNS: Record<string, string> = {
  doubles: "ps.double_kills",
  triples: "ps.triple_kills",
  quadras: "ps.quadra_kills",
  pentas: "ps.penta_kills",
};

export function getMatchHistory(
  limit: number,
  offset: number,
  filters?: {
    championId?: number;
    patch?: string;
    queue?: number;
    sort?: string;
    sortDir?: string;
    multikills?: string[];
  },
): { matches: any[]; total: number } {
  const where: string[] = [];
  const params: any[] = [];
  if (filters?.championId != null) {
    where.push("ps.champion_id = ?");
    params.push(filters.championId);
  }
  if (filters?.patch) {
    where.push("g.game_version = ?");
    params.push(filters.patch);
  }
  applyQueueFilter(where, params, filters?.queue);
  if (filters?.multikills && filters.multikills.length > 0) {
    const cols = filters.multikills
      .map((k) => MULTIKILL_COLUMNS[k])
      .filter((col): col is string => !!col);
    if (cols.length > 0) {
      where.push(`(${cols.map((col) => `${col} > 0`).join(" OR ")})`);
    }
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const orderBy = matchOrderBy(filters?.sort, filters?.sortDir);

  const total = db
    .prepare(`
    SELECT COUNT(*) as count
    FROM games g
    JOIN player_stats ps ON g.game_id = ps.game_id
    ${whereSql}
  `)
    .get(...params) as any;
  const matches = db
    .prepare(`
    SELECT g.game_id, g.queue_id, g.game_creation, g.game_duration, g.is_remake, g.favorite, g.puuid, g.game_version,
           ps.champion_id, ps.win, ps.kills, ps.deaths, ps.assists,
           ps.double_kills, ps.triple_kills, ps.quadra_kills, ps.penta_kills,
           ps.total_damage_dealt, ps.total_damage_taken, ps.total_heal, ps.gold_earned,
           ps.score, ps.score_badge,
           ps.item0, ps.item1, ps.item2, ps.item3, ps.item4, ps.item5,
           (SELECT GROUP_CONCAT(ga.augment_id) FROM game_augments ga WHERE ga.game_id = g.game_id ORDER BY ga.slot) as augment_ids,
           ${MAX_STAT_COLUMNS}
    FROM games g
    JOIN player_stats ps ON g.game_id = ps.game_id
    ${whereSql}
    ORDER BY g.favorite DESC, ${orderBy}
    LIMIT ? OFFSET ?
  `)
    .all(...params, limit, offset);
  return { matches, total: total.count };
}

export function getMatchFilterOptions(filters?: {
  championId?: number;
  patch?: string;
  queue?: number;
}): {
  patches: string[];
  champions: number[];
  queues: number[];
} {
  // Each list is narrowed by the OTHER filters so a dropdown never hides its own selection
  const patchWhere = ["g.game_version IS NOT NULL AND g.game_version != ''"];
  const patchParams: any[] = [];
  if (filters?.championId != null) {
    patchWhere.push("ps.champion_id = ?");
    patchParams.push(filters.championId);
  }
  applyQueueFilter(patchWhere, patchParams, filters?.queue);
  const patchRows = db
    .prepare(`
    SELECT DISTINCT g.game_version
    FROM games g
    JOIN player_stats ps ON g.game_id = ps.game_id
    WHERE ${patchWhere.join(" AND ")}
  `)
    .all(...patchParams) as { game_version: string }[];
  const patches = patchRows
    .map((r) => r.game_version)
    .sort((a, b) => {
      const [aMajor, aMinor] = a.split(".").map(Number);
      const [bMajor, bMinor] = b.split(".").map(Number);
      return bMajor - aMajor || bMinor - aMinor;
    });

  const champWhere = ["1 = 1"];
  const champParams: any[] = [];
  if (filters?.patch) {
    champWhere.push("g.game_version = ?");
    champParams.push(filters.patch);
  }
  applyQueueFilter(champWhere, champParams, filters?.queue);
  const champRows = db
    .prepare(`
    SELECT DISTINCT ps.champion_id
    FROM player_stats ps
    JOIN games g ON ps.game_id = g.game_id
    WHERE ${champWhere.join(" AND ")}
    ORDER BY ps.champion_id
  `)
    .all(...champParams) as { champion_id: number }[];

  const queueWhere = ["1 = 1"];
  const queueParams: any[] = [];
  if (filters?.championId != null) {
    queueWhere.push("ps.champion_id = ?");
    queueParams.push(filters.championId);
  }
  if (filters?.patch) {
    queueWhere.push("g.game_version = ?");
    queueParams.push(filters.patch);
  }
  applyQueueFilter(queueWhere, queueParams, undefined);
  const queueRows = db
    .prepare(`
    SELECT DISTINCT g.queue_id
    FROM games g
    JOIN player_stats ps ON g.game_id = ps.game_id
    WHERE ${queueWhere.join(" AND ")}
    ORDER BY g.queue_id
  `)
    .all(...queueParams) as { queue_id: number }[];

  return {
    patches,
    champions: champRows.map((r) => r.champion_id),
    queues: queueRows.map((r) => r.queue_id),
  };
}

export function getMatchDetail(gameId: number): any {
  const game = db.prepare("SELECT * FROM games WHERE game_id = ?").get(gameId) as any;
  if (!game) return null;
  const stats = db.prepare("SELECT * FROM player_stats WHERE game_id = ?").get(gameId);
  const augments = db
    .prepare("SELECT * FROM game_augments WHERE game_id = ? ORDER BY slot")
    .all(gameId);
  return {
    game,
    stats,
    augments,
    raw: game.raw_json ? JSON.parse(game.raw_json) : null,
  };
}

export function getChampionStatsAll(patch?: string, queue?: number): any[] {
  const where = ["g.is_remake = 0"];
  const params: any[] = [];
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  applyQueueFilter(where, params, queue);
  return db
    .prepare(`
    SELECT
      ps.champion_id,
      COUNT(*) as games,
      SUM(ps.win) as wins,
      SUM(ps.kills) as kills,
      SUM(ps.deaths) as deaths,
      SUM(ps.assists) as assists,
      ROUND(AVG(ps.kills), 1) as avg_kills,
      ROUND(AVG(ps.deaths), 1) as avg_deaths,
      ROUND(AVG(ps.assists), 1) as avg_assists,
      ROUND(AVG(ps.total_damage_dealt)) as avg_damage,
      ROUND(AVG(ps.gold_earned)) as avg_gold,
      SUM(ps.double_kills) as double_kills,
      SUM(ps.triple_kills) as triple_kills,
      SUM(ps.quadra_kills) as quadra_kills,
      SUM(ps.penta_kills) as penta_kills
    FROM player_stats ps
    JOIN games g ON ps.game_id = g.game_id
    WHERE ${where.join(" AND ")}
    GROUP BY ps.champion_id
    ORDER BY games DESC
  `)
    .all(...params);
}

export function getAugmentStatsAll(championId?: number, patch?: string, queue?: number): any[] {
  const where = ["g.is_remake = 0"];
  const params: any[] = [];
  if (championId !== undefined) {
    where.push("ps.champion_id = ?");
    params.push(championId);
  }
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  applyQueueFilter(where, params, queue);
  return db
    .prepare(`
    SELECT ga.augment_id, COUNT(*) as picks, SUM(ps.win) as wins
    FROM game_augments ga
    JOIN player_stats ps ON ga.game_id = ps.game_id
    JOIN games g ON ga.game_id = g.game_id
    WHERE ${where.join(" AND ")}
    GROUP BY ga.augment_id
    ORDER BY picks DESC
  `)
    .all(...params);
}

export function getDashboardData(filters?: {
  championId?: number;
  patch?: string;
  queue?: number;
}): any {
  const where: string[] = ["g.is_remake = 0"];
  const params: any[] = [];
  if (filters?.championId != null) {
    where.push("ps.champion_id = ?");
    params.push(filters.championId);
  }
  if (filters?.patch) {
    where.push("g.game_version = ?");
    params.push(filters.patch);
  }
  applyQueueFilter(where, params, filters?.queue);
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const totals = db
    .prepare(`
    SELECT COUNT(*) as totalGames,
           SUM(ps.win) as wins,
           SUM(ps.kills) as totalKills,
           SUM(ps.deaths) as totalDeaths,
           SUM(ps.assists) as totalAssists,
           SUM(ps.double_kills) as doubles,
           SUM(ps.triple_kills) as triples,
           SUM(ps.quadra_kills) as quadras,
           SUM(ps.penta_kills) as pentas
    FROM player_stats ps
    JOIN games g ON ps.game_id = g.game_id
    ${whereSql}
  `)
    .get(...params) as any;

  const recentForm = db
    .prepare(`
    SELECT ps.win, g.game_id
    FROM games g
    JOIN player_stats ps ON g.game_id = ps.game_id
    ${whereSql}
    ORDER BY g.game_creation DESC
    LIMIT 10
  `)
    .all(...params);

  const topChampions = db
    .prepare(`
    SELECT
      ps.champion_id,
      COUNT(*) as games,
      SUM(ps.win) as wins,
      ROUND(AVG(ps.kills), 1) as avg_kills,
      ROUND(AVG(ps.deaths), 1) as avg_deaths,
      ROUND(AVG(ps.assists), 1) as avg_assists
    FROM player_stats ps
    JOIN games g ON ps.game_id = g.game_id
    ${whereSql}
    GROUP BY ps.champion_id
    ORDER BY games DESC
    LIMIT 5
  `)
    .all(...params);

  const topAugments = db
    .prepare(`
    SELECT ga.augment_id, COUNT(*) as picks, SUM(ps.win) as wins
    FROM game_augments ga
    JOIN player_stats ps ON ga.game_id = ps.game_id
    JOIN games g ON ga.game_id = g.game_id
    ${whereSql}
    GROUP BY ga.augment_id
    ORDER BY picks DESC
    LIMIT 5
  `)
    .all(...params);

  return {
    totalGames: totals.totalGames ?? 0,
    wins: totals.wins ?? 0,
    totalKills: totals.totalKills ?? 0,
    totalDeaths: totals.totalDeaths ?? 0,
    totalAssists: totals.totalAssists ?? 0,
    recentForm,
    topChampions,
    multikills: {
      doubles: totals.doubles ?? 0,
      triples: totals.triples ?? 0,
      quadras: totals.quadras ?? 0,
      pentas: totals.pentas ?? 0,
    },
    topAugments,
  };
}

export function getAugmentStatsWithChampions(
  patch?: string,
  queue?: number,
): {
  augment_id: number;
  picks: number;
  wins: number;
  champions: { champion_id: number; picks: number; wins: number }[];
}[] {
  const where = ["g.is_remake = 0"];
  const params: any[] = [];
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  applyQueueFilter(where, params, queue);
  const augments = db
    .prepare(`
    SELECT ga.augment_id, COUNT(*) as picks, SUM(ps.win) as wins
    FROM game_augments ga
    JOIN player_stats ps ON ga.game_id = ps.game_id
    JOIN games g ON ga.game_id = g.game_id
    WHERE ${where.join(" AND ")}
    GROUP BY ga.augment_id
    ORDER BY picks DESC
  `)
    .all(...params) as { augment_id: number; picks: number; wins: number }[];

  const champBreakdown = db
    .prepare(`
    SELECT ga.augment_id, ps.champion_id, COUNT(*) as picks, SUM(ps.win) as wins
    FROM game_augments ga
    JOIN player_stats ps ON ga.game_id = ps.game_id
    JOIN games g ON ga.game_id = g.game_id
    WHERE ${where.join(" AND ")}
    GROUP BY ga.augment_id, ps.champion_id
    ORDER BY picks DESC
  `)
    .all(...params) as { augment_id: number; champion_id: number; picks: number; wins: number }[];

  const champMap = new Map<number, { champion_id: number; picks: number; wins: number }[]>();
  for (const row of champBreakdown) {
    if (!champMap.has(row.augment_id)) champMap.set(row.augment_id, []);
    champMap
      .get(row.augment_id)!
      .push({ champion_id: row.champion_id, picks: row.picks, wins: row.wins });
  }

  return augments.map((a) => ({
    ...a,
    champions: champMap.get(a.augment_id) ?? [],
  }));
}

export function getChampionMatchHistory(
  championId: number,
  limit: number,
  offset: number,
  patch?: string,
  queue?: number,
): { matches: any[]; total: number } {
  const where = ["ps.champion_id = ?"];
  const params: any[] = [championId];
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  applyQueueFilter(where, params, queue);
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const total = db
    .prepare(`
    SELECT COUNT(*) as count
    FROM games g
    JOIN player_stats ps ON g.game_id = ps.game_id
    ${whereSql}
  `)
    .get(...params) as any;
  const matches = db
    .prepare(`
    SELECT g.game_id, g.game_creation, g.game_duration, g.is_remake, g.favorite, g.puuid,
           ps.champion_id, ps.win, ps.kills, ps.deaths, ps.assists,
           ps.double_kills, ps.triple_kills, ps.quadra_kills, ps.penta_kills,
           ps.total_damage_dealt, ps.total_damage_taken, ps.total_heal, ps.gold_earned,
           ps.score, ps.score_badge,
           ps.item0, ps.item1, ps.item2, ps.item3, ps.item4, ps.item5,
           (SELECT GROUP_CONCAT(ga.augment_id) FROM game_augments ga WHERE ga.game_id = g.game_id ORDER BY ga.slot) as augment_ids,
           ${MAX_STAT_COLUMNS}
    FROM games g
    JOIN player_stats ps ON g.game_id = ps.game_id
    ${whereSql}
    ORDER BY g.game_creation DESC
    LIMIT ? OFFSET ?
  `)
    .all(...params, limit, offset);
  return { matches, total: total.count };
}

export function toggleFavorite(gameId: number): boolean {
  db.prepare("UPDATE games SET favorite = 1 - favorite WHERE game_id = ?").run(gameId);
  const row = db.prepare("SELECT favorite FROM games WHERE game_id = ?").get(gameId) as
    | { favorite: number }
    | undefined;
  return !!row?.favorite;
}

export function gameExists(gameId: number): boolean {
  const row = db.prepare("SELECT 1 FROM games WHERE game_id = ?").get(gameId);
  return !!row;
}

// Every game id we've already made a decision about — stored or deliberately
// skipped. One query beats a lookup per id when a backfill checks hundreds.
export function getKnownGameIds(): Set<number> {
  const rows = db
    .prepare("SELECT game_id FROM games UNION SELECT game_id FROM ignored_games")
    .all() as { game_id: number }[];
  return new Set(rows.map((r) => r.game_id));
}

export function markIgnoredGame(gameId: number): void {
  db.prepare("INSERT OR IGNORE INTO ignored_games (game_id) VALUES (?)").run(gameId);
}

export function insertGameFull(gameData: any, puuid: string): boolean {
  const rows = extractParticipants(gameData);
  const owner = findOwnerRow(rows, puuid);
  if (!owner) return false;

  const isRemake = detectRemake(gameData.gameDuration, gameData) ? 1 : 0;
  if (!isRemake) scoreParticipants(rows);

  const insertGameStmt = db.prepare(`
    INSERT OR IGNORE INTO games (game_id, queue_id, game_mode, game_creation, game_duration, is_remake, puuid, game_version, raw_json, platform_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertStatsStmt = db.prepare(`
    INSERT OR IGNORE INTO player_stats (
      game_id, champion_id, win, kills, deaths, assists,
      double_kills, triple_kills, quadra_kills, penta_kills,
      total_damage_dealt, total_damage_taken, gold_earned, total_heal,
      largest_killing_spree, item0, item1, item2, item3, item4, item5, item6,
      score, score_badge
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAugmentStmt = db.prepare(`
    INSERT OR IGNORE INTO game_augments (game_id, slot, augment_id) VALUES (?, ?, ?)
  `);

  const tx = db.transaction(() => {
    const result = insertGameStmt.run(
      gameData.gameId,
      gameData.queueId,
      gameData.gameMode,
      gameData.gameCreation,
      gameData.gameDuration,
      isRemake,
      puuid,
      parsePatch(gameData.gameVersion),
      JSON.stringify(gameData),
      typeof gameData.platformId === "string" && gameData.platformId
        ? gameData.platformId.toUpperCase()
        : null,
    );

    if (result.changes === 0) return false; // duplicate

    insertStatsStmt.run(
      gameData.gameId,
      owner.championId,
      owner.win,
      owner.kills,
      owner.deaths,
      owner.assists,
      owner.doubleKills,
      owner.tripleKills,
      owner.quadraKills,
      owner.pentaKills,
      owner.totalDamageDealt,
      owner.totalDamageTaken,
      owner.goldEarned,
      owner.totalHeal,
      owner.largestKillingSpree,
      ...owner.items,
      owner.score,
      owner.scoreBadge,
    );

    for (const a of owner.augments) {
      insertAugmentStmt.run(gameData.gameId, a.slot, a.augmentId);
    }

    replaceParticipantRows(gameData.gameId, rows);

    return true;
  });

  return tx() as boolean;
}

export function upsertSummoner(summoner: any): void {
  db.prepare(`
    INSERT OR REPLACE INTO summoner (puuid, game_name, tag_line, summoner_id, account_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    summoner.puuid,
    summoner.displayName || summoner.gameName || summoner.internalName || summoner.game_name,
    summoner.tagLine || summoner.tag_line || null,
    summoner.summonerId ?? summoner.summoner_id,
    summoner.accountId ?? summoner.account_id,
    Date.now(),
  );
}

export function getSummoner(): any {
  return db.prepare("SELECT * FROM summoner ORDER BY updated_at DESC LIMIT 1").get();
}

export function getAllPuuids(): string[] {
  const rows = db.prepare("SELECT puuid FROM summoner").all() as { puuid: string }[];
  return rows.map((r) => r.puuid);
}

// Someone we queued with once is a stranger, not a friend — the list only
// counts players we've shared at least this many games with.
const MIN_SHARED_GAMES = 2;

// "name#tag", bare name, or a slot placeholder when the game predates names
function participantDisplayName(row: {
  game_name: string | null;
  tag_line: string | null;
  participant_id: number;
}): string {
  if (row.game_name) return row.tag_line ? `${row.game_name}#${row.tag_line}` : row.game_name;
  return `Player ${row.participant_id}`;
}

// The id the Friends list keys a teammate on — puuid when we know it, so name
// changes don't split a player in two.
function teammateKey(entry: { puuid: string | null; name: string }): string {
  return entry.puuid || entry.name;
}

// SQL fragments for teammate queries: join every participant who shared a team
// with one of our accounts, excluding the accounts themselves. Params: tracked
// puuids twice (the me-join, then the exclusion), then any queue params.
function teammateJoinSql(placeholders: string): { join: string; where: string } {
  return {
    join: `
    JOIN participants me ON me.game_id = g.game_id AND me.puuid IN (${placeholders})
    JOIN participants t ON t.game_id = g.game_id AND t.team_id = me.team_id
         AND t.participant_id != me.participant_id`,
    where: `(t.puuid IS NULL OR t.puuid NOT IN (${placeholders}))`,
  };
}

export function getTeammateStats(): any[] {
  const tracked = getAllPuuids().filter(Boolean);
  if (tracked.length === 0) return [];
  const ph = tracked.map(() => "?").join(", ");
  const { join, where } = teammateJoinSql(ph);

  const queueWhere: string[] = [];
  const queueParams: any[] = [];
  applyQueueFilter(queueWhere, queueParams, undefined);

  const rows = db
    .prepare(`
    SELECT t.game_id, t.participant_id, t.puuid, t.game_name, t.tag_line, t.profile_icon,
           t.champion_id, t.win, t.kills, t.deaths, t.assists,
           g.game_creation
    FROM games g
    ${join}
    WHERE g.is_remake = 0 AND ${where}
      ${queueWhere.length > 0 ? `AND ${queueWhere.join(" AND ")}` : ""}
  `)
    .all(...tracked, ...tracked, ...queueParams) as any[];

  const playerMap = new Map<
    string,
    {
      name: string;
      puuid: string | null;
      profileIcon: number | null;
      games: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
      champions: Map<number, number>;
      lastPlayed: number;
    }
  >();

  // Two tracked accounts in one lobby would join a teammate twice
  const seen = new Set<string>();

  for (const r of rows) {
    const rowKey = `${r.game_id}:${r.participant_id}`;
    if (seen.has(rowKey)) continue;
    seen.add(rowKey);

    const name = participantDisplayName(r);
    const t = { puuid: r.puuid as string | null, name };
    const key = teammateKey(t);

    // If we now have a puuid but previously tracked this player by name, merge
    if (t.puuid && !playerMap.has(t.puuid) && playerMap.has(t.name)) {
      const old = playerMap.get(t.name)!;
      if (!old.puuid) {
        playerMap.set(t.puuid, old);
        old.puuid = t.puuid;
        playerMap.delete(t.name);
      }
    }

    if (!playerMap.has(key)) {
      playerMap.set(key, {
        name: t.name,
        puuid: t.puuid,
        profileIcon: null,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        champions: new Map(),
        lastPlayed: 0,
      });
    }

    const entry = playerMap.get(key)!;
    // Update name and icon to the most recent version
    if (r.game_creation > entry.lastPlayed) {
      entry.name = t.name;
      if (r.profile_icon != null) entry.profileIcon = r.profile_icon;
    }
    entry.games++;
    if (r.win) entry.wins++;
    entry.kills += r.kills;
    entry.deaths += r.deaths;
    entry.assists += r.assists;
    entry.lastPlayed = Math.max(entry.lastPlayed, r.game_creation);

    entry.champions.set(r.champion_id, (entry.champions.get(r.champion_id) || 0) + 1);
  }

  return Array.from(playerMap.entries())
    .filter(([, p]) => p.games >= MIN_SHARED_GAMES)
    .map(([key, p]) => ({
      key,
      name: p.name,
      puuid: p.puuid,
      profileIcon: p.profileIcon,
      games: p.games,
      wins: p.wins,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      champions: Array.from(p.champions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([champion_id, games]) => ({ champion_id, games })),
      lastPlayed: p.lastPlayed,
    }))
    .sort((a, b) => b.games - a.games);
}

// Every game we played alongside one teammate, from both sides: our stored
// stats for the row plus the teammate's own line in that game.
export function getTeammateDetail(key: string): { player: any; matches: any[] } | null {
  const tracked = getAllPuuids().filter(Boolean);
  if (tracked.length === 0) return null;
  const ph = tracked.map(() => "?").join(", ");
  const { join, where } = teammateJoinSql(ph);

  const queueWhere: string[] = [];
  const queueParams: any[] = [];
  applyQueueFilter(queueWhere, queueParams, undefined);

  const rows = db
    .prepare(`
    SELECT g.game_id, g.queue_id, g.game_creation, g.game_duration, g.is_remake, g.favorite,
           g.puuid, g.game_version,
           ps.champion_id, ps.win, ps.kills, ps.deaths, ps.assists,
           ps.double_kills, ps.triple_kills, ps.quadra_kills, ps.penta_kills,
           ps.total_damage_dealt, ps.total_damage_taken, ps.total_heal, ps.gold_earned,
           ps.score, ps.score_badge,
           ps.item0, ps.item1, ps.item2, ps.item3, ps.item4, ps.item5,
           (SELECT GROUP_CONCAT(ga.augment_id) FROM game_augments ga WHERE ga.game_id = g.game_id ORDER BY ga.slot) as augment_ids,
           ${MAX_STAT_COLUMNS},
           t.participant_id AS f_participant_id, t.puuid AS f_puuid,
           t.game_name AS f_game_name, t.tag_line AS f_tag_line, t.profile_icon AS f_profile_icon,
           t.champion_id AS f_champion_id, t.win AS f_win,
           t.kills AS f_kills, t.deaths AS f_deaths, t.assists AS f_assists,
           t.total_damage_dealt AS f_total_damage_dealt,
           t.total_damage_taken AS f_total_damage_taken,
           t.total_heal AS f_total_heal,
           t.score AS f_score, t.score_badge AS f_score_badge
    FROM games g
    JOIN player_stats ps ON g.game_id = ps.game_id
    ${join}
    WHERE g.is_remake = 0 AND ${where}
      ${queueWhere.length > 0 ? `AND ${queueWhere.join(" AND ")}` : ""}
    ORDER BY g.game_creation DESC, t.participant_id
  `)
    .all(...tracked, ...tracked, ...queueParams) as any[];

  interface ChampionTotals {
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
  }

  const matches: any[] = [];
  const champions = new Map<number, ChampionTotals>();
  const player = {
    key,
    name: key,
    puuid: null as string | null,
    profileIcon: null as number | null,
    games: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    champions: [] as ({ champion_id: number } & ChampionTotals)[],
    lastPlayed: 0,
  };

  const matchedGames = new Set<number>();
  for (const row of rows) {
    if (matchedGames.has(row.game_id)) continue;

    const name = participantDisplayName({
      game_name: row.f_game_name,
      tag_line: row.f_tag_line,
      participant_id: row.f_participant_id,
    });
    const entry = { puuid: row.f_puuid as string | null, name };
    // Older games can be missing puuids; once we know who we're looking at,
    // match those on name too — the same merge the Friends list does.
    const isMatch =
      teammateKey(entry) === key ||
      (player.games > 0 && entry.puuid == null && entry.name === player.name);
    if (!isMatch) continue;
    matchedGames.add(row.game_id);

    // Rows are newest-first, so the first hit carries the current name and icon
    if (player.games === 0) {
      player.name = name;
      player.puuid = entry.puuid;
      player.profileIcon = row.f_profile_icon;
      player.lastPlayed = row.game_creation;
    } else if (player.profileIcon == null) {
      player.profileIcon = row.f_profile_icon;
    }

    player.games++;
    if (row.f_win) player.wins++;
    player.kills += row.f_kills;
    player.deaths += row.f_deaths;
    player.assists += row.f_assists;

    if (!champions.has(row.f_champion_id)) {
      champions.set(row.f_champion_id, { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 });
    }
    const champ = champions.get(row.f_champion_id)!;
    champ.games++;
    if (row.f_win) champ.wins++;
    champ.kills += row.f_kills;
    champ.deaths += row.f_deaths;
    champ.assists += row.f_assists;

    const {
      f_participant_id,
      f_puuid,
      f_game_name,
      f_tag_line,
      f_profile_icon,
      f_champion_id,
      f_win,
      f_kills,
      f_deaths,
      f_assists,
      f_total_damage_dealt,
      f_total_damage_taken,
      f_total_heal,
      f_score,
      f_score_badge,
      ...rest
    } = row;
    matches.push({
      ...rest,
      friend: {
        champion_id: f_champion_id,
        win: f_win ? 1 : 0,
        kills: f_kills,
        deaths: f_deaths,
        assists: f_assists,
        total_damage_dealt: f_total_damage_dealt,
        total_damage_taken: f_total_damage_taken,
        total_heal: f_total_heal,
        score: f_score ?? null,
        score_badge: f_score_badge ?? null,
      },
    });
  }

  if (player.games === 0) return null;

  player.champions = Array.from(champions.entries())
    .map(([champion_id, totals]) => ({ champion_id, ...totals }))
    .sort((a, b) => b.games - a.games);

  return { player, matches };
}

export function getChampionItemStats(
  championId: number,
  patch?: string,
  queue?: number,
): { item_id: number; picks: number; wins: number }[] {
  const extraWhere: string[] = [];
  const extraParams: any[] = [];
  if (patch) {
    extraWhere.push("g.game_version = ?");
    extraParams.push(patch);
  }
  applyQueueFilter(extraWhere, extraParams, queue);
  const extraSql = extraWhere.length > 0 ? ` AND ${extraWhere.join(" AND ")}` : "";
  const itemCols = ["item0", "item1", "item2", "item3", "item4", "item5", "item6"];
  const excludedList = EXCLUDED_ITEM_IDS.join(", ");
  const subquery = (col: string) =>
    `SELECT ps.${col} as item_id, ps.win FROM player_stats ps JOIN games g ON ps.game_id = g.game_id WHERE ps.champion_id = ? AND ps.${col} IS NOT NULL AND ps.${col} > 0 AND ps.${col} NOT IN (${excludedList}) AND g.is_remake = 0${extraSql}`;
  const params = itemCols.flatMap(() => [championId, ...extraParams]);
  return db
    .prepare(`
    SELECT item_id, COUNT(*) as picks, SUM(win) as wins
    FROM (
      ${itemCols.map(subquery).join("\n      UNION ALL\n      ")}
    )
    GROUP BY item_id
    ORDER BY picks DESC
  `)
    .all(...params) as any[];
}

export function getGlobalStats(
  patch?: string,
  queue?: number,
): {
  champions: { champion_id: number; games: number; wins: number }[];
  augments: { augment_id: number; picks: number; wins: number }[];
  totalParticipantSlots: number;
} {
  const where = ["g.is_remake = 0"];
  const params: any[] = [];
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  applyQueueFilter(where, params, queue);
  const whereSql = where.join(" AND ");

  const champions = db
    .prepare(`
    SELECT p.champion_id, COUNT(*) as games, SUM(p.win) as wins
    FROM participants p
    JOIN games g ON p.game_id = g.game_id
    WHERE p.champion_id > 0 AND ${whereSql}
    GROUP BY p.champion_id
    ORDER BY games DESC
  `)
    .all(...params) as { champion_id: number; games: number; wins: number }[];

  const augments = db
    .prepare(`
    SELECT pa.augment_id, COUNT(*) as picks, SUM(pa.win) as wins
    FROM participant_augments pa
    JOIN games g ON pa.game_id = g.game_id
    WHERE pa.champion_id > 0 AND ${whereSql}
    GROUP BY pa.augment_id
    ORDER BY picks DESC
  `)
    .all(...params) as { augment_id: number; picks: number; wins: number }[];

  return {
    champions,
    augments,
    totalParticipantSlots: champions.reduce((sum, c) => sum + c.games, 0),
  };
}

// Everything we know about one champion across every stored game, counting all
// ten players in each game (not just our own). Items and augments come from
// raw_json for the same reason — the player_stats/game_augments tables only
// hold our own picks.
export function getGlobalChampionDetail(
  championId: number,
  patch?: string,
  queue?: number,
): {
  champion_id: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  avgDamage: number;
  avgDamageTaken: number;
  avgGold: number;
  avgHeal: number;
  damageShare: number;
  killParticipation: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  totalParticipantSlots: number;
  items: { item_id: number; picks: number; wins: number }[];
  augments: { augment_id: number; picks: number; wins: number }[];
} {
  const where = ["g.is_remake = 0"];
  const params: any[] = [];
  if (patch) {
    where.push("g.game_version = ?");
    params.push(patch);
  }
  applyQueueFilter(where, params, queue);
  const whereSql = where.join(" AND ");

  // The champion's rows joined with their team's totals in that game
  const rows = db
    .prepare(`
    SELECT p.win, p.kills, p.deaths, p.assists,
           p.total_damage_dealt, p.total_damage_taken, p.gold_earned, p.total_heal,
           p.double_kills, p.triple_kills, p.quadra_kills, p.penta_kills,
           p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6,
           t.team_dmg, t.team_kills
    FROM participants p
    JOIN games g ON p.game_id = g.game_id
    JOIN (
      SELECT game_id, team_id,
             SUM(total_damage_dealt) as team_dmg, SUM(kills) as team_kills
      FROM participants
      WHERE champion_id > 0
      GROUP BY game_id, team_id
    ) t ON t.game_id = p.game_id AND t.team_id = p.team_id
    WHERE p.champion_id = ? AND ${whereSql}
  `)
    .all(championId, ...params) as any[];

  const itemMap = new Map<number, { picks: number; wins: number }>();
  const totals = {
    games: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    damage: 0,
    damageTaken: 0,
    gold: 0,
    heal: 0,
    doubleKills: 0,
    tripleKills: 0,
    quadraKills: 0,
    pentaKills: 0,
  };
  // Shares are per-game ratios averaged over the games they're defined in, so
  // a game with no team damage/kills recorded can't drag the average to zero.
  let damageShareSum = 0;
  let damageShareGames = 0;
  let kpSum = 0;
  let kpGames = 0;

  for (const r of rows) {
    totals.games++;
    if (r.win) totals.wins++;
    totals.kills += r.kills;
    totals.deaths += r.deaths;
    totals.assists += r.assists;
    totals.damage += r.total_damage_dealt;
    totals.damageTaken += r.total_damage_taken;
    totals.gold += r.gold_earned;
    totals.heal += r.total_heal;
    totals.doubleKills += r.double_kills;
    totals.tripleKills += r.triple_kills;
    totals.quadraKills += r.quadra_kills;
    totals.pentaKills += r.penta_kills;

    if (r.team_dmg > 0) {
      damageShareSum += r.total_damage_dealt / r.team_dmg;
      damageShareGames++;
    }
    if (r.team_kills > 0) {
      kpSum += (r.kills + r.assists) / r.team_kills;
      kpGames++;
    }

    for (let i = 0; i <= 6; i++) {
      const itemId = r[`item${i}`];
      if (itemId && itemId > 0 && !EXCLUDED_ITEM_IDS.includes(itemId)) {
        if (!itemMap.has(itemId)) itemMap.set(itemId, { picks: 0, wins: 0 });
        const item = itemMap.get(itemId)!;
        item.picks++;
        if (r.win) item.wins++;
      }
    }
  }

  // Slots across ALL champions in the filtered games, for pick rate
  const totalParticipantSlots = (
    db
      .prepare(`
    SELECT COUNT(*) as c
    FROM participants p
    JOIN games g ON p.game_id = g.game_id
    WHERE p.champion_id > 0 AND ${whereSql}
  `)
      .get(...params) as { c: number }
  ).c;

  const augments = db
    .prepare(`
    SELECT pa.augment_id, COUNT(*) as picks, SUM(pa.win) as wins
    FROM participant_augments pa
    JOIN games g ON pa.game_id = g.game_id
    WHERE pa.champion_id = ? AND ${whereSql}
    GROUP BY pa.augment_id
    ORDER BY picks DESC
  `)
    .all(championId, ...params) as { augment_id: number; picks: number; wins: number }[];

  const avg = (total: number) => (totals.games > 0 ? Math.round(total / totals.games) : 0);

  return {
    champion_id: championId,
    games: totals.games,
    wins: totals.wins,
    kills: totals.kills,
    deaths: totals.deaths,
    assists: totals.assists,
    avgDamage: avg(totals.damage),
    avgDamageTaken: avg(totals.damageTaken),
    avgGold: avg(totals.gold),
    avgHeal: avg(totals.heal),
    damageShare: damageShareGames > 0 ? damageShareSum / damageShareGames : 0,
    killParticipation: kpGames > 0 ? kpSum / kpGames : 0,
    doubleKills: totals.doubleKills,
    tripleKills: totals.tripleKills,
    quadraKills: totals.quadraKills,
    pentaKills: totals.pentaKills,
    totalParticipantSlots,
    items: Array.from(itemMap.entries())
      .map(([item_id, stats]) => ({ item_id, ...stats }))
      .sort((a, b) => b.picks - a.picks),
    augments,
  };
}

export function getDatabase(): Database.Database {
  return db;
}

// ---- Community upload ----

// A game is uploadable once it has a platform (dedup key), a patch, and
// extracted participant rows, and hasn't been sent or rejected before.
// Remakes carry no stat value and are skipped entirely.
const PENDING_UPLOAD_WHERE = `
  g.is_remake = 0
  AND g.platform_id IS NOT NULL
  AND g.game_version IS NOT NULL
  AND g.queue_id IN (${MAYHEM_QUEUE_IDS.join(", ")})
  AND g.game_id NOT IN (SELECT game_id FROM uploaded_games)
  AND EXISTS (SELECT 1 FROM participants p WHERE p.game_id = g.game_id)`;

export interface PendingUploadGame {
  game_id: number;
  platform_id: string;
  queue_id: number;
  game_version: string;
  game_duration: number;
  game_creation: number;
  participants: {
    participant_id: number;
    team_id: number;
    champion_id: number;
    win: number;
    kills: number;
    deaths: number;
    assists: number;
    double_kills: number;
    triple_kills: number;
    quadra_kills: number;
    penta_kills: number;
    largest_killing_spree: number;
    total_damage_dealt: number;
    total_damage_taken: number;
    gold_earned: number;
    total_heal: number;
    item0: number | null;
    item1: number | null;
    item2: number | null;
    item3: number | null;
    item4: number | null;
    item5: number | null;
    item6: number | null;
    augments: { slot: number; augment_id: number }[];
  }[];
}

// The next batch of games for the anonymous community upload. Identity
// columns (puuid, names, icons) are deliberately never selected here — this
// is the complete set of data that leaves the machine.
export function getPendingUploadGames(limit: number): PendingUploadGame[] {
  const games = db
    .prepare(`
    SELECT g.game_id, g.platform_id, g.queue_id, g.game_version, g.game_duration, g.game_creation
    FROM games g
    WHERE ${PENDING_UPLOAD_WHERE}
    ORDER BY g.game_creation
    LIMIT ?
  `)
    .all(limit) as any[];

  const partStmt = db.prepare(`
    SELECT participant_id, team_id, champion_id, win, kills, deaths, assists,
           double_kills, triple_kills, quadra_kills, penta_kills, largest_killing_spree,
           total_damage_dealt, total_damage_taken, gold_earned, total_heal,
           item0, item1, item2, item3, item4, item5, item6
    FROM participants WHERE game_id = ? ORDER BY participant_id
  `);
  const augStmt = db.prepare(`
    SELECT participant_id, slot, augment_id
    FROM participant_augments WHERE game_id = ? ORDER BY participant_id, slot
  `);

  return games.map((g) => {
    const participants = partStmt.all(g.game_id) as any[];
    const augments = augStmt.all(g.game_id) as {
      participant_id: number;
      slot: number;
      augment_id: number;
    }[];
    const byParticipant = new Map<number, { slot: number; augment_id: number }[]>();
    for (const a of augments) {
      let list = byParticipant.get(a.participant_id);
      if (!list) byParticipant.set(a.participant_id, (list = []));
      list.push({ slot: a.slot, augment_id: a.augment_id });
    }
    for (const p of participants) {
      p.augments = byParticipant.get(p.participant_id) ?? [];
    }
    return { ...g, participants };
  });
}

export function markGameUploads(results: { gameId: number; status: "done" | "rejected" }[]): void {
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO uploaded_games (game_id, status, uploaded_at) VALUES (?, ?, ?)",
  );
  const tx = db.transaction(() => {
    for (const r of results) stmt.run(r.gameId, r.status, Date.now());
  });
  tx();
}

export function getUploadCounts(): { uploaded: number; rejected: number; pending: number } {
  const uploaded = db
    .prepare("SELECT COUNT(*) as c FROM uploaded_games WHERE status = 'done'")
    .get() as { c: number };
  const rejected = db
    .prepare("SELECT COUNT(*) as c FROM uploaded_games WHERE status = 'rejected'")
    .get() as { c: number };
  const pending = db
    .prepare(`SELECT COUNT(*) as c FROM games g WHERE ${PENDING_UPLOAD_WHERE}`)
    .get() as { c: number };
  return { uploaded: uploaded.c, rejected: rejected.c, pending: pending.c };
}

// Forget what was uploaded, so a future opt-in starts a fresh full upload —
// used after the user deletes their remote contributions.
export function clearUploadMarks(): void {
  db.prepare("DELETE FROM uploaded_games").run();
}

// ---- Settings ----

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

// ---- Export / Import ----

export function exportAllData(): {
  version: number;
  summoner?: any | null;
  summoners?: any[];
  games: any[];
} {
  const summoners = db.prepare("SELECT * FROM summoner").all();
  const rows = db.prepare("SELECT raw_json, puuid FROM games WHERE raw_json IS NOT NULL").all() as {
    raw_json: string;
    puuid: string;
  }[];
  const games = rows.map((r) => {
    const game = JSON.parse(r.raw_json);
    game._ownerPuuid = r.puuid;
    return game;
  });
  return { version: 3, summoners, games };
}

export function importData(data: any): number {
  if (data.version >= 3) {
    for (const s of data.summoners ?? []) {
      upsertSummoner(s);
    }
    let imported = 0;
    for (const game of data.games ?? []) {
      const puuid = game._ownerPuuid || data.summoners?.[0]?.puuid;
      if (!puuid) continue;
      if (insertGameFull(game, puuid)) imported++;
    }
    return imported;
  }
  // v2 fallback: single summoner
  const puuid = data.summoner?.puuid;
  if (!puuid) return 0;
  upsertSummoner(data.summoner);
  let imported = 0;
  for (const game of data.games ?? []) {
    if (insertGameFull(game, puuid)) imported++;
  }
  return imported;
}

// ---- Repair ----

// Rebuild everything derived from raw_json for each game's current owner:
// player_stats (champion, KDA, items), augments, the remake flag, and the
// score under the current formula. Heals games whose owner puuid changed
// during repair (their stored stats still described the old participant) and
// doubles as a manual "rescore now" for formula changes.
function rebuildDerivedStats(): number {
  const rows = db
    .prepare(`
      SELECT g.game_id, g.puuid, g.game_duration, g.raw_json,
             ps.champion_id, ps.kills, ps.deaths, ps.assists
      FROM games g
      LEFT JOIN player_stats ps ON g.game_id = ps.game_id
      WHERE g.raw_json IS NOT NULL
    `)
    .all() as {
    game_id: number;
    puuid: string;
    game_duration: number;
    raw_json: string;
    champion_id: number | null;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
  }[];

  const upsertStats = db.prepare(`
    INSERT OR REPLACE INTO player_stats (
      game_id, champion_id, win, kills, deaths, assists,
      double_kills, triple_kills, quadra_kills, penta_kills,
      total_damage_dealt, total_damage_taken, gold_earned, total_heal,
      largest_killing_spree, item0, item1, item2, item3, item4, item5, item6,
      score, score_badge
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateRemake = db.prepare("UPDATE games SET is_remake = ? WHERE game_id = ?");
  const deleteAugments = db.prepare("DELETE FROM game_augments WHERE game_id = ?");
  const insertAugment = db.prepare(
    "INSERT OR IGNORE INTO game_augments (game_id, slot, augment_id) VALUES (?, ?, ?)",
  );

  let rebuilt = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      try {
        const raw = JSON.parse(row.raw_json);
        const parts = extractParticipants(raw);
        // Owner puuid unknown (old imports): findOwnerRow falls back to
        // matching the stored stats row, same as the puuid backfill migration.
        const owner = findOwnerRow(parts, row.puuid || null, row);
        if (!owner) continue;

        const isRemake = detectRemake(row.game_duration, raw) ? 1 : 0;
        updateRemake.run(isRemake, row.game_id);
        if (!isRemake) scoreParticipants(parts);

        upsertStats.run(
          row.game_id,
          owner.championId,
          owner.win,
          owner.kills,
          owner.deaths,
          owner.assists,
          owner.doubleKills,
          owner.tripleKills,
          owner.quadraKills,
          owner.pentaKills,
          owner.totalDamageDealt,
          owner.totalDamageTaken,
          owner.goldEarned,
          owner.totalHeal,
          owner.largestKillingSpree,
          ...owner.items,
          owner.score,
          owner.scoreBadge,
        );

        deleteAugments.run(row.game_id);
        for (const a of owner.augments) {
          insertAugment.run(row.game_id, a.slot, a.augmentId);
        }

        replaceParticipantRows(row.game_id, parts);
        rebuilt++;
      } catch {
        /* ignore parse errors */
      }
    }
  });
  tx();

  // Stamp the startup-backfill keys — the rebuild just did their work
  setSetting("score_formula_version", scoreFormulaKey());
  setSetting("augment_slots", String(AUGMENT_SLOTS));
  setSetting("participants_version", PARTICIPANTS_SCHEMA_VERSION);
  return rebuilt;
}

export function repairPuuids(): {
  repairedGames: number;
  discoveredAccounts: number;
  rebuiltGames: number;
} {
  // Step 1: Parse all games and collect participant puuids per game
  const games = db
    .prepare("SELECT game_id, raw_json FROM games WHERE raw_json IS NOT NULL")
    .all() as { game_id: number; raw_json: string }[];

  const puuidToGames = new Map<string, Set<number>>();
  const gameToPuuids = new Map<number, Set<string>>();

  for (const game of games) {
    try {
      const raw = JSON.parse(game.raw_json);
      const participants = raw.participants || [];
      const identities = raw.participantIdentities || [];
      const puuidsInGame = new Set<string>();

      for (let i = 0; i < participants.length; i++) {
        const p = participants[i];
        const identity = identities[i];
        const pPuuid = p.puuid || identity?.player?.puuid;
        if (pPuuid && !/^0+(-0+)*$/.test(pPuuid)) {
          puuidsInGame.add(pPuuid);
          if (!puuidToGames.has(pPuuid)) {
            puuidToGames.set(pPuuid, new Set());
          }
          puuidToGames.get(pPuuid)!.add(game.game_id);
        }
      }

      gameToPuuids.set(game.game_id, puuidsInGame);
    } catch {
      continue;
    }
  }

  // Step 2: Sort puuids by frequency (most games first)
  const sortedPuuids = Array.from(puuidToGames.entries()).sort((a, b) => b[1].size - a[1].size);

  // Step 3: Greedily identify user accounts — a puuid is a user account if it
  // never co-occurs in the same game as an already-identified user account.
  // This filters out friends (who always appear alongside a user account)
  // while correctly identifying alt accounts (which never share a game).
  const userPuuids = new Set<string>();

  for (const [puuid, gameIds] of sortedPuuids) {
    let coOccurs = false;
    for (const gameId of gameIds) {
      const puuidsInGame = gameToPuuids.get(gameId)!;
      for (const userPuuid of userPuuids) {
        if (puuidsInGame.has(userPuuid)) {
          coOccurs = true;
          break;
        }
      }
      if (coOccurs) break;
    }

    if (!coOccurs) {
      userPuuids.add(puuid);
    }
  }

  // Step 4: For each game, find which user account is present and update puuid
  const updateStmt = db.prepare("UPDATE games SET puuid = ? WHERE game_id = ?");
  let repairedGames = 0;

  for (const game of games) {
    try {
      const raw = JSON.parse(game.raw_json);
      const participants = raw.participants || [];
      const identities = raw.participantIdentities || [];

      for (let i = 0; i < participants.length; i++) {
        const p = participants[i];
        const identity = identities[i];
        const pPuuid = p.puuid || identity?.player?.puuid;
        if (pPuuid && userPuuids.has(pPuuid)) {
          updateStmt.run(pPuuid, game.game_id);
          repairedGames++;
          break;
        }
      }
    } catch {
      continue;
    }
  }

  // Step 5: Upsert discovered summoners using the most recent name from raw_json
  const upsertStmt = db.prepare(`
    INSERT OR IGNORE INTO summoner (puuid, game_name, tag_line, summoner_id, account_id, updated_at)
    VALUES (?, ?, ?, NULL, NULL, ?)
  `);

  for (const puuid of userPuuids) {
    const gameIds = puuidToGames.get(puuid)!;
    let latestName: string | null = null;
    let latestTagLine: string | null = null;
    let latestCreation = 0;

    for (const game of games) {
      if (!gameIds.has(game.game_id)) continue;
      try {
        const raw = JSON.parse(game.raw_json);
        const creation = raw.gameCreation || 0;
        if (creation <= latestCreation) continue;

        const participants = raw.participants || [];
        const identities = raw.participantIdentities || [];
        for (let i = 0; i < participants.length; i++) {
          const p = participants[i];
          const identity = identities[i];
          const pPuuid = p.puuid || identity?.player?.puuid;
          if (pPuuid === puuid) {
            const name =
              identity?.player?.gameName ||
              identity?.player?.summonerName ||
              p.summonerName ||
              p.riotIdGameName ||
              null;
            if (name) {
              latestName = name;
              latestTagLine = identity?.player?.tagLine || p.riotIdTagline || null;
              latestCreation = creation;
            }
            break;
          }
        }
      } catch {
        continue;
      }
    }

    upsertStmt.run(puuid, latestName, latestTagLine, Date.now());
  }

  // Step 6: Rebuild stats, augments, remake flags, and scores from raw_json
  // now that game ownership is settled.
  const rebuiltGames = rebuildDerivedStats();

  return { repairedGames, discoveredAccounts: userPuuids.size, rebuiltGames };
}

// ── Augment analytics (extended stats, schema v2) ───────────────────────────

export interface AugmentSlotStat {
  augmentId: number;
  slot: number;
  picks: number;
  wins: number;
}

// How each augment performs by the breakpoint it was taken at. Slot order is
// preserved from the client payload, so slot 1 is the first augment pick.
export function getAugmentSlotStats(minPicks = 1): AugmentSlotStat[] {
  return db
    .prepare(
      `SELECT pa.augment_id AS augmentId, pa.slot AS slot,
              COUNT(*) AS picks, COALESCE(SUM(pa.win), 0) AS wins
       FROM participant_augments pa
       JOIN games g ON g.game_id = pa.game_id
       WHERE g.is_remake = 0
       GROUP BY pa.augment_id, pa.slot
       HAVING COUNT(*) >= ?
       ORDER BY pa.augment_id, pa.slot`,
    )
    .all(minPicks) as AugmentSlotStat[];
}

export interface AugmentPairStat {
  augmentA: number;
  augmentB: number;
  picks: number;
  wins: number;
}

// Win rates for augment pairs taken together by the same player in the same
// game (canonical order augmentA < augmentB, each pair counted once).
export function getAugmentPairStats(minPicks = 5): AugmentPairStat[] {
  return db
    .prepare(
      `SELECT a.augment_id AS augmentA, b.augment_id AS augmentB,
              COUNT(*) AS picks, COALESCE(SUM(a.win), 0) AS wins
       FROM participant_augments a
       JOIN participant_augments b
         ON b.game_id = a.game_id
        AND b.participant_id = a.participant_id
        AND b.augment_id > a.augment_id
       JOIN games g ON g.game_id = a.game_id
       WHERE g.is_remake = 0
       GROUP BY a.augment_id, b.augment_id
       HAVING COUNT(*) >= ?
       ORDER BY CAST(COALESCE(SUM(a.win), 0) AS REAL) / COUNT(*) DESC, COUNT(*) DESC`,
    )
    .all(minPicks) as AugmentPairStat[];
}
