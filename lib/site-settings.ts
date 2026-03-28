import type { AvatarSelectionPayload, SiteSettingsPayload, ThemeMode, ThemeSchedulePayload } from "@/lib/study/profile";

export const THEME_STORAGE_KEY = "uichicago_theme_settings";
export const SETTINGS_STORAGE_KEY = "uichicago_site_settings";

export const DEFAULT_THEME_MODE: ThemeMode = "auto";

export const DEFAULT_THEME_SCHEDULE: Required<ThemeSchedulePayload> = {
  darkStartHour: 19,
  lightStartHour: 7,
};

type PresetAvatarDefinition = {
  id: string;
  label: string;
  bg: string;
  accent: string;
  skin: string;
  mascot: "cat" | "owl" | "robot" | "bear" | "frog";
  accessory: "spark" | "book" | "glasses" | "cap" | "leaf";
};

export const PRESET_AVATARS = [
  { id: "flame-fox", label: "Cinder Cat", bg: "#f97316", accent: "#fb7185", skin: "#ffe1b3", mascot: "cat", accessory: "spark" },
  { id: "night-owl", label: "Night Owl", bg: "#4338ca", accent: "#38bdf8", skin: "#e8dcc9", mascot: "owl", accessory: "glasses" },
  { id: "pixel-bot", label: "Pixel Bot", bg: "#0f766e", accent: "#22c55e", skin: "#d7f9f1", mascot: "robot", accessory: "spark" },
  { id: "study-bear", label: "Study Bear", bg: "#92400e", accent: "#f59e0b", skin: "#f6d3a0", mascot: "bear", accessory: "book" },
  { id: "rocket-cat", label: "Rocket Cat", bg: "#be185d", accent: "#8b5cf6", skin: "#ffe3c8", mascot: "cat", accessory: "cap" },
  { id: "mint-frog", label: "Mint Frog", bg: "#059669", accent: "#2dd4bf", skin: "#d7ffd8", mascot: "frog", accessory: "leaf" },
  { id: "spark-tiger", label: "Campus Cat", bg: "#dc2626", accent: "#f59e0b", skin: "#ffe1b3", mascot: "cat", accessory: "book" },
  { id: "cosmic-whale", label: "Astro Owl", bg: "#1d4ed8", accent: "#a855f7", skin: "#f0e6d4", mascot: "owl", accessory: "spark" },
  { id: "campus-panda", label: "Slate Bot", bg: "#334155", accent: "#60a5fa", skin: "#dde7f5", mascot: "robot", accessory: "glasses" },
  { id: "sunny-chick", label: "Sunny Bear", bg: "#ca8a04", accent: "#fb7185", skin: "#ffe2a8", mascot: "bear", accessory: "cap" },
  { id: "berry-bear", label: "Berry Bear", bg: "#7c3aed", accent: "#f472b6", skin: "#f4d1c3", mascot: "bear", accessory: "spark" },
  { id: "cloud-cat", label: "Cloud Cat", bg: "#2563eb", accent: "#7dd3fc", skin: "#fff2e2", mascot: "cat", accessory: "glasses" },
  { id: "fern-frog", label: "Fern Frog", bg: "#15803d", accent: "#86efac", skin: "#d8ffce", mascot: "frog", accessory: "book" },
  { id: "pearl-owl", label: "Pearl Owl", bg: "#6d28d9", accent: "#c4b5fd", skin: "#efe5d2", mascot: "owl", accessory: "cap" },
  { id: "copper-bot", label: "Copper Bot", bg: "#b45309", accent: "#fbbf24", skin: "#fde68a", mascot: "robot", accessory: "leaf" },
  { id: "lagoon-cat", label: "Lagoon Cat", bg: "#0f766e", accent: "#67e8f9", skin: "#ffe0c4", mascot: "cat", accessory: "spark" },
  { id: "plum-bear", label: "Plum Bear", bg: "#7e22ce", accent: "#f0abfc", skin: "#f2d8c2", mascot: "bear", accessory: "book" },
  { id: "mocha-owl", label: "Mocha Owl", bg: "#78350f", accent: "#f59e0b", skin: "#ead9bf", mascot: "owl", accessory: "glasses" },
  { id: "mint-bot", label: "Mint Bot", bg: "#0d9488", accent: "#99f6e4", skin: "#d9fffa", mascot: "robot", accessory: "cap" },
  { id: "sunrise-frog", label: "Sunrise Frog", bg: "#ea580c", accent: "#fdba74", skin: "#dcfce7", mascot: "frog", accessory: "spark" },
  { id: "rose-cat", label: "Rose Cat", bg: "#e11d48", accent: "#f9a8d4", skin: "#ffe0d2", mascot: "cat", accessory: "leaf" },
  { id: "indigo-bear", label: "Indigo Bear", bg: "#3730a3", accent: "#818cf8", skin: "#f6d9c4", mascot: "bear", accessory: "glasses" },
  { id: "lime-frog", label: "Lime Frog", bg: "#65a30d", accent: "#bef264", skin: "#ecfccb", mascot: "frog", accessory: "cap" },
  { id: "neon-bot", label: "Neon Bot", bg: "#111827", accent: "#22d3ee", skin: "#dbeafe", mascot: "robot", accessory: "book" },
  { id: "cocoa-owl", label: "Cocoa Owl", bg: "#6f4e37", accent: "#d6a77a", skin: "#efe0c9", mascot: "owl", accessory: "leaf" },
  { id: "blush-cat", label: "Blush Cat", bg: "#f43f5e", accent: "#fda4af", skin: "#ffe4cf", mascot: "cat", accessory: "book" },
  { id: "teal-bear", label: "Teal Bear", bg: "#0f766e", accent: "#5eead4", skin: "#f7dcc3", mascot: "bear", accessory: "cap" },
  { id: "dawn-owl", label: "Dawn Owl", bg: "#db2777", accent: "#fde68a", skin: "#f0e2ce", mascot: "owl", accessory: "spark" },
  { id: "orbit-bot", label: "Orbit Bot", bg: "#1f2937", accent: "#a78bfa", skin: "#e9eaf4", mascot: "robot", accessory: "glasses" },
  { id: "lotus-frog", label: "Lotus Frog", bg: "#16a34a", accent: "#f9a8d4", skin: "#dcfce7", mascot: "frog", accessory: "leaf" },
  { id: "ember-cat", label: "Ember Cat", bg: "#c2410c", accent: "#fb7185", skin: "#ffe4bf", mascot: "cat", accessory: "spark" },
  { id: "storm-bear", label: "Storm Bear", bg: "#475569", accent: "#93c5fd", skin: "#f4d7be", mascot: "bear", accessory: "book" },
  { id: "iris-owl", label: "Iris Owl", bg: "#5b21b6", accent: "#93c5fd", skin: "#eee0cb", mascot: "owl", accessory: "cap" },
  { id: "melon-bot", label: "Melon Bot", bg: "#fb7185", accent: "#fdba74", skin: "#ffe4ec", mascot: "robot", accessory: "leaf" },
  { id: "jade-frog", label: "Jade Frog", bg: "#047857", accent: "#6ee7b7", skin: "#d1fae5", mascot: "frog", accessory: "glasses" },
  { id: "nova-cat", label: "Nova Cat", bg: "#7c2d12", accent: "#facc15", skin: "#ffe4c2", mascot: "cat", accessory: "cap" },
  { id: "amber-bear", label: "Amber Bear", bg: "#a16207", accent: "#fcd34d", skin: "#f5d5a4", mascot: "bear", accessory: "leaf" },
  { id: "arctic-owl", label: "Arctic Owl", bg: "#0f172a", accent: "#67e8f9", skin: "#f8f3ea", mascot: "owl", accessory: "book" },
  { id: "bubble-bot", label: "Bubble Bot", bg: "#2563eb", accent: "#f472b6", skin: "#dbeafe", mascot: "robot", accessory: "spark" },
  { id: "grove-frog", label: "Grove Frog", bg: "#166534", accent: "#34d399", skin: "#dcfce7", mascot: "frog", accessory: "cap" },
  { id: "violet-cat", label: "Violet Cat", bg: "#9333ea", accent: "#f0abfc", skin: "#ffe3d7", mascot: "cat", accessory: "glasses" },
  { id: "sand-bear", label: "Sand Bear", bg: "#b45309", accent: "#fdba74", skin: "#f3d0a8", mascot: "bear", accessory: "spark" },
  { id: "comet-owl", label: "Comet Owl", bg: "#1e3a8a", accent: "#38bdf8", skin: "#eee1cb", mascot: "owl", accessory: "leaf" },
  { id: "mint-chip-bot", label: "Mint Chip Bot", bg: "#0f766e", accent: "#a7f3d0", skin: "#ecfeff", mascot: "robot", accessory: "book" },
  { id: "clover-frog", label: "Clover Frog", bg: "#65a30d", accent: "#4ade80", skin: "#ecfccb", mascot: "frog", accessory: "spark" },
  { id: "sunset-cat", label: "Sunset Cat", bg: "#ea580c", accent: "#fb7185", skin: "#ffe4c7", mascot: "cat", accessory: "book" },
  { id: "cherry-bear", label: "Cherry Bear", bg: "#be123c", accent: "#fda4af", skin: "#f7d4bc", mascot: "bear", accessory: "glasses" },
  { id: "luna-owl", label: "Luna Owl", bg: "#312e81", accent: "#c4b5fd", skin: "#efe4d3", mascot: "owl", accessory: "spark" },
  { id: "solar-bot", label: "Solar Bot", bg: "#f59e0b", accent: "#f97316", skin: "#ffedd5", mascot: "robot", accessory: "cap" },
  { id: "reef-frog", label: "Reef Frog", bg: "#0284c7", accent: "#22d3ee", skin: "#cffafe", mascot: "frog", accessory: "book" },
  { id: "peach-cat", label: "Peach Cat", bg: "#fb7185", accent: "#fdba74", skin: "#ffe4d6", mascot: "cat", accessory: "leaf" },
] as const satisfies readonly PresetAvatarDefinition[];

export function getResolvedThemeMode(settings?: SiteSettingsPayload): ThemeMode {
  return settings?.themeMode === "light" || settings?.themeMode === "dark" || settings?.themeMode === "auto"
    ? settings.themeMode
    : DEFAULT_THEME_MODE;
}

export function getResolvedThemeSchedule(settings?: SiteSettingsPayload): Required<ThemeSchedulePayload> {
  return {
    darkStartHour:
      typeof settings?.themeSchedule?.darkStartHour === "number"
        ? clampHour(settings.themeSchedule.darkStartHour)
        : DEFAULT_THEME_SCHEDULE.darkStartHour,
    lightStartHour:
      typeof settings?.themeSchedule?.lightStartHour === "number"
        ? clampHour(settings.themeSchedule.lightStartHour)
        : DEFAULT_THEME_SCHEDULE.lightStartHour,
  };
}

export function resolveEffectiveTheme(
  settings?: SiteSettingsPayload,
  now: Date = new Date(),
): Exclude<ThemeMode, "auto"> {
  const mode = getResolvedThemeMode(settings);
  if (mode === "light" || mode === "dark") return mode;

  const schedule = getResolvedThemeSchedule(settings);
  const hour = now.getHours();

  if (schedule.darkStartHour === schedule.lightStartHour) {
    return hour >= 18 || hour < 7 ? "dark" : "light";
  }

  if (schedule.darkStartHour > schedule.lightStartHour) {
    return hour >= schedule.darkStartHour || hour < schedule.lightStartHour ? "dark" : "light";
  }

  return hour >= schedule.darkStartHour && hour < schedule.lightStartHour ? "dark" : "light";
}

export function shouldForceDarkTheme(pathname: string | null | undefined) {
  return Boolean(pathname?.startsWith("/study"));
}

function clampHour(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(23, Math.round(value)));
}

function renderMascot(preset: PresetAvatarDefinition) {
  const face =
    preset.mascot === "cat"
      ? `
        <polygon points="34,46 46,28 54,50" fill="${preset.skin}" />
        <polygon points="94,46 82,28 74,50" fill="${preset.skin}" />
        <circle cx="64" cy="72" r="29" fill="${preset.skin}" />
        <path d="M50 84 Q64 96 78 84" fill="none" stroke="#2a1f1a" stroke-width="4" stroke-linecap="round" />
      `
      : preset.mascot === "owl"
      ? `
        <circle cx="64" cy="70" r="30" fill="${preset.skin}" />
        <path d="M42 48 Q52 36 64 46 Q76 36 86 48" fill="${preset.skin}" />
        <polygon points="64,74 58,84 70,84" fill="#e68a2e" />
      `
      : preset.mascot === "robot"
      ? `
        <rect x="34" y="42" width="60" height="54" rx="22" fill="${preset.skin}" />
        <rect x="42" y="34" width="44" height="16" rx="8" fill="${preset.skin}" />
        <circle cx="64" cy="28" r="5" fill="${preset.accent}" />
        <rect x="61" y="28" width="6" height="10" rx="3" fill="${preset.accent}" />
      `
      : preset.mascot === "bear"
      ? `
        <circle cx="42" cy="46" r="12" fill="${preset.skin}" />
        <circle cx="86" cy="46" r="12" fill="${preset.skin}" />
        <circle cx="64" cy="72" r="30" fill="${preset.skin}" />
        <ellipse cx="64" cy="84" rx="13" ry="10" fill="#f9e7cf" />
      `
      : `
        <circle cx="46" cy="46" r="11" fill="${preset.skin}" />
        <circle cx="82" cy="46" r="11" fill="${preset.skin}" />
        <circle cx="64" cy="72" r="30" fill="${preset.skin}" />
        <path d="M46 48 Q64 26 82 48" fill="${preset.skin}" />
      `;

  const accessory =
    preset.accessory === "spark"
      ? `<path d="M96 30 L101 42 L114 47 L101 52 L96 64 L91 52 L78 47 L91 42 Z" fill="rgba(255,255,255,0.7)" />`
      : preset.accessory === "book"
      ? `<rect x="84" y="84" width="22" height="16" rx="4" fill="#fff7ed" /><path d="M95 84 V100" stroke="${preset.accent}" stroke-width="2.5" />`
      : preset.accessory === "glasses"
      ? `<circle cx="52" cy="68" r="8" fill="none" stroke="#2a1f1a" stroke-width="3" /><circle cx="76" cy="68" r="8" fill="none" stroke="#2a1f1a" stroke-width="3" /><path d="M60 68 H68" stroke="#2a1f1a" stroke-width="3" stroke-linecap="round" />`
      : preset.accessory === "cap"
      ? `<path d="M35 53 Q64 34 93 53 L64 60 Z" fill="#1f2937" /><rect x="43" y="52" width="42" height="8" rx="4" fill="#111827" />`
      : `<path d="M96 32 C88 32 84 40 88 48 C92 56 101 58 108 52 C112 44 108 35 96 32 Z" fill="#86efac" />`;

  return `
    ${face}
    ${accessory}
    <circle cx="53" cy="69" r="4.8" fill="#1f2937" />
    <circle cx="75" cy="69" r="4.8" fill="#1f2937" />
    <circle cx="51" cy="67" r="1.4" fill="white" />
    <circle cx="73" cy="67" r="1.4" fill="white" />
    <path d="M56 86 Q64 92 72 86" fill="none" stroke="#1f2937" stroke-width="3.2" stroke-linecap="round" />
  `;
}

function buildPresetAvatarDataUri(preset: PresetAvatarDefinition) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${preset.bg}" />
          <stop offset="100%" stop-color="${preset.accent}" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="64" fill="url(#g)" />
      <circle cx="97" cy="30" r="12" fill="rgba(255,255,255,0.22)" />
      <circle cx="31" cy="103" r="14" fill="rgba(255,255,255,0.08)" />
      <circle cx="64" cy="67" r="40" fill="rgba(255,255,255,0.08)" />
      ${renderMascot(preset)}
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function getPresetAvatarUrl(id: string) {
  const preset = PRESET_AVATARS.find((entry) => entry.id === id);
  if (!preset) return null;
  return buildPresetAvatarDataUri(preset);
}

export function resolveAvatarUrl(selection: AvatarSelectionPayload | undefined, fallbackImage?: string | null) {
  if (selection?.type === "upload" && typeof selection.value === "string" && selection.value.trim()) {
    return selection.value;
  }

  if (selection?.type === "preset" && typeof selection.value === "string") {
    return getPresetAvatarUrl(selection.value) ?? fallbackImage ?? null;
  }

  return fallbackImage ?? null;
}

export function readLocalSiteSettings() {
  if (typeof window === "undefined") {
    return {} as SiteSettingsPayload;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {} as SiteSettingsPayload;
    const parsed = JSON.parse(raw) as SiteSettingsPayload;
    return typeof parsed === "object" && parsed ? parsed : ({} as SiteSettingsPayload);
  } catch {
    return {} as SiteSettingsPayload;
  }
}

export function writeLocalSiteSettings(settings: SiteSettingsPayload) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
