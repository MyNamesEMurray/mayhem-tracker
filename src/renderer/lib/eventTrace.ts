// Counts the games-updated events this window has received since it opened.
// If the main process reports storing games while this stays at zero, the
// problem is event delivery; if both move but the list doesn't, it's the
// refetch. Subscribed once from the app shell.
export const eventTrace = {
  gamesUpdated: 0,
  lastAt: 0,
};

export function recordGamesUpdated() {
  eventTrace.gamesUpdated++;
  eventTrace.lastAt = Date.now();
}
