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

export default function Stage() {
  const { settings } = useAppSettings();
  const { emotion: globalEmotion } = useEmotion();

  const assetVersion = String((settings as any)?.assetVersion ?? "").trim();

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

    // 推測パス（プロジェクトの実配置に合わせて必要なら変更）
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

      mappedIsFile
        ? appendAssetVersion(mappedSingleSrc, assetVersion)
        : appendAssetVersion(mappedExpressionSrc, assetVersion),
      mappedIsFile ? "" : appendAssetVersion(mappedNeutralSrc, assetVersion),

      appendAssetVersion(expressionSrc, assetVersion),
      appendAssetVersion(neutralSrc, assetVersion),
      appendAssetVersion(fallbackSrc, assetVersion),

      // 最後の保険（ここが実ファイルとズレてると「永遠に出ない」）
      appendAssetVersion("/assets/characters/tsuduri.png", assetVersion),
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

  const [frontSrc, setFrontSrc] = useState<string>("");
  const [backSrc, setBackSrc] = useState<string>("");
  const [frontVisible, setFrontVisible] = useState<boolean>(true);
  const [tryIndex, setTryIndex] = useState<number>(0);
  const loadTokenRef = useRef(0);

  useEffect(() => {
    const on = () => setTryIndex(0);
    window.addEventListener("tsuduri-settings", on);
    return () => window.removeEventListener("tsuduri-settings", on);
  }, []);

  useEffect(() => {
    setTryIndex(0);
  }, [characterCandidates.length, characterCandidates[0]]);

  useEffect(() => {
    if (!characterEnabled) return;

    const next = characterCandidates[tryIndex] ?? "";
    if (!next) {
      // ここで候補ゼロになってたら、設定 or パスが完全に外れてる
      return;
    }

    if (next === frontSrc || next === backSrc) return;

    const token = ++loadTokenRef.current;

    preloadImage(next)
      .then(() => {
        if (token !== loadTokenRef.current) return;

        if (frontVisible) {
          setBackSrc(next);
          requestAnimationFrame(() => {
            if (token !== loadTokenRef.current) return;
            setFrontVisible(false);
          });
        } else {
          setFrontSrc(next);
          requestAnimationFrame(() => {
            if (token !== loadTokenRef.current) return;
            setFrontVisible(true);
          });
        }
      })
      .catch(() => {
        if (token !== loadTokenRef.current) return;

        setTryIndex((i) => {
          const n = i + 1;
          // 全滅したら警告だけ出して止める（無限ループ防止）
          if (n >= characterCandidates.length) {
            console.warn(
              "[Stage] character image load failed for all candidates:",
              characterCandidates,
            );
            return i;
          }
          return n;
        });
      });
  }, [
    characterEnabled,
    characterCandidates,
    tryIndex,
    frontSrc,
    backSrc,
    frontVisible,
  ]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (frontVisible) setBackSrc("");
      else setFrontSrc("");
    }, 520);
    return () => window.clearTimeout(t);
  }, [frontVisible]);

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
    transition: "opacity 500ms ease",
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
