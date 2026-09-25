import React, { useState, useMemo } from "react";
import {
  Disc3,
  Music,
  Calendar,
  Clock,
  X,
  Tag,
  Plus,
  Play,
  ListPlus,
  Volume2,
  Trash2,
  CheckSquare,
  Square,
  MinusSquare,
} from "lucide-react";
import { Album, TagCategory, TagItem, Track } from "../types/music";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

interface AlbumGridProps {
  albums: Album[];
  selectedTags: string[];
  availableTags: TagItem[];
  currentPlayingTrackId?: number | null;
  isPlaying?: boolean;
  onSelectTrack?: (track: Track, album: Album) => void;
  onPlayTrack?: (track: Track, album: Album) => void;
  onQueueTrack?: (track: Track, album: Album) => void;
  onPlayAlbum?: (album: Album, tracks: Track[]) => void;
  onQueueAlbum?: (album: Album, tracks: Track[]) => void;
  onDeleteAlbum?: (albumId: number) => Promise<void>;
  onTagsChanged?: () => void;
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

export const AlbumGrid: React.FC<AlbumGridProps> = ({
  albums,
  selectedTags,
  availableTags,
  currentPlayingTrackId,
  isPlaying = false,
  onSelectTrack,
  onPlayTrack,
  onQueueTrack,
  onPlayAlbum,
  onQueueAlbum,
  onDeleteAlbum,
  onTagsChanged,
}) => {
  const [activeAlbum, setActiveAlbum] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Track selection state for batch tag editing
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());
  const [lastSelectedTrackIndex, setLastSelectedTrackIndex] = useState<number | null>(null);

  // Batch Track Tag Edit state
  const [batchTrackTag, setBatchTrackTag] = useState("");
  const [batchTrackTagCategory, setBatchTrackTagCategory] = useState<TagCategory>("other");

  // Album Tag Edit state
  const [isAddingAlbumTag, setIsAddingAlbumTag] = useState(false);
  const [newAlbumTag, setNewAlbumTag] = useState("");
  const [newAlbumTagCategory, setNewAlbumTagCategory] = useState<TagCategory>("other");

  // Track Tag Edit state
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);
  const [newTrackTag, setNewTrackTag] = useState("");
  const [newTrackTagCategory, setNewTrackTagCategory] = useState<TagCategory>("other");

  const handleAlbumClick = async (album: Album) => {
    setActiveAlbum(album);
    setSelectedTrackIds(new Set());
    setLastSelectedTrackIndex(null);
    setBatchTrackTag("");
    setLoadingTracks(true);
    try {
      const result = await invoke<Track[]>("get_album_tracks", { albumId: album.id });
      setTracks(result);
    } catch (e) {
      console.error("Failed to load tracks", e);
      setTracks([]);
    } finally {
      setLoadingTracks(false);
    }
  };

  const handleAddAlbumTag = async (tagName: string, category = newAlbumTagCategory) => {
    if (!activeAlbum || !tagName.trim()) return;
    try {
      const updatedTags = await invoke<string[]>("add_album_tag", {
        albumId: activeAlbum.id,
        tagName: tagName.trim(),
        category,
      });
      setActiveAlbum({ ...activeAlbum, tags: updatedTags });
      setNewAlbumTag("");
      setIsAddingAlbumTag(false);
      onTagsChanged?.();
    } catch (err) {
      console.error("Add album tag error", err);
    }
  };

  const handleRemoveAlbumTag = async (tagName: string) => {
    if (!activeAlbum) return;
    try {
      const updatedTags = await invoke<string[]>("remove_album_tag", {
        albumId: activeAlbum.id,
        tagName,
      });
      setActiveAlbum({ ...activeAlbum, tags: updatedTags });
      onTagsChanged?.();
    } catch (err) {
      console.error("Remove album tag error", err);
    }
  };

  const handleAddTrackTag = async (
    trackId: number,
    tagName: string,
    category = newTrackTagCategory
  ) => {
    if (!tagName.trim()) return;
    try {
      const updatedTags = await invoke<string[]>("add_track_tag", {
        trackId,
        tagName: tagName.trim(),
        category,
      });
      setTracks((prev) =>
        prev.map((t) => (t.id === trackId ? { ...t, tags: updatedTags } : t))
      );
      setNewTrackTag("");
      setEditingTrackId(null);
      onTagsChanged?.();
    } catch (err) {
      console.error("Add track tag error", err);
    }
  };

  const handleRemoveTrackTag = async (trackId: number, tagName: string) => {
    try {
      const updatedTags = await invoke<string[]>("remove_track_tag", {
        trackId,
        tagName,
      });
      setTracks((prev) =>
        prev.map((t) => (t.id === trackId ? { ...t, tags: updatedTags } : t))
      );
      onTagsChanged?.();
    } catch (err) {
      console.error("Remove track tag error", err);
    }
  };

  // ソート済みトラックリスト（モーダル内外で一貫して使用）
  const sortedTracks = useMemo(() => {
    return [...tracks].sort((a, b) => {
      const discA = a.disc_number ?? 1;
      const discB = b.disc_number ?? 1;
      if (discA !== discB) return discA - discB;
      const trackA = a.track_number ?? 9999;
      const trackB = b.track_number ?? 9999;
      if (trackA !== trackB) return trackA - trackB;
      return a.title.localeCompare(b.title);
    });
  }, [tracks]);

  // 全曲選択 / 全解除トグル
  const handleToggleSelectAll = () => {
    if (selectedTrackIds.size === sortedTracks.length && sortedTracks.length > 0) {
      setSelectedTrackIds(new Set());
    } else {
      setSelectedTrackIds(new Set(sortedTracks.map((t) => t.id)));
    }
  };

  // トラック選択トグル（Shift+クリックで範囲選択対応）
  const handleToggleTrackSelect = (
    trackId: number,
    index: number,
    event: React.MouseEvent
  ) => {
    event.stopPropagation();
    const newSelected = new Set(selectedTrackIds);

    if (event.shiftKey && lastSelectedTrackIndex !== null) {
      const start = Math.min(lastSelectedTrackIndex, index);
      const end = Math.max(lastSelectedTrackIndex, index);
      const shouldSelect = !selectedTrackIds.has(trackId);

      for (let i = start; i <= end; i++) {
        const id = sortedTracks[i]?.id;
        if (id !== undefined) {
          if (shouldSelect) {
            newSelected.add(id);
          } else {
            newSelected.delete(id);
          }
        }
      }
    } else {
      if (newSelected.has(trackId)) {
        newSelected.delete(trackId);
      } else {
        newSelected.add(trackId);
      }
      setLastSelectedTrackIndex(index);
    }

    setSelectedTrackIds(newSelected);
  };

  // 複数曲へのタグ一括追加
  const handleBatchAddTrackTag = async (
    tagName: string,
    category = batchTrackTagCategory
  ) => {
    if (selectedTrackIds.size === 0 || !tagName.trim() || !activeAlbum) return;
    try {
      await invoke("add_tracks_tag", {
        trackIds: Array.from(selectedTrackIds),
        tagName: tagName.trim(),
        category,
      });
      const updatedTracks = await invoke<Track[]>("get_album_tracks", {
        albumId: activeAlbum.id,
      });
      setTracks(updatedTracks);
      setBatchTrackTag("");
      onTagsChanged?.();
    } catch (err) {
      console.error("Batch add track tag error", err);
    }
  };

  // 複数曲からのタグ一括削除
  const handleBatchRemoveTrackTag = async (tagName: string) => {
    if (selectedTrackIds.size === 0 || !activeAlbum) return;
    try {
      await invoke("remove_tracks_tag", {
        trackIds: Array.from(selectedTrackIds),
        tagName,
      });
      const updatedTracks = await invoke<Track[]>("get_album_tracks", {
        albumId: activeAlbum.id,
      });
      setTracks(updatedTracks);
      onTagsChanged?.();
    } catch (err) {
      console.error("Batch remove track tag error", err);
    }
  };

  // 選択された曲に含まれるタグの集計
  const selectedTrackTagsSummary = useMemo(() => {
    if (selectedTrackIds.size === 0) return [];
    const countMap = new Map<string, number>();
    const selected = sortedTracks.filter((t) => selectedTrackIds.has(t.id));
    for (const t of selected) {
      for (const tag of t.tags) {
        countMap.set(tag, (countMap.get(tag) || 0) + 1);
      }
    }
    return Array.from(countMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        isAll: count === selectedTrackIds.size,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [sortedTracks, selectedTrackIds]);

  // 一括タグ追加用サジェスト候補
  const batchTagSuggestions = useMemo(() => {
    if (selectedTrackIds.size === 0) return [];
    const query = batchTrackTag.trim().toLowerCase();
    const allSelectedHaveTag = new Set(
      selectedTrackTagsSummary.filter((t) => t.isAll).map((t) => t.name)
    );

    const candidates = availableTags.filter(
      (t) => !allSelectedHaveTag.has(t.name) && !/^\d{4}$/.test(t.name)
    );

    if (!query) {
      return candidates.slice(0, 8);
    }
    return candidates
      .filter((t) => t.name.toLowerCase().includes(query))
      .slice(0, 10);
  }, [selectedTrackIds, batchTrackTag, selectedTrackTagsSummary, availableTags]);

  const handleDeleteAlbum = async () => {
    if (!activeAlbum || isDeleting) return;
    const confirmed = window.confirm(
      `アルバム「${activeAlbum.title}」をライブラリから削除しますか？\n\n※アプリのデータベースから登録情報を削除します。\nパソコン内の音楽ファイル自体は削除されません。`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      if (onDeleteAlbum) {
        await onDeleteAlbum(activeAlbum.id);
      } else {
        await invoke("delete_album", { albumId: activeAlbum.id });
        onTagsChanged?.();
      }
      setActiveAlbum(null);
    } catch (err) {
      console.error("Delete album error", err);
      alert(`アルバム削除エラー: ${err}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining.toString().padStart(2, "0")}`;
  };

  // アルバムタグ用サジェスト（現在のアルバムが持っていない既存タグ、4桁数字タグは除外。入力に応じてリアルタイム絞り込み）
  const albumTagSuggestions = useMemo(() => {
    if (!activeAlbum) return [];
    const query = newAlbumTag.trim().toLowerCase();
    const candidateTags = availableTags.filter(
      (t) => !activeAlbum.tags.includes(t.name) && !/^\d{4}$/.test(t.name)
    );

    if (!query) {
      return candidateTags.slice(0, 8);
    }
    return candidateTags
      .filter((t) => t.name.toLowerCase().includes(query))
      .slice(0, 10);
  }, [activeAlbum, availableTags, newAlbumTag]);

  // モーダル内トラックタグ用サジェスト（入力に応じてリアルタイム絞り込み）
  const trackTagSuggestions = useMemo(() => {
    if (!editingTrackId) return [];
    const currentTrack = tracks.find((t) => t.id === editingTrackId);
    if (!currentTrack) return [];
    const query = newTrackTag.trim().toLowerCase();
    const candidateTags = availableTags.filter(
      (t) => !currentTrack.tags.includes(t.name) && !/^\d{4}$/.test(t.name)
    );

    if (!query) {
      return candidateTags.slice(0, 6);
    }
    return candidateTags
      .filter((t) => t.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [editingTrackId, tracks, availableTags, newTrackTag]);

  const getTagCategory = (tagName: string): TagCategory =>
    availableTags.find((tag) => tag.name.toLowerCase() === tagName.toLowerCase())?.category ?? "other";

  if (albums.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-20">
        <div className="h-16 w-16 rounded-2xl bg-zinc-900 flex items-center justify-center mb-4 border border-zinc-800 shadow-inner">
          <Music className="h-8 w-8 text-zinc-600" />
        </div>
        <h2 className="text-base font-medium text-zinc-300">
          {selectedTags.length > 0
            ? "選択したタグに一致するアルバムがありません"
            : "アルバムが見つかりません"}
        </h2>
        <p className="mt-1 text-xs text-zinc-500 max-w-sm">
          {selectedTags.length > 0
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

          return (
            <div
              key={album.id}
              onClick={() => handleAlbumClick(album)}
              className="group flex flex-col bg-zinc-900/30 hover:bg-zinc-900/70 border border-zinc-800/60 hover:border-zinc-700/80 rounded-xl p-3 transition duration-200 cursor-pointer shadow-sm hover:shadow-md"
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
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center p-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-medium shadow-lg transform translate-y-1 group-hover:translate-y-0 transition duration-200 border border-indigo-400/30 backdrop-blur-sm">
                    <Tag className="h-3.5 w-3.5" />
                    <span>タグ編集</span>
                  </div>
                </div>
              </div>

              {/* Album Info */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-zinc-100 truncate group-hover:text-indigo-300 transition">
                  {album.title}
                </span>
                <span className="text-[11px] text-zinc-400 truncate">
                  {album.artist}
                </span>

                <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-1">
                  {album.release_year && (
                    <span className="flex items-center gap-0.5">
                      <Calendar className="h-2.5 w-2.5" /> {album.release_year}
                    </span>
                  )}
                  <span>{album.track_count} 曲</span>
                </div>

                {/* Tags preview */}
                {album.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {album.tags.slice(0, 3).map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/40 font-mono truncate max-w-[80px]"
                      >
                        #{tag}
                      </span>
                    ))}
                    {album.tags.length > 3 && (
                      <span className="text-[9px] text-zinc-500">
                        +{album.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Album Tracks Detail Modal */}
      {activeAlbum && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-800/80 flex flex-col gap-4 bg-zinc-900/90">
              {/* Top Row: Album Info & Close Button */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-4 min-w-0 flex-1">
                  <div className="h-24 w-24 rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 shrink-0 flex items-center justify-center shadow-inner">
                    {activeAlbum.cover_url ? (
                      <img
                        src={convertFileSrc(activeAlbum.cover_url)}
                        alt={activeAlbum.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Disc3 className="h-10 w-10 text-zinc-600" />
                    )}
                  </div>
                  <div className="flex flex-col justify-center min-w-0 flex-1">
                    <span className="text-xs uppercase tracking-wider text-indigo-400 font-semibold">
                      Album
                    </span>
                    <h2 className="text-lg font-bold text-zinc-100 truncate">{activeAlbum.title}</h2>
                    <p className="text-xs text-zinc-400 mt-0.5 truncate">{activeAlbum.artist}</p>

                    {/* Album Tags with Edit & Delete */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                      {activeAlbum.tags.map((t, i) => (
                        <span
                          key={i}
                          className={`group/tag inline-flex items-center gap-1 text-[10px] pl-2 pr-1.5 py-0.5 rounded-full border ${tagColorClasses[getTagCategory(t)]}`}
                        >
                          #{t}
                          <button
                            onClick={() => handleRemoveAlbumTag(t)}
                            className="opacity-60 hover:opacity-100 hover:text-red-400 cursor-pointer"
                            title="タグを削除"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}

                      {/* Add Album Tag Button / Input */}
                      {isAddingAlbumTag ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={newAlbumTag}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNewAlbumTag(val);
                              const matched = availableTags.find(
                                (t) => t.name.toLowerCase() === val.trim().toLowerCase()
                              );
                              if (matched) {
                                setNewAlbumTagCategory(matched.category);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddAlbumTag(newAlbumTag);
                              if (e.key === "Escape") setIsAddingAlbumTag(false);
                            }}
                            placeholder="タグ名..."
                            autoFocus
                            className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-950 border border-indigo-500/60 text-zinc-100 w-24 focus:outline-none"
                          />
                          <select
                            value={newAlbumTagCategory}
                            onChange={(e) => setNewAlbumTagCategory(e.target.value as TagCategory)}
                            className="text-[10px] px-1 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-300 focus:outline-none"
                            aria-label="アルバムタグの分類"
                          >
                            {tagCategories.map((category) => (
                              <option key={category.value} value={category.value}>{category.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleAddAlbumTag(newAlbumTag)}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer"
                          >
                            追加
                          </button>
                          <button
                            onClick={() => {
                              setIsAddingAlbumTag(false);
                              setNewAlbumTag("");
                            }}
                            className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsAddingAlbumTag(true)}
                          className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-400 hover:text-zinc-200 border border-zinc-700/40 transition cursor-pointer"
                        >
                          <Plus className="h-2.5 w-2.5" /> タグ追加
                        </button>
                      )}
                    </div>

                    {/* Tag Suggestions for Album */}
                    {isAddingAlbumTag && (
                      <div className="flex flex-wrap items-center gap-1 mt-2 text-[9px] text-zinc-500">
                        <span>{newAlbumTag.trim() ? "候補:" : "よく使う候補:"}</span>
                        {albumTagSuggestions.length > 0 ? (
                          albumTagSuggestions.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => handleAddAlbumTag(s.name, s.category)}
                              className={`px-1.5 py-0.5 rounded border text-[9px] transition cursor-pointer flex items-center gap-0.5 hover:brightness-125 ${
                                tagColorClasses[s.category] || "bg-zinc-800 text-zinc-300 border-zinc-700"
                              }`}
                              title={`タグ「${s.name}」(${tagCategories.find(c => c.value === s.category)?.label || s.category}) を追加`}
                            >
                              <span>+{s.name}</span>
                            </button>
                          ))
                        ) : newAlbumTag.trim() ? (
                          <span className="text-zinc-500 italic">一致する候補がありません（Enterで新規追加）</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setActiveAlbum(null);
                    setSelectedTrackIds(new Set());
                    setLastSelectedTrackIndex(null);
                    setBatchTrackTag("");
                    setEditingTrackId(null);
                  }}
                  className="text-zinc-400 hover:text-zinc-100 p-1.5 rounded-lg hover:bg-zinc-800 transition cursor-pointer shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Action Buttons Row: Under Album Cover & Tags */}
              <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60">
                <div className="flex items-center gap-2">
                  {tracks.length > 0 && (
                    <>
                      <button
                        onClick={() => onPlayAlbum?.(activeAlbum, tracks)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-medium transition cursor-pointer shadow-sm"
                        title="アルバム全曲を再生"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        全曲再生
                      </button>
                      <button
                        onClick={() => onQueueAlbum?.(activeAlbum, tracks)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 text-xs font-medium border border-zinc-700/60 transition cursor-pointer"
                        title="アルバム全曲を再生キューに追加"
                      >
                        <ListPlus className="h-3.5 w-3.5" />
                        全曲キューへ
                      </button>
                    </>
                  )}
                </div>

                {/* Album Delete Button */}
                <button
                  onClick={handleDeleteAlbum}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-red-950/50 text-zinc-400 hover:text-red-400 border border-zinc-700/60 hover:border-red-500/40 text-xs font-medium transition cursor-pointer disabled:opacity-50"
                  title="アルバムをライブラリから削除（音楽ファイル自体は削除されません）"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>削除</span>
                </button>
              </div>
            </div>

            {/* Tracks List */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingTracks ? (
                <div className="py-12 text-center text-xs text-zinc-500">トラック読み込み中...</div>
              ) : sortedTracks.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500">トラック情報がありません</div>
              ) : (() => {
                const uniqueDiscs = Array.from(new Set(sortedTracks.map((t) => t.disc_number ?? 1)));
                const hasMultipleDiscs = uniqueDiscs.length > 1;

                return (
                  <div className="flex flex-col gap-3">
                    {/* Batch Selection & Editing Toolbar */}
                    <div className="space-y-2">
                      {/* Selection Toolbar Header */}
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-950/60 border border-zinc-800/80 text-xs">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={handleToggleSelectAll}
                            className="flex items-center gap-2 text-zinc-300 hover:text-white transition cursor-pointer select-none"
                            title={
                              selectedTrackIds.size === sortedTracks.length
                                ? "全選択を解除"
                                : "全曲を選択"
                            }
                          >
                            {selectedTrackIds.size === sortedTracks.length && sortedTracks.length > 0 ? (
                              <CheckSquare className="h-4 w-4 text-indigo-400" />
                            ) : selectedTrackIds.size > 0 ? (
                              <MinusSquare className="h-4 w-4 text-indigo-400" />
                            ) : (
                              <Square className="h-4 w-4 text-zinc-500 hover:text-zinc-400" />
                            )}
                            <span className="font-medium">
                              {selectedTrackIds.size === sortedTracks.length && sortedTracks.length > 0
                                ? "全選択解除"
                                : "すべて選択"}
                            </span>
                          </button>

                          {selectedTrackIds.size > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium">
                              {selectedTrackIds.size} / {sortedTracks.length} 曲選択中
                            </span>
                          )}
                        </div>

                        {selectedTrackIds.size > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedTrackIds(new Set())}
                            className="text-[11px] text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                          >
                            選択解除
                          </button>
                        )}
                      </div>

                      {/* Batch Tag Editing Panel */}
                      {selectedTrackIds.size > 0 && (
                        <div className="p-3.5 rounded-xl bg-zinc-950/90 border border-indigo-500/40 shadow-xl space-y-3 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                              <Tag className="h-3.5 w-3.5" />
                              <span>選択した {selectedTrackIds.size} 曲のタグを一括編集</span>
                            </div>
                            <span className="text-[10px] text-zinc-500 hidden sm:inline">
                              Shift+クリックで曲の範囲選択が可能
                            </span>
                          </div>

                          {/* Batch Tag Add Inputs */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <input
                              type="text"
                              value={batchTrackTag}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBatchTrackTag(val);
                                const matched = availableTags.find(
                                  (t) => t.name.toLowerCase() === val.trim().toLowerCase()
                                );
                                if (matched) {
                                  setBatchTrackTagCategory(matched.category);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleBatchAddTrackTag(batchTrackTag);
                                if (e.key === "Escape") setBatchTrackTag("");
                              }}
                              placeholder="タグ名を入力..."
                              className="text-xs px-2.5 py-1 rounded-lg bg-zinc-900 border border-indigo-500/60 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-400 w-44"
                            />
                            <select
                              value={batchTrackTagCategory}
                              onChange={(e) => setBatchTrackTagCategory(e.target.value as TagCategory)}
                              className="text-xs px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 focus:outline-none"
                              aria-label="一括追加タグの分類"
                            >
                              {tagCategories.map((category) => (
                                <option key={category.value} value={category.value}>
                                  {category.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={!batchTrackTag.trim()}
                              onClick={() => handleBatchAddTrackTag(batchTrackTag)}
                              className="text-xs px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-white font-medium transition cursor-pointer shadow-sm flex items-center gap-1"
                            >
                              <Plus className="h-3 w-3" />
                              一括追加
                            </button>
                          </div>

                          {/* Tag Suggestions for Batch */}
                          {batchTagSuggestions.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 text-[10px] text-zinc-400">
                              <span className="text-zinc-500 text-[9px]">
                                {batchTrackTag.trim() ? "候補:" : "よく使う候補:"}
                              </span>
                              {batchTagSuggestions.map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => handleBatchAddTrackTag(s.name, s.category)}
                                  className={`px-1.5 py-0.5 rounded border text-[9px] transition cursor-pointer hover:brightness-125 flex items-center gap-0.5 ${
                                    tagColorClasses[s.category] || "bg-zinc-800 text-zinc-300 border-zinc-700"
                                  }`}
                                  title={`選択中の ${selectedTrackIds.size} 曲に「${s.name}」を一括追加`}
                                >
                                  <span>+{s.name}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Existing Tags in Selected Tracks (with batch remove) */}
                          {selectedTrackTagsSummary.length > 0 && (
                            <div className="pt-2 border-t border-zinc-800/80">
                              <div className="text-[10px] text-zinc-400 mb-1.5 flex items-center gap-1">
                                <span>選択曲に付いているタグ (×で選択曲から一括削除):</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {selectedTrackTagsSummary.map((item) => {
                                  const category = getTagCategory(item.name);
                                  return (
                                    <span
                                      key={item.name}
                                      className={`inline-flex items-center gap-1 text-[10px] pl-2 pr-1.5 py-0.5 rounded-full border ${tagColorClasses[category]}`}
                                    >
                                      <span>#{item.name}</span>
                                      <span className="text-[9px] opacity-70 font-mono">
                                        ({item.count}/{selectedTrackIds.size})
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleBatchRemoveTrackTag(item.name)}
                                        className="opacity-60 hover:opacity-100 hover:text-red-400 cursor-pointer ml-0.5"
                                        title={`選択したすべての曲から「${item.name}」を一括削除`}
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Tracks List Items */}
                    <div className="flex flex-col divide-y divide-zinc-800/40">
                      {sortedTracks.map((track, idx) => {
                        const currentDisc = track.disc_number ?? 1;
                        const prevDisc = idx > 0 ? (sortedTracks[idx - 1].disc_number ?? 1) : null;
                        const showDiscHeader = hasMultipleDiscs && (idx === 0 || currentDisc !== prevDisc);
                        const isSelected = selectedTrackIds.has(track.id);

                        return (
                          <React.Fragment key={track.id}>
                            {showDiscHeader && (
                              <div className="flex items-center gap-2 pt-3.5 pb-1 px-3 text-[11px] font-semibold text-indigo-400 bg-zinc-900/80 border-b border-zinc-800/80 sticky top-0 backdrop-blur-sm z-10">
                                <Disc3 className="h-3.5 w-3.5" />
                                <span>Disc {currentDisc}</span>
                              </div>
                            )}
                            <div
                              className={`group py-2.5 px-3 flex items-center justify-between rounded-lg hover:bg-zinc-800/50 transition cursor-pointer text-xs ${
                                isSelected
                                  ? "bg-indigo-950/40 border-l-2 border-indigo-500"
                                  : currentPlayingTrackId === track.id
                                  ? "bg-indigo-950/25 border-l-2 border-indigo-400"
                                  : ""
                              }`}
                              onClick={() => {
                                if (onPlayTrack) {
                                  onPlayTrack(track, activeAlbum);
                                } else {
                                  onSelectTrack?.(track, activeAlbum);
                                }
                              }}
                            >
                              <div className="flex items-center gap-2.5 truncate">
                                {/* Track Selection Checkbox */}
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleTrackSelect(track.id, idx, e)}
                                  className="p-1 -ml-1 text-zinc-500 hover:text-zinc-200 transition cursor-pointer shrink-0"
                                  title="選択 / 選択解除 (Shift+クリックで範囲選択)"
                                >
                                  {isSelected ? (
                                    <CheckSquare className="h-4 w-4 text-indigo-400" />
                                  ) : (
                                    <Square className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400" />
                                  )}
                                </button>

                                <span className="w-5 text-zinc-500 font-mono text-center text-[11px] shrink-0">
                                  {track.track_number ?? "-"}
                                </span>
                                <div className="flex flex-col truncate">
                                  <div className="flex items-center gap-2 truncate">
                                    <span
                                      className={`font-medium transition truncate ${
                                        currentPlayingTrackId === track.id
                                          ? "text-indigo-400"
                                          : isSelected
                                          ? "text-indigo-200 font-semibold"
                                          : "text-zinc-200 group-hover:text-indigo-300"
                                      }`}
                                    >
                                      {track.title}
                                    </span>
                                    {currentPlayingTrackId === track.id && isPlaying && (
                                      <Volume2 className="h-3.5 w-3.5 text-indigo-400 shrink-0 animate-pulse" />
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 truncate">
                                    {track.artist && <span>{track.artist}</span>}
                                    {track.composer && <span>(作: {track.composer})</span>}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                                {/* Track tags list */}
                                <div className="flex items-center gap-1">
                                  {track.tags.map((t, tagIdx) => {
                                    const category = getTagCategory(t);
                                    return (
                                      <span
                                        key={tagIdx}
                                        className={`inline-flex items-center gap-0.5 text-[9px] pl-1.5 pr-1 py-0.2 rounded border ${tagColorClasses[category]}`}
                                      >
                                        {t}
                                        <button
                                          onClick={() => handleRemoveTrackTag(track.id, t)}
                                          className="opacity-60 hover:opacity-100 hover:text-red-400 cursor-pointer"
                                          title="タグを削除"
                                        >
                                          <X className="h-2 w-2" />
                                        </button>
                                      </span>
                                    );
                                  })}

                                  {/* Add Track Tag input / button */}
                                  {editingTrackId === track.id ? (
                                    <div className="flex flex-col items-start gap-1">
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={newTrackTag}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setNewTrackTag(val);
                                            const matched = availableTags.find(
                                              (t) => t.name.toLowerCase() === val.trim().toLowerCase()
                                            );
                                            if (matched) {
                                              setNewTrackTagCategory(matched.category);
                                            }
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") handleAddTrackTag(track.id, newTrackTag);
                                            if (e.key === "Escape") setEditingTrackId(null);
                                          }}
                                          placeholder="曲タグ..."
                                          autoFocus
                                          className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-950 border border-emerald-500/60 text-zinc-100 w-16 focus:outline-none"
                                        />
                                        <select
                                          value={newTrackTagCategory}
                                          onChange={(e) => setNewTrackTagCategory(e.target.value as TagCategory)}
                                          className="text-[9px] px-1 py-0.2 rounded bg-zinc-950 border border-zinc-700 text-zinc-300 focus:outline-none"
                                          aria-label="曲タグの分類"
                                        >
                                          {tagCategories.map((category) => (
                                            <option key={category.value} value={category.value}>
                                              {category.label}
                                            </option>
                                          ))}
                                        </select>
                                        <button
                                          onClick={() => handleAddTrackTag(track.id, newTrackTag)}
                                          className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
                                        >
                                          追加
                                        </button>
                                        <button
                                          onClick={() => {
                                            setEditingTrackId(null);
                                            setNewTrackTag("");
                                          }}
                                          className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      </div>
                                      {trackTagSuggestions.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1 mt-0.5 text-[8px] text-zinc-500">
                                          <span>候補:</span>
                                          {trackTagSuggestions.map((s) => (
                                            <button
                                              key={s.id}
                                              onClick={() => handleAddTrackTag(track.id, s.name, s.category)}
                                              className={`px-1 py-0.2 rounded border text-[8px] transition cursor-pointer hover:brightness-125 ${
                                                tagColorClasses[s.category] || "bg-zinc-800 text-zinc-300 border-zinc-700"
                                              }`}
                                              title={`タグ「${s.name}」(${
                                                tagCategories.find((c) => c.value === s.category)?.label || s.category
                                              }) を追加`}
                                            >
                                              +{s.name}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setEditingTrackId(track.id);
                                        setNewTrackTag("");
                                        setNewTrackTagCategory("other");
                                      }}
                                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                                      title="曲にタグを追加"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {/* Queue Button */}
                                  {onQueueTrack && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onQueueTrack(track, activeAlbum);
                                      }}
                                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-indigo-600 text-zinc-300 hover:text-white border border-zinc-700/40 hover:border-indigo-500 text-[10px] transition cursor-pointer"
                                      title="この曲を再生キューに追加"
                                    >
                                      <Plus className="h-3 w-3" />
                                      <span>キューへ</span>
                                    </button>
                                  )}

                                  <span className="text-[11px] text-zinc-500 font-mono flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatDuration(track.duration_secs)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
