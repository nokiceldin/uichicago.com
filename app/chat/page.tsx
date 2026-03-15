"use client";
import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
const BETA_PASSWORD = "uicsparky2026";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  streaming?: boolean;
}

interface TopicGroup {
  id: string;
  label: string;
  color: string;
  activeColor: string;
  borderColor: string;
  textColor: string;
  chipActive: string;
  items: string[];
}

// ─── Topic Data ───────────────────────────────────────────────────────────────

const TOPICS: TopicGroup[] = [
  {
    id: "courses",
    label: "📚 Courses",
    color: "violet",
    activeColor: "bg-violet-600",
    borderColor: "border-violet-500/30",
    textColor: "text-violet-300",
    chipActive: "bg-violet-600 border-violet-600 text-white",
    items: [
      "Make me a full 4-year CS plan",
      "What CS courses have the highest average GPA?",
      "Easiest Gen Ed for the natural world requirement?",
      "What are the prerequisites for CS 251?",
      "Hardest courses at UIC by GPA?",
      "Best electives for a CS major?",
    ],
  },
  {
    id: "professors",
    label: "🎓 Professors",
    color: "amber",
    activeColor: "bg-amber-600",
    borderColor: "border-amber-500/30",
    textColor: "text-amber-300",
    chipActive: "bg-amber-600 border-amber-600 text-white",
    items: [
      "Who gives the best grades in MATH 180?",
      "Best rated CS professors at UIC?",
      "Easiest professor for CHEM 122?",
      "Which professors give the most As in calculus?",
      "Best biology professors at UIC?",
      "Who teaches CS 211 and how are they?",
    ],
  },
  {
    id: "costs",
    label: "💰 Costs",
    color: "emerald",
    activeColor: "bg-emerald-600",
    borderColor: "border-emerald-500/30",
    textColor: "text-emerald-300",
    chipActive: "bg-emerald-600 border-emerald-600 text-white",
    items: [
      "How much is UIC tuition in-state?",
      "Do I qualify for the Aspire Grant?",
      "When is my fall tuition bill due?",
      "What scholarships can I apply for?",
      "How does UIC compare to UIUC in cost?",
      "What is the Aspire Grant and who qualifies?",
    ],
  },
  {
    id: "housing",
    label: "🏠 Housing",
    color: "sky",
    activeColor: "bg-sky-600",
    borderColor: "border-sky-500/30",
    textColor: "text-sky-300",
    chipActive: "bg-sky-600 border-sky-600 text-white",
    items: [
      "Best dorm for a freshman engineering student?",
      "Should I live on campus or off campus?",
      "Which dorms don't require a meal plan?",
      "Cheapest housing options at UIC?",
      "What LLCs are available in JST?",
      "What's the difference between ARC and JST?",
    ],
  },
  {
    id: "campus_life",
    label: "🎉 Campus Life",
    color: "pink",
    activeColor: "bg-pink-600",
    borderColor: "border-pink-500/30",
    textColor: "text-pink-300",
    chipActive: "bg-pink-600 border-pink-600 text-white",
    items: [
      "What frats and sororities are at UIC?",
      "How does Greek rush work at UIC?",
      "Best clubs for pre-med students?",
      "What is the Spark Festival?",
      "What is the Involvement Fair?",
      "Best student orgs for CS majors?",
    ],
  },
  {
    id: "dining",
    label: "🍔 Dining",
    color: "orange",
    activeColor: "bg-orange-600",
    borderColor: "border-orange-500/30",
    textColor: "text-orange-300",
    chipActive: "bg-orange-600 border-orange-600 text-white",
    items: [
      "What dining options are open late?",
      "Is there 24-hour food on campus?",
      "Which meal plan is best for freshmen?",
      "Where is the cheapest food near UIC?",
      "What halal food options are on campus?",
      "What are the hours for 605 Commons?",
    ],
  },
  {
    id: "athletics",
    label: "🔥 Athletics",
    color: "red",
    activeColor: "bg-red-600",
    borderColor: "border-red-500/30",
    textColor: "text-red-300",
    chipActive: "bg-red-600 border-red-600 text-white",
    items: [
      "Did UIC win their last basketball game?",
      "How do I get free student tickets?",
      "What conference is UIC in?",
      "Where is the basketball arena?",
      "What is the Flames Fast Pass?",
      "What's the UIC basketball Instagram?",
    ],
  },
  {
    id: "campus",
    label: "🗺️ Campus",
    color: "indigo",
    activeColor: "bg-indigo-600",
    borderColor: "border-indigo-500/30",
    textColor: "text-indigo-300",
    chipActive: "bg-indigo-600 border-indigo-600 text-white",
    items: [
      "Which CTA line goes to UIC?",
      "Where is the MSLC tutoring center?",
      "How does Night Ride work?",
      "Where is the Financial Aid office?",
      "How do I get from east to west campus?",
      "Where can I print on campus?",
    ],
  },
  {
    id: "health",
    label: "🏥 Health",
    color: "teal",
    activeColor: "bg-teal-600",
    borderColor: "border-teal-500/30",
    textColor: "text-teal-300",
    chipActive: "bg-teal-600 border-teal-600 text-white",
    items: [
      "How do I waive CampusCare insurance?",
      "Is counseling free at UIC?",
      "Where is the health clinic?",
      "How do I get disability accommodations?",
      "What immunizations do I need?",
      "Where is the campus pharmacy?",
    ],
  },
  {
    id: "registration",
    label: "📅 Registration",
    color: "lime",
    activeColor: "bg-lime-600",
    borderColor: "border-lime-500/30",
    textColor: "text-lime-300",
    chipActive: "bg-lime-600 border-lime-600 text-white",
    items: [
      "When does spring registration open?",
      "What is a registration time ticket?",
      "How do I add or drop a class?",
      "What is the last day to withdraw?",
      "How does the waitlist work at UIC?",
      "How do I handle a prerequisite override?",
    ],
  },
  {
    id: "admissions",
    label: "📝 Admissions",
    color: "blue",
    activeColor: "bg-blue-600",
    borderColor: "border-blue-500/30",
    textColor: "text-blue-300",
    chipActive: "bg-blue-600 border-blue-600 text-white",
    items: [
      "What is the UIC application deadline?",
      "Does UIC require SAT or ACT?",
      "What is the transfer GPA requirement?",
      "What is the Guaranteed Admission Transfer?",
      "What happens after I'm accepted?",
      "When does housing open for admitted students?",
    ],
  },
  {
    id: "careers",
    label: "💼 Careers",
    color: "cyan",
    activeColor: "bg-cyan-600",
    borderColor: "border-cyan-500/30",
    textColor: "text-cyan-300",
    chipActive: "bg-cyan-600 border-cyan-600 text-white",
    items: [
      "When are the UIC career fairs?",
      "How do I find internships as a UIC student?",
      "Where is the Career Services office?",
      "Can F-1 students work on campus?",
      "How do I get a graduate assistantship?",
      "How does Handshake work at UIC?",
    ],
  },
  {
    id: "international",
    label: "🌍 International",
    color: "purple",
    activeColor: "bg-purple-600",
    borderColor: "border-purple-500/30",
    textColor: "text-purple-300",
    chipActive: "bg-purple-600 border-purple-600 text-white",
    items: [
      "What do I need to do as a new F-1 student?",
      "How does CPT work at UIC?",
      "What is OPT and when can I apply?",
      "Do I need to check in with OIS?",
      "Can I work on campus as an F-1 student?",
      "How do I get a travel signature?",
    ],
  },
  {
    id: "safety",
    label: "🛡️ Safety",
    color: "rose",
    activeColor: "bg-rose-600",
    borderColor: "border-rose-500/30",
    textColor: "text-rose-300",
    chipActive: "bg-rose-600 border-rose-600 text-white",
    items: [
      "How does the safety escort work?",
      "What is the UIC Safe app?",
      "How do I report a bias incident?",
      "Who do I contact for a campus emergency?",
      "Are student legal services free?",
      "What is Title IX at UIC?",
    ],
  },
];

const FEATURED_PROMPTS = [
  "Make me a full 4-year CS plan",
  "Best professor for MATH 180?",
  "Should I live on campus or off campus?",
  "Do I qualify for the Aspire Grant?",
  "Easiest Gen Eds for a GPA boost?",
  "How do free student tickets work?",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function formatContent(text: string): string {
  // Headers
  let html = text.replace(/^### (.+)$/gm, "<h3 class='text-white font-bold text-base mt-4 mb-1.5'>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2 class='text-white font-bold text-[17px] mt-5 mb-2'>$1</h2>");
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong class='text-white font-semibold'>$1</strong>");
  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code class='bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded text-[13px] font-mono'>$1</code>");
  // Bullet lists
  html = html.replace(/^[•\-\*] (.+)$/gm, "<li class='flex gap-2 items-start'><span class='text-zinc-500 mt-0.5 shrink-0'>•</span><span>$1</span></li>");
  // Numbered lists
  html = html.replace(/^(\d+)\. (.+)$/gm, "<li class='flex gap-2.5 items-start'><span class='text-zinc-500 font-mono text-xs mt-1 shrink-0 w-4'>$1.</span><span>$2</span></li>");
  // Wrap consecutive <li> items - use split approach for compatibility
  const liBlockRegex = /<li[^>]*>[\s\S]*?<\/li>/g;
  const liBlocks = html.match(liBlockRegex);
  if (liBlocks) {
    html = html.replace(/<li/, "<ul class='space-y-1.5 my-2'><li");
    html = html.replace(/(<\/li>)(?!\s*<li)/, "$1</ul>");
  }
  // Paragraphs
  html = html.replace(/\n\n/g, "</p><p class='mt-3'>");
  html = html.replace(/\n/g, "<br/>");
  return html;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SparkyAvatar({ size = "sm" }: { size?: "sm" | "lg" }) {
  const dim = size === "lg" ? "w-16 h-16" : "w-7 h-7";
  return (
    <div className={`relative ${dim} shrink-0`}>
      {size === "lg" && (
        <div className="absolute inset-0 rounded-full bg-red-600/20 blur-xl scale-150" />
      )}
      <img
        src="/sparky-icon.png"
        alt="Sparky"
        className={`relative ${dim} object-contain drop-shadow-lg`}
      />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 items-start">
      <SparkyAvatar size="sm" />
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3.5 flex items-center gap-1">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-zinc-400 rounded-full"
            style={{
              animation: `dotPulse 1.4s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end gap-2.5 items-end">
        <div className="max-w-[72%] md:max-w-[60%] bg-zinc-800 border border-zinc-700/60 text-zinc-100 rounded-2xl rounded-br-sm px-4 py-3 text-[14.5px] leading-relaxed">
          {msg.content}
        </div>
        <div className="w-7 h-7 rounded-full bg-zinc-700 border border-zinc-600 flex items-center justify-center shrink-0 mb-0.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-300">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 items-start">
      <SparkyAvatar size="sm" />
      <div className={`flex-1 min-w-0 max-w-[85%] md:max-w-[78%] ${msg.error ? "opacity-60" : ""}`}>
        <div className="text-[14.5px] leading-relaxed text-zinc-200 prose-sparky">
          {msg.streaming ? (
            // Target node for direct DOM writes — React never touches this during streaming
            <div
              data-stream-id={msg.id}
              className="whitespace-pre-wrap"
            />
          ) : (
            <div
              className="space-y-1"
              dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
            />
          )}
        </div>
        {msg.error && (
          <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
            </svg>
            Failed to get response
          </p>
        )}
      </div>
    </div>
  );
}

function ChatInput({
  value,
  onChange,
  onSend,
  onKeyDown,
  loading,
  inputRef,
  variant = "floating",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  loading: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  variant?: "floating" | "fixed";
}) {
  const isFloating = variant === "floating";

  return (
    <div
      className={`relative bg-zinc-900 border transition-all duration-200 ${
        isFloating
          ? "border-zinc-700/60 hover:border-zinc-600 focus-within:border-zinc-500 rounded-2xl shadow-xl"
          : "border-zinc-800 hover:border-zinc-700 focus-within:border-zinc-600 rounded-2xl"
      }`}
    >
      <textarea
        ref={inputRef}
        value={value}
        disabled={loading}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
          onChange(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px";
        }}
        onKeyDown={onKeyDown}
        placeholder="Ask Sparky anything about UIC..."
        rows={1}
        className="w-full bg-transparent text-white placeholder-zinc-500 outline-none resize-none text-[15px] leading-relaxed px-5 pt-[14px] pb-[52px] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ maxHeight: "180px" }}
      />
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 pb-3">
        <span className="text-[11px] text-zinc-600 select-none">
          {loading ? (
            <span className="text-zinc-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-pulse" />
              Sparky is thinking...
            </span>
          ) : (
            "Enter to send · Shift+Enter for new line"
          )}
        </span>
        <button
          onClick={() => onSend()}
          disabled={!value.trim() || loading}
          className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150 ${
            value.trim() && !loading
              ? "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/40"
              : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
          }`}
        >
          {loading ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

function TopicChip({
  topic,
  active,
  onClick,
}: {
  topic: TopicGroup;
  active: boolean;
  onClick: () => void;
  key?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3.5 py-1.5 rounded-full border text-[12.5px] font-medium transition-all duration-150 ${
        active
          ? topic.chipActive
          : `bg-zinc-900/80 border-zinc-700/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500`
      }`}
    >
      {topic.label}
    </button>
  );
}

function PromptCard({
  text,
  onClick,
  delay,
}: {
  text: string;
  onClick: () => void;
  delay: number;
  key?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className="prompt-card group w-full text-left px-4 py-3 rounded-xl border bg-zinc-900/60 border-zinc-700/40 text-zinc-300 hover:bg-zinc-800/80 hover:border-zinc-600 hover:text-white transition-all duration-150 hover:scale-[1.02] active:scale-[0.99] text-[13.5px] font-medium leading-snug flex items-start gap-2.5"
    >
      <span className="flex-1">{text}</span>
      <svg
        className="w-3.5 h-3.5 mt-0.5 opacity-30 group-hover:opacity-50 shrink-0 transition-opacity"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
      </svg>
    </button>
  );
}

function EmptyState({
  activeTopic,
  setActiveTopic,
  onSend,
  input,
  onInputChange,
  onKeyDown,
  loading,
  inputRef,
}: {
  activeTopic: number;
  setActiveTopic: (i: number) => void;
  onSend: () => void;
  input: string;
  onInputChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  loading: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const topic = TOPICS[activeTopic];

  return (
    <div
      className="flex flex-col items-center px-4 w-full"
      style={{ minHeight: "calc(100vh - 64px)", paddingTop: "15vh", paddingBottom: "40px" }}
    >
      {/* Identity */}
      <div className="flex flex-col items-center mb-8">
        <div className="sparky-float mb-5">
          <img src="/sparky-icon.png" alt="Sparky" className="w-24 h-24 object-contain drop-shadow-lg" />
        </div>
        <h1 className="text-[32px] font-black text-white tracking-tight leading-none mb-3">
          Hey, I&apos;m Sparky
        </h1>
        <p className="text-zinc-500 text-[14.5px] text-center max-w-sm leading-relaxed">
          Ask me anything about UIC — courses, professors, housing, costs, and more.
        </p>
      </div>

      {/* Input */}
      <div className="w-full max-w-2xl mb-6">
        <ChatInput
          value={input}
          onChange={onInputChange}
          onSend={onSend}
          onKeyDown={onKeyDown}
          loading={loading}
          inputRef={inputRef}
          variant="floating"
        />
      </div>

      {/* Topic tabs + prompt cards */}
      <div className="w-full max-w-2xl">
        {/* Scrollable topic chips — negative mx so fade mask reaches edge */}
        <div className="relative -mx-4">
<div className="hide-scroll flex gap-1.5 overflow-x-auto pb-4">  
  {TOPICS.map((t, i) => (
              <TopicChip
                key={t.id}
                topic={t}
                active={activeTopic === i}
                onClick={() => setActiveTopic(i)}
              />
            ))}
          </div>
        </div>

        {/* 2-col prompt grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {topic.items.slice(0, 4).map((item, i) => (
            <PromptCard
              key={item}
              text={item}
              onClick={() => {
                onInputChange(item);
                setTimeout(() => onSend(), 50);
              }}
              delay={i * 35}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ConversationView({
  messages,
  loading,
  bottomRef,
}: {
  messages: Message[];
  loading: boolean;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}) {
  const isStreaming = messages.some(m => m.streaming);
  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-6">
      <div className="space-y-6">
        {messages.map(msg => (
          <div key={msg.id} className="msg-appear">
            <MessageBubble msg={msg} />
          </div>
        ))}
        {loading && !isStreaming && <TypingIndicator />}
      </div>
      <div ref={bottomRef} className="h-4" />
    </div>
  );
}

function QuickSuggestBar({
  activeTopic,
  setActiveTopic,
  onSend,
  onInputChange,
}: {
  activeTopic: number;
  setActiveTopic: (i: number) => void;
  onSend: () => void;
  onInputChange: (v: string) => void;
}) {
  const topic = TOPICS[activeTopic];
  // Extract just the emoji from each label (first char)
  const topicEmojis = TOPICS.slice(0, 8).map(t => t.label.split(" ")[0]);

  return (
    <div className="border-t border-zinc-800/60 px-4 py-2 bg-[#080808]">
      <div className="max-w-3xl mx-auto hide-scroll flex items-center gap-2 overflow-x-auto">
        {/* Emoji topic icons */}
        <div className="flex gap-0.5 shrink-0">
          {TOPICS.slice(0, 8).map((t, i) => (
            <button
              key={t.id}
              onClick={() => setActiveTopic(i)}
              title={t.label}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-[16px] transition-all ${
                activeTopic === i ? "bg-zinc-700" : "hover:bg-zinc-800"
              }`}
            >
              {topicEmojis[i]}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-zinc-800 shrink-0" />
        {topic.items.slice(0, 4).map(item => (
          <button
            key={item}
            onClick={() => {
              onInputChange(item);
              setTimeout(() => onSend(), 50);
            }}
            className="shrink-0 text-[11.5px] text-zinc-500 hover:text-white bg-transparent hover:bg-zinc-800/80 border border-transparent hover:border-zinc-700 px-3 py-1 rounded-full transition-all whitespace-nowrap"
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function ChatContent() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTopic, setActiveTopic] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasSentInitial = useRef(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const isEmpty = messages.length === 0;

  // Handle ?q= param
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !hasSentInitial.current) {
      hasSentInitial.current = true;
      handleSend(q);
    }
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  const handleSend = useCallback(async (textOverride?: string) => {
    const text = (typeof textOverride === "string" ? textOverride : input).trim();
    if (!text || loading) return;

    const userMsg: Message = { id: uid(), role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const assistantId = uid();
      setMessages((prev: Message[]) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", streaming: true },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      // Write directly to the DOM node — zero React re-renders during streaming
      const getDomNode = () =>
        document.querySelector(`[data-stream-id="${assistantId}"]`) as HTMLElement | null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const delta = decoder.decode(value, { stream: true });
accumulated += delta;
const node = getDomNode();
if (node) node.insertAdjacentText("beforeend", delta);
        if (node) node.textContent = accumulated;
      }

      // Stream done — hand off to React with full content so formatContent runs
      setMessages((prev: Message[]) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: accumulated, streaming: false } : m)
      );
    } catch {
      setMessages((prev: Message[]) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: "Something went wrong reaching Sparky. Please try again.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, messages, loading]);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handlePromptClick = useCallback((text: string) => {
    setInput(text);
    setTimeout(() => handleSend(text), 10);
  }, [handleSend]);

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sparkyFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
        @keyframes msgAppear {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dotPulse {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
          40%            { transform: scale(1.1); opacity: 1; }
        }
        @keyframes promptIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .sparky-float { animation: sparkyFloat 3.5s ease-in-out infinite; }
        .msg-appear   { animation: msgAppear 0.2s ease forwards; }
        .prompt-card  { animation: promptIn 0.25s ease both; }
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .prose-sparky h2 { color: white; font-weight: 700; font-size: 1.0625rem; margin-top: 1.25rem; margin-bottom: 0.5rem; }
        .prose-sparky h3 { color: white; font-weight: 600; font-size: 0.9375rem; margin-top: 1rem; margin-bottom: 0.375rem; }
        .prose-sparky strong { color: white; font-weight: 600; }
        .prose-sparky ul { margin: 0.5rem 0; padding: 0; list-style: none; }
        .prose-sparky li { display: flex; gap: 0.5rem; align-items: flex-start; line-height: 1.6; }
        .prose-sparky code { background: rgb(39 39 42); color: rgb(212 212 216); padding: 0.15rem 0.45rem; border-radius: 0.3rem; font-size: 0.8125rem; font-family: ui-monospace, monospace; }
        .prose-sparky p { margin-top: 0.75rem; }
        .prose-sparky p:first-child { margin-top: 0; }
      `}</style>

      <div
        className="flex flex-col bg-[#080808] text-white"
        style={{ height: "calc(100vh - 64px)", animation: "slideUp 0.25s ease forwards" }}
      >
        {/* Scrollable area */}
        <div ref={scrollAreaRef} className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <EmptyState
              activeTopic={activeTopic}
              setActiveTopic={setActiveTopic}
              onSend={handleSend}
              input={input}
              onInputChange={setInput}
              onKeyDown={handleKey}
              loading={loading}
              inputRef={inputRef}
            />
          ) : (
            <ConversationView
              messages={messages}
              loading={loading}
              bottomRef={bottomRef}
            />
          )}
        </div>

        {/* Bottom controls — only when chatting */}
        {!isEmpty && (
          <>
            <QuickSuggestBar
              activeTopic={activeTopic}
              setActiveTopic={setActiveTopic}
              onSend={handleSend}
              onInputChange={setInput}
            />
            <div className="bg-[#080808] px-4 pb-4 pt-2">
              <div className="max-w-3xl mx-auto">
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSend={handleSend}
                  onKeyDown={handleKey}
                  loading={loading}
                  inputRef={inputRef}
                  variant="fixed"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-[#080808] text-zinc-500 text-sm gap-2.5">
          <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
          Loading Sparky...
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}