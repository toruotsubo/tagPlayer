import React, { useState, useRef, useEffect } from "react";
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
import { useTranslation } from "../i18n";

export interface QueueModalProps {
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

export const QueueModal: React.FC<QueueModalProps> = ({
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
  const { t } = useTranslation();
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

  // Escキーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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
        break;
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
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden select-text animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/90 gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
              <ListMusic className="h-5 w-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100 shrink-0">{t.queueModal.title}</h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-zinc-700/80 bg-zinc-950/60 text-[10px] font-mono text-zinc-400 shrink-0">
                  {t.queueModal.queueCountAndDuration(queue.length, Math.floor(totalDurationSecs / 60))}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                {t.queueModal.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {queue.length > 0 && (
              <>
                <button
                  onClick={() => setIsSaving(!isSaving)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200 hover:text-indigo-300 transition text-xs font-medium cursor-pointer shadow-xs active:scale-95"
                  title={t.queueModal.savePlaylistTip}
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  <span>{t.queueModal.savePlaylistButton}</span>
                </button>
                <button
                  onClick={onClearQueue}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200 hover:text-red-400 transition text-xs font-medium cursor-pointer shadow-xs active:scale-95"
                  title={t.queueModal.clearQueueTip}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{t.queueModal.clearQueueButton}</span>
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer ml-1"
              title={t.queueModal.closeTip}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Save as Playlist dialog/banner */}
        {isSaving && (
          <form
            onSubmit={handleSave}
            className="p-3.5 px-5 bg-zinc-950/80 border-b border-zinc-800 flex flex-col gap-2 shrink-0 animate-in fade-in duration-150"
          >
            <div className="text-xs font-medium text-zinc-300">
              {t.queueModal.savePrompt}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                placeholder={t.queueModal.playlistNamePlaceholder}
                autoFocus
                className="flex-1 rounded-lg bg-zinc-900 border border-zinc-700/80 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!playlistName.trim()}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 disabled:opacity-40 transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
              >
                {saveSuccess ? <Check className="h-3.5 w-3.5" /> : t.queueModal.saveButton}
              </button>
              <button
                type="button"
                onClick={() => setIsSaving(false)}
                className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 text-xs transition cursor-pointer"
              >
                {t.queueModal.cancelButton}
              </button>
            </div>
          </form>
        )}

        {/* Queue Items List */}
        <div className="flex-1 overflow-y-auto p-3 min-h-0 divide-y divide-zinc-800/40">
          {queue.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-zinc-500 text-xs">
              <Disc3 className="h-10 w-10 mb-2.5 text-zinc-700" />
              <span className="text-sm font-medium text-zinc-400">{t.queueModal.emptyQueueTitle}</span>
              <span className="text-xs text-zinc-600 mt-1">
                {t.queueModal.emptyQueueSub}
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
                  className={`group flex items-center justify-between p-2.5 rounded-xl transition-all text-xs select-none ${
                    draggingIndex !== null ? "cursor-grabbing" : "cursor-pointer"
                  } ${
                    isDragged
                      ? "opacity-35 scale-[0.98] border border-dashed border-indigo-400 bg-indigo-950/20"
                      : isTarget
                      ? "ring-2 ring-indigo-500 bg-indigo-500/20"
                      : isCurrent
                      ? "bg-indigo-600/15 border border-indigo-500/40 text-indigo-200 shadow-sm"
                      : "hover:bg-zinc-800/60 text-zinc-300 border border-transparent"
                  }`}
                  style={{ touchAction: "none" }}
                >
                  <div className="flex items-center gap-3 truncate flex-1 min-w-0">
                    <div
                      className="p-1 text-zinc-600 group-hover:text-zinc-400 rounded transition shrink-0"
                      title={t.queueModal.dragHandleTip}
                    >
                      <GripVertical className="h-4 w-4" />
                    </div>

                    <div className="h-10 w-10 rounded-lg bg-zinc-950 shrink-0 overflow-hidden flex items-center justify-center border border-zinc-800/80 relative pointer-events-none shadow-xs">
                      {coverSrc ? (
                        <img
                          src={coverSrc}
                          alt=""
                          className="h-full w-full object-cover pointer-events-none"
                          draggable={false}
                        />
                      ) : (
                        <Disc3 className="h-5 w-5 text-zinc-600" />
                      )}
                      {isCurrent && isPlaying && (
                        <div className="absolute inset-0 bg-indigo-950/75 flex items-center justify-center backdrop-blur-[1px]">
                          <Volume2 className="h-5 w-5 text-indigo-300 animate-pulse" />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col truncate flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`truncate font-medium text-sm ${
                            isCurrent
                              ? "text-indigo-300 font-semibold"
                              : "text-zinc-200"
                          }`}
                        >
                          {track.title}
                        </span>
                        {isCurrent && isPlaying && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-medium shrink-0">
                            {t.queueModal.nowPlayingBadge}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500 truncate mt-0.5">
                        {track.artist || track.album_artist} • {track.album_title}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="text-xs text-zinc-400 font-mono">
                      {formatDuration(track.duration_secs)}
                    </span>
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveTrack(idx);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition cursor-pointer"
                      title={t.queueModal.removeTrackTip}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-zinc-950/60 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500 shrink-0">
          <span className="flex items-center gap-1.5">
            <span>💡</span>
            <span>{t.queueModal.footerHint}</span>
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition cursor-pointer active:scale-95 shadow-xs"
          >
            {t.queueModal.closeButton}
          </button>
        </div>
      </div>
    </div>
  );
};

// 互換性のためのエイリアス
export const QueueDrawer = QueueModal;
