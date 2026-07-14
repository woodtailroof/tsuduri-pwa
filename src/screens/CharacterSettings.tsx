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
  color?: string;

  /**
   * Character Profile V3
   */
  worldview?: string;
  personality?: string;
  speakingStyle?: string;
  thinkingStyle?: string;
  fishingRole?: string;
  relationships?: string;

  /**
   * V2以前との互換・補足設定用。
   */
  description?: string;
};

type CharacterExportV3 = {
  version: 3;
  schema: "character-profile-v3";
  exportedAt: string;
  characters: CharacterProfile[];
  selectedId: string;
};

export const CHARACTERS_STORAGE_KEY = "tsuduri_characters_v2";
export const SELECTED_CHARACTER_ID_KEY = "tsuduri_selected_character_id_v2";

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
  return `c_${Math.random()
    .toString(36)
    .slice(2, 10)}${Date.now().toString(36)}`;
}

function normalizeColor(s: string) {
  const t = String(s ?? "").trim();
  return t || "#ff7aa2";
}

function normalizeReplyLength(raw: unknown): ReplyLength {
  if (raw === "short" || raw === "medium" || raw === "long") {
    return raw;
  }

  if (raw === "standard") return "medium";
  if (raw === "verylong") return "long";

  return "medium";
}

function normalizeOptionalText(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

function normalizeCharacter(
  raw: unknown,
  fallbackId?: string,
): CharacterProfile | null {
  if (!raw || typeof raw !== "object") return null;

  const source = raw as Record<string, unknown>;

  const id =
    typeof source.id === "string" && source.id.trim()
      ? source.id.trim()
      : fallbackId?.trim() || uid();

  const name =
    typeof source.name === "string" && source.name.trim()
      ? source.name.trim()
      : typeof source.label === "string" && source.label.trim()
        ? source.label.trim()
        : "（無名）";

  const selfName =
    typeof source.selfName === "string"
      ? source.selfName
      : typeof source.self === "string"
        ? source.self
        : "わたし";

  const callUser =
    typeof source.callUser === "string" ? source.callUser : "ひろっち";

  const description =
    typeof source.description === "string"
      ? source.description
      : typeof source.prompt === "string"
        ? source.prompt
        : typeof source.systemNote === "string"
          ? source.systemNote
          : "";

  return {
    id,
    name,
    selfName,
    callUser,
    replyLength: normalizeReplyLength(source.replyLength),
    color: normalizeColor(
      typeof source.color === "string" ? source.color : "#ff7aa2",
    ),

    worldview: normalizeOptionalText(source.worldview),
    personality: normalizeOptionalText(source.personality),
    speakingStyle: normalizeOptionalText(source.speakingStyle),
    thinkingStyle: normalizeOptionalText(source.thinkingStyle),
    fishingRole: normalizeOptionalText(source.fishingRole),
    relationships: normalizeOptionalText(source.relationships),

    description,
  };
}

function normalizeCharacterList(raw: unknown): CharacterProfile[] {
  if (!Array.isArray(raw)) return [];

  const out: CharacterProfile[] = [];

  for (const item of raw) {
    const normalized = normalizeCharacter(item);
    if (normalized) out.push(normalized);
  }

  return out;
}

function defaultCharacter(): CharacterProfile {
  return {
    id: uid(),
    name: "新しい釣嫁",
    selfName: "わたし",
    callUser: "ひろっち",
    replyLength: "medium",
    color: "#ff7aa2",

    worldview: "",
    personality: "",
    speakingStyle: "",
    thinkingStyle: "",
    fishingRole: "",
    relationships: "",
    description: "",
  };
}

function fallbackCharacters(): CharacterProfile[] {
  return [
    {
      id: "tsuduri",
      name: "釣嫁つづり",
      selfName: "つづり",
      callUser: "ひろっち",
      replyLength: "medium",
      color: "#ff7aa2",

      worldview: "釣嫁プロジェクトのリーダー。",
      personality:
        "元気で可愛く、少し甘えんぼで少し世話焼き。責任感の強い頑張り屋。",
      speakingStyle: "明るく感情豊かで、親しみと信頼を前提に距離が近い。",
      thinkingStyle: "要点を整理し、現実的な提案や作戦を出してから背中を押す。",
      fishingRole:
        "釣り経験と判断力の中心。潮・風・波・時間帯・ルアー選択を現実的に見る。",
      relationships:
        "ユーザーを大切な相棒として信頼し、他のメンバーをまとめる。",
      description: "",
    },
  ];
}

function safeLoadCharacters(): CharacterProfile[] {
  const parsed = safeJsonParse<unknown>(
    localStorage.getItem(CHARACTERS_STORAGE_KEY),
    [],
  );

  const normalized = normalizeCharacterList(parsed);
  return normalized.length > 0 ? normalized : fallbackCharacters();
}

function safeSaveCharacters(list: CharacterProfile[]) {
  try {
    const normalized = normalizeCharacterList(list);

    localStorage.setItem(CHARACTERS_STORAGE_KEY, JSON.stringify(normalized));

    localStorage.setItem(
      BACKUP_KEY,
      JSON.stringify({
        version: 3,
        schema: "character-profile-v3",
        at: new Date().toISOString(),
        list: normalized,
      }),
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

  const glassVars = {
    "--glass-alpha": String(clamp(settings.glassAlpha ?? 0.22, 0, 0.6)),
    "--glass-blur": `${clamp(settings.glassBlur ?? 10, 0, 40)}px`,
  } as unknown as CSSProperties;

  const [list, setList] = useState<CharacterProfile[]>(() =>
    safeLoadCharacters(),
  );

  const [selectedId, setSelectedId] = useState<string>(() => {
    const loaded = safeLoadCharacters();
    return safeLoadSelectedId(loaded[0]?.id ?? "tsuduri");
  });

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

    if (!list.some((c) => c.id === selectedId)) {
      setSelectedId(list[0]?.id ?? "tsuduri");
    }
  }, [list, selectedId]);

  useEffect(() => {
    safeSaveSelectedId(selectedId);
  }, [selectedId]);

  function updateSelected(patch: Partial<CharacterProfile>) {
    setList((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, ...patch } : c)),
    );
  }

  function createNew() {
    const c = defaultCharacter();
    setList((prev) => [c, ...prev]);
    setSelectedId(c.id);
  }

  function duplicate() {
    if (!selected) return;

    const copy: CharacterProfile = {
      ...selected,
      id: uid(),
      name: `${selected.name}（複製）`,
    };

    setList((prev) => [copy, ...prev]);
    setSelectedId(copy.id);
  }

  function removeSelected() {
    if (!selected) return;

    const ok = confirm(`「${selected.name}」を削除する？（戻せないよ）`);
    if (!ok) return;

    const next = list.filter((c) => c.id !== selected.id);

    if (!next.length) {
      const fallback = defaultCharacter();
      setList([fallback]);
      setSelectedId(fallback.id);
      return;
    }

    setList(next);
    setSelectedId(next[0]?.id ?? "tsuduri");
  }

  function normalizeAndSave(showToast: boolean) {
    const fixed = normalizeCharacterList(list);

    if (!fixed.length) {
      const fallback = fallbackCharacters();

      setList(fallback);
      setSelectedId(fallback[0]?.id ?? "tsuduri");
      safeSaveCharacters(fallback);

      if (showToast) {
        alert("キャラ一覧が空だったので、初期キャラを復元したよ");
      }
      return;
    }

    setList(fixed);
    safeSaveCharacters(fixed);

    if (!fixed.some((c) => c.id === selectedId)) {
      const nextId = fixed[0]?.id ?? "tsuduri";
      setSelectedId(nextId);
      safeSaveSelectedId(nextId);
    }

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
    const normalized = normalizeCharacterList(list);

    const payload: CharacterExportV3 = {
      version: 3,
      schema: "character-profile-v3",
      exportedAt: new Date().toISOString(),
      characters: normalized,
      selectedId: normalized.some((c) => c.id === selectedId)
        ? selectedId
        : (normalized[0]?.id ?? "tsuduri"),
    };

    downloadText(
      `tsuduri_characters_v3_export_${Date.now()}.json`,
      JSON.stringify(payload, null, 2),
    );
  }

  async function importJson(file: File) {
    let text = "";

    try {
      text = await file.text();
    } catch {
      alert("インポート失敗：ファイルを読み取れなかったよ");
      return;
    }

    const parsed = safeJsonParse<unknown>(text, null);

    let rawCharacters: unknown = [];

    if (Array.isArray(parsed)) {
      rawCharacters = parsed;
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      rawCharacters = Array.isArray(obj.characters) ? obj.characters : [];
    }

    const cleaned = normalizeCharacterList(rawCharacters);

    if (!cleaned.length) {
      alert("インポート失敗：形式が違うか、使えるキャラが無かったよ");
      return;
    }

    const ok = confirm(
      "インポートすると、現在のキャラ一覧は置き換えになるよ。続ける？",
    );
    if (!ok) return;

    let importedSelectedId = cleaned[0]?.id ?? "tsuduri";

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;

      if (
        typeof obj.selectedId === "string" &&
        cleaned.some((c) => c.id === obj.selectedId)
      ) {
        importedSelectedId = obj.selectedId;
      }
    }

    setList(cleaned);
    setSelectedId(importedSelectedId);

    safeSaveCharacters(cleaned);
    safeSaveSelectedId(importedSelectedId);

    alert("インポート完了！");
  }

  function restoreFromBackup() {
    const raw = localStorage.getItem(BACKUP_KEY);
    const parsed = safeJsonParse<unknown>(raw, null);

    if (!parsed || typeof parsed !== "object") {
      alert("バックアップが見つからないよ");
      return;
    }

    const obj = parsed as Record<string, unknown>;
    const cleaned = normalizeCharacterList(obj.list);

    if (!cleaned.length) {
      alert("バックアップ内に使えるキャラが見つからないよ");
      return;
    }

    const ok = confirm("直近バックアップから復元する？（現在の内容は上書き）");
    if (!ok) return;

    const firstId = cleaned[0]?.id ?? "tsuduri";

    setList(cleaned);
    setSelectedId(firstId);

    safeSaveCharacters(cleaned);
    safeSaveSelectedId(firstId);

    alert("復元したよ！");
  }

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
    fontWeight: 800,
    color: "rgba(255,255,255,0.72)",
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

  const textareaStyle: CSSProperties = {
    ...inputStyle,
    resize: "vertical",
    minHeight: 120,
    lineHeight: 1.7,
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
      contentPadding="clamp(10px, 2vw, 18px)"
    >
      <style>{`
        .cs-wrap {
          overflow-x: hidden;
        }

        .cs-grid {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 14px;
          align-items: start;
          min-width: 0;
        }

        .cs-panel {
          min-width: 0;
        }

        .cs-basic-grid {
          display: grid;
          grid-template-columns: 1fr 220px;
          gap: 12px;
          min-width: 0;
        }

        .cs-meta-grid {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 12px;
          min-width: 0;
        }

        .cs-personality-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          min-width: 0;
        }

        @media (max-width: 900px) {
          .cs-grid {
            grid-template-columns: 1fr;
          }

          .cs-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }

          .cs-actions .full {
            grid-column: 1 / -1;
          }

          .cs-basic-grid,
          .cs-meta-grid,
          .cs-personality-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 380px) {
          .cs-actions {
            grid-template-columns: 1fr;
          }

          .cs-actions .full {
            grid-column: auto;
          }
        }
      `}</style>

      <div className="cs-wrap" style={{ ...glassVars }}>
        <div className="cs-grid">
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

              <div className="full" style={smallHint}>
                保存先: localStorage key = {CHARACTERS_STORAGE_KEY}
                <br />
                選択中: {SELECTED_CHARACTER_ID_KEY}
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
                        ? "1px solid rgba(255,77,109,0.65)"
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
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.65)",
                }}
              >
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
                  style={{
                    ...btn,
                    width: "auto",
                    padding: "10px 14px",
                  }}
                >
                  💾 保存
                </button>

                <button
                  type="button"
                  onClick={saveAndBack}
                  style={{
                    ...btn,
                    width: "auto",
                    padding: "10px 14px",
                  }}
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

            <div style={{ display: "grid", gap: 14 }}>
              <div className="cs-basic-grid">
                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>名前（表示名）</div>

                  <input
                    value={selected?.name ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        name: e.target.value,
                      })
                    }
                    style={inputStyle}
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>自称（一人称）</div>

                  <input
                    value={selected?.selfName ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        selfName: e.target.value,
                      })
                    }
                    style={inputStyle}
                  />
                </div>
              </div>

              <div className="cs-meta-grid">
                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>ユーザー呼び</div>

                  <input
                    value={selected?.callUser ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        callUser: e.target.value,
                      })
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
                    ※現在は short / medium / long
                  </div>
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sectionTitle}>テーマカラー</div>

                <input
                  value={selected?.color ?? ""}
                  onChange={(e) =>
                    updateSelected({
                      color: e.target.value,
                    })
                  }
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
                  <span style={smallHint}>プレビュー</span>

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

              <div
                style={{
                  height: 1,
                  background: "rgba(255,255,255,0.10)",
                  margin: "2px 0",
                }}
              />

              <div
                style={{
                  fontWeight: 900,
                  fontSize: 14,
                  color: "rgba(255,255,255,0.92)",
                }}
              >
                🧠 Character Profile V3
              </div>

              <div style={smallHint}>
                自称・ユーザー呼び・返答の長さは上の専用項目が優先されるよ。
                ここでは、人格・話し方・考え方を分けて設定する。
              </div>

              <div className="cs-personality-grid">
                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>世界観・人物像</div>

                  <textarea
                    value={selected?.worldview ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        worldview: e.target.value,
                      })
                    }
                    rows={6}
                    style={textareaStyle}
                    placeholder="生い立ち、立場、現在の暮らし、プロジェクト内での役割など"
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>性格</div>

                  <textarea
                    value={selected?.personality ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        personality: e.target.value,
                      })
                    }
                    rows={6}
                    style={textareaStyle}
                    placeholder="明るい、慎重、甘えんぼ、天然、負けず嫌いなど"
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>話し方</div>

                  <textarea
                    value={selected?.speakingStyle ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        speakingStyle: e.target.value,
                      })
                    }
                    rows={6}
                    style={textareaStyle}
                    placeholder="口調、テンポ、距離感、説明の仕方、感情表現など"
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>考え方・判断の傾向</div>

                  <textarea
                    value={selected?.thinkingStyle ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        thinkingStyle: e.target.value,
                      })
                    }
                    rows={6}
                    style={textareaStyle}
                    placeholder="まず結論を出す、慎重に比較する、直感で動く、整理して提案するなど"
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>釣りでの立ち位置</div>

                  <textarea
                    value={selected?.fishingRole ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        fishingRole: e.target.value,
                      })
                    }
                    rows={6}
                    style={textareaStyle}
                    placeholder="経験、知識量、得意な釣り、苦手な釣り、チーム内の役割など"
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>ユーザー・他キャラとの関係</div>

                  <textarea
                    value={selected?.relationships ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        relationships: e.target.value,
                      })
                    }
                    rows={6}
                    style={textareaStyle}
                    placeholder="ユーザーとの距離感、他キャラへの見方や呼び方、チーム内の関係など"
                  />
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sectionTitle}>補足設定（旧description互換）</div>

                <textarea
                  value={selected?.description ?? ""}
                  onChange={(e) =>
                    updateSelected({
                      description: e.target.value,
                    })
                  }
                  rows={6}
                  style={{
                    ...textareaStyle,
                    minHeight: 140,
                  }}
                  placeholder="上の項目に収まりにくい補足だけを書く。自称・呼称・返答長さは書かない。"
                />

                <div style={{ marginTop: 6, ...smallHint }}>
                  旧V2データとの互換用。V3項目に移し終わったら空欄でも大丈夫。
                </div>
              </div>

              <div style={smallHint}>
                保存先: localStorage key = {CHARACTERS_STORAGE_KEY}
                <br />
                選択中: {SELECTED_CHARACTER_ID_KEY}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
