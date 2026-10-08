import React, { useState, useRef } from "react";
import {
  ListMusic,
  X,
  Trash2,
  BookmarkPlus,
  Volume2,
  Disc3,
  Check,
  GripVertical,
} from "lucide-react";

import { convertFileSrc } from "@tauri-apps/api/core";
import { TrackWithAlbum } from "../types/music";

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  queue: TrackWithAlbum[];
  currentIndex: number;
  onPlayTrackAtIndex: (index: number) => void;
  onRemoveTrack: (index: number) => void;
  onClearQueue: () => void;
  onSaveAsPlaylist: (name: string) => Promise<void>;
  onReorderQueue: (fromIndex: number, toIndex: number) => void;
  isPlaying?: boolean;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({
  isOpen,
  onClose,
  queue,
  currentIndex,
  onPlayTrackAtIndex,
  onRemoveTrack,
  onClearQueue,
  onSaveAsPlaylist,
  onReorderQueue,
  isPlaying = false,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);

  const pointerState = useRef<{
    pointerId: number;
    startIndex: number;
    startY: number;
    startX: number;
    isDragging: boolean;
    targetElement: HTMLElement | null;
  } | null>(null);

  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    idx: number
  ) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;

    const el = e.currentTarget;
    pointerState.current = {
      pointerId: e.pointerId,
      startIndex: idx,
      startY: e.clientY,
      startX: e.clientX,
      isDragging: false,
      targetElement: el,
    };

    try {
      el.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerState.current;
    if (!state || state.pointerId !== e.pointerId) return;

    const dy = Math.abs(e.clientY - state.startY);
    const dx = Math.abs(e.clientX - state.startX);

    if (!state.isDragging) {
      if (dy > 4 || dx > 4) {
        state.isDragging = true;
        setDraggingIndex(state.startIndex);
        setTargetIndex(state.startIndex);
      } else {
        return;
      }
    }

    const clientY = e.clientY;
    for (let i = 0; i < queue.length; i++) {
      const el = itemRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        setTargetIndex(i);
        return;
      }
    }

    if (itemRefs.current[0]) {
      const topRect = itemRefs.current[0].getBoundingClientRect();
      if (clientY < topRect.top) {
        setTargetIndex(0);
        return;
      }
    }
    const lastEl = itemRefs.current[queue.length - 1];
    if (lastEl) {
      const bottomRect = lastEl.getBoundingClientRect();
      if (clientY > bottomRect.bottom) {
        setTargetIndex(queue.length - 1);
        return;
      }
    }
  };

  const handlePointerUp = (
    e: React.PointerEvent<HTMLDivElement>,
    idx: number
  ) => {
    const state = pointerState.current;
    if (!state || state.pointerId !== e.pointerId) return;

    if (state.targetElement) {
      try {
        state.targetElement.releasePointerCapture(e.pointerId);
      } catch {}
    }

    if (state.isDragging) {
      if (targetIndex !== null && targetIndex !== state.startIndex) {
        onReorderQueue(state.startIndex, targetIndex);
      }
    } else {
      onPlayTrackAtIndex(idx);
    }

    pointerState.current = null;
    setDraggingIndex(null);
    setTargetIndex(null);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerState.current;
    if (state && state.targetElement) {
      try {
        state.targetElement.releasePointerCapture(e.pointerId);
      } catch {}
    }
    pointerState.current = null;
    setDraggingIndex(null);
    setTargetIndex(null);
  };

  if (!isOpen) return null;

  const totalDurationSecs = queue.reduce((acc, t) => acc + t.duration_secs, 0);

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining.toString().padStart(2, "0")}`;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistName.trim()) return;
    try {
      await onSaveAsPlaylist(playlistName.trim());
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsSaving(false);
        setPlaylistName("");
      }, 1500);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
      <div className="w-full max-w-xl h-full bg-zinc-900 border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/90 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ListMusic className="h-4 w-4 text-indigo-400 shrink-0" />
            <h2 className="text-sm font-semibold text-zinc-200 shrink-0">再生キュー</h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-zinc-700/80 bg-zinc-950/60 text-[10px] font-mono text-zinc-400 shrink-0">
              {queue.length} 曲 / {Math.floor(totalDurationSecs / 60)}分
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {queue.length > 0 && (
              <>
                <button
                  onClick={() => setIsSaving(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-700/60 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 hover:text-indigo-300 transition text-xs font-medium cursor-pointer shadow-xs"
                  title="プレイリストとして保存"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  <span>プレイリストとして保存</span>
                </button>
                <button
                  onClick={onClearQueue}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-700/60 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 hover:text-red-400 transition text-xs font-medium cursor-pointer shadow-xs"
                  title="キューをクリア"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>クリア</span>
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Save as Playlist dialog/banner */}
        {isSaving && (
          <form
            onSubmit={handleSave}
            className="p-3 bg-zinc-950/70 border-b border-zinc-800 flex flex-col gap-2 animate-in fade-in duration-150"
          >
            <div className="text-xs font-medium text-zinc-300">
              キューをプレイリストとして保存
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                placeholder="プレイリスト名を入力..."
                autoFocus
                className="flex-1 rounded-md bg-zinc-900 border border-zinc-700/80 px-2.5 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!playlistName.trim()}
                className="px-3 py-1 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 disabled:opacity-40 transition cursor-pointer flex items-center gap-1"
              >
                {saveSuccess ? <Check className="h-3.5 w-3.5" /> : "保存"}
              </button>
              <button
                type="button"
                onClick={() => setIsSaving(false)}
                className="px-2 py-1 rounded-md text-zinc-400 hover:text-zinc-200 text-xs transition cursor-pointer"
              >
                取消
              </button>
            </div>
          </form>
        )}

        {/* Queue Items List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-zinc-800/40">
          {queue.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 text-xs">
              <Disc3 className="h-8 w-8 mb-2 text-zinc-700" />
              再生キューが空です
              <span className="text-[11px] text-zinc-600 mt-1">
                曲を再生するか、タグからプレイリストを作成してください
              </span>
            </div>
          ) : (
            queue.map((track, idx) => {
              const isCurrent = idx === currentIndex;
              const isDragged = draggingIndex === idx;
              const isTarget = targetIndex === idx && draggingIndex !== null && draggingIndex !== idx;
              const coverSrc = track.cover_url
                ? convertFileSrc(track.cover_url)
                : null;

              return (
                <div
                  key={`${track.id}-${idx}`}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  onPointerDown={(e) => handlePointerDown(e, idx)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={(e) => handlePointerUp(e, idx)}
                  onPointerCancel={handlePointerCancel}
                  className={`group flex items-center justify-between p-2 rounded-lg transition-all text-xs select-none ${
                    draggingIndex !== null ? "cursor-grabbing" : "cursor-pointer"
                  } ${
                    isDragged
                      ? "opacity-35 scale-[0.98] border border-dashed border-indigo-400 bg-indigo-950/20"
                      : isTarget
                      ? "ring-2 ring-indigo-500 bg-indigo-500/20"
                      : isCurrent
                      ? "bg-indigo-600/15 border border-indigo-500/30 text-indigo-200"
                      : "hover:bg-zinc-800/60 text-zinc-300"
                  }`}
                  style={{ touchAction: "none" }}
                >
                  <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                    <div
                      className="p-0.5 text-zinc-600 group-hover:text-zinc-400 rounded transition shrink-0"
                      title="ドラッグして順位を入れ替え"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </div>

                    <div className="h-9 w-9 rounded bg-zinc-950 shrink-0 overflow-hidden flex items-center justify-center border border-zinc-800/60 relative pointer-events-none">
                      {coverSrc ? (
                        <img
                          src={coverSrc}
                          alt=""
                          className="h-full w-full object-cover pointer-events-none"
                          draggable={false}
                        />
                      ) : (
                        <Disc3 className="h-4 w-4 text-zinc-600" />
                      )}
                      {isCurrent && isPlaying && (
                        <div className="absolute inset-0 bg-indigo-950/70 flex items-center justify-center">
                          <Volume2 className="h-4 w-4 text-indigo-400 animate-pulse" />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col truncate">
                      <span
                        className={`truncate font-medium ${
                          isCurrent
                            ? "text-indigo-300 font-semibold"
                            : "text-zinc-200"
                        }`}
                      >
                        {track.title}
                      </span>
                      <span className="text-[11px] text-zinc-500 truncate">
                        {track.artist || track.album_artist} • {track.album_title}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {formatDuration(track.duration_secs)}
                    </span>
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveTrack(idx);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition cursor-pointer"
                      title="キューから削除"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
