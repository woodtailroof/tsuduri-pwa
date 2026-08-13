import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
  type WheelEvent,
} from "react";
import PageShell from "../components/PageShell";
import {
  db,
  type ReelType,
  type RodType,
  type TackleItem,
  type TackleKind,
} from "../db";
import { syncTrips } from "../lib/tripSync";

type Props = { back: () => void };
type TabKind = "rod" | "reel";
type RodForm = {
  maker: string;
  model: string;
  rodType: RodType;
  sizeLabel: string;
  lengthFeet: string;
  lengthInches: string;
  tipMm: string;
  buttMm: string;
  weightG: string;
  castWeightMinG: string;
  castWeightMaxG: string;
  memo: string;
  active: boolean;
};
type ReelForm = {
  maker: string;
  model: string;
  reelType: ReelType;
  sizeLabel: string;
  weightG: string;
  spoolDiameterMm: string;
  spoolWidthMm: string;
  retrieveCm: string;
  memo: string;
  active: boolean;
};

const emptyRod = (): RodForm => ({
  maker: "",
  model: "",
  rodType: "spinning",
  sizeLabel: "",
  lengthFeet: "",
  lengthInches: "",
  tipMm: "",
  buttMm: "",
  weightG: "",
  castWeightMinG: "",
  castWeightMaxG: "",
  memo: "",
  active: true,
});
const emptyReel = (): ReelForm => ({
  maker: "",
  model: "",
  reelType: "spinning",
  sizeLabel: "",
  weightG: "",
  spoolDiameterMm: "",
  spoolWidthMm: "",
  retrieveCm: "",
  memo: "",
  active: true,
});
const num = (s: string) => {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const integer = (s: string) => {
  const n = num(s);
  return n == null ? null : Math.trunc(n);
};
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
const textCmp = (a?: string | null, b?: string | null) =>
  (a ?? "").localeCompare(b ?? "", "ja", {
    numeric: true,
    sensitivity: "base",
  });
const typeRank = (v?: RodType | ReelType | null) =>
  v === "spinning" ? 0 : v === "bait" ? 1 : 2;
const numberCmp = (a?: number | null, b?: number | null) =>
  a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b;
const rodLength = (v: TackleItem) =>
  v.rod?.lengthFeet == null
    ? null
    : v.rod.lengthFeet * 12 + (v.rod.lengthInches ?? 0);
const titleOf = (v: TackleItem) =>
  [v.maker, v.model, v.kind === "rod" ? v.rod?.sizeLabel : v.reel?.sizeLabel]
    .filter(Boolean)
    .join(" ");
const show = (v?: number | null, s = "") => (v == null ? "—" : `${v}${s}`);

function scrollRailWithWheel(event: WheelEvent<HTMLDivElement>) {
  const rail = event.currentTarget;
  const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
  if (maxScrollLeft <= 0) return;

  const rawDelta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;
  if (rawDelta === 0) return;

  const unit =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 18
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? rail.clientWidth
        : 1;
  const delta = rawDelta * unit * 1.35;

  const atStart = rail.scrollLeft <= 0;
  const atEnd = rail.scrollLeft >= maxScrollLeft - 1;
  if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;

  event.preventDefault();
  rail.scrollLeft = Math.max(0, Math.min(maxScrollLeft, rail.scrollLeft + delta));
}

function sorted(items: TackleItem[], kind: TabKind) {
  return items
    .filter((v) => v.kind === kind)
    .slice()
    .sort((a, b) => {
      const active = Number(b.active) - Number(a.active);
      if (kind === "rod")
        return (
          active ||
          typeRank(a.rod?.rodType) - typeRank(b.rod?.rodType) ||
          numberCmp(rodLength(a), rodLength(b)) ||
          textCmp(a.rod?.sizeLabel, b.rod?.sizeLabel) ||
          textCmp(a.maker, b.maker) ||
          textCmp(a.model, b.model)
        );
      return (
        active ||
        typeRank(a.reel?.reelType) - typeRank(b.reel?.reelType) ||
        numberCmp(a.reel?.weightG, b.reel?.weightG) ||
        textCmp(a.reel?.sizeLabel, b.reel?.sizeLabel) ||
        textCmp(a.maker, b.maker) ||
        textCmp(a.model, b.model)
      );
    });
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`tm-field${wide ? " tm-wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function TackleManager({ back }: Props) {
  const [items, setItems] = useState<TackleItem[]>([]);
  const [tab, setTab] = useState<TabKind>("rod");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [rod, setRod] = useState<RodForm>(emptyRod());
  const [reel, setReel] = useState<ReelForm>(emptyReel());

  async function reload() {
    setLoading(true);
    try {
      setItems(await db.tackleItems.filter((v) => !v.deletedAt).toArray());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  async function syncAndReload() {
    setSyncing(true);
    try {
      const r = await syncTrips();
      if (!r.ok) console.warn("tackle sync failed", r.errors);
      window.dispatchEvent(new Event("tsuduri-sync-complete"));
    } catch (e) {
      console.warn(e);
    } finally {
      setSyncing(false);
      await reload();
    }
  }

  useEffect(() => {
    void syncAndReload();
    const sync = () => void reload();
    const focus = () => void syncAndReload();
    const visible = () => {
      if (document.visibilityState === "visible") void syncAndReload();
    };
    window.addEventListener("tsuduri-sync-complete", sync);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("tsuduri-sync-complete", sync);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visible);
    };
    // 画面を開いた時だけ購読し、各イベントではその時点のDBを読む。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, saving]);

  const list = useMemo(() => sorted(items, tab), [items, tab]);
  const rodCount = useMemo(() => sorted(items, "rod").length, [items]);
  const reelCount = useMemo(() => sorted(items, "reel").length, [items]);

  function create(kind: TackleKind) {
    setTab(kind);
    setEditingId(null);
    if (kind === "rod") setRod(emptyRod());
    else setReel(emptyReel());
    setError("");
    setOpen(true);
  }
  function edit(item: TackleItem) {
    setTab(item.kind);
    setEditingId(item.id ?? null);
    if (item.kind === "rod")
      setRod({
        maker: item.maker,
        model: item.model,
        rodType: item.rod?.rodType ?? "spinning",
        sizeLabel: item.rod?.sizeLabel ?? "",
        lengthFeet:
          item.rod?.lengthFeet == null ? "" : String(item.rod.lengthFeet),
        lengthInches:
          item.rod?.lengthInches == null ? "" : String(item.rod.lengthInches),
        tipMm: item.rod?.tipMm == null ? "" : String(item.rod.tipMm),
        buttMm: item.rod?.buttMm == null ? "" : String(item.rod.buttMm),
        weightG: item.rod?.weightG == null ? "" : String(item.rod.weightG),
        castWeightMinG:
          item.rod?.castWeightMinG == null
            ? ""
            : String(item.rod.castWeightMinG),
        castWeightMaxG:
          item.rod?.castWeightMaxG == null
            ? ""
            : String(item.rod.castWeightMaxG),
        memo: item.memo ?? "",
        active: item.active,
      });
    else
      setReel({
        maker: item.maker,
        model: item.model,
        reelType: item.reel?.reelType ?? "spinning",
        sizeLabel: item.reel?.sizeLabel ?? "",
        weightG: item.reel?.weightG == null ? "" : String(item.reel.weightG),
        spoolDiameterMm:
          item.reel?.spoolDiameterMm == null
            ? ""
            : String(item.reel.spoolDiameterMm),
        spoolWidthMm:
          item.reel?.spoolWidthMm == null ? "" : String(item.reel.spoolWidthMm),
        retrieveCm:
          item.reel?.retrieveCm == null ? "" : String(item.reel.retrieveCm),
        memo: item.memo ?? "",
        active: item.active,
      });
    setError("");
    setOpen(true);
  }

  async function saveRod() {
    if (!rod.maker.trim() || !rod.model.trim() || !rod.sizeLabel.trim()) {
      setError("メーカー・モデル名・番手は入れてね");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const old =
        editingId == null ? null : await db.tackleItems.get(editingId);
      const row: TackleItem = {
        id: old?.id,
        uid: old?.uid ?? uid(),
        createdAt: old?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: "pending",
        kind: "rod",
        maker: rod.maker.trim(),
        model: rod.model.trim(),
        memo: rod.memo.trim() || null,
        active: rod.active,
        retiredAt: rod.active ? null : (old?.retiredAt ?? now),
        rod: {
          rodType: rod.rodType,
          sizeLabel: rod.sizeLabel.trim(),
          lengthFeet: integer(rod.lengthFeet),
          lengthInches: integer(rod.lengthInches),
          tipMm: num(rod.tipMm),
          buttMm: num(rod.buttMm),
          weightG: num(rod.weightG),
          castWeightMinG: num(rod.castWeightMinG),
          castWeightMaxG: num(rod.castWeightMaxG),
        },
        reel: null,
      };
      if (editingId == null) await db.tackleItems.add(row);
      else await db.tackleItems.put(row);
      setOpen(false);
      setEditingId(null);
      await syncAndReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  async function saveReel() {
    if (!reel.maker.trim() || !reel.model.trim() || !reel.sizeLabel.trim()) {
      setError("メーカー・モデル名・番手は入れてね");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const old =
        editingId == null ? null : await db.tackleItems.get(editingId);
      const row: TackleItem = {
        id: old?.id,
        uid: old?.uid ?? uid(),
        createdAt: old?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: "pending",
        kind: "reel",
        maker: reel.maker.trim(),
        model: reel.model.trim(),
        memo: reel.memo.trim() || null,
        active: reel.active,
        retiredAt: reel.active ? null : (old?.retiredAt ?? now),
        reel: {
          reelType: reel.reelType,
          sizeLabel: reel.sizeLabel.trim(),
          weightG: num(reel.weightG),
          spoolDiameterMm:
            reel.reelType === "bait" ? num(reel.spoolDiameterMm) : null,
          spoolWidthMm:
            reel.reelType === "bait" ? num(reel.spoolWidthMm) : null,
          retrieveCm: num(reel.retrieveCm),
        },
        rod: null,
      };
      if (editingId == null) await db.tackleItems.add(row);
      else await db.tackleItems.put(row);
      setOpen(false);
      setEditingId(null);
      await syncAndReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  async function toggle(item: TackleItem) {
    if (item.id == null) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await db.tackleItems.update(item.id, {
        active: !item.active,
        retiredAt: item.active ? now : null,
        updatedAt: now,
        syncStatus: "pending",
      });
      await syncAndReload();
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    const item = items.find((v) => v.id === editingId);
    if (!item?.id) return;
    if (
      !confirm(
        `${titleOf(item)} を削除する？\n\n過去の記録で使ったものは「過去所持」がおすすめだよ。`,
      )
    )
      return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await db.tackleItems.update(item.id, {
        deletedAt: now,
        updatedAt: now,
        syncStatus: "pending",
      });
      setOpen(false);
      await syncAndReload();
    } finally {
      setSaving(false);
    }
  }

  const button: CSSProperties = {
    minHeight: "var(--ui-control-height)",
    borderRadius: "var(--ui-radius-control)",
    padding: "9px 13px",
    border: "1px solid var(--ui-control-border)",
    background: "var(--ui-control-bg)",
    color: "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  const selectedButton = (on: boolean): CSSProperties => ({
    ...button,
    borderRadius: 999,
    border: on ? "2px solid rgba(255,91,132,.9)" : button.border,
    background: on ? "rgba(255,77,109,.18)" : button.background,
  });

  return (
    <PageShell
      title={
        <h1 style={{ margin: 0, fontSize: "clamp(21px,3.2vw,32px)" }}>
          🎣 タックル一覧
        </h1>
      }
      titleLayout="left"
      maxWidth={1500}
      showBack
      onBack={back}
      scrollY="hidden"
    >
      <style>{`
      .tm-page{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:10px}.tm-toolbar{padding:10px 12px;border-radius:18px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.tm-buttons,.tm-card-buttons{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.tm-wrap{min-height:0;padding:12px;border-radius:18px;display:grid;grid-template-rows:auto minmax(0,1fr);gap:9px;overflow:hidden}.tm-rail{min-height:0;display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;padding:1px 3px 9px 1px;overscroll-behavior-x:contain;scrollbar-color:rgba(126,230,255,.55) rgba(255,255,255,.08);scrollbar-width:thin}.tm-card{--tm-accent:126,226,255;flex:0 0 clamp(205px,17vw,235px);border-radius:18px;padding:11px;min-height:0;display:grid;grid-template-rows:auto auto 1fr auto;gap:8px;background:linear-gradient(155deg,rgba(var(--tm-accent),.22),rgba(234,250,255,.08) 42%,rgba(8,31,44,.32));border:1px solid rgba(var(--tm-accent),.42);box-shadow:0 10px 26px rgba(var(--tm-accent),.08),inset 0 1px rgba(255,255,255,.2)}.tm-card--spinning{--tm-accent:100,224,244}.tm-card--bait{--tm-accent:229,151,255}.tm-card h2{font-size:14px!important;line-height:1.3!important;margin-top:6px!important}.tm-type-label{color:rgba(var(--tm-accent),.96)!important;text-shadow:0 0 12px rgba(var(--tm-accent),.4)}.tm-card-divider{height:1px;background:linear-gradient(90deg,rgba(var(--tm-accent),.65),transparent)}.tm-card-buttons{flex-wrap:nowrap}.tm-card-buttons button{padding:8px 10px!important;font-size:11px;background:linear-gradient(180deg,rgba(255,255,255,.19),rgba(var(--tm-accent),.11))!important;border-color:rgba(var(--tm-accent),.32)!important}.tm-specs{display:grid;grid-template-columns:1fr;gap:5px;align-content:start}.tm-spec{padding:6px 8px;border-radius:9px;background:rgba(238,250,255,.08);border:1px solid rgba(var(--tm-accent),.15)}.tm-spec span{display:block;font-size:8px;color:rgba(255,255,255,.52);margin-bottom:2px}.tm-spec strong{display:block;font-size:10.5px;line-height:1.3;color:rgba(255,255,255,.92);overflow-wrap:anywhere}.tm-overlay{position:fixed;inset:0;z-index:1000;padding:clamp(10px,3vw,28px);display:grid;place-items:center;background:rgba(0,9,18,.62);backdrop-filter:blur(10px)}.tm-editor{width:min(900px,100%);max-height:min(88dvh,900px);overflow:auto;border-radius:22px;padding:clamp(14px,2.5vw,22px);background:linear-gradient(150deg,rgba(9,47,65,.97),rgba(5,23,39,.96));border:1px solid rgba(205,244,255,.25);box-shadow:0 24px 80px rgba(0,0,0,.55)}.tm-head{position:sticky;top:-1px;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:12px;padding-bottom:12px;background:linear-gradient(180deg,rgba(8,42,59,.98) 72%,transparent)}.tm-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.tm-field{display:grid;gap:6px;font-size:12px;color:rgba(255,255,255,.72)}.tm-field input,.tm-field select,.tm-field textarea{width:100%;box-sizing:border-box;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.25);color:#fff;padding:10px 11px;outline:none}.tm-field textarea{min-height:76px;resize:vertical}.tm-wide{grid-column:1/-1}@media(max-width:720px){.tm-toolbar{align-items:stretch}.tm-toolbar>.tm-buttons:last-child{width:100%;justify-content:space-between}.tm-wrap{padding:10px 8px 7px}.tm-card{flex-basis:min(64vw,230px);padding:10px}.tm-form{grid-template-columns:1fr}.tm-wide{grid-column:auto}.tm-overlay{padding:8px;place-items:end center}.tm-editor{max-height:92dvh;border-radius:22px 22px 12px 12px}}
    `}</style>
      <div className="tm-page">
        <div className="glass glass-strong tm-toolbar">
          <div className="tm-buttons">
            <button
              style={selectedButton(tab === "rod")}
              onClick={() => setTab("rod")}
            >
              ロッド {rodCount}
            </button>
            <button
              style={selectedButton(tab === "reel")}
              onClick={() => setTab("reel")}
            >
              リール {reelCount}
            </button>
          </div>
          <div className="tm-buttons">
            <button
              style={button}
              onClick={() => void syncAndReload()}
              disabled={loading || syncing}
            >
              {syncing ? "同期中…" : "↻ 更新"}
            </button>
            <button
              style={{
                ...button,
                background: "rgba(255,77,109,.28)",
                fontWeight: 800,
              }}
              onClick={() => create(tab)}
            >
              ＋ {tab === "rod" ? "ロッド" : "リール"}を登録
            </button>
          </div>
        </div>
        <div className="glass glass-strong tm-wrap">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "baseline",
              flexWrap: "wrap",
            }}
          >
            <div>
              <strong>
                {tab === "rod" ? "ロッドコレクション" : "リールコレクション"}
              </strong>
              <span
                style={{
                  marginLeft: 10,
                  fontSize: 12,
                  color: "rgba(255,255,255,.58)",
                }}
              >
                {list.length}台中 現役{list.filter((v) => v.active).length}台
              </span>
            </div>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.52)" }}>
              マウスホイールでも横にスクロール
            </span>
          </div>
          {error && !open ? (
            <div style={{ color: "#ffc0cc" }}>⚠ {error}</div>
          ) : loading ? (
            <div>読み込み中…</div>
          ) : list.length === 0 ? (
            <button
              style={{ ...button, placeSelf: "center", padding: "14px 22px" }}
              onClick={() => create(tab)}
            >
              まだ登録がないよ ＋ 最初の1台を登録
            </button>
          ) : (
            <div className="tm-rail" onWheel={scrollRailWithWheel}>
              {list.map((item) => (
                <TackleCard
                  key={item.uid}
                  item={item}
                  button={button}
                  edit={() => edit(item)}
                  toggle={() => void toggle(item)}
                  disabled={saving || syncing}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {open ? (
        <div
          className="tm-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setOpen(false);
          }}
        >
          <section className="tm-editor" role="dialog" aria-modal="true">
            <div className="tm-head">
              <div>
                <small style={{ color: "rgba(155,230,255,.7)" }}>
                  {editingId == null ? "NEW TACKLE" : "EDIT TACKLE"}
                </small>
                <div style={{ fontSize: 19, fontWeight: 900 }}>
                  {tab === "rod" ? "🎣 ロッド" : "⚙️ リール"}
                  {editingId == null ? "を登録" : "を編集"}
                </div>
              </div>
              <button
                style={button}
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                ✕ 閉じる
              </button>
            </div>
            {error ? (
              <div style={{ color: "#ffc0cc", marginBottom: 12 }}>
                ⚠ {error}
              </div>
            ) : null}
            {tab === "rod" ? (
              <RodEditor
                value={rod}
                set={setRod}
                save={() => void saveRod()}
                remove={editingId == null ? undefined : () => void remove()}
                busy={saving || syncing}
                button={button}
              />
            ) : (
              <ReelEditor
                value={reel}
                set={setReel}
                save={() => void saveReel()}
                remove={editingId == null ? undefined : () => void remove()}
                busy={saving || syncing}
                button={button}
              />
            )}
          </section>
        </div>
      ) : null}
    </PageShell>
  );
}

function TackleCard({
  item,
  button,
  edit,
  toggle,
  disabled,
}: {
  item: TackleItem;
  button: CSSProperties;
  edit: () => void;
  toggle: () => void;
  disabled: boolean;
}) {
  const r = item.rod,
    q = item.reel;
  const tackleType = (r?.rodType ?? q?.reelType) === "bait" ? "bait" : "spinning";
  return (
    <article className={`tm-card tm-card--${tackleType}`}>
      <div>
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 10 }}
        >
          <span
            className="tm-type-label"
            style={{
              fontSize: 11,
              letterSpacing: ".08em",
              color: "rgba(160,232,255,.75)",
            }}
          >
            {item.kind === "rod" ? "ROD" : "REEL"} ·{" "}
            {(r?.rodType ?? q?.reelType) === "bait" ? "BAIT" : "SPINNING"}
          </span>
          <span
            style={{ fontSize: 11, color: item.active ? "#aaffcb" : "#ffd0ae" }}
          >
            ● {item.active ? "現役" : "過去所持"}
          </span>
        </div>
        <h2
          style={{
            margin: "10px 0 0",
            fontSize: 19,
            lineHeight: 1.35,
            overflowWrap: "anywhere",
          }}
        >
          {titleOf(item)}
        </h2>
      </div>
      <div className="tm-card-divider" />
      <div className="tm-specs">
        {item.kind === "rod" ? (
          <>
            <Spec
              label="長さ"
              value={
                r?.lengthFeet == null
                  ? "—"
                  : `${r.lengthFeet}'${r.lengthInches ?? 0}″`
              }
            />
            <Spec label="自重" value={show(r?.weightG, "g")} />
            <Spec
              label="キャスト"
              value={
                r?.castWeightMinG == null && r?.castWeightMaxG == null
                  ? "—"
                  : `${r?.castWeightMinG ?? "—"}–${r?.castWeightMaxG ?? "—"}g`
              }
            />
            <Spec
              label="先径 / 元径"
              value={`${show(r?.tipMm, "mm")} / ${show(r?.buttMm, "mm")}`}
            />
          </>
        ) : (
          <>
            <Spec label="自重" value={show(q?.weightG, "g")} />
            <Spec label="巻上長" value={show(q?.retrieveCm, "cm")} />
            {q?.reelType === "bait" ? (
              <>
                <Spec
                  label="スプール径"
                  value={show(q.spoolDiameterMm, "mm")}
                />
                <Spec label="スプール幅" value={show(q.spoolWidthMm, "mm")} />
              </>
            ) : null}
          </>
        )}
        {item.memo ? <Spec label="メモ" value={item.memo} wide /> : null}
      </div>
      <div className="tm-card-buttons">
        <button style={button} onClick={edit}>
          編集
        </button>
        <button style={button} onClick={toggle} disabled={disabled}>
          {item.active ? "過去所持へ" : "現役に戻す"}
        </button>
      </div>
    </article>
  );
}
function Spec({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`tm-spec${wide ? " tm-wide" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
const input = (
  value: string,
  onChange: (v: string) => void,
  extra: Record<string, unknown> = {},
) => (
  <input value={value} onChange={(e) => onChange(e.target.value)} {...extra} />
);

function RodEditor({
  value: v,
  set,
  save,
  remove,
  busy,
  button,
}: {
  value: RodForm;
  set: (fn: (v: RodForm) => RodForm) => void;
  save: () => void;
  remove?: () => void;
  busy: boolean;
  button: CSSProperties;
}) {
  const f = (k: keyof RodForm) => (x: string) => set((p) => ({ ...p, [k]: x }));
  return (
    <div className="tm-form">
      <Field label="メーカー">
        {input(v.maker, f("maker"), { placeholder: "例：シマノ" })}
      </Field>
      <Field label="モデル名">
        {input(v.model, f("model"), { placeholder: "例：ディアルーナ" })}
      </Field>
      <Field label="種別">
        <select
          value={v.rodType}
          onChange={(e) =>
            set((p) => ({ ...p, rodType: e.target.value as RodType }))
          }
        >
          <option value="spinning">スピニング</option>
          <option value="bait">ベイト</option>
        </select>
      </Field>
      <Field label="番手">
        {input(v.sizeLabel, f("sizeLabel"), { placeholder: "例：S106M" })}
      </Field>
      <Field label="長さ ft">
        {input(v.lengthFeet, f("lengthFeet"), { inputMode: "numeric" })}
      </Field>
      <Field label="長さ in">
        {input(v.lengthInches, f("lengthInches"), { inputMode: "numeric" })}
      </Field>
      <Field label="先径 (mm)">
        {input(v.tipMm, f("tipMm"), { inputMode: "decimal" })}
      </Field>
      <Field label="元径 (mm)">
        {input(v.buttMm, f("buttMm"), { inputMode: "decimal" })}
      </Field>
      <Field label="自重 (g)">
        {input(v.weightG, f("weightG"), { inputMode: "decimal" })}
      </Field>
      <Field label="キャスト最小 (g)">
        {input(v.castWeightMinG, f("castWeightMinG"), { inputMode: "decimal" })}
      </Field>
      <Field label="キャスト最大 (g)">
        {input(v.castWeightMaxG, f("castWeightMaxG"), { inputMode: "decimal" })}
      </Field>
      <Field label="メモ" wide>
        <textarea value={v.memo} onChange={(e) => f("memo")(e.target.value)} />
      </Field>
      <label className="tm-wide">
        <input
          type="checkbox"
          checked={v.active}
          onChange={(e) => set((p) => ({ ...p, active: e.target.checked }))}
        />{" "}
        現役タックル
      </label>
      <EditorActions button={button} busy={busy} save={save} remove={remove} />
    </div>
  );
}
function ReelEditor({
  value: v,
  set,
  save,
  remove,
  busy,
  button,
}: {
  value: ReelForm;
  set: (fn: (v: ReelForm) => ReelForm) => void;
  save: () => void;
  remove?: () => void;
  busy: boolean;
  button: CSSProperties;
}) {
  const f = (k: keyof ReelForm) => (x: string) =>
    set((p) => ({ ...p, [k]: x }));
  return (
    <div className="tm-form">
      <Field label="メーカー">
        {input(v.maker, f("maker"), { placeholder: "例：シマノ" })}
      </Field>
      <Field label="モデル名">
        {input(v.model, f("model"), { placeholder: "例：ヴァンフォード" })}
      </Field>
      <Field label="種別">
        <select
          value={v.reelType}
          onChange={(e) =>
            set((p) => ({ ...p, reelType: e.target.value as ReelType }))
          }
        >
          <option value="spinning">スピニング</option>
          <option value="bait">ベイト</option>
        </select>
      </Field>
      <Field label="番手">
        {input(v.sizeLabel, f("sizeLabel"), { placeholder: "例：C3000HG" })}
      </Field>
      <Field label="自重 (g)">
        {input(v.weightG, f("weightG"), { inputMode: "decimal" })}
      </Field>
      <Field label="1回転巻上げ長 (cm)">
        {input(v.retrieveCm, f("retrieveCm"), { inputMode: "decimal" })}
      </Field>
      {v.reelType === "bait" ? (
        <>
          <Field label="スプール径 (mm)">
            {input(v.spoolDiameterMm, f("spoolDiameterMm"), {
              inputMode: "decimal",
            })}
          </Field>
          <Field label="スプール幅 (mm)">
            {input(v.spoolWidthMm, f("spoolWidthMm"), { inputMode: "decimal" })}
          </Field>
        </>
      ) : null}
      <Field label="メモ" wide>
        <textarea value={v.memo} onChange={(e) => f("memo")(e.target.value)} />
      </Field>
      <label className="tm-wide">
        <input
          type="checkbox"
          checked={v.active}
          onChange={(e) => set((p) => ({ ...p, active: e.target.checked }))}
        />{" "}
        現役タックル
      </label>
      <EditorActions button={button} busy={busy} save={save} remove={remove} />
    </div>
  );
}
function EditorActions({
  button,
  busy,
  save,
  remove,
}: {
  button: CSSProperties;
  busy: boolean;
  save: () => void;
  remove?: () => void;
}) {
  return (
    <div
      className="tm-wide tm-buttons"
      style={{
        justifyContent: remove ? "space-between" : "flex-end",
        marginTop: 4,
      }}
    >
      {remove ? (
        <button
          style={{
            ...button,
            color: "#ffd0d0",
            borderColor: "rgba(255,120,120,.45)",
          }}
          onClick={remove}
          disabled={busy}
        >
          削除
        </button>
      ) : null}
      <button
        style={{ ...button, background: "rgba(255,77,109,.28)" }}
        onClick={save}
        disabled={busy}
      >
        {busy ? "保存中…" : "保存する"}
      </button>
    </div>
  );
}
