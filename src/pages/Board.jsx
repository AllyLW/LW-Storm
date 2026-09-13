import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../App.jsx";
import * as api from "../lib/api.js";
import { thpShort, thpFull } from "../lib/format.js";

const EVENTS = ["CSB", "DSB"];
const EV_LABEL = { CSB: "Canyon Storm — Thursday", DSB: "Desert Storm — Friday" };

export default function Board() {
  const { weeks, members, role, pin, reload, flash } = useApp();
  const [params] = useSearchParams();
  const canEdit = role === "admin" || role === "officer";

  const weekId = params.get("week");
  const week = useMemo(() => {
    if (weekId) return weeks.find((w) => w.id === weekId);
    const withBoard = weeks.filter((w) => w.board).sort((a, b) => b.week_index - a.week_index);
    return withBoard[0] || null;
  }, [weeks, weekId]);

  const [board, setBoard] = useState(() => (week?.board ? clone(week.board) : null));
  const [syncedId, setSyncedId] = useState(week?.id);
  const [editor, setEditor] = useState(null);
  const [adding, setAdding] = useState(null); // "ev-team" of the team being added to
  if (week && week.id !== syncedId) {
    setSyncedId(week.id);
    setBoard(week.board ? clone(week.board) : null);
    setEditor(null);
  }

  if (!week || !board) {
    return (
      <section className="stack">
        <div className="pagehead"><h1>Board</h1></div>
        <div className="panel empty">
          <p>No teams generated yet.</p>
          {canEdit && <p className="muted small">Go to Plan, enter availability, and generate the week.</p>}
        </div>
      </section>
    );
  }

  const coreSet = new Set(board.core || []);
  const confirmed = Boolean(week.confirmed_at);
  const availability = week.availability || {};

  const placedIds = new Set();
  for (const ev of EVENTS)
    for (const t of ["A", "B"])
      for (const b of ["starters", "subs"])
        board.events[ev][t][b].forEach((m) => placedIds.add(m.id));

  // --- rotation flags ---------------------------------------------------
  // B) "overdue" = a pool player who did NOT play in the most recent
  //    confirmed week before this one. Core never gets it.
  const overdueSet = new Set();
  const lastConfirmed = weeks
    .filter((w) => w.confirmed_at && w.board && w.week_index < week.week_index)
    .sort((a, b) => b.week_index - a.week_index)[0];
  if (lastConfirmed) {
    const playedLast = new Set();
    for (const ev of EVENTS)
      for (const t of ["A", "B"])
        for (const bk of ["starters", "subs"])
          (lastConfirmed.board.events?.[ev]?.[t]?.[bk] || []).forEach((m) => playedLast.add(m.id));
    // any active pool member who isn't core and didn't play last week is overdue
    for (const m of members) {
      if (!m.active || coreSet.has(m.id)) continue;
      if (!playedLast.has(m.id)) overdueSet.add(m.id);
    }
  }

  // C) "doubled-up" = a pool player placed in BOTH events this week.
  const inCSB = new Set();
  const inDSB = new Set();
  for (const t of ["A", "B"])
    for (const bk of ["starters", "subs"]) {
      (board.events.CSB[t][bk] || []).forEach((m) => inCSB.add(m.id));
      (board.events.DSB[t][bk] || []).forEach((m) => inDSB.add(m.id));
    }
  const doubledSet = new Set();
  inCSB.forEach((id) => { if (inDSB.has(id) && !coreSet.has(id)) doubledSet.add(id); });

  async function confirmWeek() {
    if (!window.confirm("Confirm this week? It locks the board and counts toward everyone's participation. You can reopen it later if needed.")) return;
    try {
      await api.saveWeek(pin, { id: week.id, label: week.label, week_index: week.week_index, board, confirm: true });
      await reload();
      flash("Week confirmed — history updated");
    } catch (e) { flash(e.message); }
  }
  async function reopenWeek() {
    if (!window.confirm("Reopen this week for editing? Its participation will be recounted when you confirm again.")) return;
    try {
      await api.saveWeek(pin, { id: week.id, label: week.label, week_index: week.week_index, board, reopen: true });
      await reload();
      flash("Week reopened — you can edit again");
    } catch (e) { flash(e.message); }
  }
  async function saveEdits() {
    try {
      await api.saveWeek(pin, { id: week.id, label: week.label, week_index: week.week_index, board, confirm: false });
      await reload();
      flash("Changes saved");
    } catch (e) { flash(e.message); }
  }

  function removeFrom(ev, team, bucket, id) {
    setBoard((b) => {
      const n = clone(b);
      n.events[ev][team][bucket] = n.events[ev][team][bucket].filter((m) => m.id !== id);
      return n;
    });
    setEditor(null);
  }

  // Empty every slot on the board and SAVE immediately, so it persists across
  // reloads/tab switches (otherwise the old board reloads from the database).
  async function clearBoard() {
    if (!window.confirm("Clear every player from all four teams? This saves immediately.")) return;
    const cleared = clone(board);
    for (const ev of EVENTS)
      for (const t of ["A", "B"])
        for (const bk of ["starters", "subs"])
          cleared.events[ev][t][bk] = [];
    setBoard(cleared);
    setEditor(null);
    try {
      await api.saveWeek(pin, { id: week.id, label: week.label, week_index: week.week_index, board: cleared, confirm: false });
      await reload();
      flash("Board cleared and saved");
    } catch (e) { flash(e.message); }
  }

  // Add a player to a team (manual build). Goes to starters if room, else subs.
  // Removes them from any other slot in the same event first (no duplicates).
  function addPlayer(ev, team, member) {
    setBoard((b) => {
      const n = clone(b);
      // remove from any slot in this event
      for (const t of ["A", "B"])
        for (const bk of ["starters", "subs"])
          n.events[ev][t][bk] = n.events[ev][t][bk].filter((m) => m.id !== member.id);
      const slim = { id: member.id, name: member.name, thp: member.thp };
      const bucket = n.events[ev][team].starters.length < 20 ? "starters" : "subs";
      n.events[ev][team][bucket].push(slim);
      // keep ordered by THP
      n.events[ev][team][bucket].sort((a, c) => c.thp - a.thp || a.name.localeCompare(c.name));
      return n;
    });
    flash(`Added ${member.name}`);
  }
  function swapIn(ev, team, bucket, oldId, newMember) {
    setBoard((b) => {
      const n = clone(b);
      const list = n.events[ev][team][bucket];
      const i = list.findIndex((m) => m.id === oldId);
      if (i !== -1) list[i] = { id: newMember.id, name: newMember.name, thp: newMember.thp };
      return n;
    });
    setEditor(null);
    flash(`Swapped in ${newMember.name}`);
  }
  function moveTo(from, dest) {
    setBoard((b) => {
      const n = clone(b);
      const src = n.events[from.ev][from.team][from.bucket];
      const i = src.findIndex((m) => m.id === from.id);
      if (i === -1) return n;
      const [mm] = src.splice(i, 1);
      n.events[dest.ev][dest.team][dest.bucket].push(mm);
      n.events[dest.ev][dest.team][dest.bucket].sort((a, c) => c.thp - a.thp || a.name.localeCompare(c.name));
      return n;
    });
    setEditor(null);
    flash("Moved");
  }

  return (
    <section className="stack">
      <div className="pagehead board-head">
        <div>
          <h1>{week.label}</h1>
          <p className="muted">
            {confirmed ? "Confirmed — locked so participation stays accurate. Reopen to make changes."
                       : "Draft — tap ✎ on any name to swap or move. Confirm when it's final."}
            {board.unplaced && (board.unplaced.pool.length + board.unplaced.core.length > 0) && (
              <> · {board.unplaced.pool.length + board.unplaced.core.length} couldn't be placed (over capacity)</>
            )}
          </p>
        </div>
        {canEdit && !confirmed && (
          <div className="board-actions">
            <button className="btn ghost danger" onClick={clearBoard}>Clear board</button>
            <button className="btn ghost" onClick={saveEdits}>Save edits</button>
            <button className="btn primary" onClick={confirmWeek}>Confirm week</button>
          </div>
        )}
        {canEdit && confirmed && (
          <div className="board-actions">
            <button className="btn primary" onClick={reopenWeek}>Reopen week</button>
          </div>
        )}
      </div>

      {EVENTS.map((ev) => (
        <div key={ev} className={"event " + ev.toLowerCase()}>
          <div className="event-head">
            <h2><span className="ev-icon">{ev === "CSB" ? "🏔️" : "🏜️"}</span>{EV_LABEL[ev]}</h2>
            <span className="event-count">{countEvent(board.events[ev])} placed</span>
          </div>
          <div className="teams">
            {["A", "B"].map((team) => (
              <TeamCard
                key={team}
                ev={ev} team={team}
                data={board.events[ev][team]}
                coreSet={coreSet}
                availability={availability}
                overdueSet={overdueSet}
                doubledSet={doubledSet}
                canEdit={canEdit && !confirmed}
                editor={editor}
                setEditor={setEditor}
                members={members}
                placedIds={placedIds}
                onRemove={removeFrom}
                onSwap={swapIn}
                onMove={moveTo}
                onAdd={addPlayer}
                adding={adding}
                setAdding={setAdding}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function TeamCard(props) {
  const { team, data, ev, canEdit, adding, setAdding } = props;
  const power = [...data.starters, ...data.subs].reduce((s, m) => s + m.thp, 0);
  const addKey = `${ev}-${team}`;
  const addOpen = adding === addKey;
  return (
    <div className={"team team-" + team.toLowerCase()}>
      <div className="team-head">
        <h3>Team {team}</h3>
        <span className="team-power" title={thpFull(power)}>⚡ {thpShort(power)}</span>
      </div>
      <SlotList {...props} title="Starters" cap={20} rows={data.starters} bucket="starters" />
      <SlotList {...props} title="Subs" cap={10} rows={data.subs} bucket="subs" sub />
      {canEdit && (
        <div className="team-add">
          <button className="btn xs ghost" onClick={() => setAdding(addOpen ? null : addKey)}>
            {addOpen ? "Close" : "+ Add player"}
          </button>
          {addOpen && (
            <AddPicker {...props} onDone={() => setAdding(null)} />
          )}
        </div>
      )}
    </div>
  );
}

function AddPicker(props) {
  const { ev, team, members, availability, coreSet, placedIds, onAdd } = props;
  const [q, setQ] = useState("");
  const list = useMemo(() =>
    members
      .filter((m) => m.active && m.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.thp - a.thp || a.name.localeCompare(b.name))
      .slice(0, 40),
    [members, q]);
  return (
    <div className="addpicker">
      <input autoFocus className="bpicker-search" placeholder="Add player to this team…"
        value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="bpicker-list">
        {list.map((m) => {
          const already = placedIds.has(m.id);
          const avail = wasAvailable(availability, m.id, ev);
          return (
            <li key={m.id}>
              <button className="bpick" onClick={() => onAdd(ev, team, m)}>
                <span className="bpick-name">
                  {coreSet.has(m.id) && <span className="dot" />}{m.name}
                  {!avail && <span className="warn" title="Wasn't marked available">!</span>}
                  {already && <span className="bpick-tag">placed</span>}
                </span>
                <span className="bpick-thp">{thpShort(m.thp)}</span>
                <span className="bpick-check"></span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="muted small" style={{ padding: "0.4rem" }}>No match</li>}
      </ul>
    </div>
  );
}

function SlotList(props) {
  const { title, cap, rows, sub, ev, team, bucket, coreSet, availability, overdueSet, doubledSet, canEdit,
          editor, setEditor, members, placedIds, onRemove, onSwap, onMove } = props;
  return (
    <div className={"slotlist" + (sub ? " subs" : "")}>
      <div className="slotlist-title">{title} <span className="cap">{rows.length}/{cap}</span></div>
      <ol>
        {rows.map((m, i) => {
          const key = `${ev}-${team}-${bucket}-${m.id}`;
          const open = editor && editor.key === key;
          const avail = wasAvailable(availability, m.id, ev);
          return (
            <li key={m.id} className={coreSet.has(m.id) ? "core" : ""}>
              <span className="slot-n">{i + 1}</span>
              <span className="slot-name">
                {coreSet.has(m.id) && <span className="dot" title="Core" />}
                {m.name}
                {!avail && <span className="warn" title="Wasn't marked available this week">!</span>}
                {overdueSet && overdueSet.has(m.id) && <span className="flag-overdue" title="Didn't play last week — give them a turn">⏳</span>}
                {doubledSet && doubledSet.has(m.id) && <span className="flag-doubled" title="Placed in BOTH events this week while others may be sitting out">×2</span>}
              </span>
              <span className="slot-thp">{thpShort(m.thp)}</span>
              {canEdit && (
                <button className="slot-edit" title="Swap or move"
                  onClick={() => setEditor(open ? null : { key, ev, team, bucket, id: m.id })}>
                  ✎
                </button>
              )}
              {open && (
                <SlotEditor
                  slot={{ ev, team, bucket, id: m.id }}
                  member={m}
                  members={members}
                  availability={availability}
                  placedIds={placedIds}
                  onClose={() => setEditor(null)}
                  onRemove={onRemove}
                  onSwap={onSwap}
                  onMove={onMove}
                />
              )}
            </li>
          );
        })}
        {rows.length === 0 && <li className="slot-empty">—</li>}
      </ol>
    </div>
  );
}

function SlotEditor({ slot, member, members, availability, placedIds, onClose, onRemove, onSwap, onMove }) {
  const [tab, setTab] = useState("swap");
  const [q, setQ] = useState("");

  const candidates = useMemo(() => {
    return members
      .filter((m) => m.active && m.id !== member.id)
      .filter((m) => m.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.thp - a.thp || a.name.localeCompare(b.name))
      .slice(0, 40);
  }, [members, q, member.id]);

  const destinations = [];
  for (const ev of EVENTS)
    for (const team of ["A", "B"])
      for (const bucket of ["starters", "subs"]) {
        if (ev === slot.ev && team === slot.team && bucket === slot.bucket) continue;
        destinations.push({ ev, team, bucket });
      }

  return (
    <div className="editor-pop" onClick={(e) => e.stopPropagation()}>
      <div className="editor-tabs">
        <button className={tab === "swap" ? "on" : ""} onClick={() => setTab("swap")}>Swap in</button>
        <button className={tab === "move" ? "on" : ""} onClick={() => setTab("move")}>Move</button>
        <button className="editor-close" onClick={onClose}>×</button>
      </div>

      {tab === "swap" && (
        <div className="editor-body">
          <input autoFocus className="editor-search" placeholder="Search player…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="cand-list">
            {candidates.map((c) => {
              const already = placedIds.has(c.id);
              const avail = wasAvailable(availability, c.id, slot.ev);
              return (
                <li key={c.id}>
                  <button className="cand" onClick={() => onSwap(slot.ev, slot.team, slot.bucket, member.id, c)}>
                    <span className="cand-name">
                      {c.name}
                      {!avail && <span className="warn" title="Wasn't marked available for this event">!</span>}
                      {already && <span className="cand-tag">placed</span>}
                    </span>
                    <span className="cand-thp">{thpShort(c.thp)}</span>
                  </button>
                </li>
              );
            })}
            {candidates.length === 0 && <li className="muted small" style={{ padding: "0.4rem" }}>No match</li>}
          </ul>
        </div>
      )}

      {tab === "move" && (
        <div className="editor-body">
          <p className="muted small" style={{ margin: "0 0 0.4rem" }}>Move {member.name} to:</p>
          <div className="dest-grid">
            {destinations.map((d, i) => (
              <button key={i} className={"dest " + d.ev.toLowerCase()} onClick={() => onMove(slot, d)}>
                <b>{d.ev}</b> {d.team} · {d.bucket === "starters" ? "Start" : "Sub"}
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="editor-remove" onClick={() => onRemove(slot.ev, slot.team, slot.bucket, member.id)}>
        Remove from team
      </button>
    </div>
  );
}

function wasAvailable(availability, id, ev) {
  const a = availability[id];
  if (!a) return false;
  return !!a[ev];
}
function countEvent(e) {
  return ["A", "B"].reduce((s, t) => s + e[t].starters.length + e[t].subs.length, 0);
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }