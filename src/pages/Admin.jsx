import { useState } from "react";
import { useApp } from "../App.jsx";
import * as api from "../lib/api.js";
import { useT } from "../lib/i18n.jsx";

export default function Admin() {
  const { settings, role, pin, reload, flash } = useApp();
  const { t } = useT();
  const [form, setForm] = useState({
    alliance: settings.alliance,
    core_size: settings.core_size,
    fairness_window: settings.fairness_window,
  });

  if (role !== "admin") {
    return (
      <section className="stack">
        <div className="pagehead"><h1>{t("admin.title")}</h1></div>
        <div className="panel"><p>{t("admin.pinRequired")}</p></div>
      </section>
    );
  }

  async function save() {
    try {
      await api.updateSettings(pin, {
        alliance: form.alliance,
        core_size: Number(form.core_size),
        fairness_window: Number(form.fairness_window),
      });
      await reload();
      flash(t("admin.save"));
    } catch (e) { flash(e.message); }
  }

  return (
    <section className="stack">
      <div className="pagehead">
        <h1>{t("admin.title")}</h1>
        <p className="muted">{t("admin.sub")}</p>
      </div>
      <div className="panel form">
        <label className="field">
          <span>{t("admin.alliance")}</span>
          <input value={form.alliance} onChange={(e) => setForm({ ...form, alliance: e.target.value })} />
        </label>
        <label className="field">
          <span>{t("admin.coreSize")}</span>
          <input type="number" min="0" max="100" value={form.core_size}
            onChange={(e) => setForm({ ...form, core_size: e.target.value })} />
        </label>
        <label className="field">
          <span>{t("admin.window")}</span>
          <input type="number" min="1" max="52" value={form.fairness_window}
            onChange={(e) => setForm({ ...form, fairness_window: e.target.value })} />
        </label>
        <button className="btn primary" onClick={save}>{t("admin.save")}</button>
      </div>
    </section>
  );
}
