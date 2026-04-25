export interface Badge {
  id: string;
  emoji: string;
  name: string;
  description: string;
}

export const BADGES: Badge[] = [
  {
    id: "first_discovery",
    emoji: "⭐",
    name: "أول اكتشاف",
    description: "اكتشفت أول معلم تاريخي في الخرج",
  },
  {
    id: "kharj_explorer",
    emoji: "🧭",
    name: "مستكشف الخرج",
    description: "زرت جميع المعالم التاريخية في المنطقة",
  },
  {
    id: "history_master",
    emoji: "🏆",
    name: "سيّد التاريخ",
    description: "أكملت الرحلة الوثائقية الكاملة عبر الزمن",
  },
];

const STORAGE_KEY = "georawi_badges_v1";

export function loadEarnedBadges(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set();
}

export function saveEarnedBadges(earned: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...earned]));
  } catch {}
}

export function clearEarnedBadges(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function getBadgeById(id: string): Badge | undefined {
  return BADGES.find((b) => b.id === id);
}
