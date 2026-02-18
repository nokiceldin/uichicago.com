"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeProfName } from "@/app/lib/name";

function formatCourseLabel(s: string) {
  const t = s.trim();

  const m = t.match(/^([A-Z&]+)\s+(\d+[A-Z]?)\b/i);
  if (m) return `${m[1].toUpperCase()} ${m[2].toUpperCase()}`;

  const pipeParts = t.split("|").map((x) => x.trim());
  if (pipeParts.length >= 2) return `${pipeParts[0]} ${pipeParts[1]}`;

  return t;
}

function tokens(name: string) {
  return normalizeProfName(name)
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length > 1); // remove single-letter initials
}

function overlapCount(a: string[], b: string[]) {
  const setB = new Set(b);
  let count = 0;
  for (const x of a) if (setB.has(x)) count++;
  return count;
}

const NICK: Record<string, string[]> = {
  // A
  alex: ["alexandra", "alexander"],
  al: ["alan", "allen", "albert", "alfred"],
  ally: ["allison", "alison"],
  andy: ["andrew"],
  annie: ["anne", "anna"],
  art: ["arthur"],

  // B
  ben: ["benjamin", "bennett"],
  beth: ["elizabeth", "bethany"],
  bill: ["william"],
  billy: ["william"],
  bob: ["robert"],
  bobby: ["robert"],
  brad: ["bradley"],
  brian: ["bryan"],

  // C
  cam: ["cameron"],
  cate: ["catherine", "katherine"],
  cathy: ["catherine", "katherine"],
  charlie: ["charles"],
  chris: ["christopher", "christina", "christine"],
  chuck: ["charles"],
  cindy: ["cynthia"],
  claire: ["clarissa"],

  // D
  dan: ["daniel"],
  danny: ["daniel"],
  dave: ["david"],
  davy: ["david"],
  deb: ["deborah"],
  debbie: ["deborah"],
  don: ["donald"],
  donny: ["donald"],
  drew: ["andrew"],
  dylan: ["dillon"],

  // E
  ed: ["edward", "edwin"],
  eddie: ["edward"],
  eli: ["elijah"],
  ellie: ["elizabeth", "eleanor"],
  em: ["emily", "emma"],
  eric: ["erik"],

  // F
  frank: ["francis", "franklin"],
  freddie: ["frederick"],

  // G
  gabe: ["gabriel"],
  gary: ["gerald"],
  gen: ["jennifer"],
  geoff: ["geoffrey"],
  george: ["georgios"],

  // H
  hank: ["henry"],
  harry: ["harold", "henry"],
  heidi: ["adelheid"],

  // J
  jack: ["john", "jackson"],
  jake: ["jacob"],
  james: ["jim"],
  jan: ["janet"],
  janey: ["jane"],
  jay: ["jason"],
  jean: ["jeanne"],
  jeff: ["jeffrey"],
  jen: ["jennifer"],
  jenny: ["jennifer"],
  jess: ["jessica"],
  jessie: ["jessica"],
  jim: ["james"],
  jimmy: ["james"],
  joe: ["joseph"],
  joey: ["joseph"],
  johnny: ["john"],
  jon: ["jonathan"],
  jonny: ["jonathan"],
  josh: ["joshua"],
  judy: ["judith"],
  julie: ["julia"],
  justin: ["justine"],

  // K
  kate: ["katherine", "catherine", "kathryn"],
  katie: ["katherine", "catherine", "kathryn"],
  kathy: ["katherine", "catherine"],
  ken: ["kenneth"],
  kenny: ["kenneth"],
  kim: ["kimberly"],
  kris: ["kristopher", "kristen"],

  // L
  larry: ["lawrence"],
  leo: ["leonard"],
  liz: ["elizabeth"],
  lizzy: ["elizabeth"],
  lou: ["louis"],
  lucy: ["lucille"],
  luke: ["lucas"],

  // M
  maggie: ["margaret"],
  mandy: ["amanda"],
  marc: ["mark"],
  margie: ["margaret"],
  mary: ["marie"],
  matt: ["matthew"],
  mikey: ["michael"],
  mike: ["michael"],
  molly: ["mary"],
  monica: ["monique"],

  // N
  nate: ["nathan", "nathaniel"],
  nick: ["nicholas"],
  nicky: ["nicholas"],

  // P
  pat: ["patrick", "patricia"],
  pete: ["peter"],
  phil: ["philip", "phillip"],

  // R
  randy: ["randall"],
  ray: ["raymond"],
  rebecca: ["becky"],
  rick: ["richard"],
  ricky: ["richard"],
  rob: ["robert"],
  robbie: ["robert"],
  ron: ["ronald"],
  ronnie: ["ronald"],
  russ: ["russell"],

  // S
  sam: ["samuel", "samantha"],
  sandy: ["alexandra"],
  steve: ["steven", "stephen"],
  stevie: ["steven"],
  sue: ["susan"],
  susie: ["susan"],

  // T
  ted: ["theodore"],
  terry: ["terence", "theresa"],
  tim: ["timothy"],
  tom: ["thomas"],
  tommy: ["thomas"],
  tony: ["anthony"],
  trish: ["patricia"],

  // V
  vicky: ["victoria"],
  vinny: ["vincent"],

  // W
  will: ["william"],
  willy: ["william"],
};


function expandToken(t: string) {
  return [t, ...(NICK[t] ?? [])];
}

function firstNameMatches(aFirst: string, bFirst: string) {
  if (aFirst === bFirst) return true;

  const aExpanded = expandToken(aFirst);
  const bExpanded = expandToken(bFirst);

  return aExpanded.includes(bFirst) || bExpanded.includes(aFirst);
}


function getCoursesFuzzy(
  map: Record<string, string[]>,
  profName: string
) {
  const exact = map[normalizeProfName(profName)];
  if (exact) return exact;

  const a = tokens(profName);
  if (a.length < 2) return [];

  const first = a[0];

  let bestKey = "";
  let bestScore = 0;

  for (const key of Object.keys(map)) {
    const b = tokens(key);
    if (b.length < 2) continue;

    // require same first name
    // allow nickname matching on first name
if (!firstNameMatches(first, b[0])) continue;


    const common = overlapCount(a, b);

    // require at least 2 overlapping tokens
    if (common >= 2 && common > bestScore) {
      bestScore = common;
      bestKey = key;
    }
  }

  return bestKey ? map[bestKey] : [];
}


export function ClassesCell({
  profName,
  map,
  onPickCourse,
}: {
  profName: string;
  map: Record<string, string[]>;
  onPickCourse?: (courseLabel: string) => void;

  
}) {
const coursesRaw = getCoursesFuzzy(map, profName);


  const courses = useMemo(() => {
    // format labels and remove duplicates
    const labels = coursesRaw.map(formatCourseLabel);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of labels) {
      const k = x.trim().toUpperCase();
      if (!k) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(x);
    }
    return out;
  }, [coursesRaw]);

  const firstThree = courses.slice(0, 3);
  const rest = courses.slice(3);
  const extra = rest.length;

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const chipBase =
    "inline-flex items-center rounded-full px-3 py-1 text-[11.5px] font-semibold ring-1 transition";
  const chipStatic =
    "bg-white/50 text-zinc-800 ring-white/10 dark:bg-white/5 dark:text-zinc-100";
  const chipClickable =
    "hover:bg-white/70 dark:hover:bg-white/10";
  const chipBorder =
    "ring-zinc-200 dark:ring-zinc-700";

  if (courses.length === 0) {
    return <div className="text-xs text-zinc-500 dark:text-zinc-400">No data</div>;
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex flex-wrap items-center gap-2 justify-start">
        {firstThree.map((label) => {
          const clickable = Boolean(onPickCourse);
          return (
            <button
              key={label}
              type="button"
              onClick={() => clickable && onPickCourse?.(label)}
              className={[
                chipBase,
                chipStatic,
                chipBorder,
                clickable ? chipClickable : "",
              ].join(" ")}
              title={clickable ? `Filter by ${label}` : label}
            >
              {label}
            </button>
          );
        })}

        {extra > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={[
              chipBase,
              "bg-white/40 text-zinc-700 ring-zinc-200 hover:bg-white/60",
              "dark:bg-white/5 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-white/10",
            ].join(" ")}
            aria-expanded={open}
            aria-haspopup="menu"
            title="Show more classes"
          >
            +{extra}
          </button>
        )}
      </div>

      {open && extra > 0 && (
        <div
          className="absolute left-0 top-[calc(100%+10px)] z-20 w-[260px] rounded-2xl border border-white/10 bg-white/90 p-2 shadow-xl backdrop-blur dark:bg-zinc-950/80"
          role="menu"
        >
          <div className="px-2 py-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
            More classes
          </div>

          <div className="max-h-56 overflow-auto px-1 pb-1">
            {rest.map((label) => {
              const clickable = Boolean(onPickCourse);
              return (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (clickable) onPickCourse?.(label);
                    setOpen(false);
                  }}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/10"
                  title={clickable ? `Filter by ${label}` : label}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
