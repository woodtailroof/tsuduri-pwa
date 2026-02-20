// src/components/Stage.tsx
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  DEFAULT_SETTINGS,
  getTimeBand,
  normalizePublicPath,
  resolveAutoBackgroundSrc,
  type BgMode,
  useAppSettings,
} from "../lib/appSettings";
import { CHARACTERS_STORAGE_KEY } from "../screens/CharacterSettings";
import { useEmotion, type Emotion } from "../lib/emotion";

const CHARACTER_IMAGE_MAP_KEY = "tsuduri_character_image_map_v1";
type CharacterImageMap = Record<string, string>;

type StoredCharacterLike = {
  id?: unknown;
  name?: unknown; // v2
  label?: unknown; // v1
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

function useMinuteTick() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let timer: number | null = null;

    const arm = () => {
      const now = Date.now();
      const msToNextMinute = 60_000 - (now % 60_000) + 5;
      timer = window.setTimeout(() => {
        setTick((v) => v + 1);
        arm();
      }, msToNextMinute);
    };

    arm();
    return () => {
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  return tick;
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
    if (typeof window === "undefined") return resolve();

    const img = new Image() as HTMLImageElement & {
      decode?: () => Promise<void>;
    };
    img.decoding = "async";

    img.onload = async () => {
      try {
        if (typeof img.decode === "function") await img.decode();
      } catch {
        // ignore
      }
      resolve();
    };
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

async function resolveFirstLoadable(
  candidates: string[],
  token: number,
  tokenRef: React.MutableRefObject<number>,
): Promise<string> {
  for (const src of candidates) {
    if (tokenRef.current !== token) return "";
    try {
      await preloadImage(src);
      if (tokenRef.current !== token) return "";
      return src;
    } catch {
      // next
    }
  }
  return "";
}

export default function Stage() {
  const { settings } = useAppSettings();
  const minuteTick = useMinuteTick();

  // ===== 背景 =====
  const bgMode: BgMode = settings.bgMode ?? DEFAULT_SETTINGS.bgMode;
  const autoBgSet =
    (settings.autoBgSet ?? DEFAULT_SETTINGS.autoBgSet).trim() ||
    DEFAULT_SETTINGS.autoBgSet;
  const fixedBgSrcRaw = settings.fixedBgSrc ?? DEFAULT_SETTINGS.fixedBgSrc;
  const fixedBgSrc =
    normalizePublicPath(fixedBgSrcRaw) || "/assets/bg/ui-check.png";

  const autoPreviewSrc = useMemo(() => {
    const band = getTimeBand(new Date());
    return resolveAutoBackgroundSrc(autoBgSet, band);
  }, [autoBgSet, minuteTick]);

  const effectiveBgSrc = useMemo(() => {
    if (bgMode === "off") return "";
    if (bgMode === "fixed") return fixedBgSrc;
    return autoPreviewSrc;
  }, [bgMode, fixedBgSrc, autoPreviewSrc]);

  // ===== キャラ =====
  const { emotion: globalEmotion } = useEmotion();
  const effectiveExpression = normalizeExpression(globalEmotion);

  const assetVersion = (settings.assetVersion ?? "").trim();

  const characterEnabled =
    settings.characterEnabled ?? DEFAULT_SETTINGS.characterEnabled;
  const characterMode =
    settings.characterMode ?? DEFAULT_SETTINGS.characterMode;

  const createdCharacters = loadCreatedCharacters();
  const charImageMap = loadCharacterImageMap();

  const [randomPickedId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    if (!createdCharacters.length) return "tsuduri";
    const i = Math.floor(Math.random() * createdCharacters.length);
    return createdCharacters[i]?.id ?? createdCharacters[0].id;
  });

  const fixedCharacterId = settings.fixedCharacterId ?? "tsuduri";
  const effectiveCharacterId =
    characterMode === "fixed" ? fixedCharacterId : randomPickedId;

  const characterOverrideSrc = (settings.characterOverrideSrc ?? "").trim();

  const mappedRaw = (charImageMap[effectiveCharacterId] ?? "").trim();
  const mappedNorm = normalizePublicPath(mappedRaw) || "";
  const mappedIsFile = mappedNorm ? looksLikeImageFilePath(mappedNorm) : false;

  const mappedDir =
    mappedNorm && !mappedIsFile ? ensureTrailingSlash(mappedNorm) : "";

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

  const characterCandidates = useMemo(() => {
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

  const FADE_MS = 500;

  const [charCurrent, setCharCurrent] = useState<string>("");
  const [charNext, setCharNext] = useState<string>("");
  const [charFade, setCharFade] = useState(false);

  const charCurrentRef = useRef("");
  useEffect(() => {
    charCurrentRef.current = charCurrent;
  }, [charCurrent]);

  const resolveTokenRef = useRef(0);
  const fadeTokenRef = useRef(0);
  const fadeTimerRef = useRef<number | null>(null);
  const fadeRafRef = useRef<number | null>(null);

  useEffect(() => {
    // 前回の演出は必ず停止（古い確定が刺さるとチラつく）
    if (fadeTimerRef.current != null) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (fadeRafRef.current != null) {
      cancelAnimationFrame(fadeRafRef.current);
      fadeRafRef.current = null;
    }
    fadeTokenRef.current++;

    if (!characterEnabled) {
      // “消える”のは設定でOFFの時だけ
      setCharCurrent("");
      setCharNext("");
      setCharFade(false);
      return;
    }

    const token = ++resolveTokenRef.current;
    let cancelled = false;

    (async () => {
      const picked = await resolveFirstLoadable(
        characterCandidates,
        token,
        resolveTokenRef,
      );
      if (cancelled) return;
      if (resolveTokenRef.current !== token) return;

      // 見つからない場合は現状維持（ここで空にすると「一瞬消え」が出る）
      if (!picked) return;

      const current = charCurrentRef.current;

      // 初回は即表示（Stageは常駐なので、ここは一回だけ）
      if (!current) {
        setCharCurrent(picked);
        setCharNext("");
        setCharFade(false);
        return;
      }

      if (picked === current) return;

      const ftoken = ++fadeTokenRef.current;

      setCharNext(picked);
      setCharFade(false);

      fadeRafRef.current = requestAnimationFrame(() => {
        if (fadeTokenRef.current !== ftoken) return;
        setCharFade(true);
      });

      fadeTimerRef.current = window.setTimeout(() => {
        if (fadeTokenRef.current !== ftoken) return;
        setCharCurrent(picked);
        setCharNext("");
        setCharFade(false);
        fadeTimerRef.current = null;
      }, FADE_MS);
    })();

    return () => {
      cancelled = true;
      if (fadeTimerRef.current != null) {
        window.clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      if (fadeRafRef.current != null) {
        cancelAnimationFrame(fadeRafRef.current);
        fadeRafRef.current = null;
      }
      fadeTokenRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterCandidates.join("|"), characterEnabled]);

  const bgLayerStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
  };

  const bgImageStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage: effectiveBgSrc ? `url("${effectiveBgSrc}")` : "none",
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: `blur(var(--bg-blur, 0px))`,
    transform: "scale(1.03)",
    willChange: "filter, transform",
  };

  const bgDimStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    background: `rgba(0,0,0,var(--bg-dim, 0.25))`,
  };

  const characterScale = Number.isFinite(settings.characterScale)
    ? settings.characterScale
    : DEFAULT_SETTINGS.characterScale;
  const characterOpacity = Number.isFinite(settings.characterOpacity)
    ? settings.characterOpacity
    : DEFAULT_SETTINGS.characterOpacity;

  const characterBaseStyle: CSSProperties = {
    position: "absolute",
    right: "env(safe-area-inset-right)",
    bottom: "env(safe-area-inset-bottom)",
    transform: `scale(${clamp(characterScale, 0.5, 2.0)})`,
    transformOrigin: "bottom right",
    filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.45))",
    maxWidth: "min(46vw, 520px)",
    height: "auto",
    willChange: "opacity",
  };

  const charUnderStyle: CSSProperties = {
    ...characterBaseStyle,
    opacity: clamp(characterOpacity, 0, 1) * (charFade ? 0 : 1),
    transition: `opacity ${FADE_MS}ms ease`,
  };

  const charOverStyle: CSSProperties = {
    ...characterBaseStyle,
    opacity: clamp(characterOpacity, 0, 1) * (charFade ? 1 : 0),
    transition: `opacity ${FADE_MS}ms ease`,
  };

  return (
    <div style={bgLayerStyle} aria-hidden="true">
      <div style={bgImageStyle} />
      <div style={bgDimStyle} />

      {characterEnabled && charCurrent ? (
        <>
          <img src={charCurrent} alt="" style={charUnderStyle} />
          {charNext ? <img src={charNext} alt="" style={charOverStyle} /> : null}
        </>
      ) : null}
    </div>
  );
}