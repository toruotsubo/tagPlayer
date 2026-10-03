import React from "react";
import {
  Disc3,
  Music,
  Tag,
  Play,
  ListPlus,
} from "lucide-react";
import { Album, TagCategory, TagItem, Track, categoryDotClasses } from "../types/music";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

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
  { value: "genre", label: "ジャンル" },
  { value: "artist", label: "アーティスト" },
  { value: "composer", label: "作曲" },
  { value: "release_year", label: "リリース年" },
  { value: "other", label: "その他" },
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

/**
 * アルバムカード等のタグ表示順を整える。
 * 楽曲データから生成された「ジャンル」「リリース年」をそれぞれ1番目、2番目とし、
 * 以降は現状同様のテキストソート順とする。
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
            ? "検索条件に一致するアルバムがありません"
            : selectedTags.length > 0
            ? "選択したタグに一致するアルバムがありません"
            : "アルバムが見つかりません"}
        </h2>
        <p className="mt-1 text-xs text-zinc-500 max-w-sm">
          {hasSearch
            ? "検索キーワードを変更するかクリアしてください。"
            : selectedTags.length > 0
            ? "タグフィルターの選択を解除するか変更してください。"
            : "上部の「ディレクトリを開く」から音楽ファイルを読み込んでください。"}
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
          const autoArtistTag =
            album.tags.find((t) => t.toLowerCase() === album.artist.toLowerCase()) ||
            (album.artist ? album.artist : null);
          const otherTags = sortAlbumTags(album.tags, album);

          return (
            <div
              key={album.id}
              className="group flex flex-col bg-zinc-900/30 hover:bg-zinc-900/70 border border-zinc-800/60 hover:border-zinc-700/80 rounded-xl p-3 transition duration-200 shadow-sm hover:shadow-md"
            >
              {/* Cover Art */}
              <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-zinc-950/80 border border-zinc-800/40 mb-3 flex items-center justify-center shadow-inner">
                {coverSrc ? (
                  <img
                    src={coverSrc}
                    alt={album.title}
                    className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                    loading="lazy"
                  />
                ) : (
                  <Disc3 className="h-12 w-12 text-zinc-700 group-hover:text-indigo-400/80 transition duration-300" />
                )}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-0 bg-black/65 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition duration-200 flex flex-col items-center justify-center gap-1.5 p-3"
                >
                  <button
                    type="button"
                    onClick={(e) => handlePlayAlbumClick(e, album)}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer"
                    title="アルバム全曲を再生"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>再生</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleQueueAlbumClick(e, album)}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer"
                    title="アルバム全曲をキューに追加"
                  >
                    <ListPlus className="h-3.5 w-3.5" />
                    <span>キューに追加</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleEditTagsClick(e, album)}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer"
                    title="タグ編集モーダルを開く"
                  >
                    <Tag className="h-3.5 w-3.5" />
                    <span>タグ編集</span>
                  </button>
                </div>
              </div>

              {/* Album Info */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <span
                  className="text-xs font-semibold text-zinc-100 truncate group-hover:text-indigo-300 transition"
                  title={album.title}
                >
                  {album.title}
                </span>

                {/* Auto Artist Tag */}
                {autoArtistTag && (
                  <div className="flex items-center">
                    {(() => {
                      const category = getTagCategory(autoArtistTag);
                      const isTagSelected = selectedTags.includes(autoArtistTag);
                      return (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleTag?.(autoArtistTag);
                          }}
                          className={`inline-flex items-center gap-1.5 text-[11px] px-1.5 py-0.5 rounded border font-mono truncate max-w-full cursor-pointer hover:brightness-125 transition ${
                            isTagSelected
                              ? tagSelectedColorClasses[category] || tagSelectedColorClasses.artist
                              : tagColorClasses[category] || tagColorClasses.artist
                          }`}
                          title={`タグ「${autoArtistTag}」を選択タグに追加/解除`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                              categoryDotClasses[category] || categoryDotClasses.artist
                            }`}
                          />
                          <span className="text-zinc-300 truncate">{autoArtistTag}</span>
                        </span>
                      );
                    })()}
                  </div>
                )}

                {/* Tags preview */}
                {otherTags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                    {otherTags.map((tag, idx) => {
                      const category = getTagCategory(tag);
                      const isTagSelected = selectedTags.includes(tag);
                      return (
                        <span
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleTag?.(tag);
                          }}
                          className={`inline-flex items-center gap-1.5 text-[11px] px-1.5 py-0.5 rounded border font-mono truncate max-w-full cursor-pointer hover:brightness-125 transition ${
                            isTagSelected
                              ? tagSelectedColorClasses[category]
                              : tagColorClasses[category]
                          }`}
                          title={`タグ「${tag}」を選択タグに追加/解除`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${categoryDotClasses[category]}`}
                          />
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
