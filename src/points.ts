// src/points.ts

export const FIXED_PORT = {
  id: "yaizu",
  name: "焼津（固定）",
  pc: "22",
  hc: "15",
} as const;

/**
 * Open-Meteo Marine API に渡す駿河湾西岸の代表座標。
 * cell_selection=sea を併用し、実際には最寄りの海上格子が返る。
 */
export const WAVE_REFERENCE = {
  id: "suruga-west",
  name: "焼津沖基準",
  lat: 34.85,
  lon: 138.38,
} as const;

export type WaveExposure = "open" | "partial" | "sheltered" | "none";

export type FishingPoint = {
  id: string;
  name: string;
  shortName: string;
  waveExposure: WaveExposure;
  /** 岸から見て海が開けている方角。波向は「波が来る方角」で比較する。 */
  seaFacingDeg?: number;
  note: string;
  camera?: {
    name: string;
    url: string;
    sameLocation: boolean;
  };
};

const OOHAMA_CAMERA = {
  name: "静岡海岸・大浜海岸カメラ",
  url: "https://shizuokakaigan.pref.shizuoka.jp/sys/sp/cam/oohamakaigan.html",
} as const;

export const FISHING_POINTS: readonly FishingPoint[] = [
  {
    id: "oohama",
    name: "大浜海岸",
    shortName: "大浜",
    waveExposure: "open",
    seaFacingDeg: 145,
    note: "開放サーフとして厳しめに判定",
    camera: { ...OOHAMA_CAMERA, sameLocation: true },
  },
  {
    id: "hirono",
    name: "広野海岸公園",
    shortName: "広野",
    waveExposure: "open",
    seaFacingDeg: 145,
    note: "開放岸として厳しめに判定",
    camera: { ...OOHAMA_CAMERA, sameLocation: false },
  },
  {
    id: "abekawa-mouth",
    name: "安倍川河口",
    shortName: "安倍川河口",
    waveExposure: "open",
    seaFacingDeg: 145,
    note: "開放河口。増水・濁りは別途現地確認",
    camera: { ...OOHAMA_CAMERA, sameLocation: false },
  },
  {
    id: "mochimune-port",
    name: "用宗港（港内）",
    shortName: "用宗港",
    waveExposure: "sheltered",
    note: "港内想定。外向き護岸にはこの判定を使わない",
    camera: { ...OOHAMA_CAMERA, sameLocation: false },
  },
  {
    id: "shimizu-port",
    name: "清水港（港内）",
    shortName: "清水港",
    waveExposure: "sheltered",
    note: "港内想定。外向き・港口は実際の波を優先",
  },
  {
    id: "tomoe-mouth",
    name: "巴川河口",
    shortName: "巴川河口",
    waveExposure: "partial",
    seaFacingDeg: 120,
    note: "半遮蔽。河川増水は波浪判定に含まない",
  },
  {
    id: "asahata-pond",
    name: "麻機遊水池 第4工区",
    shortName: "麻機",
    waveExposure: "none",
    note: "海の波浪判定対象外",
  },
] as const;

export const DEFAULT_FISHING_POINT_ID = "oohama";

export function getFishingPoint(id: string): FishingPoint {
  return (
    FISHING_POINTS.find((point) => point.id === id) ?? FISHING_POINTS[0]
  );
}
