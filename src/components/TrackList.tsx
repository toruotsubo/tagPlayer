import React, { useMemo } from "react";
import {
  Play,
  Disc3,
  Music2,
  ListPlus,
  Volume2,
  Check,
  Tag,
} from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { TagCategory, TagItem, TrackWithAlbum, categoryDotClasses } from "../types/music";

interface TrackListProps {
  tracks: TrackWithAlbum[];
  searchQuery?: string;
  selectedTags: string[];
  availableTags?: TagItem[];
  queue?: TrackWithAlbum[];
  loading?: boolean;
  currentPlayingTrackId?: number | null;
  isPlaying?: boolean;
  onPlayTrack: (track: TrackWithAlbum) => void;
  onQueueTrack: (track: TrackWithAlbum) => void;
  onPlayAll?: (tracks: TrackWithAlbum[]) => void;
  onQueueAll?: (tracks: TrackWithAlbum[]) => void;
  onToggleTag?: (tagName: string) => void;
  onEditTrackTags?: (track: TrackWithAlbum) => void;
}

const tagColorClasses: Record<TagCategory, string> = {
  genre: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  artist: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  composer: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  release_year: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  other: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
};

const tagSelectedColorClasses: Record<TagCategory, string> = {
  genre: "bg-amber-500/30 text-amber-300 border-amber-500/30",
  artist: "bg-emerald-500/30 text-emerald-300 border-emerald-500/30",
  composer: "bg-purple-500/30 text-purple-300 border-purple-500/30",
  release_year: "bg-sky-500/30 text-sky-300 border-sky-500/30",
  other: "bg-indigo-500/30 text-indigo-300 border-indigo-500/30",
};

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  searchQuery,
  selectedTags,
  availableTags = [],
  queue = [],
  loading = false,
  currentPlayingTrackId,
  isPlaying = false,
  onPlayTrack,
  onQueueTrack,
  onPlayAll,
  onQueueAll,
  onToggleTag,
  onEditTrackTags,
}) => {
  const queuedTrackIds = useMemo(() => new Set(queue.map((t) => t.id)), [queue]);

  const getTagCategory = (tagName: string): TagCategory =>
    availableTags.find((tag) => tag.name.toLowerCase() === tagName.toLowerCase())?.category ?? "other";

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-500 text-xs gap-2">
        <Disc3 className="h-6 w-6 animate-spin text-indigo-400" />
        <span>曲を検索中...</span>
      </div>
    );
  }

  const hasSearch = Boolean(searchQuery && searchQuery.trim());

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-2xl bg-zinc-900 flex items-center justify-center mb-4 border border-zinc-800 shadow-inner">
          <Music2 className="h-8 w-8 text-zinc-600" />
        </div>
        <h2 className="text-base font-medium text-zinc-300">
          {hasSearch
            ? "検索条件に一致する曲がありません"
            : selectedTags.length > 0
            ? "選択したタグに一致する曲がありません"
            : "曲が見つかりません"}
        </h2>
        <p className="mt-1 text-xs text-zinc-500 max-w-sm">
          {hasSearch
            ? "検索キーワードを変更するかクリアしてください。"
            : selectedTags.length > 0
            ? "他のタグを選択するか、タグフィルターを解除してください。"
            : "上部の「登録」から音楽ファイルを読み込んでください。"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-200">
            {hasSearch
              ? "曲検索結果"
              : selectedTags.length > 0
              ? "タグ検索結果"
              : "すべての曲"}
          </span>
          <span className="text-xs text-zinc-500 font-mono">
            ({tracks.length} 曲)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {onPlayAll && tracks.length > 0 && (
            <button
              onClick={() => onPlayAll(tracks)}
              className="w-28 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
              title="すべての曲を再生"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              再生
            </button>
          )}
          {onQueueAll && tracks.length > 0 && (
            <button
              onClick={() => onQueueAll(tracks)}
              className="w-28 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
              title="すべての曲を再生キューに追加"
            >
              <ListPlus className="h-3.5 w-3.5" />
              キューに追加
            </button>
          )}
        </div>
      </div>

      {/* Tracks List */}
      <div className="flex flex-col divide-y divide-zinc-800/40">
        {tracks.map((track, idx) => {
          const isCurrent = currentPlayingTrackId === track.id;
          const coverSrc = track.cover_url ? convertFileSrc(track.cover_url) : null;

          return (
            <div
              key={`${track.id}-${idx}`}
              className={`group py-2.5 px-3 rounded-lg flex items-center justify-between gap-4 transition hover:bg-zinc-900/70 text-xs ${
                isCurrent ? "bg-indigo-950/25 border-l-2 border-indigo-500" : ""
              }`}
            >
              {/* Left: Index / Play Button + Artwork + Title/Artist/Album */}
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                {/* Artwork Thumbnail */}
                <div className="relative h-10 w-10 rounded-md overflow-hidden bg-zinc-950 border border-zinc-800 shrink-0 flex items-center justify-center shadow-inner">
                  {coverSrc ? (
                    <img
                      src={coverSrc}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <Music2 className="h-5 w-5 text-zinc-600" />
                  )}

                  {/* Play overlay on thumbnail */}
                  <button
                    onClick={() => onPlayTrack(track)}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 flex items-center justify-center transition cursor-pointer text-white hover:text-indigo-300"
                    title="この曲を再生"
                  >
                    <Play className="h-4 w-4 fill-current ml-0.5" />
                  </button>
                </div>

                {/* Track details */}
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      onClick={() => onPlayTrack(track)}
                      className={`font-semibold truncate cursor-pointer hover:underline transition ${
                        isCurrent
                          ? "text-indigo-400"
                          : "text-zinc-200 group-hover:text-zinc-100"
                      }`}
                    >
                      {track.title}
                    </span>
                    {isCurrent && isPlaying && (
                      <Volume2 className="h-3.5 w-3.5 text-indigo-400 shrink-0 animate-pulse" />
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-zinc-400 truncate mt-0.5">
                    <span className="truncate">{track.artist || track.album_artist || "Unknown Artist"}</span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-zinc-500 truncate">{track.album_title}</span>
                  </div>
                </div>
              </div>

              {/* Center/Right: Tags */}
              <div
                className="hidden md:flex items-center gap-1.5 flex-wrap max-w-sm shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {track.tags &&
                  track.tags.map((t, tIdx) => {
                    const isTagSelected = selectedTags.includes(t);
                    const category = getTagCategory(t);
                    return (
                      <span
                        key={tIdx}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleTag?.(t);
                        }}
                        className={`inline-flex items-center gap-1.5 text-[11px] px-1.5 py-0.5 rounded border font-mono truncate max-w-full cursor-pointer hover:brightness-125 transition ${
                          isTagSelected
                            ? tagSelectedColorClasses[category]
                            : tagColorClasses[category]
                        }`}
                        title={`タグ「${t}」を選択タグに追加/解除`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full shrink-0 ${categoryDotClasses[category]}`}
                        />
                        <span className="text-zinc-300 truncate">{t}</span>
                      </span>
                    );
                  })}
              </div>

              {/* Right: Actions & Duration */}
              <div className="flex items-center gap-3 shrink-0">
                {/* Tag Edit Button */}
                {onEditTrackTags && (
                  <button
                    onClick={() => onEditTrackTags(track)}
                    className="py-1 px-2.5 rounded-md bg-zinc-800/40 text-zinc-400 border border-zinc-700/40 group-hover:bg-indigo-600 group-hover:hover:bg-indigo-500 group-hover:text-white group-hover:border-transparent group-hover:shadow-sm active:scale-98 font-medium text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                    title="所属アルバムのタグ編集モーダルを開く"
                  >
                    <Tag className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-[11px] whitespace-nowrap">タグ編集</span>
                  </button>
                )}

                {/* Single Track Queue Button / Queued Label */}
                {queuedTrackIds.has(track.id) ? (
                  <span
                    className="w-28 py-1 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-xs font-medium select-none flex items-center justify-center gap-1.5 shrink-0"
                    title="すでに再生キューに追加されています"
                  >
                    <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                    <span className="text-[11px] whitespace-nowrap">キュー追加済み</span>
                  </span>
                ) : (
                  <button
                    onClick={() => onQueueTrack(track)}
                    className="w-28 py-1 rounded-md bg-zinc-800/40 text-zinc-400 border border-zinc-700/40 group-hover:bg-indigo-600 group-hover:hover:bg-indigo-500 group-hover:text-white group-hover:border-transparent group-hover:shadow-sm active:scale-98 font-medium text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                    title="この曲を再生キューに追加"
                  >
                    <ListPlus className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-[11px] whitespace-nowrap">キューに追加</span>
                  </button>
                )}

                {/* Duration */}
                <span className="text-[11px] text-zinc-500 font-mono w-10 text-right">
                  {formatDuration(track.duration_secs)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
