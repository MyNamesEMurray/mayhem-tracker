import { createContext, useContext, useMemo, type ReactNode } from "react";

// Augment names and rarities, for the components that draw them.
//
// The app and the site fetch this from the same CommunityDragon endpoint but
// by different routes - the app through its main process over IPC, with a
// cache on disk; the site with fetch and localStorage. Both are right for
// their runtime, so the transport stays where it is and only the result is
// shared. A component asks the context; each surface fills it once, at its
// root, from whatever it already had.
//
// This replaced the app's icons reaching for window.api in a mount effect,
// which is also what made them impossible to render outside Electron - the
// design-sync previews needed a hand-written window.api shim to draw a
// scoreboard.

export interface AugmentInfo {
  name: string;
  desc?: string;
  iconPath: string;
  rarity: string;
}

export type AugmentData = Record<number, AugmentInfo>;

// A stable empty map, so a surface that has not loaded yet does not hand the
// context a fresh object on every render
export const NO_AUGMENTS: AugmentData = {};

const GameDataContext = createContext<{ augments: AugmentData }>({ augments: NO_AUGMENTS });

export function GameDataProvider({
  augments,
  children,
}: {
  augments: AugmentData;
  children: ReactNode;
}) {
  // The site re-renders its root on every filter change, so the value is
  // memoised rather than rebuilt each time and pushed at every consumer.
  const value = useMemo(() => ({ augments }), [augments]);
  return <GameDataContext.Provider value={value}>{children}</GameDataContext.Provider>;
}

export function useAugments(): AugmentData {
  return useContext(GameDataContext).augments;
}

export function getAugmentName(data: AugmentData, id: number): string {
  return data[id]?.name || `Augment ${id}`;
}
