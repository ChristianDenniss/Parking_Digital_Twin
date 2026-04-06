import { useState, useEffect } from "react";
import { Routes, Route, NavLink, useNavigate, useLocation } from "react-router-dom";
import { CampusShell } from "./pages/CampusShell";
import { Home, HomeIndexContent } from "./pages/Home";
import { Lots } from "./pages/Lots";
import { LotDetail } from "./pages/LotDetail";
import { Auth } from "./pages/Auth";
import { Logs } from "./pages/Logs";
import { Api } from "./pages/Api";
import { Schedule } from "./pages/Schedule";
import { WhatIf } from "./pages/WhatIf";
import unbSymbol from "./images/UNBSymbol.png";

const tokenKey = "parking_twin_token";

const mainNavItems: { to: string; label: string; end?: boolean }[] = [
  { to: "/", label: "Home", end: true },
  { to: "/lots", label: "Lots" },
  { to: "/logs", label: "Logs" },
  { to: "/what-if", label: "What-If" },
  { to: "/api", label: "API" },
  { to: "/apispec", label: "API Spec" },
];

function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = typeof window !== "undefined" ? localStorage.getItem(tokenKey) : null;
  const [menuOpen, setMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    (isActive ? "text-white font-semibold active" : "text-white/90 hover:text-white") +
    " group flex items-center gap-1.5 py-4 -my-2";

  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    (isActive ? "text-white font-semibold bg-unb-red-dark" : "text-white/90 hover:text-white hover:bg-unb-red-dark") +
    " block px-4 py-3 text-sm transition-colors";

  const handlePrimaryClick = () => {
    if (token) {
      navigate("/schedule");
    } else {
      navigate("/auth");
    }
  };

  return (
    <nav className="border-b border-unb-red-dark bg-unb-red">
      <div className="flex items-center justify-between py-3 px-[clamp(1.5rem,6vw,5rem)]">
        <div className="flex items-center gap-12">
          <NavLink to="/" className="text-lg font-semibold text-white">
            UNB Parking
          </NavLink>
          <div className="hidden sm:flex items-center gap-6 text-sm">
            {mainNavItems.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={linkClass}>
                {label}
                <img src={unbSymbol} alt="" className="h-4 w-4 shrink-0 invisible group-hover:visible group-[.active]:visible transition-[visibility]" aria-hidden />
              </NavLink>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrimaryClick}
            className="rounded-full bg-white text-unb-red text-sm px-4 py-1.5 font-medium hover:bg-white/90"
          >
            {token ? "My account" : "Login / Sign up"}
          </button>
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="sm:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            <span className={`block w-5 h-0.5 bg-white transition-transform ${menuOpen ? "translate-y-2 rotate-45" : ""}`} />
            <span className={`block w-5 h-0.5 bg-white transition-opacity ${menuOpen ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-0.5 bg-white transition-transform ${menuOpen ? "-translate-y-2 -rotate-45" : ""}`} />
          </button>
        </div>
      </div>
      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-unb-red-dark">
          {mainNavItems.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={mobileLinkClass}>
              {label}
            </NavLink>
          ))}
          <div className="px-4 py-3 border-t border-unb-red-dark">
            <button
              type="button"
              onClick={handlePrimaryClick}
              className="w-full rounded-full bg-white text-unb-red text-sm px-4 py-1.5 font-medium hover:bg-white/90"
            >
              {token ? "My account" : "Login / Sign up"}
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

export default function App() {
  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen font-sans">
      <Nav />
      <Routes>
        <Route element={<CampusShell />}>
          <Route path="/" element={<Home />}>
            <Route index element={<HomeIndexContent />} />
            <Route path="lot/:id" element={<LotDetail />} />
          </Route>
          <Route path="lots" element={<Lots />} />
          <Route path="auth" element={<Auth />} />
          <Route path="logs" element={<Logs />} />
          <Route path="api" element={<Api />} />
          <Route path="apispec" element={<Api />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="what-if" element={<WhatIf />} />
        </Route>
      </Routes>
    </div>
  );
}
