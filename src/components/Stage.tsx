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

const CHARACTER_IMAGE_MAP_KEY = "tsuduri_character_image_map_v1";
type CharacterImageMap = Record<string, string>;

type StoredCharacterLike = {
  id?: unknown;
  name?: unknown;
  label?: unknown;
};

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

function preloadImage(src: string) {
  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("img_load_failed"));
    img.src = src;
  });
}

async function pickFirstLoadable(candidates: string[], signal: AbortSignal) {
  for (const src of candidates) {
    if (signal.aborted) throw new Error("aborted");
    try {
      await preloadImage(src);
      return src;
    } catch {
      // next
    }
  }
  return "";
}

export default function Stage() {
  const { settings } = useAppSettings();
  const { emotion } = useEmotion();

  const FADE_MS = 500;

  const assetVersion = (settings as any)?.assetVersion
    ? String((settings as any).assetVersion).trim()
    : "";

  const characterEnabled =
    settings.characterEnabled ?? DEFAULT_SETTINGS.characterEnabled;
  const characterMode =
    settings.characterMode ?? DEFAULT_SETTINGS.characterMode;

  const createdCharacters = loadCreatedCharacters();

  const fixedCharacterId = settings.fixedCharacterId ?? "tsuduri";

  // ✅ random は「画面遷移ごと」ではなく Stage 常駐で固定したいので、ここで一回だけ決める
  const [randomPickedId] = useState<string>(() => {
    if (typeof window === "undefined") return "tsuduri";
    if (!createdCharacters.length) return "tsuduri";
    const i = Math.floor(Math.random() * createdCharacters.length);
    return createdCharacters[i]?.id ?? createdCharacters[0].id;
  });

  const effectiveCharacterId =
    characterMode === "fixed" ? fixedCharacterId : randomPickedId;

  const characterOverrideSrc = (settings.characterOverrideSrc ?? "").trim();

  const charImageMap = loadCharacterImageMap();
  const mappedRaw = (charImageMap[effectiveCharacterId] ?? "").trim();
  const mappedNorm = normalizePublicPath(mappedRaw) || "";
  const mappedIsFile = mappedNorm ? looksLikeImageFilePath(mappedNorm) : false;

  const mappedDir =
    mappedNorm && !mappedIsFile ? ensureTrailingSlash(mappedNorm) : "";

  const effectiveExpression = normalizeExpression(emotion);

  const mappedExpressionSrc = mappedDir
    ? normalizePublicPath(`${mappedDir}${effectiveExpression}.png`)
    : "";
  const mappedNeutralSrc = mappedDir
    ? normalizePublicPath(`${mappedDir}neutral.png`)
    : "";
  const mappedSingleSrc = mappedIsFile ? mappedNorm : "";

  const expressionSrc = normalizePublicPath(
    `/assets/characters/${effectiveCharacterId}/${effectiveExpression}.png`,
  );
  const neutralSrc = normalizePublicPath(
    `/assets/characters/${effectiveCharacterId}/neutral.png`,
  );
  const fallbackSrc = normalizePublicPath(
    `/assets/characters/${effectiveCharacterId}.png`,
  );

  const candidates = useMemo(() => {
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
    characterOverrideSrc,
    assetVersion,
    mappedIsFile,
    mappedSingleSrc,
    mappedExpressionSrc,
    mappedNeutralSrc,
    expressionSrc,
    neutralSrc,
    fallbackSrc,
  ]);

  const resolveKey = useMemo(() => {
    return [
      characterEnabled ? "on" : "off",
      effectiveCharacterId,
      effectiveExpression,
      candidates.join("|"),
    ].join("::");
  }, [characterEnabled, effectiveCharacterId, effectiveExpression, candidates]);

  const [activeSrc, setActiveSrc] = useState<string>("");
  const [nextSrc, setNextSrc] = useState<string>("");
  const [crossOn, setCrossOn] = useState(false);

  const lastKeyRef = useRef<string>("");

  useEffect(() => {
    if (!characterEnabled) {
      setActiveSrc("");
      setNextSrc("");
      setCrossOn(false);
      lastKeyRef.current = resolveKey;
      return;
    }

    if (lastKeyRef.current === resolveKey) return;
    lastKeyRef.current = resolveKey;

    const ac = new AbortController();
    const signal = ac.signal;

    (async () => {
      const picked = await pickFirstLoadable(candidates, signal);
      if (signal.aborted) return;

      if (!activeSrc) {
        setActiveSrc(picked);
        setNextSrc("");
        setCrossOn(false);
        return;
      }

      if (picked && picked === activeSrc) return;

      setNextSrc(picked);
      setCrossOn(false);

      requestAnimationFrame(() => {
        if (signal.aborted) return;
        setCrossOn(true);
      });

      window.setTimeout(() => {
        if (signal.aborted) return;
        setActiveSrc(picked);
        setNextSrc("");
        setCrossOn(false);
      }, FADE_MS + 30);
    })().catch(() => {
      // ignore
    });

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveKey]);

  const characterScale = Number.isFinite(settings.characterScale)
    ? settings.characterScale
    : DEFAULT_SETTINGS.characterScale;
  const characterOpacity = Number.isFinite(settings.characterOpacity)
    ? settings.characterOpacity
    : DEFAULT_SETTINGS.characterOpacity;

  const bgLayerStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  };

  const bgImageStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage: "var(--bg-image)",
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: `blur(var(--bg-blur))`,
    transform: "scale(1.03)",
  };

  const bgDimStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    background: `rgba(0,0,0,var(--bg-dim))`,
  };

  const wrapStyle: CSSProperties = {
    position: "absolute",
    right: "env(safe-area-inset-right)",
    bottom: "env(safe-area-inset-bottom)",
    maxWidth: "min(46vw, 520px)",
    width: "auto",
    height: "auto",
  };

  const imgBase: CSSProperties = {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: "100%",
    height: "auto",
    opacity: clamp(characterOpacity, 0, 1),
    transform: `scale(${clamp(characterScale, 0.5, 2.0)})`,
    transformOrigin: "bottom right",
    filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.45))",
    transition: `opacity ${FADE_MS}ms ease`,
    willChange: "opacity",
  };

  const activeOpacity = characterEnabled && activeSrc ? (crossOn ? 0 : 1) : 0;
  const nextOpacity = characterEnabled && nextSrc ? (crossOn ? 1 : 0) : 0;

  return (
    <div style={bgLayerStyle} aria-hidden="true">
      <div style={bgImageStyle} />
      <div style={bgDimStyle} />

      {characterEnabled && (activeSrc || nextSrc) ? (
        <div style={wrapStyle}>
          {activeSrc ? (
            <img
              src={activeSrc}
              alt=""
              style={{ ...imgBase, opacity: activeOpacity }}
            />
          ) : null}
          {nextSrc ? (
            <img
              src={nextSrc}
              alt=""
              style={{ ...imgBase, opacity: nextOpacity }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
