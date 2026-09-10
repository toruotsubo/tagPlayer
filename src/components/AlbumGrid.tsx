import React, { useState } from "react";
import { Disc3, Music, Calendar, Clock, X, Tag, Plus } from "lucide-react";
import { Album, TagItem, Track } from "../types/music";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

interface AlbumGridProps {
  albums: Album[];
  selectedTags: string[];
  availableTags: TagItem[];
  onSelectTrack?: (track: Track, album: Album) => void;
  onTagsChanged?: () => void;
}

export const AlbumGrid: React.FC<AlbumGridProps> = ({
  albums,
  selectedTags,
  availableTags,
  onSelectTrack,
  onTagsChanged,
}) => {
  const [activeAlbum, setActiveAlbum] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);

  // Album Tag Edit state
  const [isAddingAlbumTag, setIsAddingAlbumTag] = useState(false);
  const [newAlbumTag, setNewAlbumTag] = useState("");

  // Track Tag Edit state
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);
  const [newTrackTag, setNewTrackTag] = useState("");

  const handleAlbumClick = async (album: Album) => {
    setActiveAlbum(album);
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

  const handleAddAlbumTag = async (tagName: string) => {
    if (!activeAlbum || !tagName.trim()) return;
    try {
      const updatedTags = await invoke<string[]>("add_album_tag", {
        albumId: activeAlbum.id,
        tagName: tagName.trim(),
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

  const handleAddTrackTag = async (trackId: number, tagName: string) => {
    if (!tagName.trim()) return;
    try {
      const updatedTags = await invoke<string[]>("add_track_tag", {
        trackId,
        tagName: tagName.trim(),
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

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining.toString().padStart(2, "0")}`;
  };

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

  // アルバムタグ用サジェスト（現在のアルバムが持っていない既存タグ）
  const albumTagSuggestions = activeAlbum
    ? availableTags
        .filter((t) => !activeAlbum.tags.includes(t.name))
        .slice(0, 8)
    : [];

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
            <div className="p-6 border-b border-zinc-800/80 flex items-start justify-between gap-4 bg-zinc-900/90">
              <div className="flex gap-4">
                <div className="h-24 w-24 rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 shrink-0 flex items-center justify-center">
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
                <div className="flex flex-col justify-center">
                  <span className="text-xs uppercase tracking-wider text-indigo-400 font-semibold">
                    Album
                  </span>
                  <h2 className="text-lg font-bold text-zinc-100">{activeAlbum.title}</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">{activeAlbum.artist}</p>

                  {/* Album Tags with Edit & Delete */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    {activeAlbum.tags.map((t, i) => (
                      <span
                        key={i}
                        className="group/tag inline-flex items-center gap-1 text-[10px] pl-2 pr-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/30"
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
                          onChange={(e) => setNewAlbumTag(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddAlbumTag(newAlbumTag);
                            if (e.key === "Escape") setIsAddingAlbumTag(false);
                          }}
                          placeholder="タグ名..."
                          autoFocus
                          className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-950 border border-indigo-500/60 text-zinc-100 w-24 focus:outline-none"
                        />
                        <button
                          onClick={() => handleAddAlbumTag(newAlbumTag)}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer"
                        >
                          追加
                        </button>
                        <button
                          onClick={() => setIsAddingAlbumTag(false)}
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
                  {isAddingAlbumTag && albumTagSuggestions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-2 text-[9px] text-zinc-500">
                      <span>候補:</span>
                      {albumTagSuggestions.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleAddAlbumTag(s.name)}
                          className="px-1.5 py-0.2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
                        >
                          +{s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setActiveAlbum(null)}
                className="text-zinc-400 hover:text-zinc-100 p-1.5 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tracks List */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingTracks ? (
                <div className="py-12 text-center text-xs text-zinc-500">トラック読み込み中...</div>
              ) : tracks.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500">トラック情報がありません</div>
              ) : (() => {
                const sortedTracks = [...tracks].sort((a, b) => {
                  const discA = a.disc_number ?? 1;
                  const discB = b.disc_number ?? 1;
                  if (discA !== discB) return discA - discB;
                  const trackA = a.track_number ?? 9999;
                  const trackB = b.track_number ?? 9999;
                  if (trackA !== trackB) return trackA - trackB;
                  return a.title.localeCompare(b.title);
                });

                const uniqueDiscs = Array.from(new Set(sortedTracks.map((t) => t.disc_number ?? 1)));
                const hasMultipleDiscs = uniqueDiscs.length > 1;

                return (
                  <div className="flex flex-col divide-y divide-zinc-800/40">
                    {sortedTracks.map((track, idx) => {
                      const currentDisc = track.disc_number ?? 1;
                      const prevDisc = idx > 0 ? (sortedTracks[idx - 1].disc_number ?? 1) : null;
                      const showDiscHeader = hasMultipleDiscs && (idx === 0 || currentDisc !== prevDisc);

                      return (
                        <React.Fragment key={track.id}>
                          {showDiscHeader && (
                            <div className="flex items-center gap-2 pt-3.5 pb-1 px-3 text-[11px] font-semibold text-indigo-400 bg-zinc-900/80 border-b border-zinc-800/80 sticky top-0 backdrop-blur-sm z-10">
                              <Disc3 className="h-3.5 w-3.5" />
                              <span>Disc {currentDisc}</span>
                            </div>
                          )}
                          <div
                            className="group py-2.5 px-3 flex items-center justify-between rounded-lg hover:bg-zinc-800/50 transition cursor-pointer text-xs"
                            onClick={() => onSelectTrack?.(track, activeAlbum)}
                          >
                            <div className="flex items-center gap-3 truncate">
                              <span className="w-5 text-zinc-500 font-mono text-center text-[11px]">
                                {track.track_number ?? "-"}
                              </span>
                        <div className="flex flex-col truncate">
                          <span className="font-medium text-zinc-200 group-hover:text-indigo-300 transition truncate">
                            {track.title}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-500 truncate">
                            {track.artist && <span>{track.artist}</span>}
                            {track.composer && <span>(作: {track.composer})</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {/* Track tags list */}
                        <div className="flex items-center gap-1">
                          {track.tags.map((t, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-0.5 text-[9px] pl-1.5 pr-1 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
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
                          ))}

                          {/* Add Track Tag input / button */}
                          {editingTrackId === track.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={newTrackTag}
                                onChange={(e) => setNewTrackTag(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleAddTrackTag(track.id, newTrackTag);
                                  if (e.key === "Escape") setEditingTrackId(null);
                                }}
                                placeholder="曲タグ..."
                                autoFocus
                                className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-950 border border-emerald-500/60 text-zinc-100 w-16 focus:outline-none"
                              />
                              <button
                                onClick={() => handleAddTrackTag(track.id, newTrackTag)}
                                className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
                              >
                                追加
                              </button>
                              <button
                                onClick={() => setEditingTrackId(null)}
                                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingTrackId(track.id);
                                setNewTrackTag("");
                              }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                              title="曲にタグを追加"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                        <span className="text-[11px] text-zinc-500 font-mono flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(track.duration_secs)}
                        </span>
                      </div>
                    </div>
                  </React.Fragment>
                      );
                    })}
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
