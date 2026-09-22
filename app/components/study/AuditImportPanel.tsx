"use client";

import { useState } from "react";
import { parseUachievePdfText, parseUachieveText } from "@/lib/academic/uachieve-import";
import { allowedChoice, defaultImportChoices, reviewImport, type AuditPreview, type ImportChoice, type SavedAuditImport } from "@/lib/academic/audit-import-review";

type Props = {
  canSave: boolean;
  saving: boolean;
  completedCourses: string[];
  currentCourses: string[];
  savedImport?: SavedAuditImport;
  onImport: (text: string, choices: ImportChoice[], source: "paste" | "pdf") => Promise<void>;
};

export default function AuditImportPanel({ canSave, saving, completedCourses, currentCourses, savedImport, onImport }: Props) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<AuditPreview | null>(null);
  const [choices, setChoices] = useState<ImportChoice[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [inputKind, setInputKind] = useState<"paste" | "pdf">("paste");
  let review: ReturnType<typeof reviewImport> | null = null;
  let reviewError = "";
  if (preview) {
    try { review = reviewImport(preview, choices); }
    catch (err) { reviewError = err instanceof Error ? err.message : "Review the imported rows."; }
  }
  const removedCompleted = review ? completedCourses.filter(code => !review.completedCourses.includes(code)) : [];
  const removedCurrent = review ? currentCourses.filter(code => !review.currentCourses.includes(code)) : [];

  function previewAudit(source = text, kind = inputKind) {
    setError(""); setSuccess(false); setConfirmed(false);
    try {
      const parsed = kind === "pdf" ? parseUachievePdfText(source) : parseUachieveText(source);
      setPreview(parsed); setChoices(defaultImportChoices(parsed));
    } catch (err) { setPreview(null); setError(err instanceof Error ? err.message : "Could not read the audit."); }
  }

  async function uploadPdf(file: File | null) {
    if (!file || uploading) return;
    setError(""); setSuccess(false); setPreview(null); setConfirmed(false); setUploading(true);
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch("/api/study/audit-pdf", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok || typeof payload.text !== "string") throw new Error(payload.error || "Could not read that PDF.");
      setText(payload.text); setInputKind("pdf"); previewAudit(payload.text, "pdf");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not read that PDF."); }
    finally { setUploading(false); }
  }

  async function saveImport() {
    if (!preview || !review || !confirmed || !canSave || saving) return;
    setError("");
    try {
      await onImport(text, choices, inputKind);
      setText(""); setPreview(null); setChoices([]); setConfirmed(false); setSuccess(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save your audit. Your preview is still available."); }
  }

  return (
    <section aria-labelledby="audit-import-title" className="rounded-[1.35rem] border border-white/10 bg-white/4 p-4 sm:p-5">
      <h2 id="audit-import-title" className="text-xl font-semibold text-white">Import your degree audit</h2>
      <p className="mt-1 text-sm leading-6 text-zinc-400">Paste the expanded uAchieve audit or upload its print/PDF view. Only structured course information is saved - never the original document, name, or UIN.</p>
      {savedImport ? <p className="mt-2 text-sm text-indigo-200">Saved audit: catalog {savedImport.metadata.catalogCode}, prepared {savedImport.metadata.preparedOn ?? "date unavailable"}. Catalog rules and exceptions still need verification.</p> : null}
      {success ? <p role="status" className="mt-3 text-sm text-emerald-200">Audit saved. The planner and Sparky can use your updated course lists. Generate a new plan to refresh its checks.</p> : null}
      <fieldset disabled={saving || uploading} className="mt-4 min-w-0 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="block text-sm text-zinc-200" htmlFor="audit-pdf">uAchieve audit PDF <span className="text-zinc-500">(up to 10 MB)</span>
            <input id="audit-pdf" type="file" accept="application/pdf,.pdf" onChange={event => void uploadPdf(event.target.files?.[0] ?? null)} className="mt-2 block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500 file:px-3 file:py-2 file:font-semibold file:text-white" />
          </label>
          <span className="pb-2 text-center text-xs text-zinc-500">or paste below</span>
        </div>
        <label className="block text-sm text-zinc-200" htmlFor="audit-paste">Expanded audit text</label>
        <textarea id="audit-paste" value={text} maxLength={1_000_000} rows={4}
          onChange={event => { setText(event.target.value); setInputKind("paste"); setPreview(null); setConfirmed(false); setSuccess(false); setError(""); }}
          placeholder="Paste the expanded website audit, including Program, Catalog Year, Total Degree Hours, and ALL COURSES."
          className="w-full rounded-xl border border-white/15 bg-black/20 p-3 text-sm text-white placeholder:text-zinc-500" />
        <p className="text-xs text-zinc-400">PDFs are read temporarily for preview and are not stored. PDF requirement-status rows can vary by export, so review the imported courses before saving.</p>
        <button type="button" disabled={!text.trim()} onClick={() => previewAudit()} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{uploading ? "Reading PDF…" : "Preview audit"}</button>
        {error ? <p role="alert" className="text-sm text-rose-200">{error}</p> : null}
        {preview ? <div className="space-y-3 border-t border-white/10 pt-3">
          <h3 className="font-semibold text-white">Review before saving</h3>
          <p className="text-sm text-zinc-300">{preview.metadata.program ?? "Program missing"} · Catalog {preview.metadata.catalogCode ?? "missing"} · Prepared {preview.metadata.preparedOn ?? "unknown"}</p>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[["Total earned", preview.totals.allCoursesEarned], ["Degree earned", preview.totals.degreeEarned], ["Degree in progress", preview.totals.degreeInProgress], ["Degree required", preview.totals.degreeRequired]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-white/5 px-3 py-2"><dt className="text-xs text-zinc-400">{label}</dt><dd className="text-base font-semibold text-white">{value ?? "-"}</dd></div>)}
          </dl>
          <p className="text-sm text-amber-200">Passing grades are imported as reported completion, not verified satisfaction of degree or prerequisite rules. Repeated courses start excluded; choose at most one attempt per course. Failed, withdrawn, and unrecognized grades cannot be marked complete here.</p>
          {preview.warnings.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-amber-200">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
          <details className="rounded-xl border border-white/10" open><summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-200">Course history ({preview.attempts.length}) - review before saving</summary><div className="max-h-72 overflow-auto border-t border-white/10">
            <table className="w-full text-left text-sm"><caption className="sr-only">Course history and import choices</caption><thead className="sticky top-0 bg-zinc-900 text-zinc-300"><tr>{["Course", "Term", "Hours", "Grade", "Import as"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
              <tbody>{preview.attempts.map((attempt, index) => <tr key={attempt.sourceLine} className="border-t border-white/10 text-zinc-200">
                <td className="whitespace-nowrap p-3">{attempt.code}</td><td className="p-3">{attempt.term}</td><td className="p-3">{attempt.hours}</td><td className="p-3">{attempt.grade} {attempt.flags.join(" ")}</td>
                <td className="p-3"><select aria-label={`Import ${attempt.code} ${attempt.term} row ${index + 1}`} value={choices[index]} onChange={event => { setChoices(current => current.map((choice, i) => i === index ? event.target.value as ImportChoice : choice)); setConfirmed(false); }} className="rounded-lg border border-white/15 bg-zinc-900 p-2 text-white">
                  <option value="skip">Do not import</option>
                  {allowedChoice(attempt) === "completed" ? <option value="completed">Reported complete</option> : null}
                  {allowedChoice(attempt) === "in_progress" ? <option value="in_progress">In progress</option> : null}
                </select></td>
              </tr>)}</tbody>
            </table></div></details>
          <details className="text-sm text-zinc-300"><summary className="cursor-pointer">Requirement statuses from the audit ({preview.requirements.length})</summary><ul className="mt-2 space-y-1">{preview.requirements.map((requirement, i) => <li key={i}>{requirement.title}: {requirement.status.replaceAll("_", " ")}</li>)}</ul></details>
          {reviewError ? <p role="alert" className="text-sm text-rose-200">{reviewError}</p> : null}
          {review ? <div className="space-y-2 text-sm text-zinc-300">
            <p>Save {review.completedCourses.length} completed and {review.currentCourses.length} in-progress courses. This replaces both course lists. Your major, semester standing, and honors selection stay unchanged.</p>
            {removedCompleted.length ? <p>Removed from completed: {removedCompleted.join(", ")}.</p> : null}
            {removedCurrent.length ? <p>Removed from in progress: {removedCurrent.join(", ")}.</p> : null}
            <label className="flex items-start gap-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" /><span>I reviewed the rows and warnings and want to replace my saved course lists with this selection.</span></label>
          </div> : null}
          {!canSave ? <p className="text-sm text-amber-200">Sign in and wait for your profile to load before saving. You can still preview the audit.</p> : null}
          <button type="button" disabled={!confirmed || !review || !canSave} onClick={() => void saveImport()} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{saving ? "Saving audit…" : "Confirm and save courses"}</button>
        </div> : null}
      </fieldset>
    </section>
  );
}
