import { NavLink, Outlet } from "react-router-dom";

const link = ({ isActive }) =>
  `block px-3 py-2 text-sm font-mono tracking-tight border-l-2 ${
    isActive ? "border-cyan-accent text-cyan-accent bg-white/5" : "border-transparent text-slate-400 hover:text-white"
  }`;

export default function Layout() {
  return (
    <div className="min-h-screen flex text-slate-100">
      <aside className="w-56 shrink-0 border-r border-white/10 bg-navy-2/90 backdrop-blur">
        <div className="px-4 py-5 border-b border-white/10">
          <div className="font-mono text-xs text-cyan-accent tracking-[0.2em]">NEURON</div>
          <div className="text-lg font-semibold mt-1">Behavior analytics</div>
          <div className="text-xs text-slate-500 mt-1">Mechanistic interpretability</div>
        </div>
        <nav className="p-2 space-y-1">
          <NavLink to="/" end className={link}>
            Dashboard
          </NavLink>
          <NavLink to="/models" className={link}>
            Model registry
          </NavLink>
          <NavLink to="/onboarding" className={link}>
            Add model
          </NavLink>
          <NavLink to="/settings" className={link}>
            Settings
          </NavLink>
        </nav>
        <div className="p-4 text-[11px] text-slate-500 font-mono">v0.1 MVP</div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
