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

  // assetVersion は型がまだ無い可能性があるので安全に読む
  const assetVersion = String((settings as any)?.assetVersion ?? "").trim();

  // ===== 背景は App.tsx のCSS変数で描く（ここでは触らない） =====
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
    filter: "blur(var(--bg-blur))",
    transform: "scale(1.03)",
  };

  const bgDimStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,var(--bg-dim))",
  };

  // ===== キャラ設定 =====
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

  // ✅ 表情（基本は globalEmotion）
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

  // ===== 候補URLリスト（PageShellのロジックを移植） =====
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

      // 設定マップ（フォルダなら表情→neutral、単一ならそれ）
      mappedIsFile
        ? appendAssetVersion(mappedSingleSrc, assetVersion)
        : appendAssetVersion(mappedExpressionSrc, assetVersion),
      mappedIsFile ? "" : appendAssetVersion(mappedNeutralSrc, assetVersion),

      // 従来推測
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
    charImageMap,
    effectiveCharacterId,
    effectiveExpression,
    characterOverrideSrc,
    assetVersion,
  ]);

  // ===== クロスフェード用の2枚運用（ちらつき防止） =====
  const [frontSrc, setFrontSrc] = useState<string>("");
  const [backSrc, setBackSrc] = useState<string>("");
  const [frontVisible, setFrontVisible] = useState<boolean>(true);

  // いま試している候補インデックス
  const [tryIndex, setTryIndex] = useState<number>(0);

  // “切替処理が二重に走って古いロードが勝つ”のを防ぐトークン
  const loadTokenRef = useRef(0);

  // 設定画面のマップ更新イベント（同一タブ）にも追従したいので再評価
  useEffect(() => {
    const on = () => {
      // candidates依存は useMemo が吸うが、念のため「再試行」だけ発火させる
      setTryIndex(0);
    };
    window.addEventListener("tsuduri-settings", on);
    return () => window.removeEventListener("tsuduri-settings", on);
  }, []);

  // candidatesが変わったら最初から試行
  useEffect(() => {
    setTryIndex(0);
  }, [characterCandidates.join("|")]);

  useEffect(() => {
    if (!characterEnabled) return;
    const next = characterCandidates[tryIndex] ?? "";
    if (!next) return;

    // 既に表示中なら何もしない（無駄なフェードを防ぐ）
    if (next === frontSrc || next === backSrc) return;

    const token = ++loadTokenRef.current;

    // “表示を消してからロード”がちらつき原因なので、必ず先にロードする
    preloadImage(next)
      .then(() => {
        if (token !== loadTokenRef.current) return;

        // いま front が見えてるなら、裏に next を差してクロスフェード
        if (frontVisible) {
          setBackSrc(next);
          // 次フレームでトランジションが効くように
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
        // 次候補へ（ただし画面は消さない）
        setTryIndex((i) => {
          const n = i + 1;
          return n < characterCandidates.length ? n : i;
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterEnabled, characterCandidates, tryIndex]);

  // フェードが完了したら、見えなくなった方をクリアして軽量化
  useEffect(() => {
    const t = window.setTimeout(() => {
      // frontVisible=true なら back は見えてない
      if (frontVisible) setBackSrc("");
      else setFrontSrc("");
    }, 520); // 0.5s + α
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
      <div style={bgLayerStyle}>
        <div style={bgImageStyle} />
        <div style={bgDimStyle} />
      </div>

      {characterEnabled ? (
        <div style={charWrapStyle}>
          {/* front */}
          {frontSrc ? (
            <img
              src={frontSrc}
              alt=""
              style={{
                ...imgCommon,
                opacity: frontVisible ? 1 : 0,
              }}
            />
          ) : null}

          {/* back */}
          {backSrc ? (
            <img
              src={backSrc}
              alt=""
              style={{
                ...imgCommon,
                opacity: frontVisible ? 0 : 1,
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
