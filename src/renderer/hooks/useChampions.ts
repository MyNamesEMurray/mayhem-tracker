import { useState, useEffect } from "react";
import type { ChampionData, AugmentData, ItemData } from "../lib/types";

let champCache: ChampionData | null = null;
let augCache: AugmentData | null = null;
const itemCaches = new Map<string, ItemData>();
const itemPromises = new Map<string, Promise<ItemData>>();

function hasData<T extends object>(obj: T | null): obj is T {
  return obj !== null && Object.keys(obj).length > 0;
}

export function useChampionData() {
  const [data, setData] = useState<ChampionData>(champCache || {});

  useEffect(() => {
    if (hasData(champCache)) return;
    window.api.getChampionData().then((d) => {
      if (Object.keys(d).length > 0) champCache = d;
      setData(d);
    });
  }, []);

  return data;
}

export function useAugmentData() {
  const [data, setData] = useState<AugmentData>(augCache || {});

  useEffect(() => {
    if (hasData(augCache)) return;
    window.api.getAugmentData().then((d) => {
      if (Object.keys(d).length > 0) augCache = d;
      setData(d);
    });
  }, []);

  return data;
}

// Item data is keyed by patch so icons come from the same patch as the game.
// Loads notify every mounted subscriber (not just the instance that started
// the fetch), and an empty result - the main process returns {} on network
// failure - is retried a few times instead of sticking until remount.
const itemListeners = new Map<string, Set<(d: ItemData) => void>>();

function loadItems(key: string, patch?: string | null): void {
  if (itemPromises.has(key)) return;
  const promise = window.api.getItemData(patch || undefined).then((raw) => {
    // Defensive: a failed IPC round-trip should degrade to "no data", never
    // throw inside the shared loader
    const d = raw ?? {};
    if (Object.keys(d).length > 0) {
      itemCaches.set(key, d);
      itemListeners.get(key)?.forEach((fn) => fn(d));
    } else {
      // Failed load: drop the promise so a later attempt can retry
      itemPromises.delete(key);
    }
    return d;
  });
  itemPromises.set(key, promise);
}

export function useItemData(patch?: string | null) {
  const key = patch || "latest";
  const [data, setData] = useState<ItemData>(itemCaches.get(key) || {});

  useEffect(() => {
    const cached = itemCaches.get(key);
    if (cached) {
      setData(cached);
      return;
    }
    setData({});
    let listeners = itemListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      itemListeners.set(key, listeners);
    }
    const listener = (d: ItemData) => setData(d);
    listeners.add(listener);
    loadItems(key, patch);
    let tries = 0;
    const retry = setInterval(() => {
      if (itemCaches.has(key) || ++tries > 5) {
        clearInterval(retry);
        return;
      }
      loadItems(key, patch);
    }, 4000);
    return () => {
      listeners!.delete(listener);
      clearInterval(retry);
    };
  }, [key]);

  return data;
}

export function getChampionName(data: ChampionData, id: number): string {
  return data[id]?.name || `Champion ${id}`;
}

export function getAugmentName(data: AugmentData, id: number): string {
  return data[id]?.name || `Augment ${id}`;
}
