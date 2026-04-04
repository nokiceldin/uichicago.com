"use client";

import { useEffect, useMemo, useState } from "react";
import { useProfCoursesMap } from "@/app/hooks/useProfCoursesMap";
import { ClassesCell } from "@/app/components/ClassesCell";
import FeatureTour from "@/app/components/onboarding/FeatureTour";
import Link from "next/link";
import MissingProfessorButton from "@/app/components/MissingProfessorButton";
import SiteFooter from "@/app/components/SiteFooter";
import { signIn } from "next-auth/react";
import { usePathname } from "next/navigation";
import ProfessorNoteModal from "@/app/components/saved/ProfessorNoteModal";
import SaveProfessorButton from "@/app/components/saved/SaveProfessorButton";
import { UNAUTHORIZED_ERROR, useSavedItems } from "@/app/hooks/useSavedItems";

type Prof = {
  id: string;
  name: string;
  department: string;
  school: string;
  quality: number;
  ratingsCount: number;
  wouldTakeAgain: number | null;
  difficulty: number | null;
  url: string;
  slug: string;
  isRated?: boolean;
  isSynthetic?: boolean;
};

function ratingConfig(v: number, isRated: boolean) {
  if (!isRated) return { text: "text-zinc-700 dark:text-zinc-300", bg: "bg-zinc-100 dark:bg-white/10", ring: "ring-zinc-200 dark:ring-white/15" };
  if (v >= 4.5) return { text: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/15", ring: "ring-emerald-200 dark:ring-emerald-500/25" };
  if (v >= 4.0) return { text: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-500/15", ring: "ring-green-200 dark:ring-green-500/25" };
  if (v >= 3.0) return { text: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/15", ring: "ring-amber-200 dark:ring-amber-500/25" };
  return { text: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/15", ring: "ring-red-200 dark:ring-red-500/25" };
}

function getPageButtons(current: number, total: number) {
  const maxButtons = 3;
  if (total <= maxButtons) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, current - Math.floor(maxButtons / 2));
  let end = start + maxButtons - 1;
  if (end > total) { end = total; start = end - maxButtons + 1; }
  return Array.from({ length: maxButtons }, (_, i) => start + i);
}

export default function Page() {
  const pathname = usePathname();
  const courseMap = useProfCoursesMap();
  const { loading: savedLoading, saved, savedProfessorSlugs, savedProfessorNotes, saveProfessor, sessionStatus, unsaveProfessor } = useSavedItems();
  const [sort, setSort] = useState<"best" | "worst" | "most">("best");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Prof[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("All");
  const [savedOnly, setSavedOnly] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [minRatings, setMinRatings] = useState(0);
  const [minStars, setMinStars] = useState(0);
  const [page, setPage] = useState(1);
  const [pendingProfessorSlug, setPendingProfessorSlug] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [selectedProfessor, setSelectedProfessor] = useState<Prof | null>(null);
  const pageSize = 50;
  const visibleData = savedOnly && !savedLoading ? data.filter((professor) => savedProfessorSlugs.has(professor.slug)) : data;
  const effectiveTotal = savedOnly && !savedLoading ? saved.professors.length : total;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));
  const pageButtons = useMemo(() => getPageButtons(page, totalPages), [page, totalPages]);
  const middle = pageButtons.filter((n) => n !== 1 && n !== totalPages);
  const start = (page - 1) * pageSize;

  const selectBase = "h-9 w-full cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-900/20 transition-colors dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:border-red-500/50 dark:focus:ring-red-500/10";
  const inputBase = "h-10 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-red-500 focus:ring-2 focus:ring-red-900/20 transition-colors dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder:text-zinc-600 dark:focus:border-red-500/50 dark:focus:ring-red-500/10";
  const chipBase = "inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 transition-colors cursor-pointer dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10";
  const navBtn = "h-9 px-4 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10";
  const pageBtn = (active: boolean) => "h-9 min-w-9 px-3 rounded-xl border text-sm font-medium transition-all flex items-center justify-center tabular-nums " + (active ? "border-zinc-300 bg-zinc-100 text-zinc-900 pointer-events-none dark:border-white/12 dark:bg-white/10 dark:text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10");
  const hasAnyFilters = query.trim() || dept !== "All" || minRatings !== 0 || minStars !== 0 || savedOnly || sort !== "best";

  function clearAll() { setQuery(""); setDept("All"); setSavedOnly(false); setMinRatings(0); setMinStars(0); setSort("best"); setPage(1); }

  useEffect(() => {
    fetch("/api/departments").then(async (r) => { const text = await r.text(); if (!r.ok) throw new Error(text); return JSON.parse(text); }).then((d) => setDepartments(Array.isArray(d) ? d : [])).catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page)); params.set("pageSize", String(pageSize)); params.set("dept", dept);
    params.set("minRatings", String(minRatings)); params.set("minStars", String(minStars)); params.set("sort", sort);
    if (savedOnly) params.set("saved", "1");
    const qTrim = query.trim();
    if (qTrim) params.set("q", qTrim);
    fetch(`/api/professors?${params.toString()}`, { signal: controller.signal })
      .then(async (r) => { const text = await r.text(); if (!r.ok) throw new Error(text); return JSON.parse(text); })
      .then((res) => { setData(res.items || []); setTotal(res.total || 0); })
      .catch((err) => { if (err?.name !== "AbortError") console.error(err); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, dept, minRatings, minStars, page, savedOnly, sort]);

  async function handleProfessorSaveToggle(event: React.MouseEvent<HTMLButtonElement>, professor: Prof) {
    event.preventDefault();
    event.stopPropagation();
    setSaveError("");

    if (sessionStatus === "loading") {
      return;
    }

    try {
      if (savedProfessorSlugs.has(professor.slug)) {
        setPendingProfessorSlug(professor.slug);
        await unsaveProfessor(professor.slug);
      } else {
        setSelectedProfessor(professor);
        setDraftNote(savedProfessorNotes.get(professor.slug) ?? "");
        setNoteModalOpen(true);
      }
    } catch (error) {
      if (error instanceof Error && error.message === UNAUTHORIZED_ERROR) {
        await signIn("google", { callbackUrl: pathname || "/professors" });
        return;
      }
      setSaveError(error instanceof Error ? error.message : "Could not save professor.");
    } finally {
      setPendingProfessorSlug(null);
    }
  }

  async function handleProfessorModalSubmit() {
    if (!selectedProfessor) return;
    setPendingProfessorSlug(selectedProfessor.slug);
    setSaveError("");
    try {
      await saveProfessor({
        professorSlug: selectedProfessor.slug,
        professorName: selectedProfessor.name,
        department: selectedProfessor.department,
        school: selectedProfessor.school,
        note: draftNote,
      });
      setNoteModalOpen(false);
      setSelectedProfessor(null);
    } catch (error) {
      if (error instanceof Error && error.message === UNAUTHORIZED_ERROR) {
        setNoteModalOpen(false);
        setSelectedProfessor(null);
        await signIn("google", { callbackUrl: pathname || "/professors" });
        return;
      }
      setSaveError(error instanceof Error ? error.message : "Could not save professor.");
    } finally {
      setPendingProfessorSlug(null);
    }
  }

  return (
    <main className="relative min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <FeatureTour
        storageKey="uichicago-tour-professors-list-v1"
        steps={[
          {
            targetId: "professors-filters",
            title: "Start by narrowing the list",
            description: "Search by professor name and filter by department, rating, reviews, or sort order.",
          },
          {
            targetId: "professors-open-profile",
            title: "Open a professor profile",
            description: "Click a professor name to view their rankings, course-specific performance, and AI summary.",
          },
          {
            targetId: "professors-classes",
            title: "Use classes as a shortcut",
            description: "The classes column helps you jump from a professor into the courses they are associated with.",
          },
        ]}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-linear-to-b from-red-950/20 to-transparent" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.02]" style={{ backgroundImage: "linear-gradient(rgba(0,0,0,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.4) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      <ProfessorNoteModal
        open={noteModalOpen}
        professorName={selectedProfessor?.name ?? "Professor"}
        note={draftNote}
        pending={pendingProfessorSlug != null}
        error={saveError}
        onNoteChange={setDraftNote}
        onClose={() => {
          if (pendingProfessorSlug) return;
          setNoteModalOpen(false);
          setSelectedProfessor(null);
          setSaveError("");
        }}
        onSubmit={handleProfessorModalSubmit}
      />

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-12">
        <div className="mb-6 sm:mb-8">
          <div className="mb-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-zinc-600 dark:border-white/12 dark:bg-white/6 dark:text-zinc-300">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 dark:bg-zinc-400" />
              {new Intl.NumberFormat("en-US").format(total)} professors
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-5xl">UIC Professors</h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-500 sm:text-base">Find the best professors by department, rating, and student review count.</p>
        </div>

        <div data-tour="professors-filters" className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-900/60 sm:p-6">
          <div className="relative mb-4">
            <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" /></svg>
            <input className={inputBase + " pl-10"} placeholder="Search professor name..." value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Department</div>
              <select className={selectBase} value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }}>
                <option value="All">All departments</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Min rating</div>
              <select className={selectBase} value={minStars} onChange={(e) => { setMinStars(Number(e.target.value)); setPage(1); }}>
                <option value={0}>Any</option><option value={3}>3.0+</option><option value={3.5}>3.5+</option><option value={4}>4.0+</option><option value={4.5}>4.5+</option><option value={4.8}>4.8+</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Sort by</div>
              <select className={selectBase} value={sort} onChange={(e) => { setSort(e.target.value as "best" | "worst" | "most"); setPage(1); }}>
                <option value="best">Highest rated</option><option value="worst">Lowest rated</option><option value="most">Most reviews</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Library</div>
              <select className={selectBase} value={savedOnly ? "saved" : "all"} onChange={(e) => { setSavedOnly(e.target.value === "saved"); setPage(1); }}>
                <option value="all">All professors</option>
                <option value="saved">Saved only</option>
              </select>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                <span>Min reviews</span><span className="tabular-nums text-zinc-600">{minRatings}</span>
              </div>
              <div className="flex h-9 items-center rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900 px-3">
                <input type="range" min={0} max={200} step={5} value={minRatings} onChange={(e) => { setMinRatings(Number(e.target.value)); setPage(1); }} className="w-full accent-zinc-500 dark:accent-zinc-300" />
              </div>
            </div>
          </div>
          {hasAnyFilters && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 dark:border-white/5 pt-4">
              <span className="text-xs text-zinc-400 mr-1">Active:</span>
              {dept !== "All" && <button className={chipBase} onClick={() => { setDept("All"); setPage(1); }}>Dept: <strong>{dept}</strong> <span className="text-zinc-400">×</span></button>}
              {minStars !== 0 && <button className={chipBase} onClick={() => { setMinStars(0); setPage(1); }}>Rating: <strong>{minStars}+</strong> <span className="text-zinc-400">×</span></button>}
              {minRatings !== 0 && <button className={chipBase} onClick={() => { setMinRatings(0); setPage(1); }}>Reviews: <strong>{minRatings}+</strong> <span className="text-zinc-400">×</span></button>}
              {savedOnly && <button className={chipBase} onClick={() => { setSavedOnly(false); setPage(1); }}>Saved only <span className="text-zinc-400">×</span></button>}
              {query.trim() && <button className={chipBase} onClick={() => { setQuery(""); setPage(1); }}>Search: <strong>&quot;{query.trim()}&quot;</strong> <span className="text-zinc-400">×</span></button>}
              <button onClick={clearAll} className="ml-auto text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">Clear all</button>
            </div>
          )}
          {saveError ? <div className="mt-4 text-sm text-red-500">{saveError}</div> : null}
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-500 tabular-nums">
            Showing <span className="text-zinc-700 dark:text-zinc-300 font-medium">{effectiveTotal === 0 ? 0 : start + 1}–{Math.min(start + pageSize, effectiveTotal)}</span> of <span className="text-zinc-700 dark:text-zinc-300 font-medium">{effectiveTotal.toLocaleString()}</span>
            {loading && <span className="ml-2 text-zinc-400">Loading…</span>}
          </p>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            <button className={navBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}>← Prev</button>
            <button className={pageBtn(page === 1)} onClick={() => setPage(1)}>1</button>
            {middle.length > 0 && middle[0] > 2 && <span className="text-zinc-400 text-sm">…</span>}
            {middle.map((n) => <button key={n} className={pageBtn(page === n)} onClick={() => setPage(n)}>{n}</button>)}
            {totalPages > 1 && (<>
              {middle.length > 0 && middle[middle.length - 1] < totalPages - 1 && <span className="text-zinc-400 text-sm">…</span>}
              <button className={pageBtn(page === totalPages)} onClick={() => setPage(totalPages)}>{totalPages}</button>
            </>)}
            <button className={navBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}>Next →</button>
          </div>
        </div>

        <div className="space-y-3 sm:hidden">
          {visibleData.map((p, idx) => {
            const rc = ratingConfig(Number(p.quality) || 0, Boolean(p.isRated));
            return (
              <div key={p.slug} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-900/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div data-tour={idx === 0 ? "professors-open-profile" : undefined} className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                      <span className="mr-1.5 text-zinc-400 dark:text-zinc-600">{start + idx + 1}.</span>
                      <Link href={`/professors/${p.slug}`} className="hover:text-red-500 dark:hover:text-white transition-colors hover:underline">{p.name}</Link>
                    </div>
                    <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{p.school}</div>
                  </div>
                  <span className={`inline-flex flex-col items-center rounded-lg px-2.5 py-1.5 text-xs font-black tabular-nums ring-1 ${rc.bg} ${rc.text} ${rc.ring}`}>
                    <span className="text-sm">{p.isRated ? (Number(p.quality) || 0).toFixed(1) : "NR"}</span>
                    <span className="text-[9px] font-medium opacity-60">{p.isRated ? `(${Number(p.ratingsCount) || 0})` : "active"}</span>
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-lg bg-zinc-100 dark:bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 ring-1 ring-zinc-200 dark:ring-white/8">{p.department}</span>
                </div>

                <div data-tour={idx === 0 ? "professors-classes" : undefined} className="mt-4">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Classes</div>
                  <ClassesCell profName={p.name} map={courseMap} />
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {p.isRated ? `${Number(p.ratingsCount) || 0} reviews` : "No RMP profile yet"}
                  </div>
                  <div className="flex items-center gap-2">
                    <SaveProfessorButton
                      isSaved={savedProfessorSlugs.has(p.slug)}
                      savedNote={savedProfessorNotes.get(p.slug) ?? null}
                      pending={pendingProfessorSlug === p.slug}
                      error={pendingProfessorSlug === p.slug ? saveError : ""}
                      onToggle={(event) => handleProfessorSaveToggle(event, p)}
                      compact
                    />
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white">Open RMP</a>
                    ) : (
                      <span className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">No RMP</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {!loading && visibleData.length === 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center shadow-sm dark:border-white/8 dark:bg-zinc-900/40">
              <p className="text-zinc-400 text-sm">No professors found.</p>
              <button onClick={clearAll} className="mt-3 text-sm text-red-500 hover:text-red-400 transition-colors font-medium">Clear all filters →</button>
              <div className="mt-4 flex justify-center"><MissingProfessorButton page="professors" searchQuery={query.trim()} show /></div>
            </div>
          )}
        </div>

        <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg dark:border-white/8 dark:bg-zinc-900/40 dark:shadow-black/40 sm:block">
          <div className="min-w-[760px] grid grid-cols-12 border-b border-zinc-100 bg-zinc-50 px-4 sm:px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:border-white/8 dark:bg-zinc-950/60 dark:text-zinc-600">
            <div className="col-span-4">Professor</div>
            <div className="col-span-3">Department</div>
            <div className="col-span-2">Classes</div>
            <div className="col-span-1 text-right">Rating</div>
            <div className="col-span-1 text-right">RMP</div>
            <div className="col-span-1 text-right">Save</div>
          </div>
          <div className="max-h-[75vh] overflow-auto">
            <div className="min-w-[760px]">
              <ul className="divide-y divide-zinc-100 dark:divide-white/4">
                {visibleData.map((p, idx) => {
                  const rc = ratingConfig(Number(p.quality) || 0, Boolean(p.isRated));
                  return (
                    <li key={p.slug} className="grid grid-cols-12 items-center px-4 sm:px-6 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-white/4">
                      <div className="col-span-4 min-w-0 pr-3">
                        <div data-tour={idx === 0 ? "professors-open-profile" : undefined} className="text-sm font-bold text-zinc-900 dark:text-zinc-100 sm:text-base">
                          <span className="text-zinc-400 dark:text-zinc-600 tabular-nums mr-1.5">{start + idx + 1}.</span>
                          <Link href={`/professors/${p.slug}`} className="hover:text-red-500 dark:hover:text-white transition-colors hover:underline">{p.name}</Link>
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-600">{p.school}</div>
                      </div>
                      <div className="col-span-3 pr-3">
                        <span className="inline-flex items-center rounded-lg bg-zinc-100 dark:bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 ring-1 ring-zinc-200 dark:ring-white/8">{p.department}</span>
                      </div>
                      <div data-tour={idx === 0 ? "professors-classes" : undefined} className="col-span-2 pr-3"><ClassesCell profName={p.name} map={courseMap} /></div>
                      <div className="col-span-1 flex justify-end">
                        <span className={`inline-flex flex-col items-center rounded-lg px-2.5 py-1.5 text-xs font-black tabular-nums ring-1 ${rc.bg} ${rc.text} ${rc.ring}`}>
                          <span className="text-sm">{p.isRated ? (Number(p.quality) || 0).toFixed(1) : "NR"}</span>
                          <span className="text-[9px] font-medium opacity-60">{p.isRated ? `(${Number(p.ratingsCount) || 0})` : "active"}</span>
                        </span>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white">RMP</a>
                        ) : (
                          <span className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">No RMP</span>
                        )}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <SaveProfessorButton
                          isSaved={savedProfessorSlugs.has(p.slug)}
                          savedNote={savedProfessorNotes.get(p.slug) ?? null}
                          pending={pendingProfessorSlug === p.slug}
                          error={pendingProfessorSlug === p.slug ? saveError : ""}
                          onToggle={(event) => handleProfessorSaveToggle(event, p)}
                          compact
                        />
                      </div>
                    </li>
                  );
                })}
                {!loading && visibleData.length === 0 && (
                  <li className="px-6 py-16 text-center">
                    <p className="text-zinc-400 text-sm">No professors found.</p>
                    <button onClick={clearAll} className="mt-3 text-sm text-red-500 hover:text-red-400 transition-colors font-medium">Clear all filters →</button>
                    <div className="mt-4 flex justify-center"><MissingProfessorButton page="professors" searchQuery={query.trim()} show /></div>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>

      </div>

      <SiteFooter className="mt-12" />
    </main>
  );
}
