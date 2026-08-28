// Pure derivation of build-order events from Live Client Data snapshots.
// Fed successive /allgamedata payloads, a session accumulates per-player
// item add/remove events (buys, sells, components consumed by combines) and
// augment pickups that reveal themselves by replacing a summoner spell slot
// (verified against a recorded Mayhem game - the only live augment signal).

export interface LiveItemEvent {
  gameTime: number;
  riotId: string;
  action: "add" | "remove" | "augment";
  itemId: number | null;
  count: number;
  // Spell/augment display name for augment events
  detail: string | null;
}

interface PlayerTrack {
  items: Map<number, number>;
  knownSpells: Set<string>;
}

// Who is at the keyboard, and what they are playing. The active player is
// named on its own object; the champion is only on the matching entry in
// allPlayers, so the two have to be joined. Riot has spelled the name three
// ways across client versions and all three still turn up in the wild, so
// every one of them is tried before giving up.
export function activePlayer(data: any): { riotId: string | null; championName: string | null } {
  const a = data?.activePlayer;
  const riotId: string | null =
    a?.riotId ||
    (a?.riotIdGameName && a?.riotIdTagLine ? `${a.riotIdGameName}#${a.riotIdTagLine}` : null) ||
    a?.summonerName ||
    null;
  if (!riotId) return { riotId: null, championName: null };

  const lower = riotId.toLowerCase();
  for (const p of data?.allPlayers ?? []) {
    const id: string = p?.riotId || p?.summonerName || "";
    // A client that reports the active player without a tag still matches the
    // tagged entry in allPlayers, which is the common shape on older builds
    if (id.toLowerCase() === lower || id.split("#")[0].toLowerCase() === lower) {
      return { riotId: id || riotId, championName: p?.championName ?? null };
    }
  }
  return { riotId, championName: null };
}

export class LiveGameSession {
  readonly startedAt = Date.now();
  endedAt: number | null = null;
  gameMode: string | null = null;
  lastGameTime = 0;
  events: LiveItemEvent[] = [];
  // The player at the keyboard, for the panel that recommends augments while
  // a game is running. Kept from the first snapshot that names them.
  activeRiotId: string | null = null;
  activeChampion: string | null = null;
  private players = new Map<string, PlayerTrack>();

  get riotIds(): string[] {
    return [...this.players.keys()];
  }

  // Augments this player has already picked up, in the order they appeared.
  // Named rather than numbered: the live API reveals an augment by replacing
  // a summoner spell's display name, and a name is all it gives.
  takenAugments(riotId: string | null = this.activeRiotId): string[] {
    if (!riotId) return [];
    const out: string[] = [];
    for (const e of this.events) {
      if (e.action === "augment" && e.riotId === riotId && e.detail) out.push(e.detail);
    }
    return out;
  }

  ingest(data: any): void {
    const gameTime: number = data?.gameData?.gameTime ?? 0;
    this.gameMode = data?.gameData?.gameMode ?? this.gameMode;
    this.lastGameTime = gameTime;

    if (!this.activeChampion) {
      const active = activePlayer(data);
      this.activeRiotId = active.riotId ?? this.activeRiotId;
      this.activeChampion = active.championName ?? this.activeChampion;
    }

    for (const p of data?.allPlayers ?? []) {
      const riotId: string = p?.riotId || p?.summonerName;
      if (!riotId) continue;

      const current = new Map<number, number>();
      for (const it of p.items ?? []) {
        if (typeof it?.itemID === "number") {
          current.set(it.itemID, (current.get(it.itemID) ?? 0) + (it.count ?? 1));
        }
      }

      const spellNames = [
        p?.summonerSpells?.summonerSpellOne?.displayName,
        p?.summonerSpells?.summonerSpellTwo?.displayName,
      ].filter((n): n is string => typeof n === "string");

      const track = this.players.get(riotId);
      if (!track) {
        // First sight of this player: inventory and spells are the baseline,
        // not events. Blank spell names (mid-cast flicker) stay unknown so a
        // real name later isn't mistaken for an augment.
        this.players.set(riotId, {
          items: current,
          knownSpells: new Set(spellNames.filter((n) => n !== "")),
        });
        continue;
      }

      for (const [id, n] of current) {
        const before = track.items.get(id) ?? 0;
        if (n > before) {
          this.events.push({
            gameTime,
            riotId,
            action: "add",
            itemId: id,
            count: n - before,
            detail: null,
          });
        }
      }
      for (const [id, n] of track.items) {
        const now = current.get(id) ?? 0;
        if (now < n) {
          this.events.push({
            gameTime,
            riotId,
            action: "remove",
            itemId: id,
            count: n - now,
            detail: null,
          });
        }
      }
      track.items = current;

      for (const name of spellNames) {
        if (name !== "" && !track.knownSpells.has(name)) {
          track.knownSpells.add(name);
          this.events.push({
            gameTime,
            riotId,
            action: "augment",
            itemId: null,
            count: 1,
            detail: name,
          });
        }
      }
    }
  }
}

// Matches a finished live session's players against a stored game's
// participants. Returns riotId -> participantId when enough players line up
// to be confident it's the same game, else null.
export function matchSessionToGame(
  sessionRiotIds: string[],
  gameParticipants: { participantId: number; riotId: string | null }[],
  minMatches = 8,
): Map<string, number> | null {
  const byId = new Map<string, number>();
  for (const p of gameParticipants) {
    if (p.riotId) byId.set(p.riotId.toLowerCase(), p.participantId);
  }
  const mapping = new Map<string, number>();
  for (const riotId of sessionRiotIds) {
    const pid = byId.get(riotId.toLowerCase());
    if (pid !== undefined) mapping.set(riotId, pid);
  }
  return mapping.size >= minMatches ? mapping : null;
}
