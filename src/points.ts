// src/points.ts

export const FIXED_PORT = {
  id: "yaizu",
  name: "焼津港",
  pc: "22",
  hc: "15",
} as const;

export type WaveExposure = "open" | "sheltered" | "none";
export type WaterKind = "surf" | "port" | "river";
export type TideInfluence = "normal" | "weak" | "none";

export type FishingPoint = {
  id: string;
  name: string;
  shortName: string;
  weatherLat: number;
  weatherLon: number;
  waterKind: WaterKind;
  waveExposure: WaveExposure;
  /** 河川は潮汐の影響を弱め、海の3地点では通常どおり加味する。 */
  tideInfluence: TideInfluence;
  waveImpactLabel: string;
  note: string;
  camera?: {
    kind: "camera" | "wave";
    name: string;
    url: string;
    sameLocation: boolean;
    locationNote?: string;
    actionLabel: string;
    /** 公式ページ側で選択してもらう観測局。URLからの自動選択には非対応。 */
    stationLabel?: string;
  };
};

const SHIZUOKA_COAST_CAMERA_URL =
  "http://shizuokakaigan.pref.shizuoka.jp/sys/cam/";

const OOHAMA_CAMERA = {
  kind: "camera",
  name: "静岡海岸・大浜海岸カメラ",
  url: SHIZUOKA_COAST_CAMERA_URL,
  actionLabel: "監視カメラ映像を開く",
  stationLabel: "大浜海岸カメラ",
} as const;

const HAMAKAWA_EAST_CAMERA = {
  kind: "camera",
  name: "静岡海岸・浜川東観測局カメラ",
  url: SHIZUOKA_COAST_CAMERA_URL,
  actionLabel: "監視カメラ映像を開く",
  stationLabel: "浜川東カメラ",
} as const;

const SHIMIZU_NOWPHAS = {
  kind: "wave",
  name: "NOWPHAS 清水港・有義波実況",
  url: "https://nowphas.mlit.go.jp/yugiha_graph/505/7/",
  actionLabel: "清水港の波浪実況を見る",
} as const;

export const FISHING_POINTS: readonly FishingPoint[] = [
  {
    id: "tomoe",
    name: "巴川",
    shortName: "巴川",
    weatherLat: 35.015,
    weatherLon: 138.489,
    waterKind: "river",
    waveExposure: "none",
    tideInfluence: "weak",
    waveImpactLabel: "対象外（河川）",
    note: "沿岸波浪は判定対象外。潮汐は下流域の参考として弱く反映し、増水・水位・濁りは現地情報を優先",
    camera: {
      ...SHIMIZU_NOWPHAS,
      sameLocation: false,
      locationNote: "河口付近へ行く場合の清水港側参考値",
    },
  },
  {
    id: "oohama",
    name: "大浜海岸",
    shortName: "大浜",
    weatherLat: 34.94,
    weatherLon: 138.405,
    waterKind: "surf",
    waveExposure: "open",
    tideInfluence: "normal",
    waveImpactLabel: "強（開放サーフ）",
    note: "沿岸波浪が直接入りやすい開放サーフ。気象庁の波高とうねりを強く反映",
    camera: {
      ...HAMAKAWA_EAST_CAMERA,
      sameLocation: false,
      locationNote: "大浜海岸の参考：浜川東観測局",
    },
  },
  {
    id: "mochimune-port",
    name: "用宗港",
    shortName: "用宗港",
    weatherLat: 34.922,
    weatherLon: 138.368,
    waterKind: "port",
    waveExposure: "sheltered",
    tideInfluence: "normal",
    waveImpactLabel: "小（港内）",
    note: "港内想定。気象庁の沿岸波浪は港外の荒れ具合として弱く反映",
    camera: {
      ...OOHAMA_CAMERA,
      sameLocation: false,
      locationNote: "用宗港の参考：大浜海岸",
    },
  },
  {
    id: "fishuna",
    name: "焼津ふぃしゅーな",
    shortName: "ふぃしゅーな",
    weatherLat: 34.86,
    weatherLon: 138.325,
    waterKind: "port",
    waveExposure: "sheltered",
    tideInfluence: "normal",
    waveImpactLabel: "小（港内）",
    note: "焼津港内の親水広場周辺。気象庁の沿岸波浪は港外の参考として弱く反映",
  },
] as const;

export const DEFAULT_FISHING_POINT_ID = "oohama";

export function getFishingPoint(id: string): FishingPoint {
  return (
    FISHING_POINTS.find((point) => point.id === id) ?? FISHING_POINTS[1]
  );
}
