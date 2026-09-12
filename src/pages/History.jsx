import { useMemo } from "react";
import { useApp } from "../App.jsx";
import { historyTable } from "../lib/history.js";
import { computeCore } from "../lib/engine.js";
import { thpShort } from "../lib/format.js";

export default function History() {
  const { members, weeks, settings } = useApp();
  const core = useMemo(() => computeCore(members, settings.core_size), [members, settings.core_size]);
  const rows = useMemo(
    () => historyTable(members, weeks, settings.fairness_window),
    [members, weeks, settings.fairness_window]
  );
  const confirmed = weeks.filter((w) => w.confirmed_at).sort((a, b) => b.week_index - a.week_index);

  return (
    <section className="stack">
      <div className="pagehead">
        <h1>History &amp; fairness</h1>
        <p className="muted">
          Fairness runs on the last {settings.fairness_window} weeks (the window the generator uses).
          All-time is shown alongside. Fewest recent plays sit at the top — those are next in line.
        </p>
      </div>

      <div className="panel">
        <table className="htable">
          <thead>
            <tr>
              <th>Member</th><th>Power</th>
              <th title={`Events played in last ${settings.fairness_window} weeks`}>Recent</th>
              <th>All-time</th><th>Last played</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className={core.has(m.id) ? "core" : ""}>
                <td>{core.has(m.id) && <span className="dot" />}{m.name}</td>
                <td className="num">{thpShort(m.thp)}</td>
                <td className="num strong">{m.window}</td>
                <td className="num">{m.allTime}</td>
                <td className="num">{m.lastPlayedWeek == null ? "never" : weekLabel(weeks, m.lastPlayedWeek)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagehead"><h2>Confirmed weeks</h2></div>
      {confirmed.length === 0 ? (
        <div className="panel empty"><p>No confirmed weeks yet.</p></div>
      ) : (
        <ul className="weeklist">
          {confirmed.map((w) => (
            <li key={w.id}>
              <span className="wk-label">{w.label}</span>
              <span className="muted small">{countBoard(w.board)} placements · confirmed {new Date(w.confirmed_at).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function weekLabel(weeks, idx) {
  const w = weeks.find((x) => x.week_index === idx);
  return w ? w.label : `W${idx}`;
}
function countBoard(board) {
  if (!board?.events) return 0;
  let n = 0;
  for (const ev of ["CSB", "DSB"])
    for (const t of ["A", "B"])
      n += (board.events[ev][t].starters.length + board.events[ev][t].subs.length);
  return n;
}
