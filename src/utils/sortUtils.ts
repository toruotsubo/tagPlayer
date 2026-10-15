import { TagItem } from "../types/music";
import { TagSortOrder } from "../components/TagSortSelect";
import { compareReleaseYearValue } from "./decadeUtils";

const STORAGE_KEY = "tagPlayer_ignoreLeadingThe";

export function getStoredIgnoreLeadingThe(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      return saved === "true";
    }
  } catch (e) {
    console.error("Failed to read ignoreLeadingThe from localStorage", e);
  }
  return false;
}

export function saveIgnoreLeadingThe(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch (e) {
    console.error("Failed to save ignoreLeadingThe to localStorage", e);
  }
}

/**
 * 頭の "The " (大文字小文字不問) を除去する。
 * 例: "The Beatles" -> "Beatles", "the cure" -> "cure"
 */
export function stripLeadingThe(text: string): string {
  const trimmed = text.trim();
  const stripped = trimmed.replace(/^the\s+/i, "");
  return stripped.trim() || trimmed;
}

/**
 * ソート用にアーティスト名を正規化する。
 */
export function normalizeArtistForSort(artist: string, ignoreLeadingThe: boolean): string {
  const trimmed = artist.trim();
  if (!ignoreLeadingThe) return trimmed;
  return stripLeadingThe(trimmed);
}

/**
 * アーティスト名テキストを比較する。
 * ignoreLeadingThe が true の場合は "The " を無視して比較し、同名の場合は元テキストでタイブレーク。
 */
export function compareArtistText(
  a: string | undefined | null,
  b: string | undefined | null,
  ignoreLeadingThe: boolean
): number {
  const sA = (a ?? "").trim();
  const sB = (b ?? "").trim();
  if (!sA && !sB) return 0;
  if (!sA) return 1;
  if (!sB) return -1;

  const normA = normalizeArtistForSort(sA, ignoreLeadingThe);
  const normB = normalizeArtistForSort(sB, ignoreLeadingThe);
  const cmp = normA.localeCompare(normB, "ja", { sensitivity: "base" });
  if (cmp !== 0) return cmp;
  return sA.localeCompare(sB, "ja", { sensitivity: "base" });
}

/**
 * タグアイテムのソート用比較関数
 */
export function compareTagItems(
  a: TagItem,
  b: TagItem,
  tagSortOrder: TagSortOrder,
  ignoreLeadingThe: boolean
): number {
  const getSortName = (item: TagItem) => {
    if (ignoreLeadingThe && item.category === "artist") {
      return normalizeArtistForSort(item.name, true);
    }
    return item.name.trim();
  };

  const compareName = (x: TagItem, y: TagItem) => {
    if (x.category === "release_year" && y.category === "release_year") {
      const yearCmp = compareReleaseYearValue(x.name, y.name);
      if (yearCmp !== null) return yearCmp;
    }
    const nX = getSortName(x);
    const nY = getSortName(y);
    const cmp = nX.localeCompare(nY, "ja", { sensitivity: "base" });
    if (cmp !== 0) return cmp;
    return x.name.trim().localeCompare(y.name.trim(), "ja", { sensitivity: "base" });
  };

  switch (tagSortOrder) {
    case "count-asc":
      if (a.count !== b.count) return a.count - b.count;
      return compareName(a, b);
    case "count-desc":
      if (a.count !== b.count) return b.count - a.count;
      return compareName(a, b);
    case "name-asc":
      return compareName(a, b);
    case "name-desc":
      return compareName(b, a);
    default:
      return 0;
  }
}
