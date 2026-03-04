import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Course, MeResponse, ScheduleEntry } from "../api/types";

const tokenKey = "parking_twin_token";

export function Schedule() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(tokenKey));
  const [me, setMe] = useState<MeResponse | null>(null);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addInput, setAddInput] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ScheduleEntry | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    Promise.all([
      api.get<MeResponse>("/api/users/me", token),
      api.get<ScheduleEntry[]>("/api/users/me/schedule", token),
      api.get<Course[]>("/api/classes"),
    ])
      .then(([meData, scheduleData, coursesData]) => {
        setMe(meData);
        setSchedule(scheduleData);
        setCourses(coursesData);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const filteredCourses = useMemo(() => {
    const q = addInput.trim().toLowerCase();
    if (!q) return courses.slice(0, 20);
    return courses.filter(
      (c) =>
        c.classCode.toLowerCase().includes(q) ||
        (c.name?.toLowerCase().includes(q) ?? false)
    ).slice(0, 20);
  }, [courses, addInput]);

  const alreadyInSchedule = useMemo(
    () => new Set(schedule.map((s) => s.classId)),
    [schedule]
  );

  const handleAddClass = (course: Course) => {
    if (!me?.student?.id || alreadyInSchedule.has(course.id)) return;
    setAddOpen(false);
    setAddInput("");
    setAddDropdownOpen(false);
    api
      .post(
        "/api/class-schedule",
        { studentId: me.student.id, classId: course.id },
        token ?? undefined
      )
      .then(() =>
        api.get<ScheduleEntry[]>("/api/users/me/schedule", token ?? undefined).then(setSchedule)
      )
      .catch((e) => setError(e.message));
  };

  const handleRemoveClick = (entry: ScheduleEntry) => {
    setConfirmRemove(entry);
  };

  const handleConfirmRemove = () => {
    if (!confirmRemove || !token) return;
    setRemovingId(confirmRemove.id);
    api
      .delete(`/api/class-schedule/${confirmRemove.id}`, token)
      .then(() => {
        setSchedule((prev) => prev.filter((e) => e.id !== confirmRemove.id));
        setConfirmRemove(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setRemovingId(null));
  };

  if (!token) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 text-center">
        <p className="text-slate-700 mb-4">Sign in to view and manage your class schedule.</p>
        <button
          type="button"
          onClick={() => navigate("/auth")}
          className="px-4 py-2 rounded-lg bg-unb-red text-white font-semibold hover:bg-unb-red-dark"
        >
          Sign in
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="skeleton h-8 w-48 mb-6" />
        <div className="skeleton h-24 w-full rounded-xl mb-4" />
        <div className="skeleton h-24 w-full rounded-xl mb-4" />
        <div className="skeleton h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          type="button"
          onClick={() => setError(null)}
          className="text-unb-red font-medium"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">My Class Schedule</h1>
      <p className="text-slate-600 text-sm mb-6">
        Add classes by code below. Click the minus to remove a class.
      </p>

      <div className="space-y-3">
        {schedule.map((entry) => {
          const c = entry.course;
          return (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold text-slate-900">
                    {c?.name ?? "Unnamed class"}
                  </span>
                  <span className="text-sm text-slate-500">{c?.classCode}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-600">
                  <span>{c?.startTime} – {c?.endTime}</span>
                  <span>{entry.studentsEnrolled} enrolled</span>
                  {(c?.building ?? c?.room) && (
                    <span>
                      {[c?.building, c?.room].filter(Boolean).join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveClick(entry)}
                disabled={removingId === entry.id}
                className="flex-shrink-0 w-9 h-9 rounded-lg border-2 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 flex items-center justify-center font-medium disabled:opacity-50"
                aria-label={`Remove ${c?.classCode ?? "class"}`}
              >
                −
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 relative">
        {!addOpen ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="w-full rounded-xl border-2 border-dashed border-slate-300 py-4 text-slate-600 hover:border-unb-red hover:text-unb-red hover:bg-red-50/30 flex items-center justify-center gap-2 font-medium transition-colors"
          >
            <span className="text-xl">+</span> Add class
          </button>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Class code or name
            </label>
            <input
              type="text"
              value={addInput}
              onChange={(e) => {
                setAddInput(e.target.value);
                setAddDropdownOpen(true);
              }}
              onFocus={() => setAddDropdownOpen(true)}
              onBlur={() => setTimeout(() => setAddDropdownOpen(false), 150)}
              placeholder="Type to search..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-unb-red focus:border-unb-red"
              autoFocus
            />
            {addDropdownOpen && (
              <ul
                className="mt-2 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1"
                role="listbox"
              >
                {filteredCourses.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">No matching classes</li>
                ) : (
                  filteredCourses.map((course) => {
                    const inSchedule = alreadyInSchedule.has(course.id);
                    return (
                      <li
                        key={course.id}
                        role="option"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => !inSchedule && handleAddClass(course)}
                        className={`px-3 py-2 text-sm cursor-pointer ${
                          inSchedule
                            ? "text-slate-400 cursor-not-allowed"
                            : "text-slate-800 hover:bg-slate-100"
                        }`}
                      >
                        <span className="font-medium">{course.classCode}</span>
                        {course.name && (
                          <span className="text-slate-500 ml-2">{course.name}</span>
                        )}
                        {inSchedule && (
                          <span className="ml-2 text-slate-400">(already added)</span>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            )}
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setAddInput("");
                setAddDropdownOpen(false);
              }}
              className="mt-2 text-sm text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {confirmRemove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-remove-title"
        >
          <div className="rounded-xl bg-white p-6 shadow-xl max-w-sm w-full">
            <h2 id="confirm-remove-title" className="text-lg font-semibold text-slate-900 mb-2">
              Remove class?
            </h2>
            <p className="text-slate-600 text-sm mb-4">
              Remove{" "}
              <strong>
                {confirmRemove.course?.name ?? confirmRemove.course?.classCode ?? "this class"}
              </strong>{" "}
              from your schedule? This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={removingId === confirmRemove.id}
                className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {removingId === confirmRemove.id ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
