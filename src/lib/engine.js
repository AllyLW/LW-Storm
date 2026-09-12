// ===================================================================
// Storm event assignment engine  —  PURE, no I/O, fully testable.
//
// The whole scheduling brain lives here. The UI feeds it three things
// (roster, this week's availability, participation history) and gets
// back a proposed board. Nothing here touches the network or the DOM,
// so it can be unit-tested in isolation (see engine.test.js).
//
// Vocabulary
//   member      { id, name, thp, active }
//   core        the top `coreSize` ACTIVE members by THP (derived here,
//               never stored, so it can't go stale)
//   pool        every other active member
//   event       "CSB" (Thursday) or "DSB" (Friday)
//   team        "A" or "B" within an event
//   slot        a seat on a team; first 20 by THP = starters, next 10 = subs
//
// The agreed rules, in force order:
//   1. Fill CSB first (Thu), then DSB (Fri). CSB placements influence
//      DSB fairness for the pool.
//   2. Core plays BOTH events whenever available. No spreading — they're
//      the win condition. Available-for-one-only => that one event.
//   3. Pool fills the rest by fairness (trailing window): least-played
//      first, then longest-benched, then higher THP.
//   4. Anti-back-to-back: no available pool player is left out of BOTH
//      events when a slot exists, and no pool player gets a SECOND event
//      before every available pool player has had one.
//   5. Within an event, snake the assigned group by THP into Team A/B so
//      the two teams are near-equal in power.
//   6. Within each team, top 20 by THP start, next 10 are subs.
// ===================================================================

export const EVENTS = ["CSB", "DSB"]; // fill order matters: CSB then DSB
export const STARTERS_PER_TEAM = 20;
export const SUBS_PER_TEAM = 10;
export const TEAM_CAP = STARTERS_PER_TEAM + SUBS_PER_TEAM; // 30
export const EVENT_CAP = TEAM_CAP * 2; // 60 per event

// ---- helpers -----------------------------------------------------

// Derive the core set (ids) from the current roster: top N active by THP.
// Ties broken by name so the cutoff is deterministic.
export function computeCore(members, coreSize) {
  return new Set(
    activeByThp(members)
      .slice(0, Math.max(0, coreSize))
      .map((m) => m.id)
  );
}

function activeByThp(members) {
  return members
    .filter((m) => m.active)
    .slice()
    .sort((a, b) => b.thp - a.thp || a.name.localeCompare(b.name));
}

// Fairness numbers for the pool, from participation history.
// history: { [memberId]: { window: number, allTime: number, lastPlayedWeek: number|null } }
//   window        events played inside the trailing fairness window
//   lastPlayedWeek index of the most recent week they played (higher = more recent)
// Returns a comparator: earlier = higher claim on a scarce slot.
function poolComparator(history, weekIndex) {
  const h = (id) => history[id] || { window: 0, lastPlayedWeek: null };
  return (a, b) => {
    const ha = h(a.id);
    const hb = h(b.id);
    // 1. fewest events in the window first
    if (ha.window !== hb.window) return ha.window - hb.window;
    // 2. longest benched first (null = never played => most benched)
    const la = ha.lastPlayedWeek == null ? -Infinity : ha.lastPlayedWeek;
    const lb = hb.lastPlayedWeek == null ? -Infinity : hb.lastPlayedWeek;
    if (la !== lb) return la - lb;
    // 3. higher THP first
    return b.thp - a.thp;
  };
}

// ---- main entry --------------------------------------------------

// roster:        array of members
// availability:  { [memberId]: { CSB: bool, DSB: bool } }
// history:       see poolComparator
// opts:          { coreSize = 34, weekIndex = 0 }
//
// Returns:
// {
//   core:     Set of core ids (for UI marking),
//   events: {
//     CSB: { A: {starters:[], subs:[]}, B: {starters:[], subs:[]} },
//     DSB: { ... }
//   },
//   assignedPool: { [memberId]: number }   // how many events each pool player got (for the anti-back-to-back check / diagnostics)
//   unplaced: { core: [...], pool: [...] } // available but no slot (turnout > capacity)
// }
export function assign(roster, availability, history, opts = {}) {
  const coreSize = opts.coreSize ?? 34;
  const weekIndex = opts.weekIndex ?? 0;

  const byId = new Map(roster.map((m) => [m.id, m]));
  const core = computeCore(roster, coreSize);
  const avail = (id, ev) => !!(availability[id] && availability[id][ev]);
  const isActive = (id) => byId.get(id)?.active;

  // Split active members into core and pool, each already THP-sorted.
  const active = activeByThp(roster);
  const coreMembers = active.filter((m) => core.has(m.id));
  const poolMembers = active.filter((m) => !core.has(m.id));

  const cmp = poolComparator(history, weekIndex);
  // Pool ordered by fairness (this is the queue for scarce slots).
  const poolQueue = poolMembers.slice().sort(cmp);

  // Track how many events each pool player has been given THIS week, so we
  // can enforce "everyone gets one before anyone gets two".
  const poolGiven = {};
  poolMembers.forEach((m) => (poolGiven[m.id] = 0));

  // Build the raw membership list for each event (before A/B snake).
  // eventMembers[ev] = array of members assigned to that event.
  const eventMembers = { CSB: [], DSB: [] };
  const unplaced = { core: [], pool: [] };

  for (const ev of EVENTS) {
    const seats = EVENT_CAP;
    const chosen = [];

    // (2) Core available for this event go in first, by THP.
    for (const m of coreMembers) {
      if (!avail(m.id, ev)) continue;
      if (chosen.length < seats) chosen.push(m);
      else unplaced.core.push(m.id); // capacity blown by core alone (rare)
    }

    // (3)+(4) Pool fills the rest. Two passes:
    //   pass 1: only pool players who have 0 events so far this week
    //           (guarantees "no one misses both / everyone gets one first")
    //   pass 2: if slots remain, allow seconds, still in fairness order
    const passes = [
      poolQueue.filter((m) => poolGiven[m.id] === 0),
      poolQueue, // seconds allowed
    ];
    for (let p = 0; p < passes.length; p++) {
      for (const m of passes[p]) {
        if (chosen.length >= seats) break;
        if (!avail(m.id, ev)) continue;
        if (p === 0 && poolGiven[m.id] !== 0) continue;
        if (p === 1 && poolGiven[m.id] !== 1) continue; // only give a 2nd, not a 3rd
        if (chosen.includes(m)) continue;
        chosen.push(m);
        poolGiven[m.id] += 1;
      }
    }

    eventMembers[ev] = chosen;
  }

  // Any available pool player who ended the week with 0 events, despite a
  // slot never opening for them, is genuinely unplaced (turnout > capacity).
  for (const m of poolMembers) {
    const wanted = avail(m.id, "CSB") || avail(m.id, "DSB");
    if (wanted && poolGiven[m.id] === 0) unplaced.pool.push(m.id);
  }

  // (5)+(6) Snake each event's group into balanced Team A/B, then split
  // each team into starters/subs by THP.
  const events = {};
  for (const ev of EVENTS) {
    events[ev] = snakeAndSplit(eventMembers[ev]);
  }

  return { core, events, assignedPool: poolGiven, unplaced };
}

// Snake a THP-sorted group across Team A / Team B for power balance,
// then split each team into 20 starters + 10 subs by THP.
// Snake pattern: A, B, B, A, A, B, B, A, ...  keeps running totals close.
export function snakeAndSplit(group) {
  const sorted = group.slice().sort((a, b) => b.thp - a.thp || a.name.localeCompare(b.name));
  const A = [];
  const B = [];
  // Pairwise snake: index 0->A,1->B, 2->B,3->A, 4->A,5->B ...
  sorted.forEach((m, i) => {
    const pairEven = Math.floor(i / 2) % 2 === 0; // pair 0,2,4.. even
    const firstInPair = i % 2 === 0;
    // even pair: first->A second->B ; odd pair: first->B second->A
    const toA = pairEven ? firstInPair : !firstInPair;
    (toA ? A : B).push(m);
  });
  return { A: splitTeam(A), B: splitTeam(B) };
}

function splitTeam(team) {
  const sorted = team.slice().sort((a, b) => b.thp - a.thp || a.name.localeCompare(b.name));
  return {
    starters: sorted.slice(0, STARTERS_PER_TEAM),
    subs: sorted.slice(STARTERS_PER_TEAM, STARTERS_PER_TEAM + SUBS_PER_TEAM),
    overflow: sorted.slice(STARTERS_PER_TEAM + SUBS_PER_TEAM), // shouldn't happen within one event, kept for safety
  };
}

// Total THP of a team (starters + subs) — used by the UI to show balance.
export function teamPower(team) {
  return [...team.starters, ...team.subs].reduce((s, m) => s + m.thp, 0);
}
