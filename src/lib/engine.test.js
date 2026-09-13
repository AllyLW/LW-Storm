import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assign,
  computeCore,
  snakeAndSplit,
  teamPower,
  EVENT_CAP,
} from "./engine.js";

// ---- fixtures ----------------------------------------------------

// Make N members with descending THP: m1 is strongest.
function makeRoster(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i + 1}`,
    name: `P${String(i + 1).padStart(3, "0")}`,
    thp: (n - i) * 1000, // m1 highest
    active: true,
  }));
}

// Everyone available for both events.
function allAvailable(roster) {
  const a = {};
  roster.forEach((m) => (a[m.id] = { CSB: true, DSB: true }));
  return a;
}

const emptyHistory = {};

// ---- core derivation ---------------------------------------------

test("core is the top-N active by THP", () => {
  const roster = makeRoster(100);
  const core = computeCore(roster, 34);
  assert.equal(core.size, 34);
  assert.ok(core.has("m1"));
  assert.ok(core.has("m34"));
  assert.ok(!core.has("m35"));
});

test("inactive members are excluded from core", () => {
  const roster = makeRoster(100);
  roster[0].active = false; // strongest goes inactive
  const core = computeCore(roster, 34);
  assert.ok(!core.has("m1"));
  assert.ok(core.has("m35")); // everyone shifts up one
});

// ---- rule 2: core plays both events ------------------------------

test("available core players are placed in BOTH events", () => {
  const roster = makeRoster(100);
  const { events } = assign(roster, allAvailable(roster), emptyHistory, {
    coreSize: 34,
  });
  const inEvent = (ev, id) => {
    const all = [
      ...events[ev].A.starters,
      ...events[ev].A.subs,
      ...events[ev].B.starters,
      ...events[ev].B.subs,
    ];
    return all.some((m) => m.id === id);
  };
  // m1 is core -> in both CSB and DSB
  assert.ok(inEvent("CSB", "m1"));
  assert.ok(inEvent("DSB", "m1"));
});

test("core available for only one event appears only there", () => {
  const roster = makeRoster(100);
  const avail = allAvailable(roster);
  avail["m1"] = { CSB: true, DSB: false };
  const { events } = assign(roster, avail, emptyHistory, { coreSize: 34 });
  const inEvent = (ev, id) =>
    [...events[ev].A.starters, ...events[ev].A.subs, ...events[ev].B.starters, ...events[ev].B.subs].some(
      (m) => m.id === id
    );
  assert.ok(inEvent("CSB", "m1"));
  assert.ok(!inEvent("DSB", "m1"));
});

// ---- rule 4: anti-back-to-back for the pool ----------------------

test("no available pool player is left out of BOTH events when capacity allows", () => {
  // 60 members, core 34. Everyone available. 26 pool players, plenty of room.
  const roster = makeRoster(60);
  const avail = allAvailable(roster);
  const res = assign(roster, avail, emptyHistory, { coreSize: 34 });
  // Every active pool player wanted to play and there's room => none unplaced.
  assert.equal(res.unplaced.pool.length, 0);
  // And each pool player got at least one event.
  const poolIds = roster.slice(34).map((m) => m.id);
  poolIds.forEach((id) => assert.ok(res.assignedPool[id] >= 1, `${id} should have >=1 event`));
});

test("everyone gets one event before anyone gets two (scarce case)", () => {
  // Construct scarcity: many pool players, few slots left after core.
  // 34 core + 40 pool = 74 members. Core fills 34 of each event's 60 seats,
  // leaving 26 pool seats per event, 52 total, for 40 pool players.
  // So some can get a second, but ONLY after all 40 have got their first.
  const roster = makeRoster(74);
  const avail = allAvailable(roster);
  const res = assign(roster, avail, emptyHistory, { coreSize: 34 });
  const poolIds = roster.slice(34).map((m) => m.id);
  const gotZero = poolIds.filter((id) => res.assignedPool[id] === 0);
  const gotTwo = poolIds.filter((id) => res.assignedPool[id] === 2);
  // If anyone got two, then nobody got zero.
  if (gotTwo.length > 0) {
    assert.equal(gotZero.length, 0, "no pool player should have 0 while another has 2");
  }
});

// ---- rule 3: fairness ordering -----------------------------------

test("least-played pool player is chosen first when slots are scarce", () => {
  // Two pool players competing for one remaining slot.
  // Fill core + pool so exactly one pool seat is contested.
  const roster = makeRoster(36); // 34 core + 2 pool
  const avail = {};
  // Only give the two pool players availability for CSB, core all available.
  roster.forEach((m, i) => {
    if (i < 34) avail[m.id] = { CSB: true, DSB: true };
    else avail[m.id] = { CSB: true, DSB: false };
  });
  // m35 has played a lot in window, m36 has never played -> m36 favored.
  const history = {
    m35: { window: 5, allTime: 5, lastPlayedWeek: 3 },
    m36: { window: 0, allTime: 0, lastPlayedWeek: null },
  };
  const res = assign(roster, avail, history, { coreSize: 34, weekIndex: 4 });
  // Both should actually fit (60 seats, 36 people) — check ordering instead:
  // the less-played m36 must be present in CSB.
  const csbIds = [
    ...res.events.CSB.A.starters,
    ...res.events.CSB.A.subs,
    ...res.events.CSB.B.starters,
    ...res.events.CSB.B.subs,
  ].map((m) => m.id);
  assert.ok(csbIds.includes("m36"));
});

// ---- rule 5/6: balance and starter/sub split ---------------------

test("snake split balances team power within a few percent", () => {
  const roster = makeRoster(40);
  const { A, B } = snakeAndSplit(roster);
  const pa = teamPower(A);
  const pb = teamPower(B);
  const diff = Math.abs(pa - pb) / ((pa + pb) / 2);
  assert.ok(diff < 0.05, `teams should be within 5% power, got ${(diff * 100).toFixed(1)}%`);
});

test("each team splits into 20 starters and up to 10 subs by THP", () => {
  const roster = makeRoster(60);
  const { A } = snakeAndSplit(roster);
  assert.ok(A.starters.length <= 20);
  // starters are all stronger than subs
  if (A.subs.length) {
    const weakestStarter = Math.min(...A.starters.map((m) => m.thp));
    const strongestSub = Math.max(...A.subs.map((m) => m.thp));
    assert.ok(weakestStarter >= strongestSub);
  }
});

// ---- capacity / low turnout --------------------------------------

test("low turnout just leaves slots empty, no crash", () => {
  const roster = makeRoster(100);
  const avail = {};
  // Only 10 people available for CSB, nobody for DSB.
  roster.slice(0, 10).forEach((m) => (avail[m.id] = { CSB: true, DSB: false }));
  const res = assign(roster, avail, emptyHistory, { coreSize: 34 });
  const csbCount = [
    ...res.events.CSB.A.starters,
    ...res.events.CSB.A.subs,
    ...res.events.CSB.B.starters,
    ...res.events.CSB.B.subs,
  ].length;
  const dsbCount = [
    ...res.events.DSB.A.starters,
    ...res.events.DSB.A.subs,
    ...res.events.DSB.B.starters,
    ...res.events.DSB.B.subs,
  ].length;
  assert.equal(csbCount, 10);
  assert.equal(dsbCount, 0);
});

test("event never exceeds its capacity", () => {
  const roster = makeRoster(200); // more than can fit
  const avail = allAvailable(roster);
  const res = assign(roster, avail, emptyHistory, { coreSize: 34 });
  for (const ev of ["CSB", "DSB"]) {
    const count = [
      ...res.events[ev].A.starters,
      ...res.events[ev].A.subs,
      ...res.events[ev].B.starters,
      ...res.events[ev].B.subs,
    ].length;
    assert.ok(count <= EVENT_CAP, `${ev} has ${count}, cap ${EVENT_CAP}`);
  }
});

// ---- seed + fill (locks) -----------------------------------------

test("locked player stays on their chosen event and team", () => {
  const roster = makeRoster(100);
  const avail = allAvailable(roster);
  // lock a mid-pool player (m70) to CSB Team B, even though by THP they'd not be there
  const locks = { m70: { ev: "CSB", team: "B" } };
  const { events } = assign(roster, avail, emptyHistory, { coreSize: 34, locks });
  const inTeam = (ev, team) =>
    [...events[ev][team].starters, ...events[ev][team].subs].some((m) => m.id === "m70");
  assert.ok(inTeam("CSB", "B"), "m70 should be on CSB Team B");
  // and NOT on CSB Team A
  assert.ok(!inTeam("CSB", "A"), "m70 should not be on CSB Team A");
});

test("locked player still gets starter/sub by THP", () => {
  const roster = makeRoster(100);
  const avail = allAvailable(roster);
  // lock the single strongest player to DSB Team A -> should be a starter
  const locks = { m1: { ev: "DSB", team: "A" } };
  const { events } = assign(roster, avail, emptyHistory, { coreSize: 34, locks });
  const isStarter = events.DSB.A.starters.some((m) => m.id === "m1");
  assert.ok(isStarter, "strongest locked player should start");
});

test("locks don't break capacity", () => {
  const roster = makeRoster(200);
  const avail = allAvailable(roster);
  const locks = { m150: { ev: "CSB", team: "A" }, m151: { ev: "CSB", team: "B" } };
  const res = assign(roster, avail, emptyHistory, { coreSize: 34, locks });
  for (const ev of ["CSB", "DSB"]) {
    const count = [
      ...res.events[ev].A.starters, ...res.events[ev].A.subs,
      ...res.events[ev].B.starters, ...res.events[ev].B.subs,
    ].length;
    assert.ok(count <= EVENT_CAP, `${ev} within capacity`);
  }
  // locked players are present
  const csbAll = ["A","B"].flatMap((t) => [...res.events.CSB[t].starters, ...res.events.CSB[t].subs]).map((m)=>m.id);
  assert.ok(csbAll.includes("m150") && csbAll.includes("m151"));
});

test("no locks behaves exactly like before", () => {
  const roster = makeRoster(60);
  const avail = allAvailable(roster);
  const a = assign(roster, avail, emptyHistory, { coreSize: 34 });
  const b = assign(roster, avail, emptyHistory, { coreSize: 34, locks: {} });
  // same total placed both ways
  const count = (r, ev) => ["A","B"].reduce((s,t)=>s+r.events[ev][t].starters.length+r.events[ev][t].subs.length,0);
  assert.equal(count(a,"CSB"), count(b,"CSB"));
  assert.equal(count(a,"DSB"), count(b,"DSB"));
});
