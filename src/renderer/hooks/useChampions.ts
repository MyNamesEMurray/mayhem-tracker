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

// Item data is keyed by patch so icons come from the same patch as the game
export function useItemData(patch?: string | null) {
  const key = patch || "latest";
  const [data, setData] = useState<ItemData>(itemCaches.get(key) || {});

  useEffect(() => {
    const cached = itemCaches.get(key);
    if (cached && Object.keys(cached).length > 0) {
      setData(cached);
      return;
    }
    let promise = itemPromises.get(key);
    if (!promise) {
      promise = window.api.getItemData(patch || undefined);
      itemPromises.set(key, promise);
    }
    let active = true;
    promise.then((d) => {
      if (Object.keys(d).length > 0) itemCaches.set(key, d);
      else itemPromises.delete(key);
      if (active) setData(d);
    });
    return () => {
      active = false;
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
