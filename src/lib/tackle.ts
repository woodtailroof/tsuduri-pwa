// src/lib/tackle.ts
import type { TackleItem } from "../db";

function safeLocaleCompare(a: string, b: string): number {
  return a.localeCompare(b, "ja");
}

export function rodLengthInches(tackle: TackleItem): number {
  if (!tackle.rod) return Number.MAX_SAFE_INTEGER;

  const feet =
    typeof tackle.rod.lengthFeet === "number" &&
    Number.isFinite(tackle.rod.lengthFeet)
      ? tackle.rod.lengthFeet
      : null;

  const inches =
    typeof tackle.rod.lengthInches === "number" &&
    Number.isFinite(tackle.rod.lengthInches)
      ? tackle.rod.lengthInches
      : 0;

  if (feet == null || feet <= 0) return Number.MAX_SAFE_INTEGER;
  return feet * 12 + inches;
}

export function reelWeightG(tackle: TackleItem): number {
  if (!tackle.reel) return Number.MAX_SAFE_INTEGER;

  const weight = tackle.reel.weightG;
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  return weight;
}

export function sortRods(list: TackleItem[]): TackleItem[] {
  return [...list]
    .filter((item) => item.kind === "rod")
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;

      const lenA = rodLengthInches(a);
      const lenB = rodLengthInches(b);
      if (lenA !== lenB) return lenA - lenB;

      const makerCmp = safeLocaleCompare(a.maker, b.maker);
      if (makerCmp !== 0) return makerCmp;

      const modelCmp = safeLocaleCompare(a.model, b.model);
      if (modelCmp !== 0) return modelCmp;

      const sizeA = a.rod?.sizeLabel ?? "";
      const sizeB = b.rod?.sizeLabel ?? "";
      return safeLocaleCompare(sizeA, sizeB);
    });
}

export function sortReels(list: TackleItem[]): TackleItem[] {
  return [...list]
    .filter((item) => item.kind === "reel")
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;

      const weightA = reelWeightG(a);
      const weightB = reelWeightG(b);
      if (weightA !== weightB) return weightA - weightB;

      const makerCmp = safeLocaleCompare(a.maker, b.maker);
      if (makerCmp !== 0) return makerCmp;

      const modelCmp = safeLocaleCompare(a.model, b.model);
      if (modelCmp !== 0) return modelCmp;

      const sizeA = a.reel?.sizeLabel ?? "";
      const sizeB = b.reel?.sizeLabel ?? "";
      return safeLocaleCompare(sizeA, sizeB);
    });
}

function formatLength(tackle: TackleItem): string {
  if (!tackle.rod) return "";

  const feet =
    typeof tackle.rod.lengthFeet === "number" &&
    Number.isFinite(tackle.rod.lengthFeet)
      ? tackle.rod.lengthFeet
      : null;

  const inches =
    typeof tackle.rod.lengthInches === "number" &&
    Number.isFinite(tackle.rod.lengthInches)
      ? tackle.rod.lengthInches
      : null;

  if (feet == null || feet <= 0) return "";
  return `${feet}'${inches ?? 0}"`;
}

function formatCastWeight(tackle: TackleItem): string {
  if (!tackle.rod) return "";

  const min =
    typeof tackle.rod.castWeightMinG === "number" &&
    Number.isFinite(tackle.rod.castWeightMinG)
      ? tackle.rod.castWeightMinG
      : null;

  const max =
    typeof tackle.rod.castWeightMaxG === "number" &&
    Number.isFinite(tackle.rod.castWeightMaxG)
      ? tackle.rod.castWeightMaxG
      : null;

  if (min == null && max == null) return "";
  if (min != null && max != null) return `${min}-${max}g`;
  if (min != null) return `${min}g〜`;
  return `〜${max}g`;
}

function formatReelWeight(tackle: TackleItem): string {
  if (!tackle.reel) return "";

  const weight = tackle.reel.weightG;
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
    return "";
  }
  return `${weight}g`;
}

function formatRetrieve(tackle: TackleItem): string {
  if (!tackle.reel) return "";

  const retrieve = tackle.reel.retrieveCm;
  if (
    typeof retrieve !== "number" ||
    !Number.isFinite(retrieve) ||
    retrieve <= 0
  ) {
    return "";
  }
  return `${retrieve}cm`;
}

export function formatRodLabel(tackle: TackleItem): string {
  if (tackle.kind !== "rod" || !tackle.rod) return "不明なロッド";

  const prefix = tackle.active ? "" : "【過去】";
  const parts = [
    `${prefix}${tackle.maker}`.trim(),
    tackle.model.trim(),
    tackle.rod.sizeLabel.trim(),
    formatLength(tackle),
    formatCastWeight(tackle),
  ].filter(Boolean);

  return parts.join(" / ");
}

export function formatReelLabel(tackle: TackleItem): string {
  if (tackle.kind !== "reel" || !tackle.reel) return "不明なリール";

  const prefix = tackle.active ? "" : "【過去】";
  const parts = [
    `${prefix}${tackle.maker}`.trim(),
    tackle.model.trim(),
    tackle.reel.sizeLabel.trim(),
    formatReelWeight(tackle),
    formatRetrieve(tackle),
  ].filter(Boolean);

  return parts.join(" / ");
}
