// src/screens/TackleManager.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import PageShell from "../components/PageShell";
import {
  db,
  type TackleItem,
  type RodType,
  type ReelType,
  type TackleKind,
} from "../db";
import {
  sortRods,
  sortReels,
  formatRodLabel,
  formatReelLabel,
} from "../lib/tackle";

type Props = {
  back: () => void;
};

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

function makeUid() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function parseOptionalNumber(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseOptionalInt(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function emptyRodForm(): RodForm {
  return {
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
  };
}

function emptyReelForm(): ReelForm {
  return {
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
  };
}

function fmtMaybeNumber(value?: number | null, suffix = ""): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value}${suffix}`;
}

function fmtRodType(t: RodType): string {
  return t === "spinning" ? "スピニング" : "ベイト";
}

function fmtReelType(t: ReelType): string {
  return t === "spinning" ? "スピニング" : "ベイト";
}

function buildRodCardSub(item: TackleItem): string {
  const rod = item.rod;
  if (!rod) return "";
  const len =
    typeof rod.lengthFeet === "number"
      ? `${rod.lengthFeet}'${rod.lengthInches ?? 0}"`
      : "—";
  const cast =
    rod.castWeightMinG != null && rod.castWeightMaxG != null
      ? `${rod.castWeightMinG}-${rod.castWeightMaxG}g`
      : rod.castWeightMinG != null
        ? `${rod.castWeightMinG}g〜`
        : rod.castWeightMaxG != null
          ? `〜${rod.castWeightMaxG}g`
          : "—";
  return `${fmtRodType(rod.rodType)} / ${len} / ${cast}`;
}

function buildReelCardSub(item: TackleItem): string {
  const reel = item.reel;
  if (!reel) return "";
  const spool =
    reel.reelType === "bait"
      ? ` / スプール ${fmtMaybeNumber(reel.spoolDiameterMm, "mm")} × ${fmtMaybeNumber(reel.spoolWidthMm, "mm")}`
      : "";
  return `${fmtReelType(reel.reelType)} / ${fmtMaybeNumber(reel.weightG, "g")} / ${fmtMaybeNumber(reel.retrieveCm, "cm")}${spool}`;
}

function useIsMobileLayout(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return isMobile;
}

export default function TackleManager({ back }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<TackleItem[]>([]);
  const [tab, setTab] = useState<TabKind>("rod");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [rodForm, setRodForm] = useState<RodForm>(emptyRodForm());
  const [reelForm, setReelForm] = useState<ReelForm>(emptyReelForm());
  const [error, setError] = useState("");
  const isMobileLayout = useIsMobileLayout();

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const rows = await db.tackleItems
        .filter((item) => !item.deletedAt)
        .toArray();
      setItems(rows);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();

    const onSyncComplete = () => {
      void reload();
    };

    const onFocus = () => {
      void reload();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void reload();
      }
    };

    window.addEventListener("tsuduri-sync-complete", onSyncComplete);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("tsuduri-sync-complete", onSyncComplete);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const rodList = useMemo(() => sortRods(items), [items]);
  const reelList = useMemo(() => sortReels(items), [items]);

  const currentList = tab === "rod" ? rodList : reelList;

  function startCreate(kind: TackleKind) {
    setEditingId(null);
    setTab(kind);
    if (kind === "rod") {
      setRodForm(emptyRodForm());
    } else {
      setReelForm(emptyReelForm());
    }
    setError("");
  }

  function loadIntoForm(item: TackleItem) {
    setEditingId(item.id ?? null);
    setTab(item.kind);

    if (item.kind === "rod") {
      setRodForm({
        maker: item.maker ?? "",
        model: item.model ?? "",
        rodType: item.rod?.rodType ?? "spinning",
        sizeLabel: item.rod?.sizeLabel ?? "",
        lengthFeet:
          item.rod?.lengthFeet != null ? String(item.rod.lengthFeet) : "",
        lengthInches:
          item.rod?.lengthInches != null ? String(item.rod.lengthInches) : "",
        tipMm: item.rod?.tipMm != null ? String(item.rod.tipMm) : "",
        buttMm: item.rod?.buttMm != null ? String(item.rod.buttMm) : "",
        weightG: item.rod?.weightG != null ? String(item.rod.weightG) : "",
        castWeightMinG:
          item.rod?.castWeightMinG != null
            ? String(item.rod.castWeightMinG)
            : "",
        castWeightMaxG:
          item.rod?.castWeightMaxG != null
            ? String(item.rod.castWeightMaxG)
            : "",
        memo: item.memo ?? "",
        active: item.active,
      });
    } else {
      setReelForm({
        maker: item.maker ?? "",
        model: item.model ?? "",
        reelType: item.reel?.reelType ?? "spinning",
        sizeLabel: item.reel?.sizeLabel ?? "",
        weightG: item.reel?.weightG != null ? String(item.reel.weightG) : "",
        spoolDiameterMm:
          item.reel?.spoolDiameterMm != null
            ? String(item.reel.spoolDiameterMm)
            : "",
        spoolWidthMm:
          item.reel?.spoolWidthMm != null ? String(item.reel.spoolWidthMm) : "",
        retrieveCm:
          item.reel?.retrieveCm != null ? String(item.reel.retrieveCm) : "",
        memo: item.memo ?? "",
        active: item.active,
      });
    }

    setError("");
  }

  async function saveRod() {
    if (
      !rodForm.maker.trim() ||
      !rodForm.model.trim() ||
      !rodForm.sizeLabel.trim()
    ) {
      setError("メーカー・モデル名・番手は入れてね");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const existing =
        editingId != null ? await db.tackleItems.get(editingId) : null;

      const row: TackleItem = {
        id: existing?.id,
        uid: existing?.uid ?? makeUid(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: "pending",
        kind: "rod",
        maker: rodForm.maker.trim(),
        model: rodForm.model.trim(),
        memo: rodForm.memo.trim() || null,
        active: rodForm.active,
        retiredAt: rodForm.active ? null : (existing?.retiredAt ?? now),
        rod: {
          rodType: rodForm.rodType,
          sizeLabel: rodForm.sizeLabel.trim(),
          lengthFeet: parseOptionalInt(rodForm.lengthFeet),
          lengthInches: parseOptionalInt(rodForm.lengthInches),
          tipMm: parseOptionalNumber(rodForm.tipMm),
          buttMm: parseOptionalNumber(rodForm.buttMm),
          weightG: parseOptionalNumber(rodForm.weightG),
          castWeightMinG: parseOptionalNumber(rodForm.castWeightMinG),
          castWeightMaxG: parseOptionalNumber(rodForm.castWeightMaxG),
        },
        reel: null,
      };

      if (editingId != null) {
        await db.tackleItems.put(row);
      } else {
        await db.tackleItems.add(row);
      }

      setEditingId(null);
      setRodForm(emptyRodForm());
      await reload();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveReel() {
    if (
      !reelForm.maker.trim() ||
      !reelForm.model.trim() ||
      !reelForm.sizeLabel.trim()
    ) {
      setError("メーカー・モデル名・番手は入れてね");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const existing =
        editingId != null ? await db.tackleItems.get(editingId) : null;

      const row: TackleItem = {
        id: existing?.id,
        uid: existing?.uid ?? makeUid(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: "pending",
        kind: "reel",
        maker: reelForm.maker.trim(),
        model: reelForm.model.trim(),
        memo: reelForm.memo.trim() || null,
        active: reelForm.active,
        retiredAt: reelForm.active ? null : (existing?.retiredAt ?? now),
        reel: {
          reelType: reelForm.reelType,
          sizeLabel: reelForm.sizeLabel.trim(),
          weightG: parseOptionalNumber(reelForm.weightG),
          spoolDiameterMm:
            reelForm.reelType === "bait"
              ? parseOptionalNumber(reelForm.spoolDiameterMm)
              : null,
          spoolWidthMm:
            reelForm.reelType === "bait"
              ? parseOptionalNumber(reelForm.spoolWidthMm)
              : null,
          retrieveCm: parseOptionalNumber(reelForm.retrieveCm),
        },
        rod: null,
      };

      if (editingId != null) {
        await db.tackleItems.put(row);
      } else {
        await db.tackleItems.add(row);
      }

      setEditingId(null);
      setReelForm(emptyReelForm());
      await reload();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: TackleItem) {
    if (item.id == null) return;
    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      await db.tackleItems.update(item.id, {
        active: !item.active,
        retiredAt: item.active ? now : null,
        updatedAt: now,
        syncStatus: "pending",
      });
      if (editingId === item.id) {
        loadIntoForm({
          ...item,
          active: !item.active,
          retiredAt: item.active ? now : null,
        });
      }
      await reload();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const sectionCard: CSSProperties = {
    borderRadius: 16,
    padding: 12,
    display: "grid",
    gap: 12,
  };

  const fieldWrap: CSSProperties = {
    display: "grid",
    gap: 6,
    fontSize: 12,
    color: "rgba(255,255,255,0.76)",
  };

  const fieldStyle: CSSProperties = {
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.22)",
    color: "#fff",
    padding: "10px 12px",
    outline: "none",
    boxSizing: "border-box",
  };

  const btnStyle: CSSProperties = {
    borderRadius: 999,
    padding: "10px 14px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.24)",
    color: "rgba(255,255,255,0.86)",
    cursor: "pointer",
    lineHeight: 1,
  };

  const activeBtnStyle = (on: boolean): CSSProperties => ({
    ...btnStyle,
    border: on
      ? "2px solid rgba(255,77,109,0.9)"
      : "1px solid rgba(255,255,255,0.18)",
    background: on ? "rgba(255,77,109,0.18)" : "rgba(0,0,0,0.24)",
    color: on ? "#fff" : "rgba(255,255,255,0.86)",
  });

  return (
    <PageShell
      title={
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(20px, 3.2vw, 32px)",
            lineHeight: 1.15,
          }}
        >
          🎣 タックル管理
        </h1>
      }
      titleLayout="left"
      maxWidth={1320}
      showBack
      onBack={back}
      scrollY="auto"
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div
          className="glass glass-strong"
          style={{
            ...sectionCard,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, max-content))",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                setTab("rod");
                setEditingId(null);
                setError("");
              }}
              style={activeBtnStyle(tab === "rod")}
            >
              ロッド
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("reel");
                setEditingId(null);
                setError("");
              }}
              style={activeBtnStyle(tab === "reel")}
            >
              リール
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => startCreate(tab)}
              style={btnStyle}
            >
              ＋ 新規登録
            </button>
            <button
              type="button"
              onClick={() => void reload()}
              style={btnStyle}
              disabled={loading}
            >
              {loading ? "読み込み中…" : "↻ 更新"}
            </button>
          </div>
        </div>

        {error && (
          <div
            className="glass glass-strong"
            style={{
              ...sectionCard,
              color: "#ffb3c1",
            }}
          >
            ⚠ {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            alignItems: "start",
          }}
        >
          <div
            className="glass glass-strong"
            style={{
              ...sectionCard,
              position: isMobileLayout ? "static" : "sticky",
              top: isMobileLayout ? undefined : 12,
            }}
          >
            <div
              style={{
                fontWeight: 900,
                fontSize: 16,
              }}
            >
              {tab === "rod"
                ? editingId != null
                  ? "🎣 ロッド編集"
                  : "🎣 ロッド登録"
                : editingId != null
                  ? "⚙️ リール編集"
                  : "⚙️ リール登録"}
            </div>

            {tab === "rod" ? (
              <>
                <div style={fieldWrap}>
                  メーカー
                  <input
                    value={rodForm.maker}
                    onChange={(e) =>
                      setRodForm((prev) => ({ ...prev, maker: e.target.value }))
                    }
                    style={fieldStyle}
                    placeholder="例：シマノ"
                  />
                </div>

                <div style={fieldWrap}>
                  モデル名
                  <input
                    value={rodForm.model}
                    onChange={(e) =>
                      setRodForm((prev) => ({ ...prev, model: e.target.value }))
                    }
                    style={fieldStyle}
                    placeholder="例：18ディアルーナ"
                  />
                </div>

                <div style={fieldWrap}>
                  種別
                  <select
                    value={rodForm.rodType}
                    onChange={(e) =>
                      setRodForm((prev) => ({
                        ...prev,
                        rodType: e.target.value as RodType,
                      }))
                    }
                    style={fieldStyle}
                  >
                    <option value="spinning">スピニング</option>
                    <option value="bait">ベイト</option>
                  </select>
                </div>

                <div style={fieldWrap}>
                  番手
                  <input
                    value={rodForm.sizeLabel}
                    onChange={(e) =>
                      setRodForm((prev) => ({
                        ...prev,
                        sizeLabel: e.target.value,
                      }))
                    }
                    style={fieldStyle}
                    placeholder="例：S86L-S"
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    gridTemplateColumns: "1fr 1fr",
                  }}
                >
                  <div style={fieldWrap}>
                    長さ ft
                    <input
                      value={rodForm.lengthFeet}
                      onChange={(e) =>
                        setRodForm((prev) => ({
                          ...prev,
                          lengthFeet: e.target.value,
                        }))
                      }
                      style={fieldStyle}
                      inputMode="numeric"
                      placeholder="8"
                    />
                  </div>

                  <div style={fieldWrap}>
                    長さ in
                    <input
                      value={rodForm.lengthInches}
                      onChange={(e) =>
                        setRodForm((prev) => ({
                          ...prev,
                          lengthInches: e.target.value,
                        }))
                      }
                      style={fieldStyle}
                      inputMode="numeric"
                      placeholder="6"
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    gridTemplateColumns: "1fr 1fr",
                  }}
                >
                  <div style={fieldWrap}>
                    先径(mm)
                    <input
                      value={rodForm.tipMm}
                      onChange={(e) =>
                        setRodForm((prev) => ({
                          ...prev,
                          tipMm: e.target.value,
                        }))
                      }
                      style={fieldStyle}
                      inputMode="decimal"
                    />
                  </div>

                  <div style={fieldWrap}>
                    元径(mm)
                    <input
                      value={rodForm.buttMm}
                      onChange={(e) =>
                        setRodForm((prev) => ({
                          ...prev,
                          buttMm: e.target.value,
                        }))
                      }
                      style={fieldStyle}
                      inputMode="decimal"
                    />
                  </div>
                </div>

                <div style={fieldWrap}>
                  自重(g)
                  <input
                    value={rodForm.weightG}
                    onChange={(e) =>
                      setRodForm((prev) => ({
                        ...prev,
                        weightG: e.target.value,
                      }))
                    }
                    style={fieldStyle}
                    inputMode="decimal"
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    gridTemplateColumns: "1fr 1fr",
                  }}
                >
                  <div style={fieldWrap}>
                    キャストウェイト min(g)
                    <input
                      value={rodForm.castWeightMinG}
                      onChange={(e) =>
                        setRodForm((prev) => ({
                          ...prev,
                          castWeightMinG: e.target.value,
                        }))
                      }
                      style={fieldStyle}
                      inputMode="decimal"
                    />
                  </div>

                  <div style={fieldWrap}>
                    キャストウェイト max(g)
                    <input
                      value={rodForm.castWeightMaxG}
                      onChange={(e) =>
                        setRodForm((prev) => ({
                          ...prev,
                          castWeightMaxG: e.target.value,
                        }))
                      }
                      style={fieldStyle}
                      inputMode="decimal"
                    />
                  </div>
                </div>

                <div style={fieldWrap}>
                  メモ
                  <textarea
                    value={rodForm.memo}
                    onChange={(e) =>
                      setRodForm((prev) => ({ ...prev, memo: e.target.value }))
                    }
                    style={{
                      ...fieldStyle,
                      resize: "vertical",
                      minHeight: 88,
                    }}
                  />
                </div>

                <label
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    fontSize: 13,
                    color: "rgba(255,255,255,0.82)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={rodForm.active}
                    onChange={(e) =>
                      setRodForm((prev) => ({
                        ...prev,
                        active: e.target.checked,
                      }))
                    }
                  />
                  現役タックル
                </label>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void saveRod()}
                    style={btnStyle}
                    disabled={saving}
                  >
                    {saving
                      ? "保存中…"
                      : editingId != null
                        ? "更新する"
                        : "登録する"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setRodForm(emptyRodForm());
                      setError("");
                    }}
                    style={btnStyle}
                  >
                    クリア
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={fieldWrap}>
                  メーカー
                  <input
                    value={reelForm.maker}
                    onChange={(e) =>
                      setReelForm((prev) => ({
                        ...prev,
                        maker: e.target.value,
                      }))
                    }
                    style={fieldStyle}
                    placeholder="例：シマノ"
                  />
                </div>

                <div style={fieldWrap}>
                  モデル名
                  <input
                    value={reelForm.model}
                    onChange={(e) =>
                      setReelForm((prev) => ({
                        ...prev,
                        model: e.target.value,
                      }))
                    }
                    style={fieldStyle}
                    placeholder="例：24ヴァンフォード"
                  />
                </div>

                <div style={fieldWrap}>
                  種別
                  <select
                    value={reelForm.reelType}
                    onChange={(e) =>
                      setReelForm((prev) => ({
                        ...prev,
                        reelType: e.target.value as ReelType,
                      }))
                    }
                    style={fieldStyle}
                  >
                    <option value="spinning">スピニング</option>
                    <option value="bait">ベイト</option>
                  </select>
                </div>

                <div style={fieldWrap}>
                  番手
                  <input
                    value={reelForm.sizeLabel}
                    onChange={(e) =>
                      setReelForm((prev) => ({
                        ...prev,
                        sizeLabel: e.target.value,
                      }))
                    }
                    style={fieldStyle}
                    placeholder="例：C3000HG"
                  />
                </div>

                <div style={fieldWrap}>
                  自重(g)
                  <input
                    value={reelForm.weightG}
                    onChange={(e) =>
                      setReelForm((prev) => ({
                        ...prev,
                        weightG: e.target.value,
                      }))
                    }
                    style={fieldStyle}
                    inputMode="decimal"
                  />
                </div>

                {reelForm.reelType === "bait" && (
                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                      gridTemplateColumns: "1fr 1fr",
                    }}
                  >
                    <div style={fieldWrap}>
                      スプール径(mm)
                      <input
                        value={reelForm.spoolDiameterMm}
                        onChange={(e) =>
                          setReelForm((prev) => ({
                            ...prev,
                            spoolDiameterMm: e.target.value,
                          }))
                        }
                        style={fieldStyle}
                        inputMode="decimal"
                      />
                    </div>

                    <div style={fieldWrap}>
                      スプール幅(mm)
                      <input
                        value={reelForm.spoolWidthMm}
                        onChange={(e) =>
                          setReelForm((prev) => ({
                            ...prev,
                            spoolWidthMm: e.target.value,
                          }))
                        }
                        style={fieldStyle}
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                )}

                <div style={fieldWrap}>
                  1回転巻上げ長(cm)
                  <input
                    value={reelForm.retrieveCm}
                    onChange={(e) =>
                      setReelForm((prev) => ({
                        ...prev,
                        retrieveCm: e.target.value,
                      }))
                    }
                    style={fieldStyle}
                    inputMode="decimal"
                  />
                </div>

                <div style={fieldWrap}>
                  メモ
                  <textarea
                    value={reelForm.memo}
                    onChange={(e) =>
                      setReelForm((prev) => ({ ...prev, memo: e.target.value }))
                    }
                    style={{
                      ...fieldStyle,
                      resize: "vertical",
                      minHeight: 88,
                    }}
                  />
                </div>

                <label
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    fontSize: 13,
                    color: "rgba(255,255,255,0.82)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={reelForm.active}
                    onChange={(e) =>
                      setReelForm((prev) => ({
                        ...prev,
                        active: e.target.checked,
                      }))
                    }
                  />
                  現役タックル
                </label>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void saveReel()}
                    style={btnStyle}
                    disabled={saving}
                  >
                    {saving
                      ? "保存中…"
                      : editingId != null
                        ? "更新する"
                        : "登録する"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setReelForm(emptyReelForm());
                      setError("");
                    }}
                    style={btnStyle}
                  >
                    クリア
                  </button>
                </div>
              </>
            )}
          </div>

          <div
            className="glass glass-strong"
            style={{
              ...sectionCard,
              minHeight: 420,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 16 }}>
                {tab === "rod" ? "ロッド一覧" : "リール一覧"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                現役が先、過去所持は後ろに並ぶよ
              </div>
            </div>

            {loading ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
                読み込み中…
              </div>
            ) : currentList.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
                まだ登録がないよ
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {currentList.map((item) => {
                  const selected = editingId === item.id;
                  const title =
                    item.kind === "rod"
                      ? formatRodLabel(item)
                      : formatReelLabel(item);
                  const sub =
                    item.kind === "rod"
                      ? buildRodCardSub(item)
                      : buildReelCardSub(item);

                  return (
                    <div
                      key={item.id ?? item.uid}
                      className="glass"
                      style={{
                        borderRadius: 14,
                        padding: 12,
                        display: "grid",
                        gap: 10,
                        border: selected
                          ? "2px solid rgba(255,77,109,0.88)"
                          : "1px solid rgba(255,255,255,0.10)",
                        background: selected
                          ? "rgba(255,77,109,0.10)"
                          : "rgba(255,255,255,0.04)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                          alignItems: "baseline",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 900,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {title}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: item.active ? "#b8ffd0" : "#ffd3b8",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.active ? "現役" : "過去所持"}
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.72)",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {sub}
                      </div>

                      {item.memo ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: "rgba(255,255,255,0.82)",
                            overflowWrap: "anywhere",
                          }}
                        >
                          📝 {item.memo}
                        </div>
                      ) : null}

                      <div
                        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                      >
                        <button
                          type="button"
                          onClick={() => loadIntoForm(item)}
                          style={btnStyle}
                        >
                          編集
                        </button>

                        <button
                          type="button"
                          onClick={() => void toggleActive(item)}
                          style={btnStyle}
                          disabled={saving}
                        >
                          {item.active ? "過去所持にする" : "現役に戻す"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
