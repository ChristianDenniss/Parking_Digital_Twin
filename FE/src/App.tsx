import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { Home } from "./pages/Home";
import { Lots } from "./pages/Lots";
import { LotDetail } from "./pages/LotDetail";
import { Auth } from "./pages/Auth";
import { Logs } from "./pages/Logs";

const tokenKey = "parking_twin_token";

function Nav() {
  const navigate = useNavigate();
  const token = typeof window !== "undefined" ? localStorage.getItem(tokenKey) : null;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? "text-unb-red font-semibold"
      : "text-slate-600 hover:text-unb-red";

  const handlePrimaryClick = () => {
    if (token) {
      navigate("/schedule");
    } else {
      navigate("/auth");
    }
  };

  return (
    <nav className="flex items-center justify-between py-3 px-6 border-b border-slate-200 bg-white">
      <div className="flex items-center gap-8">
        <NavLink to="/" className="text-lg font-semibold text-unb-black">
          UNB Parking
        </NavLink>
        <div className="hidden sm:flex items-center gap-6 text-sm">
          <NavLink to="/" end className={linkClass}>
            Home
          </NavLink>
          <NavLink to="/lots" className={linkClass}>
            Lots
          </NavLink>
          <NavLink to="/logs" className={linkClass}>
            Logs
          </NavLink>
        </div>
      </div>
      <button
        type="button"
        onClick={handlePrimaryClick}
        className="rounded-full bg-unb-red text-white text-sm px-4 py-1.5 hover:bg-unb-red-dark"
      >
        {token ? "Create / edit class schedule" : "Login / Sign up"}
      </button>
    </nav>
  );
}

export default function App() {
  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen font-sans">
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lots" element={<Lots />} />
        <Route path="/lot/:id" element={<LotDetail />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/logs" element={<Logs />} />
        {/* Placeholder for future schedule UI */}
        <Route path="/schedule" element={<div className="max-w-4xl mx-auto px-6 py-10 text-sm text-slate-700">Class schedule editor coming soon.</div>} />
      </Routes>
    </div>
  );
}
