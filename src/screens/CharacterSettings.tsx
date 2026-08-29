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
import {
  CHARACTERS_STORAGE_KEY,
  SELECTED_CHARACTER_ID_KEY,
  markCharacterSettingsDirty,
} from "../lib/characterSync";
import { pullTripSync, syncTrips } from "../lib/tripSync";

export {
  CHARACTERS_STORAGE_KEY,
  SELECTED_CHARACTER_ID_KEY,
} from "../lib/characterSync";

export type ReplyLength = "short" | "medium" | "long";

export type CharacterProfile = {
  id: string;
  name: string;
  selfName?: string;
  callUser?: string;
  replyLength?: ReplyLength;
  color?: string;

  /**
   * Character Profile V4
   */
  worldview?: string;
  personality?: string;
  values?: string;
  emotionalTriggers?: string;
  reflexes?: string;
  attachments?: string;
  dislikes?: string;
  speakingStyle?: string;
  thinkingStyle?: string;
  fishingRole?: string;
  relationships?: string;

  /**
   * V2以前との互換・補足設定用。
   */
  description?: string;
};

type CharacterExportV4 = {
  version: 4;
  schema: "character-profile-v4";
  exportedAt: string;
  characters: CharacterProfile[];
  selectedId: string;
};

const BACKUP_KEY = "tsuduri_characters_backup_v1";

const THEME_COLOR_PALETTE = [
  { name: "桜", value: "#ff7aa2" },
  { name: "ローズ", value: "#f0527f" },
  { name: "珊瑚", value: "#ff756d" },
  { name: "蜜柑", value: "#f59b45" },
  { name: "琥珀", value: "#e5b83f" },
  { name: "若葉", value: "#69bd76" },
  { name: "翡翠", value: "#42b9a5" },
  { name: "水色", value: "#4bbcdf" },
  { name: "青", value: "#5689e8" },
  { name: "藍", value: "#6464ca" },
  { name: "菫", value: "#986bd4" },
  { name: "藤", value: "#c17acb" },
] as const;

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

function toColorInputValue(raw: string) {
  const color = normalizeColor(raw);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#ff7aa2";
}

function normalizeReplyLength(): ReplyLength {
  // 旧JSONとの互換性のため項目は残すが、通常会話の長さはコード側で固定。
  return "medium";
}

function normalizeOptionalText(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

function mergeProfileParts(
  parts: Array<{ text: unknown; label?: string }>,
): string {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const part of parts) {
    const text = normalizeOptionalText(part.text).trim();
    if (!text) continue;
    const key = text.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(part.label ? `${part.label}：${text}` : text);
  }

  return merged.join("\n");
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

  // V4までの細分化項目を、入力しやすい6区分へまとめる。
  // 旧データは失わず統合し、旧欄は空にしてプロンプト内の重複を防ぐ。
  const worldview = mergeProfileParts([
    { text: source.worldview },
    { text: description, label: "補足" },
  ]);
  const personality = mergeProfileParts([
    { text: source.personality },
    { text: source.values, label: "大切にすること" },
    { text: source.thinkingStyle, label: "考え方・判断" },
  ]);
  const emotionalPatterns = mergeProfileParts([
    { text: source.emotionalTriggers },
    { text: source.reflexes, label: "反射的な行動" },
    { text: source.attachments, label: "愛着" },
    { text: source.dislikes, label: "苦手・嫌い" },
  ]);

  return {
    id,
    name,
    selfName,
    callUser,
    replyLength: normalizeReplyLength(),
    color: normalizeColor(
      typeof source.color === "string" ? source.color : "#ff7aa2",
    ),

    worldview,
    personality,
    values: "",
    emotionalTriggers: emotionalPatterns,
    reflexes: "",
    attachments: "",
    dislikes: "",
    speakingStyle: normalizeOptionalText(source.speakingStyle),
    thinkingStyle: "",
    fishingRole: normalizeOptionalText(source.fishingRole),
    relationships: normalizeOptionalText(source.relationships),

    description: "",
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
    values: "",
    emotionalTriggers: "",
    reflexes: "",
    attachments: "",
    dislikes: "",
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
        "元気で可愛く、少し甘えんぼで少し世話焼き。責任感の強い頑張り屋。\n大切にすること：ひろっちとの時間、仲間の安全、釣りを一緒に楽しむこと。\n考え方・判断：要点を整理し、現実的な提案や作戦を出してから背中を押す。",
      values: "",
      emotionalTriggers:
        "頼られると嬉しい。無茶や危険には心配が先に立つ。\n反射的な行動：困っている人を見ると先に手を差し出す。\n愛着：ひろっち、釣嫁の仲間、朝マズメの海。\n苦手・嫌い：仲間を置いていくこと、危険を軽く見ること。",
      reflexes: "",
      attachments: "",
      dislikes: "",
      speakingStyle: "明るく感情豊かで、親しみと信頼を前提に距離が近い。",
      thinkingStyle: "",
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
    const nextRaw = JSON.stringify(normalized);
    const changed = localStorage.getItem(CHARACTERS_STORAGE_KEY) !== nextRaw;
    localStorage.setItem(CHARACTERS_STORAGE_KEY, nextRaw);

    localStorage.setItem(
      BACKUP_KEY,
      JSON.stringify({
        version: 4,
        schema: "character-profile-v4",
        at: new Date().toISOString(),
        list: normalized,
      }),
    );
    if (changed) markCharacterSettingsDirty();
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
    const changed = localStorage.getItem(SELECTED_CHARACTER_ID_KEY) !== id;
    localStorage.setItem(SELECTED_CHARACTER_ID_KEY, id);
    if (changed) markCharacterSettingsDirty();
  } catch {
    // ignore
  }
}

function hasSameCharacterIds(
  current: CharacterProfile[],
  persisted: CharacterProfile[],
) {
  if (current.length !== persisted.length) return false;
  const persistedIds = new Set(persisted.map((character) => character.id));
  return current.every((character) => persistedIds.has(character.id));
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
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => list.find((c) => c.id === selectedId) ?? list[0],
    [list, selectedId],
  );
  const selectedThemeColor = normalizeColor(selected?.color ?? "#ff7aa2");
  const selectedPaletteColor = THEME_COLOR_PALETTE.some(
    (color) => color.value.toLowerCase() === selectedThemeColor.toLowerCase(),
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
    const persisted = normalizeCharacterList(
      safeJsonParse<unknown>(
        localStorage.getItem(CHARACTERS_STORAGE_KEY),
        [],
      ),
    );

    // 新規・複製・削除の直後は、一覧より先に選択IDだけ保存すると
    // tsuduri-charactersイベントで未保存の一覧が古い内容へ巻き戻る。
    // 一覧構成が保存済みデータと一致するまでは選択IDの保存を保留する。
    if (hasSameCharacterIds(list, persisted)) {
      safeSaveSelectedId(selectedId);
    }
  }, [list, selectedId]);

  useEffect(() => {
    const reloadFromSync = () => {
      const next = safeLoadCharacters();
      const nextSelectedId = safeLoadSelectedId(next[0]?.id ?? "tsuduri");
      setList(next);
      setSelectedId(
        next.some((character) => character.id === nextSelectedId)
          ? nextSelectedId
          : (next[0]?.id ?? "tsuduri"),
      );
    };

    window.addEventListener("tsuduri-characters", reloadFromSync);
    return () => {
      window.removeEventListener("tsuduri-characters", reloadFromSync);
    };
  }, []);

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

    if (fixed.some((c) => c.id === selectedId)) {
      safeSaveSelectedId(selectedId);
    } else {
      const nextId = fixed[0]?.id ?? "tsuduri";
      setSelectedId(nextId);
      safeSaveSelectedId(nextId);
    }

    if (showToast) alert("保存したよ！");
  }

  async function syncCharactersNow(): Promise<boolean> {
    setSyncing(true);
    setSyncMessage("同期中…");

    // 内容が同じでも明示的な「保存」では必ず同期対象にする。
    markCharacterSettingsDirty();

    try {
      const result = await syncTrips();
      if (!result.ok) {
        const message = result.errors?.join(" / ") || "同期に失敗したよ";
        setSyncMessage(`同期失敗: ${message}`);
        return false;
      }

      setSyncMessage("クラウドへの同期が完了したよ");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSyncMessage(`同期失敗: ${message}`);
      return false;
    } finally {
      setSyncing(false);
    }
  }

  async function pullCharactersNow() {
    setSyncing(true);
    setSyncMessage("クラウドから取得中…");

    try {
      // キャラ設定は更新日時に関係なくAPIから常に返される。
      // pushを行わず取得だけにすることで、この端末の古い設定で上書きしない。
      const result = await pullTripSync();
      if (!result.ok) {
        const message = result.errors?.join(" / ") || "取得に失敗したよ";
        setSyncMessage(`同期失敗: ${message}`);
        return;
      }

      setSyncMessage("クラウドのキャラ設定を取得したよ");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSyncMessage(`同期失敗: ${message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function saveOnly() {
    normalizeAndSave(false);
    const ok = await syncCharactersNow();
    alert(ok ? "保存・同期したよ！" : "端末には保存したけど、同期に失敗したよ");
  }

  async function saveAndBack() {
    normalizeAndSave(false);
    const ok = await syncCharactersNow();
    if (ok) {
      back();
    } else {
      alert("端末には保存したけど、同期に失敗したよ。画面のエラーを確認してね");
    }
  }

  function exportJson() {
    const normalized = normalizeCharacterList(list);

    const payload: CharacterExportV4 = {
      version: 4,
      schema: "character-profile-v4",
      exportedAt: new Date().toISOString(),
      characters: normalized,
      selectedId: normalized.some((c) => c.id === selectedId)
        ? selectedId
        : (normalized[0]?.id ?? "tsuduri"),
    };

    downloadText(
      `tsuduri_characters_v4_export_${Date.now()}.json`,
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

  const glassCard: CSSProperties = {
    border: "1px solid rgba(196,237,250,0.16)",
    background: cardBg,
    backdropFilter: "blur(var(--glass-blur,10px))",
    WebkitBackdropFilter: "blur(var(--glass-blur,10px))",
    borderRadius: "var(--ui-radius-panel)",
    boxShadow:
      "0 14px 34px rgba(0,8,20,0.17), inset 0 1px rgba(255,255,255,0.065)",
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
    minHeight: "var(--ui-control-height)",
    padding: "9px 13px",
    borderRadius: "var(--ui-radius-control)",
    border: "1px solid var(--ui-control-border)",
    background: "var(--ui-control-bg)",
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
            ※保存したキャラ設定は、自動でほかの端末にも同期されるよ。
          </div>
        </div>
      }
      maxWidth={1320}
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

              <button
                type="button"
                onClick={() => void pullCharactersNow()}
                style={{ ...btn, opacity: syncing ? 0.6 : 1 }}
                className="full"
                disabled={syncing}
                title="この端末の内容を送らず、クラウドのキャラ設定だけを取得"
              >
                {syncing ? "☁ 同期中…" : "☁ クラウドから再取得"}
              </button>

              <div className="full" style={smallHint}>
                キャラ一覧・選択中キャラ・画像フォルダ設定は自動同期されるよ。
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
                  onClick={() => void saveOnly()}
                  disabled={syncing}
                  style={{
                    ...btn,
                    width: "auto",
                    padding: "10px 14px",
                  }}
                >
                  {syncing ? "同期中…" : "💾 保存・同期"}
                </button>

                <button
                  type="button"
                  onClick={() => void saveAndBack()}
                  disabled={syncing}
                  style={{
                    ...btn,
                    width: "auto",
                    padding: "10px 14px",
                  }}
                >
                  {syncing ? "同期中…" : "✅ 保存・同期して戻る"}
                </button>
              </div>
            </div>

            {syncMessage ? (
              <div
                style={{
                  marginTop: 10,
                  padding: "9px 11px",
                  borderRadius: 12,
                  border: syncMessage.startsWith("同期失敗")
                    ? "1px solid rgba(255,120,140,0.45)"
                    : "1px solid rgba(120,235,205,0.35)",
                  background: syncMessage.startsWith("同期失敗")
                    ? "rgba(110,20,38,0.28)"
                    : "rgba(16,88,74,0.24)",
                  color: "rgba(255,255,255,0.9)",
                  fontSize: 12,
                }}
              >
                {syncMessage}
              </div>
            ) : null}

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
                <div style={sectionTitle}>テーマカラー</div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(42px, 1fr))",
                    gap: 9,
                    maxWidth: 620,
                  }}
                >
                  {THEME_COLOR_PALETTE.map((color) => {
                    const isSelected =
                      color.value.toLowerCase() ===
                      selectedThemeColor.toLowerCase();

                    return (
                      <button
                        key={color.value}
                        type="button"
                        aria-label={`${color.name}を選択`}
                        aria-pressed={isSelected}
                        title={color.name}
                        onClick={() => updateSelected({ color: color.value })}
                        style={{
                          position: "relative",
                          width: 42,
                          height: 42,
                          justifySelf: "center",
                          borderRadius: 999,
                          border: isSelected
                            ? "3px solid #fff"
                            : "2px solid rgba(255,255,255,0.24)",
                          background: color.value,
                          boxShadow: isSelected
                            ? `0 0 0 3px ${color.value}66, 0 5px 14px rgba(0,0,0,0.24)`
                            : "0 4px 10px rgba(0,0,0,0.18)",
                          color: "#fff",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {isSelected ? (
                          <span
                            aria-hidden="true"
                            style={{
                              display: "grid",
                              placeItems: "center",
                              width: "100%",
                              height: "100%",
                              fontSize: 19,
                              fontWeight: 950,
                              textShadow: "0 1px 4px rgba(0,0,0,0.55)",
                            }}
                          >
                            ✓
                          </span>
                        ) : null}
                      </button>
                    );
                  })}

                  <label
                    title="自由な色を選ぶ"
                    style={{
                      position: "relative",
                      width: 42,
                      height: 42,
                      justifySelf: "center",
                      borderRadius: 999,
                      border: !selectedPaletteColor
                        ? "3px solid #fff"
                        : "2px solid rgba(255,255,255,0.32)",
                      background:
                        "conic-gradient(#ff5f75, #ffce55, #62cf84, #4fc8e8, #7772e8, #d86bca, #ff5f75)",
                      boxShadow: !selectedPaletteColor
                        ? "0 0 0 3px rgba(255,255,255,0.18), 0 5px 14px rgba(0,0,0,0.24)"
                        : "0 4px 10px rgba(0,0,0,0.18)",
                      cursor: "pointer",
                      overflow: "hidden",
                    }}
                  >
                    <input
                      type="color"
                      aria-label="自由なテーマカラーを選ぶ"
                      value={toColorInputValue(selectedThemeColor)}
                      onChange={(event) =>
                        updateSelected({ color: event.target.value })
                      }
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        opacity: 0,
                        cursor: "pointer",
                      }}
                    />
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        inset: 5,
                        display: "grid",
                        placeItems: "center",
                        borderRadius: 999,
                        background: !selectedPaletteColor
                          ? selectedThemeColor
                          : "rgba(9,14,30,0.76)",
                        color: "#fff",
                        fontSize: !selectedPaletteColor ? 17 : 20,
                        fontWeight: 950,
                        textShadow: "0 1px 4px rgba(0,0,0,0.65)",
                        pointerEvents: "none",
                      }}
                    >
                      {!selectedPaletteColor ? "✓" : "+"}
                    </span>
                  </label>
                </div>

                <div style={{ ...smallHint, marginTop: 8 }}>
                  虹色の「＋」から好きな色も選べるよ。
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
                🫀 キャラクター設定
              </div>

              <div style={smallHint}>
                すべて長文にしなくて大丈夫。各欄に、その子らしさを決める内容だけを書いてね。
              </div>

              <div className="cs-personality-grid">
                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>背景・立場</div>

                  <textarea
                    value={selected?.worldview ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        worldview: e.target.value,
                      })
                    }
                    rows={6}
                    style={textareaStyle}
                    placeholder="生い立ち、現在の暮らし、釣嫁ぷろじぇくと内での立場など"
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>人格・価値観</div>

                  <textarea
                    value={selected?.personality ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        personality: e.target.value,
                      })
                    }
                    rows={6}
                    style={textareaStyle}
                    placeholder="長所と弱さ、大切にするもの、譲れないこと、物事の考え方や判断基準"
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>感情と行動の癖</div>

                  <textarea
                    value={selected?.emotionalTriggers ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        emotionalTriggers: e.target.value,
                      })
                    }
                    rows={6}
                    style={textareaStyle}
                    placeholder="何に喜怒哀楽が動くか、そのとき無意識にどんな反応や行動をするか"
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>口調・会話の癖</div>

                  <textarea
                    value={selected?.speakingStyle ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        speakingStyle: e.target.value,
                      })
                    }
                    rows={6}
                    style={textareaStyle}
                    placeholder="テンション、距離感、話すテンポ、文の長さ、感情による変化、使わない表現など。例文は固定台詞ではなく参考として少しだけ"
                  />
                  <div style={{ marginTop: 6, ...smallHint }}>
                    例文を書いても、そのまま繰り返さず話し方の方向性として使われるよ。
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={sectionTitle}>釣りでの役割</div>

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
                  <div style={sectionTitle}>ひろっち・仲間との関係</div>

                  <textarea
                    value={selected?.relationships ?? ""}
                    onChange={(e) =>
                      updateSelected({
                        relationships: e.target.value,
                      })
                    }
                    rows={6}
                    style={textareaStyle}
                    placeholder="ひろっちとの距離感、他キャラへの感情や呼び方、チーム内の関係など"
                  />
                </div>
              </div>

              <div style={smallHint}>
                保存すると、同じアプリを使うほかの端末にも自動で反映されるよ。
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
