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
import unbSymbol from "./images/UNBSymbol.png";

const tokenKey = "parking_twin_token";

const mainNavItems = [
  { to: "/", label: "Home", end: true },
  { to: "/lots", label: "Lots", end: false },
  { to: "/logs", label: "Logs", end: false },
  { to: "/apispec", label: "API", end: false },
] as const;

function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const token = typeof window !== "undefined" ? localStorage.getItem(tokenKey) : null;

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    (isActive ? "text-white font-semibold active" : "text-white/90 hover:text-white") +
    " group flex items-center gap-1.5 py-4 -my-2";

  const linkClassMobile = ({ isActive }: { isActive: boolean }) =>
    (isActive ? "bg-white/15 text-white font-semibold" : "text-white/90 active:bg-white/10") +
    " flex items-center gap-2 px-4 py-3.5 text-base border-b border-unb-red-dark/50 last:border-b-0";

  const handlePrimaryClick = () => {
    if (token) {
      navigate("/schedule");
    } else {
      navigate("/auth");
    }
  };

  return (
    <nav className="relative z-50 flex items-center justify-between gap-3 py-3 px-[clamp(1rem,5vw,5rem)] border-b border-unb-red-dark bg-unb-red">
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-12">
        <NavLink to="/" className="truncate text-base font-semibold text-white sm:text-lg">
          UNB Parking
        </NavLink>
        <div className="hidden sm:flex items-center gap-6 text-sm">
          {mainNavItems.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={linkClass}>
              {label}
              <img
                src={unbSymbol}
                alt=""
                className="h-4 w-4 shrink-0 invisible transition-[visibility] group-hover:visible group-[.active]:visible"
                aria-hidden
              />
            </NavLink>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-md text-white hover:bg-white/10 sm:hidden"
          aria-expanded={menuOpen}
          aria-controls="nav-mobile-menu"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={handlePrimaryClick}
          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-unb-red hover:bg-white/90 sm:px-4 sm:text-sm"
        >
          {token ? "My account" : "Login / Sign up"}
        </button>
      </div>

      {menuOpen ? (
        <div
          id="nav-mobile-menu"
          className="absolute left-0 right-0 top-full border-b border-unb-red-dark bg-unb-red shadow-lg sm:hidden"
        >
          <div className="flex flex-col px-[clamp(1rem,5vw,5rem)] pb-2 pt-1">
            {mainNavItems.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={linkClassMobile} onClick={() => setMenuOpen(false)}>
                {label}
                <img src={unbSymbol} alt="" className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
              </NavLink>
            ))}
          </div>
        </div>
      ) : null}
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
          <Route path="apispec" element={<Api />} />
          <Route path="schedule" element={<Schedule />} />
        </Route>
      </Routes>
    </div>
  );
}
