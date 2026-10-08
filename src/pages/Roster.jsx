import { useState, useMemo } from "react";
import { useApp } from "../App.jsx";
import * as api from "../lib/api.js";
import { computeCore } from "../lib/engine.js";
import { thpShort, thpFull } from "../lib/format.js";
import { useT } from "../lib/i18n.jsx";

export default function Roster() {
  const { members, settings, role, pin, reload, flash } = useApp();
  const { t } = useT();
  const [q, setQ] = useState("");
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [editing, setEditing] = useState(null); // member id being edited
  const [draft, setDraft] = useState({ name: "", thp: 0 });

  const core = useMemo(() => computeCore(members, settings.core_size), [members, settings.core_size]);
  const ranked = useMemo(
    () => members.slice().sort((a, b) => b.thp - a.thp || a.name.localeCompare(b.name)),
    [members]
  );
  const shown = ranked.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));

  const canEdit = role === "admin" || role === "officer";

  async function save(m) {
    try {
      await api.upsertMember(pin, m);
      await reload();
      flash("Saved");
      setEditing(null);
    } catch (e) { flash(e.message); }
  }
  async function toggleActive(m) {
    try { await api.upsertMember(pin, { ...m, active: !m.active }); await reload(); }
    catch (e) { flash(e.message); }
  }
  async function remove(m) {
    if (!confirm(`Remove ${m.name}?`)) return;
    try { await api.deleteMember(pin, m.id); await reload(); flash("Removed"); }
    catch (e) { flash(e.message); }
  }
  async function addNew() {
    if (!draft.name.trim()) return;
    await save({ name: draft.name.trim(), thp: Number(draft.thp) || 0, active: true });
    setDraft({ name: "", thp: 0 });
  }
  async function runPaste() {
    // Parse lines: "Name<tab or comma or spaces>THP". THP may have commas/M/K.
    const rows = paste.split("\n").map(parseLine).filter(Boolean);
    if (!rows.length) { flash("No valid lines"); return; }
    try {
      const n = await api.bulkUpsertMembers(pin, rows);
      await reload();
      flash(`Updated ${n} members`);
      setPaste(""); setShowPaste(false);
    } catch (e) { flash(e.message); }
  }

  return (
    <section className="stack">
      <div className="pagehead">
        <h1>{t("roster.title")}</h1>
        <p className="muted">{t("roster.sub", { n: members.filter((m) => m.active).length, core: settings.core_size })}</p>
      </div>

      <div className="toolbar">
        <input className="search" placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        {canEdit && (
          <button className="btn ghost" onClick={() => setShowPaste((v) => !v)}>
            {showPaste ? t("roster.closePaste") : t("roster.bulkPaste")}
          </button>
        )}
      </div>

      {canEdit && showPaste && (
        <div className="panel paste">
          <p className="muted small">
            {t("roster.pasteHelp")}
          </p>
          <textarea
            rows={8}
            placeholder={"Ace, 14.2M\nBlaze, 13800000\nCyrus 12.9M"}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button className="btn" onClick={runPaste}>{t("roster.applyPaste")}</button>
        </div>
      )}

      {canEdit && (
        <div className="addrow">
          <input placeholder={t("roster.newName")} value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input placeholder={t("roster.thp")} value={draft.thp}
            onChange={(e) => setDraft({ ...draft, thp: e.target.value })}
            onBlur={(e) => setDraft({ ...draft, thp: parseThp(e.target.value) })} />
          <button className="btn" onClick={addNew}>{t("roster.add")}</button>
        </div>
      )}

      <ol className="roster">
        {shown.map((m) => {
          const rank = ranked.indexOf(m) + 1;
          const isCore = core.has(m.id);
          const isEditing = editing === m.id;
          return (
            <li key={m.id} className={(m.active ? "" : "inactive ") + (isCore ? "core" : "")}>
              <span className="rank">{rank}</span>
              {isCore && <span className="tag core-tag">{t("roster.core")}</span>}
              {isEditing ? (
                <>
                  <input className="edit-name" defaultValue={m.name}
                    onChange={(e) => (m._name = e.target.value)} />
                  <input className="edit-thp" defaultValue={thpShort(m.thp)}
                    onChange={(e) => (m._thp = e.target.value)} />
                  <button className="btn xs" onClick={() =>
                    save({ ...m, name: m._name ?? m.name, thp: m._thp != null ? parseThp(m._thp) : m.thp })
                  }>{t("common.save")}</button>
                  <button className="btn xs ghost" onClick={() => setEditing(null)}>{t("common.cancel")}</button>
                </>
              ) : (
                <>
                  <span className="mname">{m.name}</span>
                  <span className="thp" title={thpFull(m.thp)}>{thpShort(m.thp)}</span>
                  {canEdit && (
                    <span className="rowactions">
                      <button className="btn xs ghost" onClick={() => setEditing(m.id)}>{t("roster.edit")}</button>
                      <button className="btn xs ghost" onClick={() => toggleActive(m)}>
                        {m.active ? t("roster.bench") : t("roster.activate")}
                      </button>
                      <button className="btn xs ghost danger" onClick={() => remove(m)}>×</button>
                    </span>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// --- parsing helpers ---
export function parseThp(s) {
  if (typeof s === "number") return s;
  const t = String(s).trim().replace(/,/g, "").toUpperCase();
  const m = t.match(/^([\d.]+)\s*([MK]?)$/);
  if (!m) return Number(t) || 0;
  const val = parseFloat(m[1]);
  if (m[2] === "M") return Math.round(val * 1_000_000);
  if (m[2] === "K") return Math.round(val * 1_000);
  return Math.round(val);
}
function parseLine(line) {
  const raw = line.trim();
  if (!raw) return null;
  // split on comma/tab first; else last whitespace group is THP
  let name, thp;
  if (raw.includes(",") || raw.includes("\t")) {
    const parts = raw.split(/[,\t]/);
    name = parts[0].trim();
    thp = parts.slice(1).join(" ").trim();
  } else {
    const m = raw.match(/^(.*?)\s+([\d.,]+\s*[MK]?)$/i);
    if (!m) return null;
    name = m[1].trim();
    thp = m[2].trim();
  }
  if (!name) return null;
  return { name, thp: parseThp(thp) };
}
