// Turn the list of confirmed weeks into the participation stats the engine
// and the History page need. Kept pure and separate so it's testable.
//
// A confirmed week's `board` has shape:
//   { events: { CSB: {A:{starters,subs},B:{...}}, DSB:{...} }, ... }
// A member "participated" in a week if they appear anywhere in that board
// (starter or sub, either team, either event counts as participation for the
// week; but we count EVENTS played too, since fairness is about event count).

export function playedEventsInWeek(board) {
  // returns Map<memberId, number of events (0,1,2)>
  const counts = new Map();
  if (!board || !board.events) return counts;
  for (const ev of ["CSB", "DSB"]) {
    const e = board.events[ev];
    if (!e) continue;
    const ids = new Set();
    for (const team of ["A", "B"]) {
      for (const bucket of ["starters", "subs"]) {
        (e[team]?.[bucket] || []).forEach((m) => ids.add(m.id));
      }
    }
    ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
  }
  return counts;
}

// Build the history object the engine consumes.
//   weeks: confirmed weeks, ascending by week_index
//   window: trailing window size (weeks)
//   uptoIndex: compute as-of this week index (exclusive) — for the week being planned
// Returns { [memberId]: { window, allTime, lastPlayedWeek } }
export function buildHistory(weeks, window, uptoIndex = Infinity) {
  const confirmed = weeks
    .filter((w) => w.board && w.week_index < uptoIndex)
    .sort((a, b) => a.week_index - b.week_index);

  const windowStart = uptoIndex === Infinity
    ? (confirmed.length ? confirmed[confirmed.length - 1].week_index - window + 1 : 0)
    : uptoIndex - window;

  const hist = {};
  const touch = (id) => (hist[id] ||= { window: 0, allTime: 0, lastPlayedWeek: null });

  for (const w of confirmed) {
    const counts = playedEventsInWeek(w.board);
    counts.forEach((n, id) => {
      const h = touch(id);
      h.allTime += n;
      if (w.week_index >= windowStart) h.window += n;
      if (n > 0) h.lastPlayedWeek = Math.max(h.lastPlayedWeek ?? -Infinity, w.week_index);
    });
  }
  return hist;
}

// Per-member table for the History page: name, THP, window count, all-time,
// last played label. Sorted by fewest window plays (most "owed" first).
export function historyTable(members, weeks, window) {
  const hist = buildHistory(weeks, window);
  return members
    .filter((m) => m.active)
    .map((m) => {
      const h = hist[m.id] || { window: 0, allTime: 0, lastPlayedWeek: null };
      return { ...m, window: h.window, allTime: h.allTime, lastPlayedWeek: h.lastPlayedWeek };
    })
    .sort((a, b) => a.window - b.window || (a.lastPlayedWeek ?? -1) - (b.lastPlayedWeek ?? -1) || b.thp - a.thp);
}
