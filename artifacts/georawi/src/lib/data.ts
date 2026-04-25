export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  short: string;
  story: string;
  sceneTitle: string;
}

export interface PathPoint {
  lat: number;
  lng: number;
}

export const places: Place[] = [
  {
    id: "palace",
    name: "قصر الملك عبدالعزيز - الخرج",
    lat: 24.1550,
    lng: 47.3090,
    short: "قصر تاريخي ارتبط ببدايات الدولة السعودية الحديثة",
    sceneTitle: "شاهد على التأسيس",
    story:
      "في قلب الخرج يقف هذا القصر كشاهد صامت على مرحلة تأسيس الدولة السعودية الحديثة. بُني في عهد الملك عبدالعزيز آل سعود، وكان محطةً للقرارات المصيرية والزيارات الملكية. حجارته تحمل أصداء أحاديث رجال شكّلوا ملامح الجزيرة العربية. اليوم يبقى صامدًا، تراثًا للأجيال القادمة، يذكّر بحكمة البنّائين الأوائل ورؤيتهم للمستقبل.",
  },
  {
    id: "spring",
    name: "عين الضلع - الخرج",
    lat: 24.1180,
    lng: 47.3125,
    short: "عين مائية قديمة كانت مصدر حياة للقوافل",
    sceneTitle: "نبع الحياة الأبدي",
    story:
      "وسط الصحراء القاسية ظهرت هذه العين كمعجزة تتجدد كل يوم. منذ آلاف السنين وهي تُسقي القوافل العابرة، وتروي العطش في ليالي الصحراء الطويلة. حولها نشأت حضارات، ومرّ بها تجّار البُخور والتوابل في طريقهم بين اليمن والعراق. مياهها الصافية كانت أثمن من الذهب في قلب هذا الكنف المقفر، وما زالت تحكي قصص من شربوا منها وواصلوا رحلتهم.",
  },
];

export const demoPath: PathPoint[] = [
  { lat: 24.3000, lng: 47.2000 },
  { lat: 24.2500, lng: 47.2500 },
  { lat: 24.2000, lng: 47.2800 },
  { lat: 24.1550, lng: 47.3090 },
  { lat: 24.1300, lng: 47.3200 },
  { lat: 24.1180, lng: 47.3125 },
];

export const PROXIMITY_KM = 50;
export const STEP_INTERVAL_MS = 5500;
export const INTERP_STEPS = 60;
export const INTERP_INTERVAL_MS = Math.round(STEP_INTERVAL_MS / INTERP_STEPS);

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function interpolate(p1: PathPoint, p2: PathPoint, t: number): PathPoint {
  return {
    lat: p1.lat + (p2.lat - p1.lat) * t,
    lng: p1.lng + (p2.lng - p1.lng) * t,
  };
}

const STORAGE_KEY = "georawi_visited_v1";

export function loadVisited(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set();
}

export function saveVisited(visited: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visited]));
  } catch {}
}

export function clearVisited(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
