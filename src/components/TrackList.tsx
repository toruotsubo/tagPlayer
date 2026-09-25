import React, { useState } from "react";
import {
  Play,
  Plus,
  Disc3,
  Music2,
  ListPlus,
  Volume2,
  X,
} from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { TagCategory, TagItem, TrackWithAlbum } from "../types/music";

interface TrackListProps {
  tracks: TrackWithAlbum[];
  selectedTags: string[];
  availableTags?: TagItem[];
  loading?: boolean;
  currentPlayingTrackId?: number | null;
  isPlaying?: boolean;
  onPlayTrack: (track: TrackWithAlbum) => void;
  onQueueTrack: (track: TrackWithAlbum) => void;
  onPlayAll?: (tracks: TrackWithAlbum[]) => void;
  onQueueAll?: (tracks: TrackWithAlbum[]) => void;
  onToggleTag?: (tagName: string) => void;
  onAddTrackTag?: (trackId: number, tagName: string, category?: TagCategory) => Promise<void>;
  onRemoveTrackTag?: (trackId: number, tagName: string) => Promise<void>;
}

const tagCategories: { value: TagCategory; label: string }[] = [
  { value: "genre", label: "ジャンル" },
  { value: "artist", label: "アーティスト" },
  { value: "release_year", label: "リリース年" },
  { value: "other", label: "その他" },
];

const tagColorClasses: Record<TagCategory, string> = {
  genre: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  artist: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  release_year: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  other: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
};

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  selectedTags,
  availableTags = [],
  loading = false,
  currentPlayingTrackId,
  isPlaying = false,
  onPlayTrack,
  onQueueTrack,
  onPlayAll,
  onQueueAll,
  onToggleTag,
  onAddTrackTag,
  onRemoveTrackTag,
}) => {
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);
  const [newTagInput, setNewTagInput] = useState("");
  const [newTagCategory, setNewTagCategory] = useState<TagCategory>("other");

  const getTagCategory = (tagName: string): TagCategory =>
    availableTags.find((tag) => tag.name.toLowerCase() === tagName.toLowerCase())?.category ?? "other";

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining.toString().padStart(2, "0")}`;
  };

  const handleAddTagSubmit = async (
    trackId: number,
    tagName?: string,
    category = newTagCategory
  ) => {
    const targetTag = (tagName ?? newTagInput).trim();
    if (!targetTag || !onAddTrackTag) return;
    try {
      await onAddTrackTag(trackId, targetTag, category);
      setNewTagInput("");
      setNewTagCategory("other");
      setEditingTrackId(null);
    } catch (err) {
      console.error("Add tag error", err);
    }
  };

  const getSuggestions = (trackTags: string[]) => {
    const query = newTagInput.trim().toLowerCase();
    const candidateTags = availableTags
      .filter((t) => !trackTags.includes(t.name) && !/^\d{4}$/.test(t.name));

    if (!query) {
      return candidateTags.slice(0, 4);
    }
    return candidateTags
      .filter((t) => t.name.toLowerCase().includes(query))
      .slice(0, 5);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-500 text-xs gap-2">
        <Disc3 className="h-6 w-6 animate-spin text-indigo-400" />
        <span>曲を検索中...</span>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-2xl bg-zinc-900 flex items-center justify-center mb-4 border border-zinc-800 shadow-inner">
          <Music2 className="h-8 w-8 text-zinc-600" />
        </div>
        <h2 className="text-base font-medium text-zinc-300">
          {selectedTags.length > 0
            ? "選択したタグに一致する曲がありません"
            : "曲が見つかりません"}
        </h2>
        <p className="mt-1 text-xs text-zinc-500 max-w-sm">
          {selectedTags.length > 0
            ? "他のタグを選択するか、タグフィルターを解除してください。"
            : "左上の「ディレクトリを開く」から音楽ファイルを読み込んでください。"}
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
            {selectedTags.length > 0 ? "タグ検索結果" : "すべての曲"}
          </span>
          <span className="text-xs text-zinc-500 font-mono">
            ({tracks.length} 曲)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onPlayAll && tracks.length > 0 && (
            <button
              onClick={() => onPlayAll(tracks)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-medium transition cursor-pointer shadow-sm"
              title="一致するすべての曲を再生"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              すべて再生
            </button>
          )}
          {onQueueAll && tracks.length > 0 && (
            <button
              onClick={() => onQueueAll(tracks)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 text-xs font-medium border border-zinc-700/60 transition cursor-pointer"
              title="一致するすべての曲を再生キューに追加"
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
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition cursor-pointer text-white hover:text-indigo-300"
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
                    {track.composer && (
                      <>
                        <span className="text-zinc-600">•</span>
                        <span className="text-zinc-500 truncate">作: {track.composer}</span>
                      </>
                    )}
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
                        className={`inline-flex items-center gap-1 text-[10px] pl-2 pr-1.5 py-0.5 rounded-full border transition ${
                          tagColorClasses[category]
                        } ${
                          isTagSelected
                            ? "ring-2 ring-indigo-400 font-semibold brightness-125"
                            : "hover:brightness-110"
                        }`}
                      >
                        <span
                          onClick={() => onToggleTag?.(t)}
                          className="cursor-pointer hover:underline"
                        >
                          #{t}
                        </span>
                        {onRemoveTrackTag && (
                          <button
                            onClick={() => onRemoveTrackTag(track.id, t)}
                            className="opacity-50 hover:opacity-100 hover:text-red-400 cursor-pointer"
                            title="タグを削除"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </span>
                    );
                  })}

                {/* Add Tag to Track */}
                {onAddTrackTag && (
                  <>
                    {editingTrackId === track.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={newTagInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewTagInput(val);
                            const matched = availableTags.find(
                              (t) => t.name.toLowerCase() === val.trim().toLowerCase()
                            );
                            if (matched) {
                              setNewTagCategory(matched.category);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddTagSubmit(track.id);
                            if (e.key === "Escape") setEditingTrackId(null);
                          }}
                          placeholder="タグ名..."
                          autoFocus
                          className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-950 border border-emerald-500/60 text-zinc-100 w-20 focus:outline-none"
                        />
                        <select
                          value={newTagCategory}
                          onChange={(e) => setNewTagCategory(e.target.value as TagCategory)}
                          className="text-[10px] px-1 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-300 focus:outline-none"
                          aria-label="曲タグの分類"
                        >
                          {tagCategories.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAddTagSubmit(track.id)}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
                        >
                          追加
                        </button>
                        {getSuggestions(track.tags || []).map((s) => (
                          <button
                            key={s.id}
                            onClick={() => handleAddTagSubmit(track.id, s.name, s.category)}
                            className={`text-[9px] px-1.5 py-0.2 rounded border transition cursor-pointer hover:brightness-125 ${
                              tagColorClasses[s.category] || "bg-zinc-800 text-zinc-300 border-zinc-700"
                            }`}
                            title={`タグ「${s.name}」(${
                              tagCategories.find((c) => c.value === s.category)?.label || s.category
                            }) を追加`}
                          >
                            +{s.name}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            setEditingTrackId(null);
                            setNewTagInput("");
                            setNewTagCategory("other");
                          }}
                          className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingTrackId(track.id);
                          setNewTagInput("");
                          setNewTagCategory("other");
                        }}
                        className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-400 hover:text-zinc-200 border border-zinc-700/40 transition cursor-pointer"
                        title="曲にタグを追加"
                      >
                        <Plus className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Right: Actions & Duration */}
              <div className="flex items-center gap-3 shrink-0">
                {/* Single Track Queue Button */}
                <button
                  onClick={() => onQueueTrack(track)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800/60 hover:bg-indigo-600 text-zinc-300 hover:text-white border border-zinc-700/40 hover:border-indigo-500 text-xs transition cursor-pointer group/btn"
                  title="この曲を再生キューに追加"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-[11px]">キューへ</span>
                </button>

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
