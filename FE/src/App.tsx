import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { Home } from "./pages/Home";
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
  const token =
    typeof window !== "undefined" ? localStorage.getItem(tokenKey) : null;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    (isActive
      ? "text-white font-semibold active"
      : "text-white/90 hover:text-white") +
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
            <img
              src={unbSymbol}
              alt=""
              className="h-4 w-4 shrink-0 invisible group-hover:visible group-[.active]:visible transition-[visibility]"
              aria-hidden
            />
          </NavLink>

          <NavLink to="/lots" className={linkClass}>
            Lots
            <img
              src={unbSymbol}
              alt=""
              className="h-4 w-4 shrink-0 invisible group-hover:visible group-[.active]:visible transition-[visibility]"
              aria-hidden
            />
          </NavLink>

          <NavLink to="/what-if" className={linkClass}>
            What If
            <img
              src={unbSymbol}
              alt=""
              className="h-4 w-4 shrink-0 invisible group-hover:visible group-[.active]:visible transition-[visibility]"
              aria-hidden
            />
          </NavLink>

          <NavLink to="/predictions" className={linkClass}>
            Predictions
            <img
              src={unbSymbol}
              alt=""
              className="h-4 w-4 shrink-0 invisible group-hover:visible group-[.active]:visible transition-[visibility]"
              aria-hidden
            />
          </NavLink>

          <NavLink to="/logs" className={linkClass}>
            Logs
            <img
              src={unbSymbol}
              alt=""
              className="h-4 w-4 shrink-0 invisible group-hover:visible group-[.active]:visible transition-[visibility]"
              aria-hidden
            />
          </NavLink>

          <NavLink to="/api" className={linkClass}>
            API
            <img
              src={unbSymbol}
              alt=""
              className="h-4 w-4 shrink-0 invisible group-hover:visible group-[.active]:visible transition-[visibility]"
              aria-hidden
            />
          </NavLink>
        </div>
      </div>

      <button
        type="button"
        onClick={handlePrimaryClick}
        className="rounded-full bg-white text-unb-red text-sm px-4 py-1.5 font-medium hover:bg-white/90"
      >
        {token ? "My Class Schedule" : "Login / Sign up"}
      </button>
    </nav>
  );
}

function PagePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="px-[clamp(1.5rem,6vw,5rem)] py-10">
      <div className="max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-3 text-slate-600 leading-7">{description}</p>
        <div className="mt-6 rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700">
          This page is routed and ready. Next, we can connect it to the new API
          helpers in <code>client.ts</code>.
        </div>
      </div>
    </main>
  );
}

function WhatIfPage() {
  return (
    <PagePlaceholder
      title="What-If Scenario Planner"
      description="This page will let users test different arrival times, parking preferences, accessibility needs, and event conditions before coming to campus."
    />
  );
}

function PredictionsPage() {
  return (
    <PagePlaceholder
      title="Parking Predictions"
      description="This page will show predicted lot availability for weekday, weekend, and event scenarios using your parking digital twin model."
    />
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
        <Route path="/api" element={<Api />} />
        <Route path="/schedule" element={<Schedule />} />

        {/* New routes */}
        <Route path="/what-if" element={<WhatIfPage />} />
        <Route path="/predictions" element={<PredictionsPage />} />
      </Routes>
    </div>
  );
}
