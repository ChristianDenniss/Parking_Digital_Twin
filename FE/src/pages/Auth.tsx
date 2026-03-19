import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { AuthResponse } from "../api/types";
import unbLogo from "../images/UNBlogoAlternate.png";

const tokenKey = "parking_twin_token";

export function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [studentId, setStudentId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"student" | "staff" | "phd_candidate">("student");
  const [resident, setResident] = useState(false);
  const [disabledParking, setDisabledParking] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [message, setMessage] = useState<string | null>(null);
  const [token, setTokenState] = useState<string | null>(() =>
    localStorage.getItem(tokenKey)
  );

  const setToken = (t: string | null) => {
    if (t) localStorage.setItem(tokenKey, t);
    else localStorage.removeItem(tokenKey);
    setTokenState(t);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      if (mode === "register") {
        const res = await api.post<AuthResponse>("/api/auth/register", {
          email,
          password,
          name: name.trim(),
          role,
          resident,
          disabled: disabledParking,
          ...(role === "student" || role === "phd_candidate" ? { studentId: studentId.trim() } : {}),
        });
        setToken(res.token);
      } else {
        const res = await api.post<AuthResponse>("/api/auth/login", {
          email,
          password,
        });
        setToken(res.token);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    }
  };

  const navigate = useNavigate();

  const logout = () => {
    setToken(null);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img
            src={unbLogo}
            alt="University of New Brunswick"
            className="h-14 w-auto object-contain"
          />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            Parking Digital Twin
          </h1>
          <p className="mt-1 text-slate-600 text-sm">
            {token ? "Manage your account" : "Sign in or create an account"}
          </p>
        </div>

        {token ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-4 text-slate-700 text-sm">
              You are logged in. Continue to the app or log out.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-unb-red text-white font-semibold hover:bg-unb-red-dark transition-colors"
                onClick={() => navigate("/")}
              >
                Continue
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg border-2 border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-100 transition-colors"
                onClick={logout}
              >
                Log out
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-unb-red focus:border-unb-red"
                  required
                />
              </div>
              {mode === "register" && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="First and last name"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-unb-red focus:border-unb-red"
                    required
                  />
                </div>
              )}
              {mode === "register" && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Role
                    </label>
                    <select
                      value={role}
                      onChange={(e) =>
                        setRole(e.target.value as "student" | "staff" | "phd_candidate")
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-unb-red focus:border-unb-red"
                    >
                      <option value="student">Student</option>
                      <option value="staff">Staff</option>
                      <option value="phd_candidate">PhD candidate</option>
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      Used to recommend parking you&apos;re eligible for (staff, PhD, resident, general, etc.).
                    </p>
                  </div>
                  {(role === "student" || role === "phd_candidate") && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Student ID
                      </label>
                      <input
                        type="text"
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                        placeholder="e.g. 1234567"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-unb-red focus:border-unb-red"
                        required
                      />
                    </div>
                  )}
                  <div className="mb-4 space-y-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={resident}
                        onChange={(e) => setResident(e.target.checked)}
                        className="rounded border-slate-300 text-unb-red focus:ring-unb-red"
                      />
                      I live in UNBSJ campus residence
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={disabledParking}
                        onChange={(e) => setDisabledParking(e.target.checked)}
                        className="rounded border-slate-300 text-unb-red focus:ring-unb-red"
                      />
                      I need an accessible / disabled parking stall
                    </label>
                  </div>
                </>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-unb-red focus:border-unb-red"
                  required
                  minLength={mode === "register" ? 8 : 1}
                />
              </div>
              <div className="min-h-[2.75rem] flex items-center mt-4 mb-2">
                {message && (
                  <div
                    className={`w-full rounded-lg border px-3 py-2.5 text-sm ${
                      /Invalid|expired|Error|already|Failed|Not authenticated/i.test(message)
                        ? "border-red-300 bg-red-50 text-red-700"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                    role="alert"
                  >
                    {message}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-unb-red text-white font-semibold hover:bg-unb-red-dark transition-colors"
                >
                  {mode === "login" ? "Log in" : "Register"}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg border-2 border-unb-red bg-white text-unb-red font-semibold hover:bg-unb-red hover:text-white transition-colors"
                  onClick={() => setMode(mode === "login" ? "register" : "login")}
                >
                  {mode === "login" ? "Register instead" : "Log in instead"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
