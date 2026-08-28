import { useEffect, useState } from "react";
import type { LiveGameState } from "../lib/types";

// The game in progress, if there is one.
//
// Pushed from the main process rather than polled: the build-order watcher is
// already taking a snapshot every five seconds, so it can say when something
// the panel draws has changed. The initial read covers a window opened
// mid-game, when the last push happened before anyone was listening.
//
// Null means "not asked yet", which is not the same as "no game". The panel
// sends you back to Overview when there is no game to show, and treating the
// moment before the first answer as "no game" sent you back before the
// question had been answered - so the tab you had just clicked bounced.
export function useLiveGame(): LiveGameState | null {
  const [state, setState] = useState<LiveGameState | null>(null);

  useEffect(() => {
    let alive = true;
    window.api
      .getLiveGame()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState({ inGame: false }));
    const unsub = window.api.onLiveGame((s) => alive && setState(s));
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  return state;
}
