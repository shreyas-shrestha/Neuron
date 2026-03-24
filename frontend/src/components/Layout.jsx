import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useLocation, useNavigate, matchPath } from "react-router-dom";
import { fetchMe } from "../services/api.js";

function navItemClass(isActive) {
  return `flex items-center h-9 px-3 rounded-sm text-[14px] font-medium transition-all duration-150 ${
    isActive
      ? "text-neuron-primary font-semibold ring-1 ring-inset ring-neuron-accent/55 bg-neuron-accent/5"
      : "text-neuron-secondary hover:text-neuron-primary hover:bg-neuron-muted"
  }`;
}

function demoNavClass(isActive) {
  return `flex items-center h-9 px-3 rounded-sm text-[14px] font-medium transition-all duration-150 ${
    isActive
      ? "text-neuron-primary font-semibold ring-1 ring-inset ring-neuron-accent/70 bg-neuron-accent/8 shadow-[0_0_24px_-8px_rgba(129,140,248,0.5)]"
      : "text-neuron-secondary hover:text-neuron-primary hover:bg-neuron-muted"
  }`;
}

function pageTitle(pathname) {
  if (matchPath({ path: "/", end: true }, pathname)) return "Dashboard";
  if (matchPath("/models", pathname)) return "Models";
  if (matchPath("/onboarding", pathname)) return "Add model";
  if (matchPath("/settings", pathname)) return "Settings";
  if (matchPath("/analysis/:id", pathname)) return "Analysis";
  if (matchPath("/reports/:analysisId", pathname)) return "Reports";
  return "Neuron";
}

export default function Layout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const title = pageTitle(pathname);

  const initials = (me?.email || "?")
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase();

  function logout() {
    localStorage.removeItem("neuron_token");
    navigate("/");
    window.location.reload();
  }

  return (
    <div className="min-h-screen flex bg-neuron-subtle text-neuron-primary">
      <aside className="w-[240px] shrink-0 border-r border-neuron-border bg-neuron-bg flex flex-col fixed inset-y-0 left-0 z-20">
        <div className="h-14 flex items-center gap-3 px-4 border-b border-neuron-border">
          <div className="w-7 h-7 rounded-md bg-neuron-accent text-zinc-950 font-display font-bold text-sm flex items-center justify-center">
            N
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-semibold text-[15px] text-neuron-primary">neuron</span>
            <span className="text-[11px] text-neuron-mutedText">beta</span>
          </div>
        </div>

        <nav className="p-3 flex-1 overflow-y-auto">
          <div className="text-[10px] font-semibold tracking-[0.1em] text-neuron-mutedText uppercase px-3 py-2">
            Workspace
          </div>
          <div className="space-y-0.5">
            <NavLink to="/" end className={({ isActive }) => navItemClass(isActive)}>
              Dashboard
            </NavLink>
            <NavLink to="/models" className={({ isActive }) => navItemClass(isActive)}>
              Models
            </NavLink>
            <NavLink to="/onboarding" className={({ isActive }) => navItemClass(isActive)}>
              Analysis
            </NavLink>
            <Link to="/" className={navItemClass(pathname.startsWith("/reports"))}>
              Reports
            </Link>
            <NavLink to="/demo" className={({ isActive }) => demoNavClass(isActive)}>
              Live Demo
            </NavLink>
          </div>

          <div className="my-3 mx-3 border-t border-neuron-border" />

          <div className="space-y-0.5">
            <NavLink to="/settings" className={({ isActive }) => navItemClass(isActive)}>
              Settings
            </NavLink>
          </div>
        </nav>

        <div className="p-3 border-t border-neuron-border">
          <div className="flex items-center gap-3 rounded-md border border-neuron-border p-3 bg-neuron-muted/60">
            <div className="w-7 h-7 rounded-full bg-neuron-accent/20 text-neuron-accent font-mono text-xs font-semibold flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-neuron-mutedText truncate">{me?.email || "—"}</div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="p-1.5 rounded-sm text-neuron-secondary hover:bg-neuron-muted border border-transparent hover:border-neuron-border transition-all duration-150"
              title="Log out"
              aria-label="Log out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 ml-[240px] min-h-screen flex flex-col">
        <header className="h-14 shrink-0 bg-neuron-bg border-b border-neuron-border flex items-center justify-between px-6">
          <h1 className="font-display font-semibold text-[18px] text-neuron-primary">{title}</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="p-2 rounded-sm text-neuron-secondary hover:bg-neuron-subtle transition-all duration-150"
              aria-label="Notifications"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </button>
            <div className="w-8 h-8 rounded-full bg-neuron-accent/20 text-neuron-accent font-mono text-xs font-semibold flex items-center justify-center ring-1 ring-neuron-border">
              {initials}
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-[1200px] w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
