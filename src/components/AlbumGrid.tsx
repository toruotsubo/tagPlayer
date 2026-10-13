import React from "react";
import {
  Disc3,
  Music,
  Tag,
  Play,
  ListPlus,
  Star,
} from "lucide-react";
import { Album, TagCategory, TagItem, Track, categoryDotClasses } from "../types/music";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useTranslation, getTranslation } from "../i18n";

export interface AlbumGridProps {
  albums: Album[];
  searchQuery?: string;
  selectedTags: string[];
  availableTags: TagItem[];
  currentPlayingTrackId?: number | null;
  isPlaying?: boolean;
  onOpenAlbumModal?: (album: Album) => void;
  onPlayAlbum?: (album: Album, tracks: Track[]) => void;
  onQueueAlbum?: (album: Album, tracks: Track[]) => void;
  onToggleTag?: (tagName: string) => void;
}

export const tagCategories: { value: TagCategory; label: string }[] = [
  { value: "genre", label: getTranslation().categories.genre },
  { value: "artist", label: getTranslation().categories.artist },
  { value: "composer", label: getTranslation().categories.composer },
  { value: "release_year", label: getTranslation().categories.release_year },
  { value: "other", label: getTranslation().categories.other },
];

export const tagColorClasses: Record<TagCategory, string> = {
  genre: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  artist: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  composer: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  release_year: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  other: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
};

export const tagSelectedColorClasses: Record<TagCategory, string> = {
  genre: "bg-amber-500/30 text-amber-300 border-amber-500/30",
  artist: "bg-emerald-500/30 text-emerald-300 border-emerald-500/30",
  composer: "bg-purple-500/30 text-purple-300 border-purple-500/30",
  release_year: "bg-sky-500/30 text-sky-300 border-sky-500/30",
  other: "bg-indigo-500/30 text-indigo-300 border-indigo-500/30",
};

export interface AlbumDisplayTags {
  artistPrimaryTag: string | null;
  secondRowTags: string[];
}

/**
 * アルバムタグの並び順:
 * アルバムタイトル直下にアーティストPrimaryタグ、
 * 次の行にジャンルPrimaryタグ、リリース年Primaryタグ、以降非Primaryタグテキスト昇順
 */
export const getAlbumDisplayTags = (
  album: Album,
  availableTags: TagItem[]
): AlbumDisplayTags => {
  const primarySet = new Set(
    (album.primary_tags || []).map((t) => t.toLowerCase())
  );

  const getCategory = (tagName: string): TagCategory => {
    if (
      album.artist &&
      tagName.trim().toLowerCase() === album.artist.trim().toLowerCase()
    ) {
      return "artist";
    }
    return (
      availableTags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
        ?.category ?? "other"
    );
  };

  let artistPrimaryTag: string | null = null;
  let genrePrimaryTag: string | null = null;
  let releaseYearPrimaryTag: string | null = null;
  const nonPrimaryTags: string[] = [];

  for (const tag of album.tags) {
    const isPrimary = primarySet.has(tag.toLowerCase());
    const category = getCategory(tag);
    const isArtistMatch = Boolean(
      album.artist &&
        tag.trim().toLowerCase() === album.artist.trim().toLowerCase()
    );

    if (
      (isPrimary && category === "artist") ||
      (isPrimary && isArtistMatch)
    ) {
      if (!artistPrimaryTag) {
        artistPrimaryTag = tag;
      } else {
        nonPrimaryTags.push(tag);
      }
    } else if (isPrimary && category === "genre" && !genrePrimaryTag) {
      genrePrimaryTag = tag;
    } else if (
      isPrimary &&
      category === "release_year" &&
      !releaseYearPrimaryTag
    ) {
      releaseYearPrimaryTag = tag;
    } else {
      nonPrimaryTags.push(tag);
    }
  }

  // もし artistPrimaryTag が未設定で、album.artist に一致するタグがアルバムタグにあればフォールバック
  if (!artistPrimaryTag && album.artist) {
    const matchedIdx = nonPrimaryTags.findIndex(
      (t) => t.trim().toLowerCase() === album.artist.trim().toLowerCase()
    );
    if (matchedIdx !== -1) {
      artistPrimaryTag = nonPrimaryTags.splice(matchedIdx, 1)[0];
    }
  }

  // 非Primaryタグはテキスト昇順
  nonPrimaryTags.sort((a, b) => a.localeCompare(b));

  const secondRowTags: string[] = [];
  if (genrePrimaryTag) secondRowTags.push(genrePrimaryTag);
  if (releaseYearPrimaryTag) secondRowTags.push(releaseYearPrimaryTag);
  secondRowTags.push(...nonPrimaryTags);

  return {
    artistPrimaryTag,
    secondRowTags,
  };
};

/**
 * 後方互換用: 2行目タグ一覧を返す
 */
export const sortAlbumTags = (tags: string[], album: Album): string[] => {
  const nonArtistTags = tags.filter(
    (t) => t.toLowerCase() !== album.artist.toLowerCase()
  );

  const genreStr = album.genre?.trim().toLowerCase();
  const yearStr =
    album.release_year && album.release_year > 0
      ? String(album.release_year)
      : null;

  let genreTag: string | null = null;
  let yearTag: string | null = null;
  const remainingTags: string[] = [];

  for (const tag of nonArtistTags) {
    if (!genreTag && genreStr && tag.toLowerCase() === genreStr) {
      genreTag = tag;
    } else if (!yearTag && yearStr && tag.toLowerCase() === yearStr.toLowerCase()) {
      yearTag = tag;
    } else {
      remainingTags.push(tag);
    }
  }

  remainingTags.sort((a, b) => a.localeCompare(b));

  const sorted: string[] = [];
  if (genreTag) sorted.push(genreTag);
  if (yearTag) sorted.push(yearTag);
  sorted.push(...remainingTags);

  return sorted;
};

export const AlbumGrid: React.FC<AlbumGridProps> = ({
  albums,
  searchQuery = "",
  selectedTags,
  availableTags,
  onOpenAlbumModal,
  onPlayAlbum,
  onQueueAlbum,
  onToggleTag,
}) => {
  const { t } = useTranslation();

  const handlePlayAlbumClick = async (e: React.MouseEvent, album: Album) => {
    e.stopPropagation();
    try {
      const albumTracks = await invoke<Track[]>("get_album_tracks", { albumId: album.id });
      onPlayAlbum?.(album, albumTracks);
    } catch (err) {
      console.error("Failed to load album tracks for play", err);
    }
  };

  const handleQueueAlbumClick = async (e: React.MouseEvent, album: Album) => {
    e.stopPropagation();
    try {
      const albumTracks = await invoke<Track[]>("get_album_tracks", { albumId: album.id });
      onQueueAlbum?.(album, albumTracks);
    } catch (err) {
      console.error("Failed to load album tracks for queue", err);
    }
  };

  const handleEditTagsClick = (e: React.MouseEvent, album: Album) => {
    e.stopPropagation();
    onOpenAlbumModal?.(album);
  };

  const getTagCategory = (tagName: string): TagCategory =>
    availableTags.find((tag) => tag.name.toLowerCase() === tagName.toLowerCase())?.category ?? "other";

  if (albums.length === 0) {
    const hasSearch = Boolean(searchQuery && searchQuery.trim());
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-20">
        <div className="h-16 w-16 rounded-2xl bg-zinc-900 flex items-center justify-center mb-4 border border-zinc-800 shadow-inner">
          <Music className="h-8 w-8 text-zinc-600" />
        </div>
        <h2 className="text-base font-medium text-zinc-300">
          {hasSearch
            ? t.albumGrid.noAlbumsFoundSearch
            : selectedTags.length > 0
            ? t.albumGrid.noAlbumsFoundTags
            : t.albumGrid.noAlbumsFoundEmpty}
        </h2>
        <p className="mt-1 text-xs text-zinc-500 max-w-sm">
          {hasSearch
            ? t.albumGrid.noAlbumsFoundSearchSub
            : selectedTags.length > 0
            ? t.albumGrid.noAlbumsFoundTagsSub
            : t.albumGrid.noAlbumsFoundEmptySub}
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {albums.map((album) => {
          const coverSrc = album.cover_url ? convertFileSrc(album.cover_url) : null;
          const { artistPrimaryTag, secondRowTags } = getAlbumDisplayTags(album, availableTags);
          const primarySet = new Set((album.primary_tags || []).map((t) => t.toLowerCase()));

          return (
            <div
              key={album.id}
              className="group flex flex-col bg-zinc-900/30 hover:bg-zinc-900/70 focus-within:bg-zinc-900/70 border border-zinc-800/60 hover:border-zinc-700/80 focus-within:border-zinc-700/80 rounded-xl p-3 transition duration-200 shadow-sm hover:shadow-md focus-within:shadow-md"
            >
              {/* Cover Art */}
              <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-zinc-950/80 border border-zinc-800/40 mb-3 flex items-center justify-center shadow-inner">
                {coverSrc ? (
                  <img
                    src={coverSrc}
                    alt={album.title}
                    className="h-full w-full object-cover group-hover:scale-105 group-focus-within:scale-105 transition duration-300"
                    loading="lazy"
                  />
                ) : (
                  <Disc3 className="h-12 w-12 text-zinc-700 group-hover:text-indigo-400/80 group-focus-within:text-indigo-400/80 transition duration-300" />
                )}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-0 bg-black/65 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition duration-200 flex flex-col items-center justify-center gap-1.5 p-3"
                >
                  <button
                    type="button"
                    onClick={(e) => handlePlayAlbumClick(e, album)}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900"
                    title={t.albumGrid.playAlbumTip}
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>{t.common.play}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleQueueAlbumClick(e, album)}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900"
                    title={t.albumGrid.queueAlbumTip}
                  >
                    <ListPlus className="h-3.5 w-3.5" />
                    <span>{t.common.queue}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleEditTagsClick(e, album)}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900"
                    title={t.albumGrid.editTagsTip}
                  >
                    <Tag className="h-3.5 w-3.5" />
                    <span>{t.common.editTags}</span>
                  </button>
                </div>
              </div>

              {/* Album Info */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <span
                  className="text-xs font-semibold text-zinc-100 truncate group-hover:text-indigo-300 group-focus-within:text-indigo-300 transition"
                  title={album.title}
                >
                  {album.title}
                </span>

                {/* Artist Primary Tag (アルバムタイトル直下) */}
                {artistPrimaryTag && (
                  <div className="flex items-center">
                    {(() => {
                      const category =
                        album.artist &&
                        artistPrimaryTag.trim().toLowerCase() ===
                          album.artist.trim().toLowerCase()
                          ? "artist"
                          : getTagCategory(artistPrimaryTag);
                      const isTagSelected = selectedTags.includes(artistPrimaryTag);
                      return (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleTag?.(artistPrimaryTag);
                          }}
                          className={`inline-flex items-center gap-1.5 text-[11px] px-1.5 py-0.5 rounded border font-mono truncate max-w-full cursor-pointer hover:brightness-125 transition font-medium shadow-sm ${
                            isTagSelected
                              ? tagSelectedColorClasses[category] || tagSelectedColorClasses.artist
                              : tagColorClasses[category] || tagColorClasses.artist
                          }`}
                          title={t.albumGrid.toggleTagTip(artistPrimaryTag)}
                        >
                          <Star className="h-2.5 w-2.5 fill-current shrink-0 text-emerald-400" />
                          <span className="text-zinc-200 truncate">{artistPrimaryTag}</span>
                        </span>
                      );
                    })()}
                  </div>
                )}

                {/* Next row tags (ジャンルPrimary、リリース年Primary、以降非Primaryテキスト昇順) */}
                {secondRowTags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                    {secondRowTags.map((tag, idx) => {
                      const category =
                        album.artist &&
                        tag.trim().toLowerCase() ===
                          album.artist.trim().toLowerCase()
                          ? "artist"
                          : getTagCategory(tag);
                      const isTagSelected = selectedTags.includes(tag);
                      const isPrimary = primarySet.has(tag.toLowerCase());
                      return (
                        <span
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleTag?.(tag);
                          }}
                          className={`inline-flex items-center gap-1.5 text-[11px] px-1.5 py-0.5 rounded border font-mono truncate max-w-full cursor-pointer hover:brightness-125 transition ${
                            isPrimary ? "font-medium shadow-sm" : ""
                          } ${
                            isTagSelected
                              ? tagSelectedColorClasses[category]
                              : tagColorClasses[category]
                          }`}
                          title={t.albumGrid.toggleTagTip(tag)}
                        >
                          {isPrimary ? (
                            <Star
                              className={`h-2.5 w-2.5 fill-current shrink-0 ${
                                category === "genre"
                                  ? "text-amber-400"
                                  : category === "release_year"
                                  ? "text-sky-400"
                                  : "text-indigo-400"
                              }`}
                            />
                          ) : (
                            <span
                              className={`h-1.5 w-1.5 rounded-full shrink-0 ${categoryDotClasses[category]}`}
                            />
                          )}
                          <span className="text-zinc-300 truncate">{tag}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
