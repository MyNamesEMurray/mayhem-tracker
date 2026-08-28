// The stat board's ordering, under test.
//
// The two surfaces each carried their own forty-line comparator, and both had
// the same shape of bug waiting in them: a column whose value can be Infinity
// (a champion with no deaths in the sample) or whose direction is inverted
// (tier, where "descending" means S+ first). One comparator now, so it is
// worth checking the cases that used to be written twice.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  compareValues,
  sortOptions,
  sortRows,
  type BoardColumn,
} from "../src/shared/ui/boardSort.ts";

interface Row {
  id: number;
  name: string;
  n: number;
}

type Key = "name" | "n" | "unsortable";

const columns: BoardColumn<Row, Key>[] = [
  { key: null, label: "#", render: () => null },
  { key: "name", label: "Name", naturalDir: "asc", sortValue: (r) => r.name, render: () => null },
  { key: "n", label: "Number", sortValue: (r) => r.n, render: () => null },
  { key: "unsortable", label: "No value", render: () => null },
];

const rows: Row[] = [
  { id: 1, name: "Ashe", n: 3 },
  { id: 2, name: "amumu", n: 1 },
  { id: 3, name: "Zed", n: 2 },
];

const ids = (list: Row[]) => list.map((r) => r.id);

describe("sortRows", () => {
  test("orders numerically in both directions", () => {
    assert.deepEqual(ids(sortRows(rows, columns, { key: "n", dir: "desc" })), [1, 3, 2]);
    assert.deepEqual(ids(sortRows(rows, columns, { key: "n", dir: "asc" })), [2, 3, 1]);
  });

  test("orders names the way a reader expects, not the way ASCII does", () => {
    // "amumu" before "Ashe" before "Zed". A bare < comparison puts every
    // capital ahead of every lowercase and reads as broken.
    assert.deepEqual(ids(sortRows(rows, columns, { key: "name", dir: "asc" })), [2, 1, 3]);
    assert.deepEqual(ids(sortRows(rows, columns, { key: "name", dir: "desc" })), [3, 1, 2]);
  });

  test("does not mutate the list it was given", () => {
    const original = [...rows];
    sortRows(rows, columns, { key: "n", dir: "asc" });
    assert.deepEqual(rows, original);
  });

  test("leaves the order alone when the column cannot sort", () => {
    assert.deepEqual(ids(sortRows(rows, columns, { key: "unsortable", dir: "desc" })), [1, 2, 3]);
  });

  test("a deathless KDA sorts to the top rather than out of the order", () => {
    // Infinity - Infinity is NaN, and a comparator that returns NaN leaves an
    // array in whatever order it started in. This is the case that made the
    // difference in the app's old comparator, which used the subtraction.
    const kda: BoardColumn<Row, "n">[] = [
      { key: "n", label: "KDA", sortValue: (r) => r.n, render: () => null },
    ];
    const withInfinities = [
      { id: 1, name: "a", n: 2 },
      { id: 2, name: "b", n: Infinity },
      { id: 3, name: "c", n: 5 },
      { id: 4, name: "d", n: Infinity },
    ];
    assert.deepEqual(ids(sortRows(withInfinities, kda, { key: "n", dir: "desc" })), [2, 4, 3, 1]);
    assert.deepEqual(ids(sortRows(withInfinities, kda, { key: "n", dir: "asc" })), [1, 3, 2, 4]);
  });

  test("tier's composite value puts S+ first descending, score breaking ties", () => {
    // What boardColumns builds: -(rank) * 1000 + score. Two champions in the
    // same tier keep the better score above the worse one.
    const tierValue = (rank: number, score: number) => -rank * 1000 + score;
    const tiered = [
      { id: 1, name: "b-tier high", n: tierValue(2, 55) },
      { id: 2, name: "s-plus", n: tierValue(0, 61) },
      { id: 3, name: "b-tier low", n: tierValue(2, 49) },
      { id: 4, name: "s", n: tierValue(1, 59) },
    ];
    const col: BoardColumn<Row, "n">[] = [
      { key: "n", label: "Tier", sortValue: (r) => r.n, render: () => null },
    ];
    assert.deepEqual(ids(sortRows(tiered, col, { key: "n", dir: "desc" })), [2, 4, 1, 3]);
  });
});

describe("compareValues", () => {
  test("NaN never wins an ordering", () => {
    assert.equal(compareValues(NaN, 1), -1);
    assert.equal(compareValues(1, NaN), 1);
    assert.equal(compareValues(NaN, NaN), 0);
  });

  test("equal values compare equal, so a stable sort stays stable", () => {
    assert.equal(compareValues(4, 4), 0);
    assert.equal(compareValues("x", "x"), 0);
  });
});

describe("sortOptions", () => {
  test("is the sortable columns, in the order they appear", () => {
    assert.deepEqual(sortOptions(columns), [
      { key: "name", label: "Name", naturalDir: "asc" },
      { key: "n", label: "Number", naturalDir: undefined },
    ]);
  });

  test("offers nothing the board cannot actually sort by", () => {
    // The rank column has no key; the last one has a key but no value to sort
    // on. Either in the dropdown is an option that does nothing when picked.
    const labels = sortOptions(columns).map((o) => o.label);
    assert.ok(!labels.includes("#"));
    assert.ok(!labels.includes("No value"));
  });
});
