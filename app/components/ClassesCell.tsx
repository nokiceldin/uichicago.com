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
    .filter((t) => t.length > 1);
}

function overlapCount(a: string[], b: string[]) {
  const setB = new Set(b);
  let count = 0;
  for (const x of a) {
    if (setB.has(x)) count++;
  }
  return count;
}

const NICK: Record<string, string[]> = {
  alex: ["alexandra", "alexander"],
  alexandra: ["alex", "sandy"],
  alexander: ["alex"],
  al: ["alan", "allen", "albert", "alfred"],
  ally: ["allison", "alison"],
  allison: ["ally"],
  alison: ["ally"],
  andy: ["andrew"],
  andrew: ["andy", "drew"],
  annie: ["anne", "anna"],
  anne: ["annie"],
  anna: ["annie"],
  art: ["arthur"],
  arthur: ["art"],

  ben: ["benjamin", "bennett"],
  benjamin: ["ben"],
  bennett: ["ben"],
  beth: ["elizabeth", "bethany"],
  bethany: ["beth"],
  bill: ["william"],
  billy: ["william"],
  bob: ["robert"],
  bobby: ["robert"],
  brad: ["bradley"],
  bradley: ["brad"],
  brian: ["bryan"],
  bryan: ["brian"],

  cam: ["cameron"],
  cameron: ["cam"],
  cate: ["catherine", "katherine", "kathryn"],
  cathy: ["catherine", "katherine", "kathryn"],
  charlie: ["charles"],
  charles: ["charlie", "chuck"],
  chris: ["christopher", "christina", "christine"],
  christopher: ["chris"],
  christina: ["chris"],
  christine: ["chris"],
  chuck: ["charles"],
  cindy: ["cynthia"],
  cynthia: ["cindy"],
  claire: ["clarissa"],
  clarissa: ["claire"],

  dan: ["daniel"],
  danny: ["daniel"],
  daniel: ["dan", "danny"],
  dave: ["david"],
  davy: ["david"],
  david: ["dave", "davy"],
  deb: ["deborah"],
  debbie: ["deborah"],
  deborah: ["deb", "debbie"],
  don: ["donald"],
  donny: ["donald"],
  donald: ["don", "donny"],
  drew: ["andrew"],
  dylan: ["dillon"],
  dillon: ["dylan"],

  ed: ["edward", "edwin"],
  eddie: ["edward"],
  edward: ["ed", "eddie"],
  edwin: ["ed"],
  eli: ["elijah"],
  elijah: ["eli"],
  ellie: ["elizabeth", "eleanor"],
  elizabeth: ["beth", "ellie", "liz", "lizzy"],
  eleanor: ["ellie"],
  em: ["emily", "emma"],
  emily: ["em"],
  emma: ["em"],
  eric: ["erik"],
  erik: ["eric"],

  frank: ["francis", "franklin"],
  francis: ["frank"],
  franklin: ["frank"],
  freddie: ["frederick"],
  frederick: ["freddie"],

  gabe: ["gabriel"],
  gabriel: ["gabe"],
  gary: ["gerald"],
  gerald: ["gary"],
  gen: ["jennifer"],
  geoff: ["geoffrey"],
  geoffrey: ["geoff"],
  george: ["georgios"],
  georgios: ["george"],

  hank: ["henry"],
  harry: ["harold", "henry"],
  harold: ["harry"],
  henry: ["hank", "harry"],
  heidi: ["adelheid"],
  adelheid: ["heidi"],

  jack: ["john", "jackson"],
  jackson: ["jack"],
  jake: ["jacob"],
  jacob: ["jake"],
  james: ["jim", "jimmy"],
  jim: ["james", "jimmy"],
  jimmy: ["james", "jim"],
  jan: ["janet"],
  janet: ["jan"],
  janey: ["jane"],
  jane: ["janey"],
  jay: ["jason"],
  jason: ["jay"],
  jean: ["jeanne"],
  jeanne: ["jean"],
  jeff: ["jeffrey"],
  jeffrey: ["jeff"],
  jen: ["jennifer"],
  jennifer: ["jen", "jenny", "gen"],
  jenny: ["jennifer"],
  jess: ["jessica"],
  jessie: ["jessica"],
  jessica: ["jess", "jessie"],
  joe: ["joseph"],
  joey: ["joseph"],
  joseph: ["joe", "joey"],
  john: ["jack", "johnny"],
  johnny: ["john"],
  jon: ["jonathan"],
  jonathan: ["jon", "jonny"],
  jonny: ["jonathan"],
  josh: ["joshua"],
  joshua: ["josh"],
  judy: ["judith"],
  judith: ["judy"],
  julie: ["julia"],
  julia: ["julie"],
  justin: ["justine"],
  justine: ["justin"],

  kate: ["katherine", "catherine", "kathryn"],
  katie: ["katherine", "catherine", "kathryn"],
  kathy: ["katherine", "catherine", "kathryn"],
  katherine: ["kate", "katie", "kathy", "cate", "cathy"],
  catherine: ["kate", "katie", "kathy", "cate", "cathy"],
  kathryn: ["kate", "katie", "kathy", "cate", "cathy"],
  ken: ["kenneth"],
  kenny: ["kenneth"],
  kenneth: ["ken", "kenny"],
  kim: ["kimberly"],
  kimberly: ["kim"],
  kris: ["kristopher", "kristen"],
  kristopher: ["kris"],
  kristen: ["kris"],

  larry: ["lawrence"],
  lawrence: ["larry"],
  leo: ["leonard"],
  leonard: ["leo"],
  liz: ["elizabeth"],
  lizzy: ["elizabeth"],
  lou: ["louis"],
  louis: ["lou"],
  lucy: ["lucille"],
  lucille: ["lucy"],
  luke: ["lucas"],
  lucas: ["luke"],

  maggie: ["margaret"],
  margaret: ["maggie", "margie"],
  mandy: ["amanda"],
  amanda: ["mandy"],
  marc: ["mark"],
  mark: ["marc"],
  margie: ["margaret"],
  mary: ["marie"],
  marie: ["mary"],
  matt: ["matthew"],
  matthew: ["matt"],
  mikey: ["michael"],
  mike: ["michael"],
  michael: ["mike", "mikey"],
  molly: ["mary"],
  monica: ["monique"],
  monique: ["monica"],

  nate: ["nathan", "nathaniel"],
  nathan: ["nate"],
  nathaniel: ["nate"],
  nick: ["nicholas"],
  nicky: ["nicholas"],
  nicholas: ["nick", "nicky"],

  pat: ["patrick", "patricia"],
  patrick: ["pat"],
  patricia: ["pat", "trish"],
  pete: ["peter"],
  peter: ["pete"],
  phil: ["philip", "phillip"],
  philip: ["phil"],
  phillip: ["phil"],

  randy: ["randall"],
  randall: ["randy"],
  ray: ["raymond"],
  raymond: ["ray"],
  rebecca: ["becky"],
  becky: ["rebecca"],
  rick: ["richard"],
  ricky: ["richard"],
  richard: ["rick", "ricky"],
  rob: ["robert", "bob", "bobby", "robbie"],
  robbie: ["robert", "rob"],
  robert: ["bob", "bobby", "rob", "robbie"],
  ron: ["ronald"],
  ronnie: ["ronald"],
  ronald: ["ron", "ronnie"],
  russ: ["russell"],
  russell: ["russ"],

  sam: ["samuel", "samantha"],
  samuel: ["sam"],
  samantha: ["sam"],
  sandy: ["alexandra"],
  steve: ["steven", "stephen"],
  stevie: ["steven", "stephen"],
  steven: ["steve", "stevie"],
  stephen: ["steve", "stevie"],
  sue: ["susan"],
  susie: ["susan"],
  susan: ["sue", "susie"],

  ted: ["theodore"],
  theodore: ["ted"],
  terry: ["terence", "theresa"],
  terence: ["terry"],
  theresa: ["terry"],
  tim: ["timothy"],
  timothy: ["tim"],
  tom: ["thomas", "tomas", "tommy"],
  tommy: ["thomas", "tomas", "tom"],
  thomas: ["tom", "tommy", "tomas"],
  tomas: ["tom", "tommy", "thomas"],
  tony: ["anthony"],
  anthony: ["tony"],
  trish: ["patricia"],

  vicky: ["victoria"],
  victoria: ["vicky"],
  vinny: ["vincent"],
  vincent: ["vinny"],

  will: ["william"],
  willy: ["william"],
  william: ["bill", "billy", "will", "willy"],
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

function getCoursesFuzzy(map: Record<string, string[]>, profName: string) {
  const exact = map[normalizeProfName(profName)];
  if (exact) return exact;

  const a = tokens(profName);
  if (a.length < 2) return [];

  const aFirst = a[0];
  const aLast = a[a.length - 1];
  const aMiddle = a.slice(1, -1);

  let bestKey = "";
  let bestScore = -1;

  for (const key of Object.keys(map)) {
    const b = tokens(key);
    if (b.length < 2) continue;

    const bFirst = b[0];
    const bLast = b[b.length - 1];
    const bMiddle = b.slice(1, -1);

    if (aLast !== bLast) continue;
    if (!firstNameMatches(aFirst, bFirst)) continue;

    const middleOverlap = overlapCount(aMiddle, bMiddle);

    const score = 100 + middleOverlap;

    if (score > bestScore) {
      bestScore = score;
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

  const firstThree = courses.slice(0, 2);
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
    return (
      <div className="text-xs text-zinc-500 dark:text-zinc-400">
        No data
      </div>
    );
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