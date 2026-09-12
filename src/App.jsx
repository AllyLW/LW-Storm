import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import * as api from "./lib/api.js";
import Roster from "./pages/Roster.jsx";
import Plan from "./pages/Plan.jsx";
import Board from "./pages/Board.jsx";
import MapBoard from "./pages/MapBoard.jsx";
import History from "./pages/History.jsx";
import Admin from "./pages/Admin.jsx";

// Shared app state: settings, members, weeks, and the officer role.
const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export default function App() {
  const [settings, setSettings] = useState(null);
  const [members, setMembers] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [role, setRole] = useState(null); // 'admin' | 'officer' | null
  const [pin, setPin] = useState("");     // held in memory only while unlocked
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);

  const reload = useCallback(async () => {
    const [s, m, w] = await Promise.all([api.getSettings(), api.getMembers(), api.getWeeks()]);
    setSettings(s);
    setMembers(m);
    setWeeks(w);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await reload();
      } catch (e) {
        setErr(e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [reload]);

  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const unlock = useCallback(async (tryPin) => {
    const r = await api.checkPin(tryPin);
    if (r) {
      setRole(r);
      setPin(tryPin);
      flash(r === "admin" ? "Admin unlocked" : "Officer unlocked");
      return true;
    }
    flash("Wrong PIN");
    return false;
  }, [flash]);

  const lock = useCallback(() => {
    setRole(null);
    setPin("");
    flash("Locked");
  }, [flash]);

  if (loading) return <div className="loading">Loading…</div>;
  if (err) return <div className="loading err">{err}<br /><span className="small">Check your Supabase settings and reload.</span></div>;

  const ctx = { settings, setSettings, members, weeks, role, pin, reload, flash, unlock, lock };

  return (
    <Ctx.Provider value={ctx}>
      <div className="page">
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<Navigate to="/plan" replace />} />
            <Route path="/plan" element={<Plan />} />
            <Route path="/board" element={<Board />} />
            <Route path="/map" element={<MapBoard />} />
            <Route path="/roster" element={<Roster />} />
            <Route path="/history" element={<History />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </main>
        {!api.LIVE && (
          <div className="demo-note">
            Demo mode — no database connected. PINs are <code>admin</code> / <code>officer</code>. Data resets on reload.
          </div>
        )}
        {toast && <div className="toast">{toast}</div>}
      </div>
    </Ctx.Provider>
  );
}

function Header() {
  const { settings, role, unlock, lock } = useApp();
  const [pinInput, setPinInput] = useState("");
  const nav = [
    ["/plan", "Plan"],
    ["/board", "Board"],
    ["/map", "Map"],
    ["/roster", "Roster"],
    ["/history", "History"],
  ];
  if (role === "admin") nav.push(["/admin", "Admin"]);

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark">◆</span>
        <div>
          <div className="brand-name">{settings.alliance}</div>
          <div className="brand-sub">Storm events</div>
        </div>
      </div>
      <nav className="nav">
        {nav.map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => "navlink" + (isActive ? " on" : "")}>
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="lock">
        {role ? (
          <button className="btn ghost" onClick={lock}>Lock ({role})</button>
        ) : (
          <>
            <input
              type="password"
              placeholder="R4 PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { unlock(pinInput); setPinInput(""); } }}
            />
            <button className="btn" onClick={() => { unlock(pinInput); setPinInput(""); }}>Unlock</button>
          </>
        )}
      </div>
    </header>
  );
}
