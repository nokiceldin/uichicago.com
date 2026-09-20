"use client";

import { useState } from "react";
import { parseUachieveText } from "@/lib/academic/uachieve-import";
import { allowedChoice, defaultImportChoices, reviewImport, type AuditPreview, type ImportChoice, type SavedAuditImport } from "@/lib/academic/audit-import-review";

type Props = {
  canSave: boolean;
  saving: boolean;
  completedCourses: string[];
  currentCourses: string[];
  savedImport?: SavedAuditImport;
  onImport: (text: string, choices: ImportChoice[]) => Promise<void>;
};

export default function AuditImportPanel({ canSave, saving, completedCourses, currentCourses, savedImport, onImport }: Props) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<AuditPreview | null>(null);
  const [choices, setChoices] = useState<ImportChoice[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  let review: ReturnType<typeof reviewImport> | null = null;
  let reviewError = "";
  if (preview) {
    try { review = reviewImport(preview, choices); }
    catch (err) { reviewError = err instanceof Error ? err.message : "Review the imported rows."; }
  }
  const removedCompleted = review ? completedCourses.filter(code => !review.completedCourses.includes(code)) : [];
  const removedCurrent = review ? currentCourses.filter(code => !review.currentCourses.includes(code)) : [];

  function previewAudit() {
    setError(""); setSuccess(false); setConfirmed(false);
    try {
      const parsed = parseUachieveText(text);
      setPreview(parsed); setChoices(defaultImportChoices(parsed));
    } catch (err) { setPreview(null); setError(err instanceof Error ? err.message : "Could not read the audit."); }
  }

  async function saveImport() {
    if (!preview || !review || !confirmed || !canSave || saving) return;
    setError("");
    try {
      await onImport(text, choices);
      setText(""); setPreview(null); setChoices([]); setConfirmed(false); setSuccess(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save your audit. Your preview is still available."); }
  }

  return (
    <section aria-labelledby="audit-import-title" className="rounded-[1.6rem] border border-white/10 bg-white/4 p-6">
      <h2 id="audit-import-title" className="text-xl font-semibold text-white">Import your degree audit</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">In uAchieve, choose Open All Sections, then copy the audit results and paste them below. Review the course list before replacing your saved courses. PDF uploads are not supported here yet.</p>
      {savedImport ? <p className="mt-2 text-sm text-indigo-200">Saved audit: catalog {savedImport.metadata.catalogCode}, prepared {savedImport.metadata.preparedOn ?? "date unavailable"}. Catalog rules and exceptions still need verification.</p> : null}
      {success ? <p role="status" className="mt-3 text-sm text-emerald-200">Audit saved. The planner and Sparky can use your updated course lists. Generate a new plan to refresh its checks.</p> : null}
      <fieldset disabled={saving} className="mt-4 min-w-0 space-y-4">
        <label className="block text-sm text-zinc-200" htmlFor="audit-paste">Expanded audit text</label>
        <textarea id="audit-paste" value={text} maxLength={1_000_000} rows={6}
          onChange={event => { setText(event.target.value); setPreview(null); setConfirmed(false); setSuccess(false); setError(""); }}
          placeholder="Paste the expanded website audit, including Program, Catalog Year, Total Degree Hours, and ALL COURSES."
          className="w-full rounded-xl border border-white/15 bg-black/20 p-3 text-sm text-white placeholder:text-zinc-500" />
        <p className="text-xs text-zinc-400">Preview runs in your browser. On confirmation, the text is sent for validation; only structured academic fields are saved, not the pasted document, student name, or UIN.</p>
        <button type="button" disabled={!text.trim()} onClick={previewAudit} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Preview audit</button>
        {error ? <p role="alert" className="text-sm text-rose-200">{error}</p> : null}
        {preview ? <div className="space-y-4 border-t border-white/10 pt-4">
          <h3 className="font-semibold text-white">Review before saving</h3>
          <p className="text-sm text-zinc-300">{preview.metadata.program ?? "Program missing"} · Catalog {preview.metadata.catalogCode ?? "missing"} · Prepared {preview.metadata.preparedOn ?? "unknown"}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[["Total earned", preview.totals.allCoursesEarned], ["Degree earned", preview.totals.degreeEarned], ["Degree in progress", preview.totals.degreeInProgress], ["Degree required", preview.totals.degreeRequired]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white/5 p-3"><dt className="text-zinc-400">{label}</dt><dd className="mt-1 text-lg text-white">{value ?? "Unknown"}</dd></div>)}
          </dl>
          <p className="text-sm text-amber-200">Passing grades are imported as reported completion, not verified satisfaction of degree or prerequisite rules. Repeated courses start excluded; choose at most one attempt per course. Failed, withdrawn, and unrecognized grades cannot be marked complete here.</p>
          {preview.warnings.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-amber-200">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
          <div className="max-h-96 overflow-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-sm"><caption className="sr-only">Course history and import choices</caption><thead className="sticky top-0 bg-zinc-900 text-zinc-300"><tr>{["Course", "Term", "Hours", "Grade", "Import as"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
              <tbody>{preview.attempts.map((attempt, index) => <tr key={attempt.sourceLine} className="border-t border-white/10 text-zinc-200">
                <td className="whitespace-nowrap p-3">{attempt.code}</td><td className="p-3">{attempt.term}</td><td className="p-3">{attempt.hours}</td><td className="p-3">{attempt.grade} {attempt.flags.join(" ")}</td>
                <td className="p-3"><select aria-label={`Import ${attempt.code} ${attempt.term} row ${index + 1}`} value={choices[index]} onChange={event => { setChoices(current => current.map((choice, i) => i === index ? event.target.value as ImportChoice : choice)); setConfirmed(false); }} className="rounded-lg border border-white/15 bg-zinc-900 p-2 text-white">
                  <option value="skip">Do not import</option>
                  {allowedChoice(attempt) === "completed" ? <option value="completed">Reported complete</option> : null}
                  {allowedChoice(attempt) === "in_progress" ? <option value="in_progress">In progress</option> : null}
                </select></td>
              </tr>)}</tbody>
            </table>
          </div>
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
