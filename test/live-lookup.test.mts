// Joining the running game to the database.
//
// The live panel has to turn "Nunu & Willump" into a champion id and "Ultra
// Hydra" into an augment id, from three Riot sources that spell the same name
// three ways. Getting this wrong does not fail loudly - it silently shows the
// wrong champion's augments, or strikes the wrong augment off the board - so
// the matching is worth pinning down.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { championIdFromLiveName, augmentIdsFromNames } from "../src/shared/live-lookup.ts";
import { activePlayer, LiveGameSession } from "../src/shared/live-events.ts";

const champions = {
  62: { name: "Wukong", key: "MonkeyKing" },
  20: { name: "Nunu & Willump", key: "Nunu" },
  145: { name: "Kai'Sa", key: "Kaisa" },
  115: { name: "Ziggs", key: "Ziggs" },
};

const augments = {
  1: { name: "Ultra Hydra", desc: "", iconPath: "", rarity: "kPrismatic" },
  2: { name: "Accelerating Sorcery", desc: "", iconPath: "", rarity: "kGold" },
  3: { name: "Tank It Or Leave It", desc: "", iconPath: "", rarity: "kSilver" },
};

describe("championIdFromLiveName", () => {
  test("matches the display name the live API sends", () => {
    assert.equal(championIdFromLiveName(champions, "Ziggs"), 115);
    assert.equal(championIdFromLiveName(champions, "Wukong"), 62);
  });

  test("matches through the punctuation the three sources disagree on", () => {
    // Data Dragon says "Nunu & Willump"; other surfaces drop the ampersand
    assert.equal(championIdFromLiveName(champions, "NunuWillump"), 20);
    assert.equal(championIdFromLiveName(champions, "Nunu and Willump"), null);
    assert.equal(championIdFromLiveName(champions, "Kaisa"), 145);
    assert.equal(championIdFromLiveName(champions, "Kai'Sa"), 145);
  });

  test("matches the internal name too, for a client that sends it", () => {
    assert.equal(championIdFromLiveName(champions, "MonkeyKing"), 62);
  });

  test("an unknown or missing name is null, never a guess", () => {
    assert.equal(championIdFromLiveName(champions, "Rammus"), null);
    assert.equal(championIdFromLiveName(champions, ""), null);
    assert.equal(championIdFromLiveName(champions, null), null);
    assert.equal(championIdFromLiveName(champions, undefined), null);
  });
});

describe("augmentIdsFromNames", () => {
  test("resolves the names the live API reveals", () => {
    const ids = augmentIdsFromNames(augments, ["Ultra Hydra", "Accelerating Sorcery"]);
    assert.deepEqual([...ids].sort(), [1, 2]);
  });

  test("drops what it cannot match rather than guessing", () => {
    // A real summoner spell, not an augment: the panel must not strike
    // anything off because someone took Flash
    const ids = augmentIdsFromNames(augments, ["Flash", "Ultra Hydra"]);
    assert.deepEqual([...ids], [1]);
  });

  test("nothing taken is an empty set, not a throw", () => {
    assert.equal(augmentIdsFromNames(augments, []).size, 0);
    assert.equal(augmentIdsFromNames(augments, undefined).size, 0);
  });
});

describe("activePlayer", () => {
  const players = [
    { riotId: "Someone#EUW", championName: "Ziggs" },
    { riotId: "Other#NA1", championName: "Sona" },
  ];

  test("finds the player by the riotId the newer clients send", () => {
    assert.deepEqual(activePlayer({ activePlayer: { riotId: "Other#NA1" }, allPlayers: players }), {
      riotId: "Other#NA1",
      championName: "Sona",
    });
  });

  test("builds the riot id from its two halves when that is all there is", () => {
    const data = {
      activePlayer: { riotIdGameName: "Someone", riotIdTagLine: "EUW" },
      allPlayers: players,
    };
    assert.equal(activePlayer(data).championName, "Ziggs");
  });

  test("an untagged summoner name still matches the tagged entry", () => {
    const data = { activePlayer: { summonerName: "Someone" }, allPlayers: players };
    assert.equal(activePlayer(data).championName, "Ziggs");
  });

  test("no active player is nulls, not a throw", () => {
    assert.deepEqual(activePlayer({}), { riotId: null, championName: null });
    assert.deepEqual(activePlayer(null), { riotId: null, championName: null });
  });
});

describe("LiveGameSession augment tracking", () => {
  // The only live augment signal: an augment replaces a summoner spell's
  // display name, so a name appearing where one was not before is a pickup.
  const snapshot = (gameTime: number, spells: string[]) => ({
    gameData: { gameTime, gameMode: "CHERRY" },
    activePlayer: { riotId: "Me#EUW" },
    allPlayers: [
      {
        riotId: "Me#EUW",
        championName: "Ziggs",
        items: [],
        summonerSpells: {
          summonerSpellOne: { displayName: spells[0] },
          summonerSpellTwo: { displayName: spells[1] },
        },
      },
    ],
  });

  test("names the champion being played from the first snapshot", () => {
    const s = new LiveGameSession();
    s.ingest(snapshot(10, ["Flash", "Ghost"]));
    assert.equal(s.activeChampion, "Ziggs");
    assert.equal(s.activeRiotId, "Me#EUW");
  });

  test("the opening inventory is a baseline, not three augments taken", () => {
    const s = new LiveGameSession();
    s.ingest(snapshot(10, ["Flash", "Ghost"]));
    assert.deepEqual(s.takenAugments(), []);
  });

  test("a spell name that was not there before is an augment", () => {
    const s = new LiveGameSession();
    s.ingest(snapshot(10, ["Flash", "Ghost"]));
    s.ingest(snapshot(300, ["Ultra Hydra", "Ghost"]));
    s.ingest(snapshot(600, ["Ultra Hydra", "Accelerating Sorcery"]));
    assert.deepEqual(s.takenAugments(), ["Ultra Hydra", "Accelerating Sorcery"]);
  });

  test("the same augment across many snapshots is counted once", () => {
    const s = new LiveGameSession();
    s.ingest(snapshot(10, ["Flash", "Ghost"]));
    for (const t of [300, 305, 310, 315]) s.ingest(snapshot(t, ["Ultra Hydra", "Ghost"]));
    assert.deepEqual(s.takenAugments(), ["Ultra Hydra"]);
  });

  test("a blank name mid-cast is not an augment when the real one returns", () => {
    const s = new LiveGameSession();
    s.ingest(snapshot(10, ["Flash", "Ghost"]));
    s.ingest(snapshot(20, ["", "Ghost"]));
    s.ingest(snapshot(30, ["Flash", "Ghost"]));
    assert.deepEqual(s.takenAugments(), []);
  });

  test("another player's augments are not yours", () => {
    const s = new LiveGameSession();
    const two = (spells: string[], theirs: string[]) => ({
      gameData: { gameTime: 100 },
      activePlayer: { riotId: "Me#EUW" },
      allPlayers: [
        {
          riotId: "Me#EUW",
          championName: "Ziggs",
          items: [],
          summonerSpells: {
            summonerSpellOne: { displayName: spells[0] },
            summonerSpellTwo: { displayName: spells[1] },
          },
        },
        {
          riotId: "Them#EUW",
          championName: "Sona",
          items: [],
          summonerSpells: {
            summonerSpellOne: { displayName: theirs[0] },
            summonerSpellTwo: { displayName: theirs[1] },
          },
        },
      ],
    });
    s.ingest(two(["Flash", "Ghost"], ["Flash", "Ghost"]));
    s.ingest(two(["Flash", "Ghost"], ["Ultra Hydra", "Ghost"]));
    assert.deepEqual(s.takenAugments(), []);
    assert.deepEqual(s.takenAugments("Them#EUW"), ["Ultra Hydra"]);
  });
});
