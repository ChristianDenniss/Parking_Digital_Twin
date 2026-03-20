import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Course, MeResponse, ScheduleEntry } from "../api/types";

const tokenKey = "parking_twin_token";
const MAX_SCHEDULE_CLASSES = 7;

/** Class code without the section suffix when we show section separately (e.g. "CS4555-SJ01B" + "SJ01B" → "CS4555"). */
function trimSectionFromClassCode(
  classCode: string | null | undefined,
  sectionCode: string | null | undefined
): string {
  if (!classCode) return "";
  if (!sectionCode) return classCode;
  const suffix = `-${sectionCode}`;
  if (classCode.endsWith(suffix)) return classCode.slice(0, -suffix.length);
  return classCode;
}

/** Format term code as "Winter 2026", "Fall 2028", etc. */
function formatTerm(term: string | null | undefined): string {
  if (!term) return "";
  const match = term.match(/^(\d{4})\/(\w+)$/);
  if (!match) return term;
  const [, year, code] = match;
  const season: Record<string, string> = { FA: "Fall", WI: "Winter", SP: "Spring", SM: "Summer" };
  const seasonName = season[code.toUpperCase()] ?? code;
  return `${seasonName} ${year}`;
}

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
  const [termFilter, setTermFilter] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"profile" | "schedule">("profile");
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileRole, setProfileRole] = useState<"staff" | "student" | "phd_candidate">("student");
  const [profileResident, setProfileResident] = useState(false);
  const [profileDisabled, setProfileDisabled] = useState(false);
  const [profileStudentId, setProfileStudentId] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  // Load course catalog on mount so the add-class dropdown always has data
  useEffect(() => {
    api
      .get<Course[]>("/api/classes")
      .then(setCourses)
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    Promise.all([
      api.get<MeResponse>("/api/users/me", token),
      api.get<ScheduleEntry[]>("/api/users/me/schedule", token),
    ])
      .then(([meData, scheduleData]) => {
        setMe(meData);
        setSchedule(scheduleData);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!me) return;
    setProfileName(me.name ?? "");
    setProfileEmail(me.email ?? "");
    setProfileRole(me.role);
    setProfileResident(me.resident);
    setProfileDisabled(me.disabled);
    setProfileStudentId(me.student?.studentId ?? "");
  }, [me]);

  const terms = useMemo(() => {
    const set = new Set(courses.map((c) => c.term).filter(Boolean));
    return Array.from(set) as string[];
  }, [courses]);

  const filteredCourses = useMemo(() => {
    let list = courses;
    if (termFilter) list = list.filter((c) => c.term === termFilter);
    const q = addInput.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.classCode.toLowerCase().includes(q) ||
          (c.name?.toLowerCase().includes(q) ?? false) ||
          (c.sectionCode?.toLowerCase().includes(q) ?? false)
      );
    }
    return list.slice(0, 30);
  }, [courses, addInput, termFilter]);

  const alreadyInSchedule = useMemo(
    () => new Set(schedule.map((s) => s.classId)),
    [schedule]
  );

  const scheduleAtLimit = schedule.length >= MAX_SCHEDULE_CLASSES;

  const handleAddClass = (course: Course) => {
    if (!me?.student?.id || alreadyInSchedule.has(course.id) || scheduleAtLimit) return;
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

  const handleLogout = () => {
    localStorage.removeItem(tokenKey);
    setToken(null);
    navigate("/");
  };

  const needsStudentIdForSave =
    (profileRole === "student" || profileRole === "phd_candidate") && !me?.student;

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !me) return;
    setProfileMessage(null);
    setProfileSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: profileName.trim(),
        email: profileEmail.trim(),
        role: profileRole,
        resident: profileResident,
        disabled: profileDisabled,
      };
      if (needsStudentIdForSave) {
        body.studentId = profileStudentId.trim();
      }
      const updated = await api.patch<MeResponse>("/api/users/me", body, token);
      setMe(updated);
      setProfileMessage("Profile saved.");
    } catch (err) {
      setProfileMessage(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setProfileSaving(false);
    }
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

  const displayName = me?.name ?? me?.email ?? "My";

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold text-slate-900">My account</h1>
        <button
          type="button"
          onClick={handleLogout}
          className="px-4 py-2 rounded-lg border-2 border-unb-red bg-white text-unb-red font-semibold hover:bg-unb-red hover:text-white transition-colors"
        >
          Log out
        </button>
      </div>
      <p className="text-slate-600 text-sm mb-4">
        Hi, <span className="font-medium text-slate-800">{displayName}</span>. Update your profile or manage your class schedule.
      </p>

      <div className="flex gap-2 border-b border-slate-200 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
            activeTab === "profile"
              ? "border-unb-red text-unb-red bg-white"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Profile
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("schedule")}
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
            activeTab === "schedule"
              ? "border-unb-red text-unb-red bg-white"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Class schedule
        </button>
      </div>

      {activeTab === "profile" && (
        <div className="rounded-xl border-2 border-unb-red/30 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Profile & parking</h2>
          <p className="text-slate-600 text-sm mb-6">
            These details are used to recommend parking you&apos;re eligible for. Password cannot be changed here yet.
          </p>
          <form onSubmit={handleProfileSave} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-unb-red focus:border-unb-red"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-unb-red focus:border-unb-red"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
              <select
                value={profileRole}
                onChange={(e) =>
                  setProfileRole(e.target.value as "staff" | "student" | "phd_candidate")
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-unb-red focus:border-unb-red"
              >
                <option value="student">Student</option>
                <option value="staff">Staff</option>
                <option value="phd_candidate">PhD candidate</option>
              </select>
            </div>
            {needsStudentIdForSave && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Student ID</label>
                <input
                  type="text"
                  value={profileStudentId}
                  onChange={(e) => setProfileStudentId(e.target.value)}
                  placeholder="Required to link your student profile"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-unb-red focus:border-unb-red"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Required for Student or PhD candidate when no student profile is linked yet.
                </p>
              </div>
            )}
            {me?.student && (
              <p className="text-sm text-slate-600">
                Linked student ID:{" "}
                <span className="font-mono font-medium text-slate-800">{me.student.studentId}</span>
                {" "}(contact admin to change)
              </p>
            )}
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profileResident}
                  onChange={(e) => setProfileResident(e.target.checked)}
                  className="rounded border-slate-300 text-unb-red focus:ring-unb-red"
                />
                I live in UNBSJ campus residence
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profileDisabled}
                  onChange={(e) => setProfileDisabled(e.target.checked)}
                  className="rounded border-slate-300 text-unb-red focus:ring-unb-red"
                />
                I need an accessible / disabled parking stall
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={profileSaving}
                className="px-4 py-2 rounded-lg bg-unb-red text-white font-semibold hover:bg-unb-red-dark disabled:opacity-60"
              >
                {profileSaving ? "Saving…" : "Save profile"}
              </button>
              {profileMessage && (
                <span
                  className={
                    profileMessage.startsWith("Profile saved")
                      ? "text-sm text-emerald-700"
                      : "text-sm text-red-600"
                  }
                >
                  {profileMessage}
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {activeTab === "schedule" && (
        <>
          {!me?.student && (
            <p className="mb-4 text-amber-900 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Class schedules are tied to a student profile. If you&apos;re a student or PhD candidate, use{" "}
              <strong>Profile</strong> to set your role and Student ID, then return here to add classes.
            </p>
          )}
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
                  <span className="text-sm text-slate-500">{trimSectionFromClassCode(c?.classCode, c?.sectionCode) || c?.classCode}</span>
                  {c?.sectionCode && (
                    <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {c.sectionCode}
                    </span>
                  )}
                  {c?.term && (
                    <span className="text-xs text-slate-500">{formatTerm(c.term)}</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-600">
                  <span>{c?.startTime} – {c?.endTime}</span>
                  {(c?.enrolled != null && c?.capacity != null) ? (
                    <span>{c.enrolled} / {c.capacity} enrolled</span>
                  ) : (
                    <span>{entry.studentsEnrolled} enrolled</span>
                  )}
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
                aria-label={`Remove ${(trimSectionFromClassCode(c?.classCode, c?.sectionCode) || c?.classCode) ?? "class"}`}
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
            onClick={() => !scheduleAtLimit && setAddOpen(true)}
            disabled={scheduleAtLimit}
            className="w-full rounded-xl border-2 border-dashed border-slate-300 py-4 text-slate-600 hover:border-unb-red hover:text-unb-red hover:bg-red-50/30 flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-slate-300 disabled:hover:bg-transparent disabled:hover:text-slate-600"
          >
            <span className="text-xl">+</span> Add class
            {scheduleAtLimit && <span className="text-sm font-normal">(max {MAX_SCHEDULE_CLASSES} classes)</span>}
          </button>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {terms.length > 0 && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Term
                </label>
                <select
                  value={termFilter}
                  onChange={(e) => setTermFilter(e.target.value)}
                  className="w-full max-w-xs px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-unb-red focus:border-unb-red"
                >
                  <option value="">All terms</option>
                  {terms.map((t) => (
                    <option key={t} value={t}>{formatTerm(t)}</option>
                  ))}
                </select>
              </div>
            )}
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Class code, name, or section
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
                  <li className="px-3 py-2 text-sm text-slate-500">
                    {courses.length === 0
                      ? "No courses in catalog. Run the course seed script on the backend."
                      : "No matching classes. Try a different search or term."}
                  </li>
                ) : (
                  filteredCourses.map((course) => {
                    const inSchedule = alreadyInSchedule.has(course.id);
                    const cannotAdd = inSchedule || scheduleAtLimit;
                    return (
                      <li
                        key={course.id}
                        role="option"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => !cannotAdd && handleAddClass(course)}
                        className={`px-3 py-2 text-sm ${
                          cannotAdd ? "text-slate-400 cursor-not-allowed" : "text-slate-800 cursor-pointer hover:bg-slate-100"
                        }`}
                      >
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium">{trimSectionFromClassCode(course.classCode, course.sectionCode) || course.classCode}</span>
                          {course.sectionCode && (
                            <span className="text-slate-500">{course.sectionCode}</span>
                          )}
                          {course.term && (
                            <span className="text-slate-400 text-xs">{formatTerm(course.term)}</span>
                          )}
                        </div>
                        {course.name && (
                          <div className="text-slate-600 mt-0.5">{course.name}</div>
                        )}
                        {(course.enrolled != null || course.capacity != null) && (
                          <div className="text-slate-500 text-xs mt-0.5">
                            {course.startTime}–{course.endTime}
                            {course.enrolled != null && course.capacity != null && (
                              <> · {course.enrolled}/{course.capacity} enrolled</>
                            )}
                          </div>
                        )}
                        {inSchedule && (
                          <span className="ml-0 text-slate-400 text-xs">(already added)</span>
                        )}
                        {!inSchedule && scheduleAtLimit && (
                          <span className="ml-0 text-slate-400 text-xs">(schedule full)</span>
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
                {confirmRemove.course?.name ?? (trimSectionFromClassCode(confirmRemove.course?.classCode, confirmRemove.course?.sectionCode) || confirmRemove.course?.classCode) ?? "this class"}
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
        </>
      )}
    </div>
  );
}
