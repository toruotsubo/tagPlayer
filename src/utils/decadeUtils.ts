import { Album, TagItem } from "../types/music";

/**
 * 年代タグ（例: "1950s", "2010s"）をパースし、開始年と終了年を返す。
 * フォーマット: 4桁の数値（下1桁が0）+ "s" (例: 1950s)
 */
export function parseDecadeTag(tagName: string): { startYear: number; endYear: number } | null {
  const match = tagName.trim().match(/^(\d{3}0)s$/i);
  if (!match) return null;
  const startYear = parseInt(match[1], 10);
  if (startYear < 1000 || startYear > 2999) return null;
  return { startYear, endYear: startYear + 9 };
}

/**
 * タグ名が年代タグかどうかを判定する。
 */
export function isDecadeTag(tagName: string): boolean {
  return parseDecadeTag(tagName) !== null;
}

/**
 * アルバムが指定されたタグにマッチするか判定する。
 * タグが年代タグ（例: "1950s"）の場合は、アルバムの release_year または tags 内の年が 1950〜1959 に該当するか判定する。
 */
export function albumMatchesTag(album: Album, tag: string): boolean {
  const decade = parseDecadeTag(tag);
  if (decade) {
    const { startYear, endYear } = decade;
    // 1. アルバムの release_year プロパティチェック
    if (album.release_year && album.release_year >= startYear && album.release_year <= endYear) {
      return true;
    }
    // 2. アルバムタグ内の年タグチェック
    return (album.tags || []).some((t) => {
      const parsed = parseInt(t.trim(), 10);
      return !isNaN(parsed) && parsed >= startYear && parsed <= endYear;
    });
  }
  return (album.tags || []).includes(tag);
}

/**
 * ライブラリ内のアルバムおよびタグ情報から、10年刻みの年代タグ（例: "1950s"）を自動生成する。
 */
export function generateDecadeTags(albums: Album[], tags: TagItem[]): TagItem[] {
  const decadesMap = new Map<number, { albumIds: Set<number>; count: number }>();

  // 1. 各アルバムからリリース年を検出して該当年代を記録
  for (const album of albums) {
    const matchedYears = new Set<number>();

    if (album.release_year && album.release_year >= 1000 && album.release_year <= 2999) {
      matchedYears.add(album.release_year);
    }

    for (const t of album.tags || []) {
      const parsed = parseInt(t.trim(), 10);
      if (!isNaN(parsed) && parsed >= 1000 && parsed <= 2999) {
        matchedYears.add(parsed);
      }
    }

    for (const year of matchedYears) {
      const decade = Math.floor(year / 10) * 10;
      let entry = decadesMap.get(decade);
      if (!entry) {
        entry = { albumIds: new Set(), count: 0 };
        decadesMap.set(decade, entry);
      }
      entry.albumIds.add(album.id);
    }
  }

  // 2. tags テーブル内の release_year カテゴリのタグも確認（アルバム未紐付けの場合のフォールバック）
  for (const t of tags) {
    if (t.category === "release_year") {
      const parsed = parseInt(t.name.trim(), 10);
      if (!isNaN(parsed) && parsed >= 1000 && parsed <= 2999) {
        const decade = Math.floor(parsed / 10) * 10;
        if (!decadesMap.has(decade)) {
          decadesMap.set(decade, { albumIds: new Set(), count: t.count || 0 });
        }
      }
    }
  }

  // 3. 各年代の TagItem を生成
  const decadeTags: TagItem[] = [];
  for (const [decade, data] of decadesMap.entries()) {
    decadeTags.push({
      id: -(decade * 10), // 負のIDで通常タグと区別
      name: `${decade}s`,
      count: data.albumIds.size > 0 ? data.albumIds.size : data.count,
      target_type: "all",
      category: "release_year",
    });
  }

  return decadeTags;
}

/**
 * リリース年タグ・年代タグ用の比較関数。
 * 年代タグ（例: "1950s"）が、その年代の個別年（例: "1950", "1951"...）の先頭に整然と配置されるように順序付けを行う。
 */
export function compareReleaseYearValue(a: string, b: string): number | null {
  const parseVal = (s: string): { num: number; isDecade: boolean } | null => {
    const trimmed = s.trim();
    const dec = parseDecadeTag(trimmed);
    if (dec) {
      return { num: dec.startYear, isDecade: true };
    }
    const parsed = parseInt(trimmed, 10);
    if (!isNaN(parsed) && parsed >= 1000 && parsed <= 2999) {
      return { num: parsed, isDecade: false };
    }
    return null;
  };

  const vA = parseVal(a);
  const vB = parseVal(b);
  if (!vA || !vB) return null;

  if (vA.num !== vB.num) {
    return vA.num - vB.num;
  }
  // 同じ数値（例: 1950s と 1950）の場合、年代タグ（1950s）を先頭にする
  if (vA.isDecade && !vB.isDecade) return -1;
  if (!vA.isDecade && vB.isDecade) return 1;
  return 0;
}
