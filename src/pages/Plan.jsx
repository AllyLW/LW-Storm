import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../App.jsx";
import * as api from "../lib/api.js";
import { assign, computeCore } from "../lib/engine.js";
import { buildHistory } from "../lib/history.js";
import { thpShort } from "../lib/format.js";
import { isoWeekLabel } from "../lib/format.js";

export default function Plan() {
  const { members, weeks, settings, role, pin, reload, flash } = useApp();
  const nav = useNavigate();
  const canEdit = role === "admin" || role === "officer";

  const active = useMemo(
    () => members.filter((m) => m.active).sort((a, b) => b.thp - a.thp || a.name.localeCompare(b.name)),
    [members]
  );
  const core = useMemo(() => computeCore(members, settings.core_size), [members, settings.core_size]);

  // Availability state: { id: { CSB, DSB } }. Start empty.
  const [avail, setAvail] = useState(() => {
    const a = {};
    active.forEach((m) => (a[m.id] = { CSB: false, DSB: false }));
    return a;
  });
  const [q, setQ] = useState("");
  const [label, setLabel] = useState(isoWeekLabel());

  const set = (id, ev, v) => setAvail((a) => ({ ...a, [id]: { ...a[id], [ev]: v } }));
  const shown = active.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));

  const counts = useMemo(() => {
    let csb = 0, dsb = 0;
    Object.values(avail).forEach((v) => { if (v.CSB) csb++; if (v.DSB) dsb++; });
    return { csb, dsb };
  }, [avail]);

  function checkAllCore(ev, val) {
    setAvail((a) => {
      const next = { ...a };
      active.forEach((m) => { if (core.has(m.id)) next[m.id] = { ...next[m.id], [ev]: val }; });
      return next;
    });
  }
  function checkAll(ev, val) {
    setAvail((a) => {
      const next = { ...a };
      active.forEach((m) => (next[m.id] = { ...next[m.id], [ev]: val }));
      return next;
    });
  }

  async function generate() {
    // If a week with this label already exists, reuse it (overwrite the draft)
    // instead of trying to create a duplicate — labels must be unique.
    const existing = weeks.find((w) => w.label === label);
    if (existing && existing.confirmed_at) {
      flash("That week is already confirmed — change the label or reopen it from History.");
      return;
    }
    // Keep the existing week_index when regenerating so fairness stays stable;
    // only mint a new index for a genuinely new week.
    const weekIndex = existing
      ? existing.week_index
      : (weeks.length ? Math.max(...weeks.map((w) => w.week_index)) + 1 : 0);
    const history = buildHistory(weeks, settings.fairness_window, weekIndex);
    const result = assign(members, avail, history, { coreSize: settings.core_size, weekIndex });
    try {
      const id = await api.saveWeek(pin, {
        id: existing ? existing.id : null,   // <- update in place if it exists
        label,
        week_index: weekIndex,
        availability: avail,
        board: serializeBoard(result),
        confirm: false,
      });
      await reload();
      flash(existing ? "Board regenerated" : "Board generated — review and confirm");
      nav(`/board?week=${encodeURIComponent(id)}`);
    } catch (e) { flash(e.message); }
  }

  if (!canEdit) {
    return (
      <section className="stack">
        <div className="pagehead"><h1>Plan the week</h1></div>
        <div className="panel">
          <p>Entering availability and generating teams is for R4 officers. Unlock with your PIN in the top right.</p>
          <p className="muted small">Anyone can view the current teams on the Board and see fairness on History.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="stack">
      <div className="pagehead">
        <h1>Plan the week</h1>
        <p className="muted">
          Tick who voted available in-game. CSB is Thursday, DSB is Friday — the generator fills CSB first.
        </p>
      </div>

      <div className="planbar">
        <label className="field">
          <span>Week</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <div className="tallies">
          <span className="tally csb">CSB {counts.csb}</span>
          <span className="tally dsb">DSB {counts.dsb}</span>
        </div>
        <button className="btn primary" onClick={generate}>Generate teams</button>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="bulk">
          <span className="muted small">Quick set:</span>
          <button className="btn xs" onClick={() => checkAllCore("CSB", true)}>Core → CSB</button>
          <button className="btn xs" onClick={() => checkAllCore("DSB", true)}>Core → DSB</button>
          <button className="btn xs ghost" onClick={() => { checkAll("CSB", false); checkAll("DSB", false); }}>Clear all</button>
        </div>
      </div>

      <div className="gridhead">
        <span className="gh-name">Member</span>
        <span className="gh-thp">Power</span>
        <button className="gh-ev csb" onClick={() => checkAll("CSB", true)}>CSB ✓ all</button>
        <button className="gh-ev dsb" onClick={() => checkAll("DSB", true)}>DSB ✓ all</button>
      </div>
      <ul className="availgrid">
        {shown.map((m) => (
          <li key={m.id} className={core.has(m.id) ? "core" : ""}>
            <span className="ag-name">
              {core.has(m.id) && <span className="dot" title="Core" />}
              {m.name}
            </span>
            <span className="ag-thp">{thpShort(m.thp)}</span>
            <label className="ag-check csb">
              <input type="checkbox" checked={avail[m.id]?.CSB || false}
                onChange={(e) => set(m.id, "CSB", e.target.checked)} />
            </label>
            <label className="ag-check dsb">
              <input type="checkbox" checked={avail[m.id]?.DSB || false}
                onChange={(e) => set(m.id, "DSB", e.target.checked)} />
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Flatten engine member objects to just what the board needs to store.
export function serializeBoard(result) {
  const slim = (m) => ({ id: m.id, name: m.name, thp: m.thp });
  const team = (t) => ({ starters: t.starters.map(slim), subs: t.subs.map(slim) });
  return {
    events: {
      CSB: { A: team(result.events.CSB.A), B: team(result.events.CSB.B) },
      DSB: { A: team(result.events.DSB.A), B: team(result.events.DSB.B) },
    },
    core: [...result.core],
    unplaced: result.unplaced,
  };
}
