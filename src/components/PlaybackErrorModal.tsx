import React, { useEffect } from "react";
import { X, FileWarning, AlertCircle } from "lucide-react";
import { useTranslation } from "../i18n";

export interface PlaybackErrorInfo {
  trackTitle?: string;
  artist?: string;
  albumTitle?: string;
  filePath?: string;
  rawError?: unknown;
  isFileNotFound?: boolean;
}

export interface PlaybackErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  error: PlaybackErrorInfo | null;
}

export const PlaybackErrorModal: React.FC<PlaybackErrorModalProps> = ({
  isOpen,
  onClose,
  error,
}) => {
  const { t } = useTranslation();

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

  if (!isOpen || !error) return null;

  const isFileNotFound =
    error.isFileNotFound ??
    (typeof error.rawError === "string" &&
      (error.rawError.includes("ファイルが存在しません") ||
        error.rawError.toLowerCase().includes("not found")));

  const title = isFileNotFound
    ? t.playbackErrorModal.fileNotFoundTitle
    : t.playbackErrorModal.generalErrorTitle;

  const message = isFileNotFound
    ? t.playbackErrorModal.fileNotFoundMessage
    : t.playbackErrorModal.generalErrorMessage;

  const subInfo = [error.artist, error.albumTitle].filter(Boolean).join(" · ");

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden select-none animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0">
              {isFileNotFound ? (
                <FileWarning className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
            </div>
            <h2 className="text-base font-bold text-zinc-100">{title}</h2>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            title={t.common.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4 text-xs">
          <p className="text-zinc-300 leading-relaxed">{message}</p>

          {/* Track Details Card */}
          {(error.trackTitle || subInfo) && (
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3 flex flex-col gap-1">
              {error.trackTitle && (
                <span className="text-xs font-semibold text-zinc-100 truncate">
                  {error.trackTitle}
                </span>
              )}
              {subInfo && (
                <span className="text-[11px] text-zinc-400 truncate">
                  {subInfo}
                </span>
              )}
            </div>
          )}

          {/* File Path */}
          {error.filePath && (
            <div>
              <span className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
                {t.playbackErrorModal.filePathLabel}
              </span>
              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80 font-mono text-[11px] text-zinc-300 break-all select-all leading-relaxed max-h-24 overflow-y-auto">
                {error.filePath}
              </div>
            </div>
          )}

          {/* Raw Error if different from file not found */}
          {!isFileNotFound && Boolean(error.rawError) && (
            <div>
              <span className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
                {t.playbackErrorModal.errorDetailsLabel}
              </span>
              <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800/80 font-mono text-[11px] text-rose-300/80 break-all select-all">
                {String(error.rawError)}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-zinc-950/60 border-t border-zinc-800/80 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200 text-xs font-medium transition cursor-pointer active:scale-95 shadow-xs"
          >
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
};
