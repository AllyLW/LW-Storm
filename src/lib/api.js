// Thin Supabase wrapper. All writes go through PIN-gated RPCs (see schema.sql).
// If env vars are missing (e.g. local preview before you wire Supabase), the
// app still runs against an in-memory mock so you can click around.

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const LIVE = Boolean(url && key);
const sb = LIVE ? createClient(url, key) : null;

export class ApiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

// ---------- reads ----------
export async function getSettings() {
  if (!LIVE) return mock.settings();
  const { data, error } = await sb.from("public_settings").select("*").single();
  if (error) throw new ApiError("settings_read", error.message);
  return data;
}

export async function getMembers() {
  if (!LIVE) return mock.members();
  const { data, error } = await sb.from("members").select("*");
  if (error) throw new ApiError("members_read", error.message);
  return data;
}

export async function getWeeks() {
  if (!LIVE) return mock.weeks();
  const { data, error } = await sb.from("weeks").select("*").order("week_index", { ascending: true });
  if (error) throw new ApiError("weeks_read", error.message);
  return data;
}

// ---------- auth ----------
export async function checkPin(pin) {
  if (!LIVE) return mock.checkPin(pin);
  const { data, error } = await sb.rpc("check_pin", { pin });
  if (error) throw new ApiError("pin_check", error.message);
  return data; // 'admin' | 'officer' | null
}

// ---------- writes (PIN-gated) ----------
export async function upsertMember(pin, m) {
  if (!LIVE) return mock.upsertMember(m);
  const { data, error } = await sb.rpc("upsert_member", {
    pin, m_id: m.id ?? null, m_name: m.name, m_thp: m.thp, m_active: m.active,
  });
  if (error) throw new ApiError("member_write", error.message);
  return data;
}

export async function bulkUpsertMembers(pin, rows) {
  if (!LIVE) return mock.bulkUpsert(rows);
  const { data, error } = await sb.rpc("bulk_upsert_members", { pin, rows });
  if (error) throw new ApiError("bulk_write", error.message);
  return data;
}

export async function deleteMember(pin, id) {
  if (!LIVE) return mock.deleteMember(id);
  const { error } = await sb.rpc("delete_member", { pin, m_id: id });
  if (error) throw new ApiError("member_delete", error.message);
}

export async function saveWeek(pin, w) {
  if (!LIVE) return mock.saveWeek(w);
  const { data, error } = await sb.rpc("save_week", {
    pin, w_id: w.id ?? null, w_label: w.label, w_index: w.week_index,
    w_avail: w.availability ?? null, w_board: w.board ?? null,
    w_confirm: !!w.confirm, w_reopen: !!w.reopen,
  });
  if (error) throw new ApiError("week_write", error.message);
  return data;
}

export async function updateSettings(pin, s) {
  if (!LIVE) return mock.updateSettings(s);
  const { error } = await sb.rpc("update_settings", {
    pin, s_alliance: s.alliance, s_core: s.core_size, s_window: s.fairness_window,
  });
  if (error) throw new ApiError("settings_write", error.message);
}

// ===================================================================
// In-memory mock so the app is clickable without Supabase.
// Seeded with a handful of players; NOT your real roster.
// ===================================================================
const store = {
  settings: { alliance: "Alliance", core_size: 34, fairness_window: 8 },
  members: seedMembers(),
  weeks: [],
};

function seedMembers() {
  const names = ["Ace","Blaze","Cyrus","Dune","Echo","Frost","Gale","Havoc","Iris","Jinx",
    "Kilo","Lynx","Mace","Nova","Onyx","Pike","Quill","Rook","Sable","Talon",
    "Umbra","Vex","Wraith","Xer","Yuki","Zephyr","Ash","Bolt","Crag","Drift",
    "Ember","Flint","Ghost","Hex","Ion","Jet","Kade","Lux","Mist","Nyx"];
  return names.map((n, i) => ({
    id: `mock-${i + 1}`,
    name: n,
    thp: (names.length - i) * 1_200_000 + Math.floor(Math.random() * 500_000),
    active: true,
  }));
}

const mock = {
  settings: () => ({ ...store.settings }),
  members: () => store.members.map((m) => ({ ...m })),
  weeks: () => store.weeks.map((w) => ({ ...w })),
  checkPin: (pin) => (pin === "admin" ? "admin" : pin === "officer" ? "officer" : null),
  upsertMember: (m) => {
    if (m.id) {
      const i = store.members.findIndex((x) => x.id === m.id);
      store.members[i] = { ...store.members[i], ...m };
      return m.id;
    }
    const id = `mock-${Date.now()}`;
    store.members.push({ ...m, id });
    return id;
  },
  bulkUpsert: (rows) => {
    rows.forEach((r) => {
      const ex = store.members.find((x) => x.name.toLowerCase() === r.name.toLowerCase());
      if (ex) ex.thp = Number(r.thp);
      else store.members.push({ id: `mock-${Date.now()}-${Math.random()}`, name: r.name, thp: Number(r.thp), active: true });
    });
    return rows.length;
  },
  deleteMember: (id) => {
    store.members = store.members.filter((m) => m.id !== id);
  },
  saveWeek: (w) => {
    if (w.id) {
      const i = store.weeks.findIndex((x) => x.id === w.id);
      let confirmed_at = store.weeks[i].confirmed_at;
      if (w.confirm) confirmed_at = new Date().toISOString();
      if (w.reopen) confirmed_at = null;
      store.weeks[i] = { ...store.weeks[i], ...w, confirmed_at };
      return w.id;
    }
    const id = `week-${Date.now()}`;
    store.weeks.push({ ...w, id, confirmed_at: w.confirm ? new Date().toISOString() : null });
    return id;
  },
  updateSettings: (s) => {
    store.settings = { ...store.settings, ...s };
  },
};
