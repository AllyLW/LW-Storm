import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../App.jsx";
import * as api from "../lib/api.js";
import { MAPS, KIND, MAX_PER_BUILDING } from "../lib/maps.js";
import { thpShort } from "../lib/format.js";
import { exportMapImage } from "../lib/mapexport.js";

const EVENTS = ["CSB", "DSB"];
const BASE = import.meta.env.BASE_URL || "/";

export default function MapBoard() {
  const { weeks, members, role, pin, reload, flash } = useApp();
  const [params] = useSearchParams();
  const canEdit = role === "admin" || role === "officer";

  const weekId = params.get("week");
  const week = useMemo(() => {
    if (weekId) return weeks.find((w) => w.id === weekId);
    const withBoard = weeks.filter((w) => w.board).sort((a, b) => b.week_index - a.week_index);
    return withBoard[0] || null;
  }, [weeks, weekId]);

  const [ev, setEv] = useState("DSB");
  const [team, setTeam] = useState("A");
  const [maps, setMaps] = useState(() => week?.board?.maps ? clone(week.board.maps) : emptyMaps());
  const [syncedId, setSyncedId] = useState(week?.id);
  const [picking, setPicking] = useState(null);
  if (week && week.id !== syncedId) {
    setSyncedId(week.id);
    setMaps(week.board?.maps ? clone(week.board.maps) : emptyMaps());
    setPicking(null);
  }

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  if (!week || !week.board) {
    return (
      <section className="stack">
        <div className="pagehead"><h1>Battle map</h1></div>
        <div className="panel empty">
          <p>No week generated yet.</p>
          {canEdit && <p className="muted small">Generate a week on Plan first, then assign players to buildings here.</p>}
        </div>
      </section>
    );
  }

  const layout = MAPS[ev];
  const confirmed = Boolean(week.confirmed_at);
  const teamData = week.board.events[ev][team];
  const teamRoster = [...teamData.starters, ...teamData.subs];
  const assign = maps[ev][team];
  const coreSet = new Set(week.board.core || []);

  const placedHere = new Set();
  Object.values(assign).forEach((ids) => ids.forEach((id) => placedHere.add(id)));

  function toggleAssign(buildingKey, id) {
    setMaps((prev) => {
      const n = clone(prev);
      const arr = n[ev][team][buildingKey] || [];
      const i = arr.indexOf(id);
      if (i === -1) { if (arr.length >= MAX_PER_BUILDING) return prev; arr.push(id); }
      else arr.splice(i, 1);
      n[ev][team][buildingKey] = arr;
      return n;
    });
  }
  function clearBuilding(buildingKey) {
    setMaps((prev) => { const n = clone(prev); n[ev][team][buildingKey] = []; return n; });
  }
  async function save() {
    try {
      const newBoard = { ...week.board, maps };
      await api.saveWeek(pin, { id: week.id, label: week.label, week_index: week.week_index, board: newBoard, confirm: false });
      await reload();
      flash("Map saved");
    } catch (e) { flash(e.message); }
  }

  async function download(format) {
    try {
      await exportMapImage({
        ev, team, assign: maps[ev][team], memberById, format, weekLabel: week.label,
      });
      flash(`Downloaded Team ${team} ${format.toUpperCase()}`);
    } catch (e) { flash("Export failed: " + e.message); }
  }

  return (
    <section className="stack">
      <div className="pagehead">
        <h1>Battle map — {layout.label}</h1>
        <p className="muted">Click a building to assign players from Team {team}. Up to {MAX_PER_BUILDING} each.</p>
      </div>

      <div className="maptoolbar">
        <div className="seg">
          {EVENTS.map((e) => (
            <button key={e} className={"seg-btn " + (ev === e ? "on " : "") + e.toLowerCase()}
              onClick={() => { setEv(e); setPicking(null); }}>{MAPS[e].label}</button>
          ))}
        </div>
        <div className="seg">
          {["A", "B"].map((t) => (
            <button key={t} className={"seg-btn " + (team === t ? "on" : "")}
              onClick={() => { setTeam(t); setPicking(null); }}>Team {t}</button>
          ))}
        </div>
        {canEdit && !confirmed && <button className="btn primary" onClick={save}>Save map</button>}
        <div className="dlgroup">
          <span className="dl-label">Download Team {team}:</span>
          <button className="btn ghost xs" onClick={() => download("png")}>PNG</button>
          <button className="btn ghost xs" onClick={() => download("jpeg")}>JPEG</button>
        </div>
      </div>

      <div className="maplayout">
        {/* the map with tags on top */}
        <div className="mapframe" style={{ aspectRatio: String(layout.aspect) }}>
          <img className="mapimg" src={BASE + layout.image} alt={layout.label} draggable="false" />
          {layout.spawns.map((s, i) => (
            <div key={i} className={"map-spawn " + s.team} style={{ left: `${s.x}%`, top: `${s.y}%` }}>
              {s.team === "blue" ? "Blue base" : "Red base"}
            </div>
          ))}
          {layout.buildings.map((b) => {
            const ids = assign[b.key] || [];
            const kind = KIND[b.kind];
            const open = picking === b.key;
            return (
              <div key={b.key} className="map-bpos" style={{ left: `${b.x}%`, top: `${b.y}%` }}>
                <button
                  className={"map-tag" + (ids.length ? " filled" : " empty")}
                  style={{ "--tint": kind.tint }}
                  onClick={() => canEdit && !confirmed && setPicking(open ? null : b.key)}
                  title={b.name + " — " + kind.label}
                >
                  <span className="map-tag-name">{b.name}</span>
                  {ids.length > 0 ? (
                    <span className="map-tag-players">
                      {ids.map((id) => {
                        const m = memberById.get(id);
                        return <span key={id} className="map-chip">{m ? m.name : "?"}</span>;
                      })}
                    </span>
                  ) : (canEdit && !confirmed && <span className="map-tag-add">+ assign</span>)}
                </button>

                {open && (
                  <BuildingPicker
                    building={b} ids={ids} teamRoster={teamRoster}
                    placedHere={placedHere} coreSet={coreSet}
                    onToggle={(id) => toggleAssign(b.key, id)}
                    onClear={() => clearBuilding(b.key)}
                    onClose={() => setPicking(null)}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* summary list beside the map */}
        <aside className="mapsummary">
          <h3>Team {team} — {layout.label}</h3>
          <ul>
            {layout.buildings.map((b) => {
              const ids = assign[b.key] || [];
              const kind = KIND[b.kind];
              return (
                <li key={b.key}>
                  <span className="sum-dot" style={{ background: kind.tint }} />
                  <span className="sum-name">{b.name}</span>
                  <span className="sum-players">
                    {ids.length === 0
                      ? <span className="sum-empty">—</span>
                      : ids.map((id) => memberById.get(id)?.name || "?").join(", ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      {confirmed && <p className="muted small">This week is confirmed — reopen it on the Board to edit the map.</p>}
    </section>
  );
}

function BuildingPicker({ building, ids, teamRoster, placedHere, coreSet, onToggle, onClear, onClose }) {
  const [q, setQ] = useState("");
  const list = teamRoster
    .filter((m) => m.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.thp - a.thp || a.name.localeCompare(b.name));
  return (
    <div className="bpicker" onClick={(e) => e.stopPropagation()}>
      <div className="bpicker-head">
        <strong>{building.name}</strong>
        <span className="muted small">{ids.length}/{MAX_PER_BUILDING}</span>
        <button className="bpicker-close" onClick={onClose}>×</button>
      </div>
      <input autoFocus className="bpicker-search" placeholder="Search this team…"
        value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="bpicker-list">
        {list.map((m) => {
          const on = ids.includes(m.id);
          const elsewhere = !on && placedHere.has(m.id);
          return (
            <li key={m.id}>
              <button className={"bpick " + (on ? "on" : "")} onClick={() => onToggle(m.id)}>
                <span className="bpick-name">
                  {coreSet.has(m.id) && <span className="dot" />}{m.name}
                  {elsewhere && <span className="bpick-tag">placed</span>}
                </span>
                <span className="bpick-thp">{thpShort(m.thp)}</span>
                <span className="bpick-check">{on ? "✓" : ""}</span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="muted small" style={{ padding: "0.4rem" }}>No match</li>}
      </ul>
      {ids.length > 0 && <button className="bpicker-clear" onClick={onClear}>Clear building</button>}
    </div>
  );
}

function emptyMaps() {
  const m = {};
  for (const ev of EVENTS) m[ev] = { A: {}, B: {} };
  return m;
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }
