// src/screens/CharacterSettings.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import PageShell from "../components/PageShell";
import { useAppSettings } from "../lib/appSettings";

export type ReplyLength = "short" | "medium" | "long";

export type CharacterProfile = {
  id: string;
  name: string;
  selfName?: string;
  callUser?: string;
  replyLength?: ReplyLength;
  description?: string;
  color?: string;
};

// ✅ 既存キー（プロジェクト内で参照されてる前提）
export const CHARACTERS_STORAGE_KEY = "tsuduri_characters_v2";
export const SELECTED_CHARACTER_ID_KEY = "tsuduri_selected_character_id_v2";

// ちょい保険
const BACKUP_KEY = "tsuduri_characters_backup_v1";

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function uid() {
  return `c_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function normalizeColor(s: string) {
  const t = (s ?? "").trim();
  if (!t) return "#ff7aa2";
  return t;
}

function defaultCharacter(): CharacterProfile {
  return {
    id: uid(),
    name: "新しい釣嫁",
    selfName: "わたし",
    callUser: "ひろっち",
    replyLength: "medium",
    description: "性格・口調・距離感などを書いてね。",
    color: "#ff7aa2",
  };
}

function safeLoadCharacters(): CharacterProfile[] {
  const list = safeJsonParse<CharacterProfile[]>(
    localStorage.getItem(CHARACTERS_STORAGE_KEY),
    [],
  );
  if (Array.isArray(list) && list.length) return list;
  return [
    {
      id: "tsuduri",
      name: "釣嫁つづり",
      selfName: "つづり",
      callUser: "ひろっち",
      replyLength: "medium",
      description:
        "元気で可愛い、少し甘え＆少し世話焼き。釣りは現実的に頼れる相棒。説教しない。危ないことは心配として止める。",
      color: "#ff7aa2",
    },
  ];
}

function safeSaveCharacters(list: CharacterProfile[]) {
  try {
    localStorage.setItem(CHARACTERS_STORAGE_KEY, JSON.stringify(list));
    localStorage.setItem(
      BACKUP_KEY,
      JSON.stringify({ at: new Date().toISOString(), list }),
    );
  } catch {
    // ignore
  }
}

function safeLoadSelectedId(fallback: string) {
  try {
    const raw = localStorage.getItem(SELECTED_CHARACTER_ID_KEY);
    return raw && raw.trim() ? raw : fallback;
  } catch {
    return fallback;
  }
}

function safeSaveSelectedId(id: string) {
  try {
    localStorage.setItem(SELECTED_CHARACTER_ID_KEY, id);
  } catch {
    // ignore
  }
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function CharacterSettings({ back }: { back: () => void }) {
  const { settings } = useAppSettings();

  // ✅ すりガラス設定をこの画面にも流し込む（これが無いと「一部だけ反映」になる）
  const glassVars = {
    "--glass-alpha": String(clamp(settings.glassAlpha ?? 0.22, 0, 0.6)),
    "--glass-blur": `${clamp(settings.glassBlur ?? 10, 0, 40)}px`,
  } as unknown as CSSProperties;

  const [list, setList] = useState<CharacterProfile[]>(() =>
    safeLoadCharacters(),
  );
  const [selectedId, setSelectedId] = useState<string>(() =>
    safeLoadSelectedId(safeLoadCharacters()[0]?.id ?? "tsuduri"),
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => list.find((c) => c.id === selectedId) ?? list[0],
    [list, selectedId],
  );

  useEffect(() => {
    if (!list.length) {
      const next = safeLoadCharacters();
      setList(next);
      setSelectedId(next[0]?.id ?? "tsuduri");
      return;
    }
    const exists = list.some((c) => c.id === selectedId);
    if (!exists) setSelectedId(list[0]?.id ?? "tsuduri");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  useEffect(() => {
    safeSaveSelectedId(selectedId);
  }, [selectedId]);

  function updateSelected(patch: Partial<CharacterProfile>) {
    setList((prev) =>
      prev.map((c) => {
        if (c.id !== selectedId) return c;
        return { ...c, ...patch };
      }),
    );
  }

  function createNew() {
    const c = defaultCharacter();
    const next = [c, ...list];
    setList(next);
    setSelectedId(c.id);
  }

  function duplicate() {
    if (!selected) return;
    const copy: CharacterProfile = {
      ...selected,
      id: uid(),
      name: `${selected.name}（複製）`,
    };
    const next = [copy, ...list];
    setList(next);
    setSelectedId(copy.id);
  }

  function removeSelected() {
    if (!selected) return;
    const ok = confirm(`「${selected.name}」を削除する？（戻せないよ）`);
    if (!ok) return;
    const next = list.filter((c) => c.id !== selected.id);
    setList(next);
    setSelectedId(next[0]?.id ?? "tsuduri");
  }

  function normalizeAndSave(showToast: boolean) {
    const fixed = list.map((c) => ({
      ...c,
      name: (c.name ?? "").trim() || "（無名）",
      selfName: (c.selfName ?? "").trim(),
      callUser: (c.callUser ?? "").trim(),
      replyLength: (c.replyLength ?? "medium") as ReplyLength,
      description: String(c.description ?? ""),
      color: normalizeColor(String(c.color ?? "#ff7aa2")),
    }));
    safeSaveCharacters(fixed);
    if (showToast) alert("保存したよ！");
  }

  function saveOnly() {
    normalizeAndSave(true);
  }

  function saveAndBack() {
    normalizeAndSave(false);
    back();
  }

  function exportJson() {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      characters: list,
      selectedId,
    };
    downloadText(
      `tsuduri_characters_export_${Date.now()}.json`,
      JSON.stringify(payload, null, 2),
    );
  }

  async function importJson(file: File) {
    const text = await file.text();
    const parsed = safeJsonParse<any>(text, null);

    const importedList: CharacterProfile[] =
      parsed?.characters && Array.isArray(parsed.characters)
        ? parsed.characters
        : Array.isArray(parsed)
          ? parsed
          : [];

    if (!importedList.length) {
      alert("インポート失敗：形式が違うかも");
      return;
    }

    const ok = confirm(
      "インポートすると、現在のキャラ一覧は置き換えになるよ。続ける？",
    );
    if (!ok) return;

    const cleaned = importedList
      .filter(
        (c) => c && typeof c.id === "string" && typeof c.name === "string",
      )
      .map((c) => ({
        id: String(c.id),
        name: String(c.name),
        selfName: typeof c.selfName === "string" ? c.selfName : "わたし",
        callUser: typeof c.callUser === "string" ? c.callUser : "ひろっち",
        replyLength: (c.replyLength as ReplyLength) ?? "medium",
        description: typeof c.description === "string" ? c.description : "",
        color: normalizeColor(
          typeof c.color === "string" ? c.color : "#ff7aa2",
        ),
      }));

    setList(cleaned);
    setSelectedId(
      parsed?.selectedId && typeof parsed.selectedId === "string"
        ? parsed.selectedId
        : (cleaned[0]?.id ?? cleaned[0].id),
    );

    safeSaveCharacters(cleaned);
    alert("インポート完了！");
  }

  function restoreFromBackup() {
    const raw = localStorage.getItem(BACKUP_KEY);
    const parsed = safeJsonParse<any>(raw, null);
    const backupList = parsed?.list;
    if (!Array.isArray(backupList) || !backupList.length) {
      alert("バックアップが見つからないよ");
      return;
    }
    const ok = confirm("直近バックアップから復元する？（現在の内容は上書き）");
    if (!ok) return;
    setList(backupList as CharacterProfile[]);
    const firstId = (backupList[0] as any)?.id;
    setSelectedId(typeof firstId === "string" ? firstId : "tsuduri");
    safeSaveCharacters(backupList as CharacterProfile[]);
    alert("復元したよ！");
  }

  // ===== 見た目（重要：CSS変数を使って統一）=====
  const cardBg = "rgba(0,0,0,calc(0.10 + var(--glass-alpha,0.22) * 0.70))";
  const fieldBg = "rgba(0,0,0,calc(0.16 + var(--glass-alpha,0.22) * 0.65))";
  const btnBg = "rgba(0,0,0,calc(0.12 + var(--glass-alpha,0.22) * 0.55))";

  const glassCard: CSSProperties = {
    border: "1px solid rgba(255,255,255,0.14)",
    background: cardBg,
    backdropFilter: "blur(var(--glass-blur,10px))",
    WebkitBackdropFilter: "blur(var(--glass-blur,10px))",
    borderRadius: 14,
  };

  const sectionTitle: CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.60)",
    marginBottom: 6,
  };

  const smallHint: CSSProperties = {
    fontSize: 11,
    color: "rgba(255,255,255,0.50)",
    lineHeight: 1.6,
  };

  const btn: CSSProperties = {
    width: "100%",
    textAlign: "center",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: btnBg,
    color: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(var(--glass-blur,10px))",
    WebkitBackdropFilter: "blur(var(--glass-blur,10px))",
    cursor: "pointer",
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: fieldBg,
    color: "#fff",
    padding: "10px 12px",
    outline: "none",
    backdropFilter: "blur(var(--glass-blur,10px))",
    WebkitBackdropFilter: "blur(var(--glass-blur,10px))",
    boxSizing: "border-box",
  };

  const selectStyle: CSSProperties = {
    ...inputStyle,
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    paddingRight: 34,
  };

  return (
    <PageShell
      title={
        <div>
          <h1 style={{ margin: 0 }}>🎭 キャラ管理</h1>
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.55)",
              marginTop: 6,
              lineHeight: 1.6,
            }}
          >
            ※キャラはローカル（端末ごと）に保存されます。別端末へはエクスポート/インポートで移せるよ。
          </div>
        </div>
      }
      maxWidth={1100}
      showBack
      onBack={back}
      titleLayout="left"
      scrollY="auto"
      contentPadding={"clamp(10px, 2vw, 18px)"}
    >
      <style>{`
        .cs-wrap { overflow-x: hidden; }
        .cs-grid {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 14px;
          align-items: start;
          min-width: 0;
        }
        .cs-panel { min-width: 0; }

        @media (max-width: 900px) {
          .cs-grid { grid-template-columns: 1fr; }
          .cs-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }
          .cs-actions .full { grid-column: 1 / -1; }
        }
        @media (max-width: 380px) {
          .cs-actions { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ✅ ここで CSS 変数を画面全体に供給 */}
      <div className="cs-wrap" style={{ ...glassVars }}>
        <div className="cs-grid">
          {/* 左：操作＆一覧 */}
          <div className="cs-panel" style={{ ...glassCard, padding: 12 }}>
            <div className="cs-actions">
              <button type="button" onClick={createNew} style={btn}>
                ➕ 新規
              </button>
              <button type="button" onClick={duplicate} style={btn}>
                🧬 複製
              </button>
              <button type="button" onClick={removeSelected} style={btn}>
                🗑 選択中を削除
              </button>

              <div
                className="full"
                style={{
                  height: 1,
                  background: "rgba(255,255,255,0.10)",
                  margin: "2px 0",
                }}
              />

              <button type="button" onClick={exportJson} style={btn}>
                📦 エクスポート
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={btn}
                title="JSONをインポートしてキャラ一覧を置き換え"
              >
                📥 インポート
              </button>

              <button
                type="button"
                onClick={restoreFromBackup}
                style={{ ...btn, opacity: 0.9 }}
                className="full"
              >
                🛟 直近バックアップから復元
              </button>

              <div className="full" style={{ ...smallHint }}>
                保存先: localStorage key = {CHARACTERS_STORAGE_KEY} / 選択中 ={" "}
                {SELECTED_CHARACTER_ID_KEY}
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = "";
                if (!f) return;
                await importJson(f);
              }}
            />

            <div
              style={{
                height: 1,
                background: "rgba(255,255,255,0.10)",
                margin: "12px 0",
              }}
            />

            <div style={sectionTitle}>キャラ一覧（クリックで選択）</div>

            <div style={{ display: "grid", gap: 10 }}>
              {list.map((c) => {
                const isSel = c.id === selectedId;
                const color = normalizeColor(c.color ?? "#ff7aa2");
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      borderRadius: 14,
                      border: isSel
                        ? `1px solid rgba(255,77,109,0.65)`
                        : "1px solid rgba(255,255,255,0.12)",
                      background: isSel
                        ? "rgba(255,77,109,calc(0.06 + var(--glass-alpha,0.22) * 0.20))"
                        : cardBg,
                      backdropFilter: "blur(var(--glass-blur,10px))",
                      WebkitBackdropFilter: "blur(var(--glass-blur,10px))",
                      padding: 12,
                      cursor: "pointer",
                      color: "#fff",
                      minWidth: 0,
                      boxSizing: "border-box",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        minWidth: 0,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: color,
                          boxShadow: "0 0 0 4px rgba(255,255,255,0.06)",
                          flex: "0 0 auto",
                        }}
                      />
                      <div
                        style={{
                          fontWeight: 900,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          minWidth: 0,
                        }}
                      >
                        {c.name}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "rgba(255,255,255,0.65)",
                        lineHeight: 1.55,
                      }}
                    >
                      一人称: {c.selfName || "—"} / 呼称: {c.callUser || "—"}
                      <br />
                      長さ: {c.replyLength || "medium"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 右：編集 */}
          <div className="cs-panel" style={{ ...glassCard, padding: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                選択中：{" "}
                <strong style={{ color: "#fff" }}>
                  {selected?.name ?? "—"}
                </strong>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={saveOnly}
                  style={{ ...btn, width: "auto", padding: "10px 14px" }}
                >
                  💾 保存
                </button>
                <button
                  type="button"
                  onClick={saveAndBack}
                  style={{ ...btn, width: "auto", padding: "10px 14px" }}
                >
                  ✅ 保存して戻る
                </button>
              </div>
            </div>

            <div
              style={{
                height: 1,
                background: "rgba(255,255,255,0.10)",
                margin: "12px 0",
              }}
            />

            <div style={{ display: "grid", gap: 12 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 220px",
                  gap: 12,
                  minWidth: 0,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>名前（表示名）</div>
                  <input
                    value={selected?.name ?? ""}
                    onChange={(e) => updateSelected({ name: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>自称（一人称）</div>
                  <input
                    value={selected?.selfName ?? ""}
                    onChange={(e) =>
                      updateSelected({ selfName: e.target.value })
                    }
                    style={inputStyle}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "260px 1fr",
                  gap: 12,
                  minWidth: 0,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>ユーザー呼び</div>
                  <input
                    value={selected?.callUser ?? ""}
                    onChange={(e) =>
                      updateSelected({ callUser: e.target.value })
                    }
                    style={inputStyle}
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>返答の長さ</div>
                  <div style={{ position: "relative" }}>
                    <select
                      value={(selected?.replyLength ?? "medium") as ReplyLength}
                      onChange={(e) =>
                        updateSelected({
                          replyLength: e.target.value as ReplyLength,
                        })
                      }
                      style={selectStyle}
                    >
                      <option value="short">短め</option>
                      <option value="medium">標準</option>
                      <option value="long">長め</option>
                    </select>
                    <span
                      style={{
                        position: "absolute",
                        right: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        pointerEvents: "none",
                        color: "rgba(255,255,255,0.55)",
                        fontSize: 12,
                      }}
                    >
                      ▼
                    </span>
                  </div>
                  <div style={{ marginTop: 6, ...smallHint }}>
                    ※max_output_tokens に直結（体感差が出る）
                  </div>
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sectionTitle}>テーマカラー</div>
                <input
                  value={selected?.color ?? ""}
                  onChange={(e) => updateSelected({ color: e.target.value })}
                  style={inputStyle}
                  placeholder="#ff7aa2"
                />
                <div
                  style={{
                    marginTop: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ ...smallHint }}>プレビュー</span>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      background: normalizeColor(selected?.color ?? "#ff7aa2"),
                      boxShadow: "0 0 0 4px rgba(255,255,255,0.06)",
                    }}
                  />
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sectionTitle}>キャラクター設定（自由記述）</div>
                <textarea
                  value={selected?.description ?? ""}
                  onChange={(e) =>
                    updateSelected({ description: e.target.value })
                  }
                  rows={10}
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    minHeight: 220,
                    lineHeight: 1.7,
                  }}
                />
                <div style={{ marginTop: 6, ...smallHint }}>
                  コツ：自称・ユーザー呼び・返答の長さは上の入力欄が優先。ここには性格・世界観・口調・得意不得意を書くと安定しやすいよ。
                </div>
              </div>

              <div style={{ ...smallHint }}>
                保存先: localStorage key = {CHARACTERS_STORAGE_KEY} / 選択中 ={" "}
                {SELECTED_CHARACTER_ID_KEY}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
