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

export class LiveGameSession {
  readonly startedAt = Date.now();
  endedAt: number | null = null;
  gameMode: string | null = null;
  lastGameTime = 0;
  events: LiveItemEvent[] = [];
  private players = new Map<string, PlayerTrack>();

  get riotIds(): string[] {
    return [...this.players.keys()];
  }

  ingest(data: any): void {
    const gameTime: number = data?.gameData?.gameTime ?? 0;
    this.gameMode = data?.gameData?.gameMode ?? this.gameMode;
    this.lastGameTime = gameTime;

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
