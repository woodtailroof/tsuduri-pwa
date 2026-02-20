// src/components/Stage.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  DEFAULT_SETTINGS,
  normalizePublicPath,
  useAppSettings,
} from "../lib/appSettings";
import { CHARACTERS_STORAGE_KEY } from "../screens/CharacterSettings";
import { useEmotion, type Emotion } from "../lib/emotion";

type StoredCharacterLike = {
  id?: unknown;
  name?: unknown; // v2
  label?: unknown; // v1
};

const CHARACTER_IMAGE_MAP_KEY = "tsuduri_character_image_map_v1";
type CharacterImageMap = Record<string, string>;

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

function loadCreatedCharacters(): { id: string; label: string }[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(CHARACTERS_STORAGE_KEY);
  const list = safeJsonParse<StoredCharacterLike[]>(raw, []);
  const normalized = list
    .map((c) => {
      const id = typeof c?.id === "string" ? c.id : "";
      const label =
        typeof c?.name === "string"
          ? c.name
          : typeof c?.label === "string"
            ? c.label
            : "";
      return { id, label };
    })
    .filter((x) => !!x.id && !!x.label);

  const seen = new Set<string>();
  const uniq: { id: string; label: string }[] = [];
  for (const c of normalized) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    uniq.push(c);
  }
  return uniq;
}

function loadCharacterImageMap(): CharacterImageMap {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(CHARACTER_IMAGE_MAP_KEY);
  const map = safeJsonParse<CharacterImageMap>(raw, {});
  if (!map || typeof map !== "object") return {};
  return map;
}

function looksLikeImageFilePath(raw: string) {
  return /\.(png|jpg|jpeg|webp|gif|avif)$/i.test(raw.trim());
}

function ensureTrailingSlash(p: string) {
  return p.endsWith("/") ? p : `${p}/`;
}

function normalizeExpression(raw: string): Emotion {
  const v = (raw ?? "").trim();
  if (
    v === "neutral" ||
    v === "happy" ||
    v === "sad" ||
    v === "think" ||
    v === "surprise" ||
    v === "love"
  ) {
    return v;
  }
  return "neutral";
}

function appendAssetVersion(url: string, assetVersion: string) {
  const u = (url ?? "").trim();
  const av = (assetVersion ?? "").trim();
  if (!u || !av) return u;
  const encoded = encodeURIComponent(av);
  return u.includes("?") ? `${u}&av=${encoded}` : `${u}?av=${encoded}`;
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("img_load_failed"));
    img.src = src;
  });
}

function readAssetVersion(settings: unknown): string {
  // any禁止回避：unknown から安全に拾う
  if (settings && typeof settings === "object" && "assetVersion" in settings) {
    const v = (settings as { assetVersion?: unknown }).assetVersion;
    if (typeof v === "string") return v.trim();
    if (typeof v === "number") return String(v).trim();
  }
  return "";
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
  );
}

export default function Stage() {
  const { settings } = useAppSettings();
  const { emotion: globalEmotion } = useEmotion();

  const assetVersion = readAssetVersion(settings);

  const characterEnabled =
    settings.characterEnabled ?? DEFAULT_SETTINGS.characterEnabled;
  const characterMode =
    settings.characterMode ?? DEFAULT_SETTINGS.characterMode;

  const characterScale = Number.isFinite(settings.characterScale)
    ? settings.characterScale
    : DEFAULT_SETTINGS.characterScale;

  const characterOpacity = Number.isFinite(settings.characterOpacity)
    ? settings.characterOpacity
    : DEFAULT_SETTINGS.characterOpacity;

  const characterOverrideSrc = (settings.characterOverrideSrc ?? "").trim();

  const effectiveExpression = normalizeExpression(globalEmotion);

  // ✅ 作成キャラ & マップは毎回読む（同一タブ更新にも追従）
  const createdCharacters = loadCreatedCharacters();
  const charImageMap = loadCharacterImageMap();

  const [randomPickedId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    if (!createdCharacters.length) return "tsuduri";
    const i = Math.floor(Math.random() * createdCharacters.length);
    return createdCharacters[i]?.id ?? createdCharacters[0].id;
  });

  const fixedCharacterId = settings.fixedCharacterId ?? "tsuduri";
  const pickCharacterId =
    characterMode === "fixed" ? fixedCharacterId : randomPickedId;
  const effectiveCharacterId = (pickCharacterId ?? "").trim() || "tsuduri";

  const characterCandidates = useMemo(() => {
    const mappedRaw = (charImageMap[effectiveCharacterId] ?? "").trim();
    const mappedNorm = normalizePublicPath(mappedRaw) || "";
    const mappedIsFile = mappedNorm
      ? looksLikeImageFilePath(mappedNorm)
      : false;
    const mappedDir =
      mappedNorm && !mappedIsFile ? ensureTrailingSlash(mappedNorm) : "";

    const mappedExpressionSrc = mappedDir
      ? normalizePublicPath(`${mappedDir}${effectiveExpression}.png`)
      : "";
    const mappedNeutralSrc = mappedDir
      ? normalizePublicPath(`${mappedDir}neutral.png`)
      : "";
    const mappedSingleSrc = mappedIsFile ? mappedNorm : "";

    // 推測パス（実配置：/assets/characters/{id}/{expression}.png）
    const expressionSrc = normalizePublicPath(
      `/assets/characters/${effectiveCharacterId}/${effectiveExpression}.png`,
    );
    const neutralSrc = normalizePublicPath(
      `/assets/characters/${effectiveCharacterId}/neutral.png`,
    );
    const fallbackSrc = normalizePublicPath(
      `/assets/characters/${effectiveCharacterId}.png`,
    );

    const list = [
      appendAssetVersion(
        normalizePublicPath(characterOverrideSrc),
        assetVersion,
      ),

      // 設定マップ（フォルダなら表情→neutral、単一ならそれ）
      mappedIsFile
        ? appendAssetVersion(mappedSingleSrc, assetVersion)
        : appendAssetVersion(mappedExpressionSrc, assetVersion),
      mappedIsFile ? "" : appendAssetVersion(mappedNeutralSrc, assetVersion),

      // 従来推測
      appendAssetVersion(expressionSrc, assetVersion),
      appendAssetVersion(neutralSrc, assetVersion),
      appendAssetVersion(fallbackSrc, assetVersion),

      // ✅ 最後の保険は「必ず存在する」ファイルへ
      appendAssetVersion(
        "/assets/characters/tsuduri/neutral.png",
        assetVersion,
      ),
    ]
      .map((x) => (x ?? "").trim())
      .filter((x) => !!x);

    const seen = new Set<string>();
    const uniq: string[] = [];
    for (const s of list) {
      if (seen.has(s)) continue;
      seen.add(s);
      uniq.push(s);
    }
    return uniq;
  }, [
    charImageMap,
    effectiveCharacterId,
    effectiveExpression,
    characterOverrideSrc,
    assetVersion,
  ]);

  const candidatesKey = useMemo(
    () => characterCandidates.join("|"),
    [characterCandidates],
  );

  // ===== クロスフェード状態 =====
  const [frontSrc, setFrontSrc] = useState<string>("");
  const [backSrc, setBackSrc] = useState<string>("");
  const [frontVisible, setFrontVisible] = useState<boolean>(true);
  const [tryIndex, setTryIndex] = useState<number>(0);

  // “最新の切替” を識別するトークン（古いtimeout/thenが新表示を壊さないように）
  const swapTokenRef = useRef(0);
  const cleanupTimerRef = useRef<number | null>(null);

  // フェード時間（UIと同じ感覚）
  const fadeMs = prefersReducedMotion() ? 0 : 500;

  useEffect(() => {
    const on = () => setTryIndex(0);
    window.addEventListener("tsuduri-settings", on);
    return () => window.removeEventListener("tsuduri-settings", on);
  }, []);

  useEffect(() => {
    setTryIndex(0);
  }, [candidatesKey]);

  // ✅ 切替本体
  useEffect(() => {
    if (!characterEnabled) return;

    const next = characterCandidates[tryIndex] ?? "";
    if (!next) return;

    // 既に表示中なら何もしない（無駄なフェード防止）
    if (next === frontSrc || next === backSrc) return;

    const token = ++swapTokenRef.current;

    // 既存の掃除タイマーはキャンセル
    if (cleanupTimerRef.current != null) {
      window.clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }

    // “表示を消してからロード”がちらつき原因なので、必ず先にロード
    preloadImage(next)
      .then(() => {
        if (token !== swapTokenRef.current) return;

        // 0ms（reduced motion）の場合は即差し替え
        if (fadeMs === 0) {
          setFrontSrc(next);
          setBackSrc("");
          setFrontVisible(true);
          return;
        }

        // 表示していない方に next を入れて、次フレームで可視側を切替
        if (frontVisible) {
          setBackSrc(next);
          requestAnimationFrame(() => {
            if (token !== swapTokenRef.current) return;
            setFrontVisible(false);
          });
        } else {
          setFrontSrc(next);
          requestAnimationFrame(() => {
            if (token !== swapTokenRef.current) return;
            setFrontVisible(true);
          });
        }

        // フェード完了後、見えない方を片付け（※token一致の時だけ）
        cleanupTimerRef.current = window.setTimeout(() => {
          if (token !== swapTokenRef.current) return;
          if (frontVisible) {
            // frontVisible=true の状態になっていれば、back を消す
            setBackSrc("");
          } else {
            setFrontSrc("");
          }
        }, fadeMs + 30);
      })
      .catch(() => {
        if (token !== swapTokenRef.current) return;

        setTryIndex((i) => {
          const n = i + 1;
          if (n >= characterCandidates.length) {
            console.warn(
              "[Stage] character image load failed for all candidates:",
              characterCandidates,
            );
            return i; // これ以上進めない（無限ループ防止）
          }
          return n;
        });
      });

    return () => {
      // ここでは token を進めない（then/catch 側で token 判定してるため）
      // ただ掃除タイマーは止める
      if (cleanupTimerRef.current != null) {
        window.clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
    };
  }, [
    characterEnabled,
    characterCandidates,
    tryIndex,
    frontSrc,
    backSrc,
    frontVisible,
    fadeMs,
  ]);

  const charWrapStyle: CSSProperties = {
    position: "absolute",
    right: "env(safe-area-inset-right)",
    bottom: "env(safe-area-inset-bottom)",
    width: "min(46vw, 520px)",
    maxWidth: "min(46vw, 520px)",
    pointerEvents: "none",
    transformOrigin: "bottom right",
    transform: `scale(${clamp(characterScale, 0.5, 2.0)})`,
    opacity: clamp(characterOpacity, 0, 1),
    filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.45))",
  };

  const imgCommon: CSSProperties = {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: "100%",
    height: "auto",
    display: "block",
    transition: fadeMs === 0 ? "none" : `opacity ${fadeMs}ms ease`,
    willChange: "opacity",
  };

  return (
    <div style={{ position: "absolute", inset: 0 }} aria-hidden="true">
      {characterEnabled ? (
        <div style={charWrapStyle}>
          {frontSrc ? (
            <img
              src={frontSrc}
              alt=""
              style={{ ...imgCommon, opacity: frontVisible ? 1 : 0 }}
            />
          ) : null}

          {backSrc ? (
            <img
              src={backSrc}
              alt=""
              style={{ ...imgCommon, opacity: frontVisible ? 0 : 1 }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
