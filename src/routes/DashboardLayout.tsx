import { NavLink, Outlet, useNavigate } from "react-router-dom";
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
  const { user } = useAuth();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <span className="text-sm font-semibold text-slate-900">{user?.email}</span>
        <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-slate-900">
          Déconnexion
        </button>
      </header>
      <div className="mx-auto flex max-w-5xl gap-8 px-6 py-8">
        <nav className="w-56 shrink-0 space-y-1">
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
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
