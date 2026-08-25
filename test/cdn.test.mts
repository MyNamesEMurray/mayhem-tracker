// Artwork URLs, shared by the desktop app and mayhemstats.com.
//
// The fallback chain is the part worth testing: some Mayhem item icons carry a
// texture-variant suffix CommunityDragon does not export, so the base path has
// to be tried after the exact one, and the legacy mirror after that. The app
// spreads this over a patch's own branch; the site only ever needs "latest".

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  augmentIconUrl,
  CDRAGON_ASSET_URL,
  CHAMPION_ICON_URL,
  itemIconSources,
  itemIconUrl,
  stripIconVariant,
} from "../src/shared/cdn.ts";

describe("asset paths", () => {
  test("a CommunityDragon game-data path becomes a raw asset URL, lowercased", () => {
    assert.equal(
      CDRAGON_ASSET_URL("latest", "/lol-game-data/assets/ASSETS/Items/Icons2D/3153.png"),
      "https://raw.communitydragon.org/latest/game/assets/items/icons2d/3153.png",
    );
  });

  test("the branch is whatever the caller resolved — a patch, pbe or latest", () => {
    const path = "/lol-game-data/assets/ASSETS/Items/Icons2D/3153.png";
    assert.ok(CDRAGON_ASSET_URL("16.14", path).includes("/16.14/game/"));
    assert.ok(CDRAGON_ASSET_URL("pbe", path).includes("/pbe/game/"));
    assert.equal(itemIconUrl(path), CDRAGON_ASSET_URL("latest", path));
  });

  test("augment icons ask for the large variant", () => {
    const url = augmentIconUrl("/lol-game-data/assets/ASSETS/Augments/Icons/small/thing.png");
    assert.ok(url.includes("/large/"), url);
    assert.ok(!url.includes("/small/"), url);
  });

  test("an empty icon path yields no URL rather than a broken one", () => {
    assert.equal(augmentIconUrl(""), "");
    assert.equal(itemIconUrl(""), "");
  });

  test("champion icons key off the numeric id", () => {
    assert.ok(CHAMPION_ICON_URL(201).endsWith("/champion-icons/201.png"));
  });
});

describe("the item icon fallback chain", () => {
  test("a texture variant is stripped back to the base path", () => {
    assert.equal(
      stripIconVariant("3153_Blade_of_the_Ruined_King.project_jade.png"),
      "3153_Blade_of_the_Ruined_King.png",
    );
  });

  test("a path with no variant has nothing to strip", () => {
    assert.equal(stripIconVariant("3153_Blade_of_the_Ruined_King.png"), null);
    assert.equal(stripIconVariant(""), null);
  });

  test("a variant path is tried exactly, then stripped, then the legacy mirror", () => {
    const sources = itemIconSources(3153, "assets/items/3153_Blade.project_jade.png", "16.14");
    assert.equal(sources.length, 3);
    assert.ok(sources[0].includes("project_jade"), sources[0]);
    assert.ok(!sources[1].includes("project_jade"), sources[1]);
    assert.ok(sources[2].includes("league-of-data-base"), sources[2]);
    for (const s of sources.slice(0, 2)) assert.ok(s.includes("/16.14/"), s);
  });

  test("a plain path skips the stripped step", () => {
    const sources = itemIconSources(3153, "assets/items/3153_Blade.png");
    assert.equal(sources.length, 2);
  });

  test("an item with no known icon still gets the legacy mirror to try", () => {
    const sources = itemIconSources(3153);
    assert.deepEqual(sources, [
      "https://www.league-of-data-base.com/upload/16.4.1/item_img/3153.png",
    ]);
  });

  test("every candidate is a URL, in best-first order, with no duplicates", () => {
    const sources = itemIconSources(3153, "assets/items/3153_Blade.project_jade.png");
    for (const s of sources) assert.ok(s.startsWith("https://"), s);
    assert.equal(new Set(sources).size, sources.length);
  });
});
