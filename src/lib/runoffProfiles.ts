/** 初期版の陸域代表点。流域平均雨量・流量ではない。係数は現地記録で調整する仮説値。 */
export type RainSite = { id: string; name: string; lat: number; lon: number; weight: number; holdHours: number };
export type RunoffProfile = { id: string; name: string; sites: RainSite[]; debrisHalfLife: number; turbidityHalfLife: number; exposure: number; note: string; onshoreFrom: number | null };
const utogi = { id: "utogi", name: "安倍川上流参考・有東木", lat: 35.206667, lon: 138.368333 };
const kagiana = { id: "kagiana", name: "藁科川流域参考・鍵穴", lat: 35.048333, lon: 138.246667 };
export const RUNOFF_PROFILES: Record<string, RunoffProfile> = {
  oohama: { id: "oohama", name: "大浜・安倍川／浜川周辺", sites: [
    { id: "shizuoka", name: "静岡沿岸参考", lat: 34.975, lon: 138.403333, weight: .9, holdHours: 0 },
    { ...utogi, weight: 1, holdHours: 6 }, { ...kagiana, weight: .8, holdHours: 4 },
  ], debrisHalfLife: 48, turbidityHalfLife: 30, exposure: 1, onshoreFrom: 180,
    note: "安倍川・藁科川と沿岸の代表点。浜川の流域全体や沿岸の移流は再現していません。" },
  tomoe: { id: "tomoe", name: "巴川周辺", sites: [
    { id: "shimizu", name: "清水側参考", lat: 35.053333, lon: 138.521667, weight: .85, holdHours: 0 },
    { id: "asahata", name: "巴川中上流・麻機周辺参考", lat: 35.023464, lon: 138.392114, weight: 1, holdHours: 3 },
  ], debrisHalfLife: 48, turbidityHalfLife: 36, exposure: 1.05, onshoreFrom: null,
    note: "都市河川の陸域代表点。遊水地・放水路の運用、水位や流量は未反映です。" },
  "mochimune-port": { id: "mochimune-port", name: "用宗港周辺", sites: [
    { id: "mariko", name: "丸子川周辺陸域参考", lat: 34.950512, lon: 138.33717, weight: 1, holdHours: 2 },
    { ...utogi, weight: .55, holdHours: 8 },
  ], debrisHalfLife: 60, turbidityHalfLife: 36, exposure: .75, onshoreFrom: 160,
    note: "近隣陸域と安倍川上流を参考に評価。河口から港内への流入・滞留の実測ではありません。" },
  fishuna: { id: "fishuna", name: "焼津ふぃしゅーな周辺", sites: [
    { id: "yaizu", name: "焼津沿岸参考", lat: 34.86, lon: 138.325, weight: 1, holdHours: 0 },
    { id: "seto", name: "瀬戸川上流参考・高根山", lat: 34.975, lon: 138.196667, weight: .8, holdHours: 4 },
  ], debrisHalfLife: 60, turbidityHalfLife: 36, exposure: .7, onshoreFrom: 120,
    note: "沿岸・上流側陸域の代表点。港の遮蔽・流入経路・清掃による差は未検証です。" },
};

// 座標出典：有東木・鍵穴・静岡・清水・高根山は気象庁観測所メタデータ。
// https://www.jma.go.jp/bosai/amedas/const/amedastable.json
// 麻機第1西・丸子は県河川カメラ位置（雨量観測値ではなく、その座標のモデル雨量を取得）。
// https://opendata.pref.shizuoka.jp/dataset/fuji-156/resource/32450/content.html
