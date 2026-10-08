import { useMemo } from "react";
import { useApp } from "../App.jsx";
import * as api from "../lib/api.js";
import { useT } from "../lib/i18n.jsx";
import { historyTable } from "../lib/history.js";
import { computeCore } from "../lib/engine.js";
import { thpShort } from "../lib/format.js";

export default function History() {
  const { members, weeks, settings, role, pin, reload, flash } = useApp();
  const { t } = useT();
  const canEdit = role === "admin" || role === "officer";
  const core = useMemo(() => computeCore(members, settings.core_size), [members, settings.core_size]);

  async function removeWeek(w) {
    if (!window.confirm(`Delete the week "${w.label}"? This permanently removes it and its participation no longer counts toward fairness. This can't be undone.`)) return;
    try {
      await api.deleteWeek(pin, w.id);
      await reload();
      flash(t("history.delete"));
    } catch (e) { flash(e.message); }
  }
  const rows = useMemo(
    () => historyTable(members, weeks, settings.fairness_window),
    [members, weeks, settings.fairness_window]
  );
  const confirmed = weeks.filter((w) => w.confirmed_at).sort((a, b) => b.week_index - a.week_index);

  return (
    <section className="stack">
      <div className="pagehead">
        <h1>{t("history.title")}</h1>
        <p className="muted">{t("history.sub", { n: settings.fairness_window })}</p>
      </div>

      <div className="panel">
        <table className="htable">
          <thead>
            <tr>
              <th>{t("common.member")}</th><th>{t("common.power")}</th>
              <th>{t("history.recent")}</th>
              <th>{t("history.allTime")}</th><th>{t("history.lastPlayed")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className={core.has(m.id) ? "core" : ""}>
                <td>{core.has(m.id) && <span className="dot" />}{m.name}</td>
                <td className="num">{thpShort(m.thp)}</td>
                <td className="num strong">{m.window}</td>
                <td className="num">{m.allTime}</td>
                <td className="num">{m.lastPlayedWeek == null ? t("history.never") : weekLabel(weeks, m.lastPlayedWeek)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagehead"><h2>{t("history.confirmedWeeks")}</h2></div>
      {confirmed.length === 0 ? (
        <div className="panel empty"><p>{t("history.noWeeks")}</p></div>
      ) : (
        <ul className="weeklist">
          {confirmed.map((w) => (
            <li key={w.id}>
              <span className="wk-label">{w.label}</span>
              <span className="muted small">{countBoard(w.board)} {t("history.placements")} {new Date(w.confirmed_at).toLocaleDateString()}</span>
              {canEdit && (
                <button className="btn xs ghost danger wk-del" onClick={() => removeWeek(w)}>{t("history.delete")}</button>
              )}
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
