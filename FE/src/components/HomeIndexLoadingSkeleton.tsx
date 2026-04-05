/**
 * Mirrors the home index layout while `CampusShell` fetches lots, spots, tiles, and GeoJSON.
 */

function LotRowSkeleton() {
  return (
    <div className="rounded border border-slate-200 bg-white py-2 px-3 flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="skeleton h-4 w-[40%] max-w-[12rem] rounded" />
        <div className="skeleton h-3 w-14 rounded shrink-0" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="skeleton h-3 w-12 rounded" />
        <div className="skeleton h-3 w-12 rounded" />
        <div className="skeleton h-3 w-12 rounded" />
        <div className="skeleton h-3 w-9 rounded" />
      </div>
    </div>
  );
}

export function HomeIndexLoadingSkeleton() {
  return (
    <div
      className="max-w-6xl mx-auto px-6 py-10 space-y-8"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading campus parking map and lot data</span>

      <div className="space-y-8">
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="skeleton h-28 w-[7.5rem] shrink-0 rounded-md" aria-hidden />
            <div className="space-y-2 min-w-0 flex-1">
              <div className="skeleton h-9 w-[min(18rem,100%)] rounded" />
              <div className="skeleton h-4 w-[min(28rem,100%)] rounded" />
            </div>
          </div>
          <div className="skeleton h-4 w-[min(24rem,100%)] rounded" />
        </header>

        <section className="scroll-mt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="skeleton h-7 w-[min(20rem,85%)] rounded" />
            <div className="skeleton h-8 w-52 max-w-full rounded-md" />
          </div>
          <div className="relative rounded-lg border-2 border-slate-200 bg-slate-100 overflow-hidden">
            <div className="skeleton h-[480px] w-full rounded-none border-0" />
            <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:w-[min(20rem,calc(100%-1.5rem))] pointer-events-none">
              <div className="rounded-lg border-2 border-slate-200/80 bg-white/90 p-3 shadow-md space-y-2">
                <div className="skeleton h-3 w-28 rounded" />
                <div className="grid grid-cols-4 gap-2">
                  <div className="skeleton h-8 w-full rounded" />
                  <div className="skeleton h-8 w-full rounded" />
                  <div className="skeleton h-8 w-full rounded" />
                  <div className="skeleton h-8 w-full rounded" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="space-y-3">
          <div>
            <div className="skeleton h-6 w-56 max-w-full rounded mb-2" />
            <div className="skeleton h-3 w-full max-w-2xl rounded mb-1" />
            <div className="skeleton h-3 w-full max-w-xl rounded" />
          </div>
          <div className="skeleton h-9 w-[13.5rem] rounded-md" />
        </div>
        <div className="skeleton h-5 w-48 max-w-full rounded" />
        <div className="flex flex-wrap gap-2">
          <div className="skeleton h-9 w-28 rounded border border-slate-200" />
          <div className="skeleton h-9 w-24 rounded border border-slate-200" />
        </div>
        <div className="space-y-3 pt-1">
          <div className="skeleton h-24 w-full rounded-lg border border-slate-100" />
          <div className="skeleton h-24 w-full rounded-lg border border-slate-100" />
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="skeleton h-4 w-28 rounded" />
          <div className="skeleton h-5 w-24 rounded" />
        </div>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded border border-slate-100 bg-slate-50/90 p-2.5 space-y-2">
            <div className="skeleton h-3 w-32 rounded" />
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-4/5 rounded" />
          </div>
          <div className="rounded border border-slate-100 bg-slate-50/90 p-2.5 space-y-2">
            <div className="skeleton h-3 w-36 rounded" />
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-3/5 rounded" />
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-slate-200">
          <div className="skeleton h-3 w-40 rounded" />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <div className="skeleton h-6 w-48 rounded mb-2" />
            <div className="skeleton h-3.5 w-64 max-w-full rounded" />
          </div>
          <div className="skeleton h-9 w-44 rounded border border-slate-200" />
        </div>
        <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <LotRowSkeleton key={`l-${i}`} />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <LotRowSkeleton key={`r-${i}`} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
