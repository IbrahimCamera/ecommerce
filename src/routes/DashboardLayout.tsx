import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";

const navItems = [
  { to: "/dashboard", label: "Aperçu", end: true },
  { to: "/dashboard/orders", label: "Commandes", end: false },
  { to: "/dashboard/yalidine", label: "Identifiants Yalidine", end: false },
  { to: "/dashboard/landing-pages", label: "Landing pages", end: false },
];

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Ouvrir le menu"
            aria-expanded={menuOpen}
            className="shrink-0 rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M2.5 5h15M2.5 10h15M2.5 15h15" />
            </svg>
          </button>
          <span className="truncate text-sm font-semibold text-slate-900">{user?.email}</span>
        </div>
        <button onClick={handleLogout} className="shrink-0 text-sm text-slate-500 hover:text-slate-900">
          Déconnexion
        </button>
      </header>
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8 md:flex-row md:gap-8">
        <nav className={`w-full shrink-0 space-y-1 md:block md:w-56 ${menuOpen ? "block" : "hidden"}`}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
