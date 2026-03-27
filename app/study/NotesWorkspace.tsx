"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AudioLines,
  BookPlus,
  ChevronLeft,
  FileText,
  Mic,
  Plus,
  Pause,
  Pin,
  Play,
  Search,
  Star,
  StopCircle,
  Clock3,
} from "lucide-react";
import { createStudyId, materializeGeneratedStudySet } from "@/lib/study/engine";
import type {
  GeneratedFlashcardPayload,
  NoteAiGenerationLog,
  StudyLibraryState,
  StudyNote,
  StudySet,
  StructuredLectureNotes,
} from "@/lib/study/types";

type ToastTone = "default" | "error" | "reward";
type NotesSort = "recent" | "alphabetical" | "course" | "pinned";
type NotesFilter = "all" | "pinned" | "favorite";
type NotesTab = "note" | "structured" | "transcript";

type NoteActionResponse =
  | { summary?: string; rewrittenNote?: string; keyTerms?: string[]; explanation?: string; reviewSheet?: StructuredLectureNotes; flashcards?: GeneratedFlashcardPayload; quizQuestions?: Array<{ prompt: string; type: string }> }
  | null;

type Props = {
  library: StudyLibraryState;
  onLibraryChange: React.Dispatch<React.SetStateAction<StudyLibraryState>>;
  onCreateFlashcardSet: (set: StudySet) => void;
  showToast: (message: string, tone?: ToastTone) => void;
  externalQuery?: string;
  folderFilter?: string;
};

const magneticHoverProps = {
  onMouseMove: (event: React.MouseEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 8;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 8;
    target.style.setProperty("--mx", `${x.toFixed(2)}px`);
    target.style.setProperty("--my", `${y.toFixed(2)}px`);
  },
  onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--mx", "0px");
    event.currentTarget.style.setProperty("--my", "0px");
  },
};

function emptyStructured(title: string): StructuredLectureNotes {
  return {
    title,
    summary: "",
    sections: [
      { heading: "Key Concepts", items: [] },
      { heading: "Definitions", items: [] },
      { heading: "Examples", items: [] },
      { heading: "Possible Exam Focus", items: [] },
    ],
    keyTerms: [],
    questionsToReview: [],
    confidenceNotes: [],
  };
}

function createEmptyNote(sourceType: StudyNote["sourceType"] = "manual"): StudyNote {
  const now = new Date().toISOString();
  return {
    id: createStudyId("note"),
    title: "",
    course: "",
    noteDate: now.slice(0, 10),
    subject: "",
    tags: [],
    rawContent: "",
    structuredContent: null,
    transcriptContent: "",
    sourceType,
    visibility: "private",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    pinned: false,
    favorite: false,
  };
}

function serializeStructuredNotes(notes: StructuredLectureNotes | null) {
  if (!notes) return "";
  const sections = notes.sections
    .map((section) => `${section.heading}\n${section.items.map((item) => `- ${item}`).join("\n")}`)
    .join("\n\n");
  return [
    notes.title,
    notes.summary,
    sections,
    notes.keyTerms.length ? `Key Terms\n${notes.keyTerms.map((term) => `- ${term}`).join("\n")}` : "",
    notes.questionsToReview.length
      ? `Questions To Review\n${notes.questionsToReview.map((item) => `- ${item}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatNoteDate(date: string) {
  if (!date) return "No date";
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function notesSearchText(note: StudyNote) {
  return [note.title, note.course, note.subject, note.tags.join(" "), note.rawContent, note.transcriptContent]
    .join(" ")
    .toLowerCase();
}

export default function NotesWorkspace({ library, onLibraryChange, onCreateFlashcardSet, showToast, externalQuery = "", folderFilter = "" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedNoteId, setSelectedNoteId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<NotesSort>("recent");
  const [filter, setFilter] = useState<NotesFilter>("all");
  const [activeTab, setActiveTab] = useState<NotesTab>("note");
  const [focusMode] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [actionResult, setActionResult] = useState<NoteActionResponse>(null);
  const [, setActionLoading] = useState<string | null>(null);
  const [generatedFlashcards, setGeneratedFlashcards] = useState<GeneratedFlashcardPayload | null>(null);
  const [pendingExplanationConcept, setPendingExplanationConcept] = useState("");
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);
  const transcriptRef = useRef("");
  const saveTimerRef = useRef<number | null>(null);
  const lastOpenedNoteIdRef = useRef<string | null>(null);

  const notes = library.notes;
  const requestedNoteId = searchParams.get("note");
  const isFocusedNoteView = Boolean(requestedNoteId);

  useEffect(() => {
    if (requestedNoteId && requestedNoteId !== "create") {
      setSelectedNoteId(requestedNoteId);
      return;
    }
  }, [notes, requestedNoteId, selectedNoteId]);

  useEffect(() => {
    setSearch(externalQuery);
  }, [externalQuery]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      speechRecognitionRef.current?.stop?.();
    };
  }, []);

  const visibleNotes = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return [...notes]
      .filter((note) => {
        const matchesSearch = !normalized || notesSearchText(note).includes(normalized);
        const matchesFolder = !folderFilter || (note.course || note.subject || note.title).trim() === folderFilter;
        const matchesFilter =
          filter === "all" ? true : filter === "pinned" ? note.pinned : note.favorite;
        return matchesSearch && matchesFilter && matchesFolder;
      })
      .sort((a, b) => {
        if (sort === "alphabetical") return a.title.localeCompare(b.title);
        if (sort === "course") return `${a.course} ${a.title}`.localeCompare(`${b.course} ${b.title}`);
        if (sort === "pinned") return Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt);
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [filter, folderFilter, notes, search, sort]);

  const selectedNote = useMemo(() => {
    if (!isFocusedNoteView) return null;
    return visibleNotes.find((note) => note.id === selectedNoteId) || notes.find((note) => note.id === selectedNoteId) || null;
  }, [isFocusedNoteView, notes, selectedNoteId, visibleNotes]);

  useEffect(() => {
    if (!selectedNote) return;
    if (lastOpenedNoteIdRef.current === selectedNote.id) return;
    lastOpenedNoteIdRef.current = selectedNote.id;
    const openedAt = new Date().toISOString();
    onLibraryChange((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === selectedNote.id ? { ...note, lastOpenedAt: openedAt } : note,
      ),
    }));
  }, [onLibraryChange, selectedNote]);

  const updateNote = (noteId: string, patch: Partial<StudyNote>) => {
    const now = new Date().toISOString();
    const existingNote = notes.find((note) => note.id === noteId);
    if (!existingNote) return;
    const nextNote: StudyNote = { ...existingNote, ...patch, updatedAt: now };
    setSaveState("saving");
    onLibraryChange((current) => ({
      ...current,
      notes: current.notes.map((note) => (note.id === noteId ? nextNote : note)),
    }));
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => setSaveState("saved"), 420);

    if (nextNote.visibility === "public") {
      fetch("/api/study/public-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: nextNote }),
      })
        .then(async (response) => {
          if (response.ok) return;
          const payload = await response.json().catch(() => ({}));
          onLibraryChange((current) => ({
            ...current,
            notes: current.notes.map((note) =>
              note.id === noteId ? { ...note, visibility: "private" } : note,
            ),
          }));
          showToast(payload.error || "This note was kept private.", "error");
        })
        .catch(() => {
          onLibraryChange((current) => ({
            ...current,
            notes: current.notes.map((note) =>
              note.id === noteId ? { ...note, visibility: "private" } : note,
            ),
          }));
          showToast("Could not publish the note, so it was kept private.", "error");
        });
    } else {
      fetch("/api/study/public-notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId }),
      }).catch(() => undefined);
    }
  };

  const appendLog = (noteId: string, action: NoteAiGenerationLog["action"], status: NoteAiGenerationLog["status"], detail: string) => {
    onLibraryChange((current) => ({
      ...current,
      noteAiLogs: [
        {
          id: createStudyId("note-log"),
          noteId,
          action,
          createdAt: new Date().toISOString(),
          status,
          detail,
        },
        ...current.noteAiLogs,
      ].slice(0, 100),
    }));
  };

  const createNote = (sourceType: StudyNote["sourceType"] = "manual") => {
    const nextNote = createEmptyNote(sourceType);
    onLibraryChange((current) => ({ ...current, notes: [nextNote, ...current.notes] }));
    setSelectedNoteId(nextNote.id);
    setActiveTab("note");
    setActionResult(null);
    setGeneratedFlashcards(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", "notes");
    params.set("note", nextNote.id);
    router.push(`/study?${params.toString()}`);
    showToast(sourceType === "audio" ? "Ready to capture a lecture." : "New note created.");
    return nextNote;
  };

  const deleteNote = (noteId: string) => {
    const target = notes.find((note) => note.id === noteId);
    if (!target) return;
    if (!window.confirm(`Delete "${target.title}"?`)) return;
    onLibraryChange((current) => ({
      ...current,
      notes: current.notes.filter((note) => note.id !== noteId),
      noteAudioSessions: current.noteAudioSessions.filter((session) => session.noteId !== noteId),
      noteAiLogs: current.noteAiLogs.filter((log) => log.noteId !== noteId),
    }));
    fetch("/api/study/public-notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId }),
    }).catch(() => undefined);
    if (selectedNoteId === noteId) {
      const next = notes.find((note) => note.id !== noteId);
      setSelectedNoteId(next?.id || "");
      if (requestedNoteId) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("mode", "notes");
        if (next?.id) {
          params.set("note", next.id);
        } else {
          params.delete("note");
        }
        router.push(`/study?${params.toString()}`);
      }
    }
    showToast("Note deleted.");
  };

  const openNote = (noteId: string, tab: NotesTab = "note") => {
    setSelectedNoteId(noteId);
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", "notes");
    params.set("note", noteId);
    router.push(`/study?${params.toString()}`);
  };

  const closeFocusedNote = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", "notes");
    params.set("view", "library");
    params.delete("note");
    router.push(`/study?${params.toString()}`);
  };

  const insertMarkdown = (before: string, after = "", placeholder = "text") => {
    if (!selectedNote || !editorRef.current) return;
    const textarea = editorRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = selectedNote.rawContent;
    const selected = value.slice(start, end) || placeholder;
    const nextValue = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    updateNote(selectedNote.id, { rawContent: nextValue });
    requestAnimationFrame(() => {
      textarea.focus();
      const nextCursor = start + before.length + selected.length + after.length;
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const runNoteAction = async (action: string) => {
    if (!selectedNote) return;
    const content = selectedNote.structuredContent
      ? `${selectedNote.rawContent}\n\n${serializeStructuredNotes(selectedNote.structuredContent)}`
      : selectedNote.rawContent || selectedNote.transcriptContent;
    if (!content.trim()) {
      showToast("Add some note content first.", "error");
      return;
    }

    let finalContent = content;
    if (action === "explain_concept") {
      const concept = window.prompt("What concept should Sparky explain?", pendingExplanationConcept || selectedNote.title);
      if (!concept) return;
      setPendingExplanationConcept(concept);
      finalContent = `${content}\n\nConcept to explain: ${concept}`;
    }

    setActionLoading(action);
    try {
      const response = await fetch("/api/study/notes/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          content: finalContent,
          course: selectedNote.course,
          subject: selectedNote.subject,
          title: selectedNote.title,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to run note action.");
      setActionResult(payload);
      appendLog(selectedNote.id, action as NoteAiGenerationLog["action"], "success", "Note action completed.");

      if (action === "summarize" && payload.summary) {
        updateNote(selectedNote.id, {
          structuredContent: {
            ...(selectedNote.structuredContent || emptyStructured(selectedNote.title)),
            title: selectedNote.title,
            summary: payload.summary,
          },
        });
        setActiveTab("structured");
      }

      if (action === "simplify" && payload.rewrittenNote) {
        updateNote(selectedNote.id, { rawContent: payload.rewrittenNote });
        setActiveTab("note");
      }

      if (action === "review_sheet" && payload.reviewSheet) {
        updateNote(selectedNote.id, { structuredContent: payload.reviewSheet });
        setActiveTab("structured");
      }

      if (action === "generate_flashcards" && payload.flashcards) {
        setGeneratedFlashcards(payload.flashcards);
      }

      showToast(
        action === "generate_flashcards"
          ? "Flashcard draft ready to review."
          : action === "generate_quiz"
          ? "Quiz questions generated."
          : "AI action complete.",
        "reward",
      );
    } catch (error) {
      appendLog(selectedNote.id, action as NoteAiGenerationLog["action"], "error", error instanceof Error ? error.message : "Failed");
      showToast(error instanceof Error ? error.message : "That action failed.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const saveGeneratedFlashcards = () => {
    if (!selectedNote || !generatedFlashcards) return;
    const nextSet = materializeGeneratedStudySet(generatedFlashcards, {
      course: selectedNote.course,
      subject: selectedNote.subject || "Notes",
      difficulty: "medium",
      description: `Generated from note: ${selectedNote.title}`,
    });
    onCreateFlashcardSet(nextSet);
    setGeneratedFlashcards(null);
    showToast("Flashcards added to Study.", "reward");
  };

  const startRecording = async (noteOverride?: StudyNote) => {
    const activeNote = noteOverride || selectedNote;
    if (!activeNote) {
      const created = createNote("audio");
      setCaptureOpen(true);
      requestAnimationFrame(() => {
        void startRecording(created);
      });
      return;
    }
    setCaptureOpen(true);
    setRecordingError("");
    setLiveTranscript("");
    transcriptRef.current = "";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: "audio/webm" });
        const audioRef = URL.createObjectURL(audioBlob);
        const sessionId = createStudyId("audio-session");
        const durationMs = recordingMs;
        onLibraryChange((current) => ({
          ...current,
          noteAudioSessions: [
            {
              id: sessionId,
              noteId: activeNote.id,
              audioRef,
              durationMs,
              transcriptStatus: transcriptRef.current ? "processing" : "error",
              aiStatus: transcriptRef.current ? "processing" : "idle",
              createdAt: new Date().toISOString(),
            },
            ...current.noteAudioSessions,
          ],
        }));

        if (!transcriptRef.current.trim()) {
          updateNote(activeNote.id, { status: "error" });
          showToast("No transcript was captured from this recording.", "error");
          return;
        }

        updateNote(activeNote.id, { status: "processing", sourceType: "audio" });
        try {
          const transcriptResponse = await fetch("/api/study/notes/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcriptText: transcriptRef.current, title: activeNote.title }),
          });
          const transcriptPayload = await transcriptResponse.json();
          if (!transcriptResponse.ok) throw new Error(transcriptPayload.error || "Failed to process transcript.");

          const structureResponse = await fetch("/api/study/notes/structure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transcript: transcriptPayload.transcript,
              course: activeNote.course,
              subject: activeNote.subject,
              title: activeNote.title,
            }),
          });
          const structuredPayload = await structureResponse.json();
          if (!structureResponse.ok) throw new Error(structuredPayload.error || "Failed to structure notes.");

          updateNote(activeNote.id, {
            transcriptContent: transcriptPayload.transcript,
            structuredContent: structuredPayload,
            rawContent: activeNote.rawContent || structuredPayload.summary,
            status: "ready",
          });
          appendLog(activeNote.id, "lecture_notes", "success", "Lecture notes created from recording.");
          setActiveTab("structured");
          showToast("Lecture organized into clean study notes.", "reward");
        } catch (error) {
          updateNote(activeNote.id, { transcriptContent: transcriptRef.current, status: "error" });
          appendLog(activeNote.id, "lecture_notes", "error", error instanceof Error ? error.message : "Failed to process audio.");
          showToast(error instanceof Error ? error.message : "Lecture processing failed.", "error");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setRecordingMs(0);
      timerRef.current = window.setInterval(() => setRecordingMs((current) => current + 1000), 1000);

      const speechCtor =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (speechCtor) {
        const recognition = new speechCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0]?.transcript || "")
            .join(" ")
            .trim();
          transcriptRef.current = transcript;
          setLiveTranscript(transcript);
        };
        recognition.onerror = () => {
          setRecordingError("Live transcript support was limited, but your audio recording still completed.");
        };
        recognition.start();
        speechRecognitionRef.current = recognition;
      } else {
        setRecordingError("Live transcript is not available in this browser. Recording still works, but transcript quality may be limited.");
      }
    } catch {
      setRecordingError("Microphone access was denied. You can still type or paste notes manually.");
      showToast("Microphone permission was denied.", "error");
    }
  };

  const pauseRecording = () => {
    recorderRef.current?.pause();
    speechRecognitionRef.current?.stop?.();
    setIsPaused(true);
  };

  const resumeRecording = () => {
    recorderRef.current?.resume();
    const speechCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (speechCtor) {
      const recognition = new speechCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0]?.transcript || "")
          .join(" ")
          .trim();
        transcriptRef.current = transcript;
        setLiveTranscript(transcript);
      };
      recognition.start();
      speechRecognitionRef.current = recognition;
    }
    setIsPaused(false);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    speechRecognitionRef.current?.stop?.();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (timerRef.current) window.clearInterval(timerRef.current);
    setIsRecording(false);
    setIsPaused(false);
  };

  const copySummary = async () => {
    if (!selectedNote?.structuredContent?.summary) {
      showToast("No structured summary yet.", "error");
      return;
    }
    await navigator.clipboard.writeText(selectedNote.structuredContent.summary);
    showToast("Summary copied.");
  };

  return (
    <div className="space-y-5">
      <section className="study-premium-panel study-appear rounded-[1.2rem] border border-white/8 bg-[rgba(24,28,42,0.92)] p-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
              <h1 className="text-[1.55rem] font-semibold tracking-[-0.04em] text-white md:text-[1.8rem]">
              {isFocusedNoteView ? "Note" : "My notes"}
              </h1>
              <p className="mt-1 text-sm leading-6 text-zinc-400">
              {isFocusedNoteView
                ? "A focused space for writing and organizing one note."
                : "Browse your notes, or let AI turn a lecture recording into organized notes for you."}
              </p>
            </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => createNote("manual")}
              {...magneticHoverProps}
              className="study-premium-button inline-flex items-center gap-2 rounded-xl bg-white text-sm font-semibold text-zinc-900 px-4 py-2.5"
            >
              <Plus className="h-4 w-4" />
              Start a note
            </button>
            <button
              onClick={() => {
                const active = selectedNote || createNote("audio");
                setCaptureOpen(true);
                void startRecording(active);
              }}
              {...magneticHoverProps}
              className="study-premium-button inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-zinc-100"
            >
              <Mic className="h-4 w-4" />
              AI lecture notes
            </button>
          </div>
        </div>
      </section>

      <div className={`grid gap-5 ${(focusMode || isFocusedNoteView) ? "xl:grid-cols-[minmax(0,1fr)]" : "xl:grid-cols-[270px_minmax(0,1fr)]"}`}>
        {!focusMode && !isFocusedNoteView && (
          <aside className="space-y-4 xl:sticky xl:top-24">
            <div className="study-premium-panel rounded-[1.2rem] border border-white/8 bg-[rgba(25,29,42,0.9)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Search className="h-4 w-4 text-zinc-400" />
                  My notes
                </div>
                <button
                  onClick={() => createNote("manual")}
                  {...magneticHoverProps}
                  className="study-premium-button inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-200"
                >
                  <Plus className="h-3 w-3" />
                  New
                </button>
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search notes, course, tags..."
                className="study-premium-input mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as NotesFilter)}
                  className="study-premium-input rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3 text-sm text-zinc-200 outline-none"
                >
                  <option value="all">All notes</option>
                  <option value="pinned">Pinned</option>
                  <option value="favorite">Favorites</option>
                </select>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as NotesSort)}
                  className="study-premium-input rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3 text-sm text-zinc-200 outline-none"
                >
                  <option value="recent">Recent</option>
                  <option value="alphabetical">A-Z</option>
                  <option value="course">Course</option>
                  <option value="pinned">Pinned first</option>
                </select>
              </div>
              <div className="mt-4 space-y-2">
                {visibleNotes.length ? (
                  visibleNotes.map((note) => (
                    <button
                      key={note.id}
                      onClick={() => openNote(note.id, note.structuredContent ? "structured" : "note")}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        selectedNote?.id === note.id
                          ? "border-white/18 bg-white/[0.08]"
                          : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className={`truncate text-sm font-medium ${note.title.trim() ? "text-white" : "text-zinc-500"}`}>
                            {note.title.trim() || "Untitled note"}
                          </div>
                          <div className="mt-1 truncate text-xs text-zinc-400">
                            {[note.course || note.subject, formatNoteDate(note.noteDate)].filter(Boolean).join(" • ")}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {note.pinned ? <Pin className="h-3.5 w-3.5 text-zinc-300" /> : null}
                          {note.favorite ? <Star className="h-3.5 w-3.5 text-zinc-300" /> : null}
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-zinc-400">
                    No notes yet.
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        <section className="space-y-5">
          {!selectedNote ? (
            <div className="study-premium-panel rounded-[1.6rem] p-8 text-center">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
                <FileText className="h-6 w-6 text-zinc-300" />
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-white">
                {visibleNotes.length ? "Open a note to start writing." : "Start your first note."}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {visibleNotes.length
                  ? "Choose a note from My notes on the left, or create a new one to open a clean dedicated note page."
                  : "Create a clean note, or record a lecture and let AI turn it into organized notes automatically."}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => createNote("manual")}
                  {...magneticHoverProps}
                  className="study-premium-button inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-red-500 to-red-600 px-4 py-3 text-sm font-bold text-white"
                >
                  <BookPlus className="h-4 w-4" />
                  Start a note
                </button>
                <button
                  onClick={() => {
                    const created = createNote("audio");
                    setCaptureOpen(true);
                    void startRecording(created);
                  }}
                  {...magneticHoverProps}
                  className="study-premium-button inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-100"
                >
                  <AudioLines className="h-4 w-4" />
                  Record and let AI make notes
                </button>
              </div>
            </div>
          ) : (
            <>
                  {isFocusedNoteView && (
                <div className="study-appear flex items-center justify-between gap-4">
                  <button
                    onClick={closeFocusedNote}
                    className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition hover:text-white"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back to my notes
                  </button>
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                    Note editor
                  </div>
                </div>
              )}
              <div className="study-premium-panel rounded-[1.25rem] border border-white/8 bg-[rgba(25,29,42,0.92)] p-5">
                <div className="min-w-0">
                  <div className="flex flex-col gap-4 border-b border-white/8 pb-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span>{selectedNote.sourceType === "audio" ? "Lecture note" : "Manual note"}</span>
                        <span className="text-zinc-400">
                          {saveState === "saving" ? "Saving..." : "Saved"}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-[1.8fr_1fr_0.85fr]">
                        <input
                          value={selectedNote.title}
                          onChange={(event) => updateNote(selectedNote.id, { title: event.target.value })}
                          className="study-premium-input rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xl font-semibold text-white outline-none placeholder:text-zinc-500"
                          placeholder="Untitled note"
                        />
                        <input
                          value={selectedNote.course}
                          onChange={(event) => updateNote(selectedNote.id, { course: event.target.value })}
                          className="study-premium-input rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
                          placeholder="Course"
                        />
                        <input
                          type="date"
                          value={selectedNote.noteDate}
                          onChange={(event) => updateNote(selectedNote.id, { noteDate: event.target.value })}
                          className="study-premium-input rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:max-w-[360px] lg:justify-end">
                      <button
                        onClick={() => setCaptureOpen((current) => !current)}
                        {...magneticHoverProps}
                        className="study-premium-button rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200"
                      >
                        {captureOpen ? "Hide recorder" : "Recorder"}
                      </button>
                      <button
                        onClick={() => deleteNote(selectedNote.id)}
                        {...magneticHoverProps}
                        className="study-premium-button rounded-full border border-white/10 bg-transparent px-3 py-2 text-xs font-medium text-zinc-400 hover:text-white"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <select
                      value={selectedNote.visibility}
                      onChange={(event) =>
                        updateNote(selectedNote.id, {
                          visibility: event.target.value as StudyNote["visibility"],
                        })
                      }
                      className="study-premium-input rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none"
                    >
                      <option value="private">Private</option>
                      <option value="public">Public</option>
                    </select>
                    <input
                      value={selectedNote.tags.join(", ")}
                      onChange={(event) =>
                        updateNote(selectedNote.id, {
                          tags: event.target.value
                            .split(",")
                            .map((tag) => tag.trim())
                            .filter(Boolean),
                        })
                      }
                      className="study-premium-input min-w-[220px] flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
                      placeholder="Tags"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/8 pt-4">
                    <span className="text-xs font-medium text-zinc-500">Quick tools</span>
                    {[
                      { label: "H1", action: () => insertMarkdown("# ") },
                      { label: "Bullet", action: () => insertMarkdown("- ") },
                      { label: "Bold", action: () => insertMarkdown("**", "**", "bold text") },
                      { label: "Checklist", action: () => insertMarkdown("- [ ] ") },
                      { label: "Summarize", action: () => runNoteAction("summarize") },
                      { label: "Flashcards", action: () => runNoteAction("generate_flashcards") },
                    ].map((item) => (
                      <button
                        key={item.label}
                        onClick={item.action}
                        {...magneticHoverProps}
                        className="study-premium-button rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-200"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {captureOpen && (
                <div className="study-premium-panel rounded-[1.6rem] p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Lecture capture</div>
                      <div className="mt-2 text-lg font-semibold text-white">{isRecording ? "Recording in progress" : "Ready to capture audio"}</div>
                      <div className="mt-1 text-sm text-zinc-400">
                        Record, transcribe, and turn the lecture into clean study notes.
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-zinc-200">
                        {formatDuration(recordingMs)}
                      </div>
                      {!isRecording ? (
                        <button
                          onClick={() => {
                            void startRecording();
                          }}
                          {...magneticHoverProps}
                          className="study-premium-button inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-red-500 to-red-600 px-4 py-3 text-sm font-bold text-white"
                        >
                          <Mic className="h-4 w-4" />
                          Start
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={isPaused ? resumeRecording : pauseRecording}
                            {...magneticHoverProps}
                            className="study-premium-button inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-100"
                          >
                            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                            {isPaused ? "Resume" : "Pause"}
                          </button>
                          <button
                            onClick={stopRecording}
                            {...magneticHoverProps}
                            className="study-premium-button inline-flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100"
                          >
                            <StopCircle className="h-4 w-4" />
                            Stop
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-[1.3rem] border border-white/8 bg-white/[0.03] p-4">
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Live mic status</div>
                      <div className="mt-4 flex items-end gap-1">
                        {Array.from({ length: 18 }).map((_, index) => (
                          <span
                            key={index}
                            className={`w-2 rounded-full transition-all ${isRecording ? "bg-red-400/80" : "bg-white/10"}`}
                            style={{
                              height: `${isRecording ? 10 + ((index + Math.floor(recordingMs / 500)) % 6) * 5 : 12}px`,
                            }}
                          />
                        ))}
                      </div>
                      <div className="mt-4 text-sm text-zinc-400">
                        {recordingError || "When a transcript is available, AI will organize it into clean lecture notes instead of dumping raw text."}
                      </div>
                    </div>
                    <div className="rounded-[1.3rem] border border-white/8 bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Transcript preview</div>
                        <button
                          onClick={() => setCaptureOpen(false)}
                          className="text-xs text-zinc-500 hover:text-zinc-300"
                        >
                          Hide
                        </button>
                      </div>
                      <div className="mt-3 max-h-40 overflow-y-auto rounded-[1rem] border border-white/8 bg-[#171c29] px-4 py-3 text-sm leading-6 text-zinc-300">
                        {liveTranscript || "Your transcript preview will appear here while recording."}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)]">
                <div className="study-premium-panel rounded-[1.45rem] border border-white/8 bg-[rgba(25,29,42,0.92)] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-4">
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: "note", label: "Writing" },
                        { id: "structured", label: "Study view" },
                        { id: "transcript", label: "Transcript" },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as NotesTab)}
                          className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                            activeTab === tab.id
                              ? "bg-white text-zinc-900"
                              : "border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Clock3 className="h-3.5 w-3.5" />
                      Edited {new Date(selectedNote.updatedAt).toLocaleString()}
                    </div>
                  </div>

                  {activeTab === "note" && (
                    <textarea
                      ref={editorRef}
                      value={selectedNote.rawContent}
                      onChange={(event) => updateNote(selectedNote.id, { rawContent: event.target.value, sourceType: "manual" })}
                      placeholder="Start with the main ideas from class. Paste rough notes, key points, or lecture takeaways here."
                      className="mt-4 min-h-[460px] w-full resize-none bg-transparent text-[15px] leading-8 text-zinc-100 outline-none placeholder:text-zinc-500"
                    />
                  )}

                  {activeTab === "structured" && (
                    <div className="mt-4 space-y-5">
                      {selectedNote.structuredContent ? (
                        <>
                          <div className="rounded-[1.2rem] border border-emerald-400/10 bg-emerald-500/[0.05] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200/80">Lecture summary</div>
                                <div className="mt-2 text-sm leading-7 text-zinc-200">{selectedNote.structuredContent.summary}</div>
                              </div>
                              <button
                                onClick={copySummary}
                                {...magneticHoverProps}
                                className="study-premium-button rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-zinc-100"
                              >
                                Copy summary
                              </button>
                            </div>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            {selectedNote.structuredContent.sections.map((section) => (
                              <div key={section.heading} className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                                <div className="text-sm font-semibold text-white">{section.heading}</div>
                                <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                                  {section.items.length ? (
                                    section.items.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-red-400" /><span>{item}</span></li>)
                                  ) : (
                                    <li className="text-zinc-500">Nothing extracted yet.</li>
                                  )}
                                </ul>
                              </div>
                            ))}
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                              <div className="text-sm font-semibold text-white">Key terms</div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {selectedNote.structuredContent.keyTerms.length ? selectedNote.structuredContent.keyTerms.map((term) => (
                                  <span key={term} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200">
                                    {term}
                                  </span>
                                )) : <span className="text-sm text-zinc-500">No key terms yet.</span>}
                              </div>
                            </div>
                            <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                              <div className="text-sm font-semibold text-white">Questions to review</div>
                              <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                                {selectedNote.structuredContent.questionsToReview.length ? selectedNote.structuredContent.questionsToReview.map((item) => (
                                  <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-400" /><span>{item}</span></li>
                                )) : <li className="text-zinc-500">No review questions yet.</li>}
                              </ul>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-[1.2rem] border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-sm leading-6 text-zinc-400">
                          Structured notes will appear here after a lecture recording or AI action like summarize or review sheet.
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "transcript" && (
                    <div className="mt-4 rounded-[1.2rem] border border-white/8 bg-[#171c29] px-5 py-4 text-sm leading-7 text-zinc-300">
                      {selectedNote.transcriptContent || "Transcript stays secondary by design. Record a lecture to store it here."}
                    </div>
                  )}
                </div>

                {isFocusedNoteView && (actionResult || generatedFlashcards) ? <div className="space-y-4">
                  {(actionResult || generatedFlashcards) && (
                    <div className="study-premium-panel rounded-[1.2rem] border border-white/8 bg-[rgba(25,29,42,0.92)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">Latest result</div>
                        <button onClick={() => { setActionResult(null); setGeneratedFlashcards(null); }} className="text-xs text-zinc-500 hover:text-zinc-300">
                          Clear
                        </button>
                      </div>
                      <div className="mt-3 space-y-3 text-sm leading-6 text-zinc-300">
                        {actionResult?.summary ? <p>{actionResult.summary}</p> : null}
                        {actionResult?.explanation ? <p>{actionResult.explanation}</p> : null}
                        {actionResult?.keyTerms?.length ? (
                          <div className="flex flex-wrap gap-2">
                            {actionResult.keyTerms.map((term) => (
                              <span key={term} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200">
                                {term}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {generatedFlashcards ? (
                          <>
                            <div className="text-sm font-semibold text-white">{generatedFlashcards.setTitle}</div>
                            <div className="space-y-2">
                              {generatedFlashcards.cards.slice(0, 3).map((card, index) => (
                                <div key={`${card.front}-${index}`} className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-3">
                                  <div className="text-xs uppercase tracking-[0.15em] text-zinc-500">Card {index + 1}</div>
                                  <div className="mt-1 text-sm font-medium text-white">{card.front}</div>
                                  <div className="mt-1 text-sm text-zinc-300">{card.back}</div>
                                </div>
                              ))}
                            </div>
                            <button
                              onClick={saveGeneratedFlashcards}
                              {...magneticHoverProps}
                              className="study-premium-button mt-2 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900"
                            >
                              <BookPlus className="h-4 w-4" />
                              Save to flashcards
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div> : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
