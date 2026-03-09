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

type Props = {
  /** ✅ 画面遷移キー（ランダムを画面遷移ごとに成立させる） */
  activeKey?: string;

  /** ✅ 直接propsで渡したい場合の受け口（任意） */
  displayCharacterId?: string;
};

type StoredCharacterLike = {
  id?: unknown;
  name?: unknown;
  label?: unknown;
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

function pickRandomId(list: { id: string }[]): string {
  if (!list.length) return "tsuduri";
  const i = Math.floor(Math.random() * list.length);
  return list[i]?.id ?? list[0].id;
}

export default function Stage(props: Props) {
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

  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const fadeMs = reducedMotion ? 0 : 500;

  const [createdCharacters, setCreatedCharacters] = useState<
    { id: string; label: string }[]
  >(() => loadCreatedCharacters());
  const [charImageMap, setCharImageMap] = useState<CharacterImageMap>(() =>
    loadCharacterImageMap(),
  );

  useEffect(() => {
    const reload = () => {
      setCreatedCharacters(loadCreatedCharacters());
      setCharImageMap(loadCharacterImageMap());
    };

    reload();

    window.addEventListener("storage", reload);
    window.addEventListener("tsuduri-settings", reload);

    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener("tsuduri-settings", reload);
    };
  }, []);

  const [forcedIdFromShell, setForcedIdFromShell] = useState<string>("");
  const forcedIdFromShellRef = useRef(forcedIdFromShell);
  useEffect(() => {
    forcedIdFromShellRef.current = forcedIdFromShell;
  }, [forcedIdFromShell]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (ev: Event) => {
      const ce = ev as CustomEvent<{ id?: unknown }>;
      const raw = ce?.detail?.id;
      const id = typeof raw === "string" ? raw.trim() : "";
      setForcedIdFromShell(id);
    };

    window.addEventListener(
      "tsuduri-display-character",
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        "tsuduri-display-character",
        handler as EventListener,
      );
  }, []);

  const [randomPickedId, setRandomPickedId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return pickRandomId(loadCreatedCharacters());
  });

  const routeModeEnabledRef = useRef<boolean>(false);
  const lastRouteKeyRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onRoute = (ev: Event) => {
      routeModeEnabledRef.current = true;

      const ce = ev as CustomEvent<{ key?: unknown }>;
      const rawKey = ce?.detail?.key;
      const key = typeof rawKey === "string" ? rawKey : "";

      if (key && key === lastRouteKeyRef.current) return;
      if (key) lastRouteKeyRef.current = key;

      if (characterMode !== "random") return;

      const forced =
        (props.displayCharacterId ?? "").trim() || forcedIdFromShellRef.current;
      if (forced) return;

      setRandomPickedId(pickRandomId(createdCharacters));
    };

    window.addEventListener("tsuduri-stage-route", onRoute as EventListener);
    return () =>
      window.removeEventListener(
        "tsuduri-stage-route",
        onRoute as EventListener,
      );
  }, [characterMode, props.displayCharacterId, createdCharacters]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (routeModeEnabledRef.current) return;
    if (characterMode !== "random") return;

    const forced =
      (props.displayCharacterId ?? "").trim() || forcedIdFromShellRef.current;
    if (forced) return;

    setRandomPickedId(pickRandomId(createdCharacters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.activeKey, characterMode]);

  const fixedCharacterId = settings.fixedCharacterId ?? "tsuduri";

  const forcedId =
    (props.displayCharacterId ?? "").trim() || (forcedIdFromShell ?? "").trim();

  const pickCharacterId =
    characterMode === "fixed" ? fixedCharacterId : randomPickedId;

  const effectiveCharacterId =
    forcedId || (pickCharacterId ?? "").trim() || "tsuduri";

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

  const [frontSrc, setFrontSrc] = useState<string>("");
  const [backSrc, setBackSrc] = useState<string>("");
  const [frontVisible, setFrontVisible] = useState<boolean>(true);
  const frontVisibleRef = useRef(frontVisible);
  useEffect(() => {
    frontVisibleRef.current = frontVisible;
  }, [frontVisible]);

  const [tryIndex, setTryIndex] = useState<number>(0);

  const swapTokenRef = useRef(0);
  const cleanupTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setTryIndex(0);
  }, [candidatesKey]);

  useEffect(() => {
    if (!characterEnabled) return;

    const next = characterCandidates[tryIndex] ?? "";
    if (!next) return;

    if (next === frontSrc || next === backSrc) {
      if (fadeMs === 0) {
        if (next !== frontSrc) setFrontSrc(next);
        setBackSrc("");
        setFrontVisible(true);
        return;
      }

      if (next === backSrc && frontVisibleRef.current) {
        const token = ++swapTokenRef.current;

        if (cleanupTimerRef.current != null) {
          window.clearTimeout(cleanupTimerRef.current);
          cleanupTimerRef.current = null;
        }

        requestAnimationFrame(() => {
          if (token !== swapTokenRef.current) return;
          setFrontVisible(false);
        });

        cleanupTimerRef.current = window.setTimeout(() => {
          if (token !== swapTokenRef.current) return;
          if (!frontVisibleRef.current) setFrontSrc("");
        }, fadeMs + 30);

        return;
      }

      if (next === frontSrc && !frontVisibleRef.current) {
        const token = ++swapTokenRef.current;

        if (cleanupTimerRef.current != null) {
          window.clearTimeout(cleanupTimerRef.current);
          cleanupTimerRef.current = null;
        }

        requestAnimationFrame(() => {
          if (token !== swapTokenRef.current) return;
          setFrontVisible(true);
        });

        cleanupTimerRef.current = window.setTimeout(() => {
          if (token !== swapTokenRef.current) return;
          if (frontVisibleRef.current) setBackSrc("");
        }, fadeMs + 30);

        return;
      }

      return;
    }

    const token = ++swapTokenRef.current;

    if (cleanupTimerRef.current != null) {
      window.clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }

    preloadImage(next)
      .then(() => {
        if (token !== swapTokenRef.current) return;

        if (fadeMs === 0) {
          setFrontSrc(next);
          setBackSrc("");
          setFrontVisible(true);
          return;
        }

        if (frontVisibleRef.current) {
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

        cleanupTimerRef.current = window.setTimeout(() => {
          if (token !== swapTokenRef.current) return;
          if (frontVisibleRef.current) setBackSrc("");
          else setFrontSrc("");
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
            return i;
          }
          return n;
        });
      });

    return () => {
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
