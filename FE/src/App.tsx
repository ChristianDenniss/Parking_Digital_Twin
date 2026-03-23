import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
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

function Nav() {
  const navigate = useNavigate();
  const token = typeof window !== "undefined" ? localStorage.getItem(tokenKey) : null;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    (isActive ? "text-white font-semibold active" : "text-white/90 hover:text-white") +
    " group flex items-center gap-1.5 py-4 -my-2";

  const handlePrimaryClick = () => {
    if (token) {
      navigate("/schedule");
    } else {
      navigate("/auth");
    }
  };

  return (
    <nav className="flex items-center justify-between py-3 px-[clamp(1.5rem,6vw,5rem)] border-b border-unb-red-dark bg-unb-red">
      <div className="flex items-center gap-12">
        <NavLink to="/" className="text-lg font-semibold text-white">
          UNB Parking
        </NavLink>
        <div className="hidden sm:flex items-center gap-6 text-sm">
          <NavLink to="/" end className={linkClass}>
            Home
            <img src={unbSymbol} alt="" className="h-4 w-4 shrink-0 invisible group-hover:visible group-[.active]:visible transition-[visibility]" aria-hidden />
          </NavLink>
          <NavLink to="/lots" className={linkClass}>
            Lots
            <img src={unbSymbol} alt="" className="h-4 w-4 shrink-0 invisible group-hover:visible group-[.active]:visible transition-[visibility]" aria-hidden />
          </NavLink>
          <NavLink to="/logs" className={linkClass}>
            Logs
            <img src={unbSymbol} alt="" className="h-4 w-4 shrink-0 invisible group-hover:visible group-[.active]:visible transition-[visibility]" aria-hidden />
          </NavLink>
          <NavLink to="/api" className={linkClass}>
            API
            <img src={unbSymbol} alt="" className="h-4 w-4 shrink-0 invisible group-hover:visible group-[.active]:visible transition-[visibility]" aria-hidden />
          </NavLink>
        </div>
      </div>
      <button
        type="button"
        onClick={handlePrimaryClick}
        className="rounded-full bg-white text-unb-red text-sm px-4 py-1.5 font-medium hover:bg-white/90"
      >
        {token ? "My account" : "Login / Sign up"}
      </button>
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
          <Route path="schedule" element={<Schedule />} />
        </Route>
      </Routes>
    </div>
  );
}
