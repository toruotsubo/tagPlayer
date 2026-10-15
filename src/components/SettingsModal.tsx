import React, { useState, useEffect } from "react";
import { X, Check, ChevronDown } from "lucide-react";
import { useTranslation, LanguageSetting } from "../i18n";
import { getStoredTextSize, applyTextSize, TextSizeSetting } from "../hooks/useTextSize";
import { saveIgnoreLeadingThe } from "../utils/sortUtils";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  ignoreLeadingThe: boolean;
  onSaveIgnoreLeadingThe: (value: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  ignoreLeadingThe,
  onSaveIgnoreLeadingThe,
}) => {
  const { t, languageSetting, setLanguageSetting } = useTranslation();
  const [selectedSetting, setSelectedSetting] = useState<LanguageSetting>(languageSetting);
  const [selectedTextSize, setSelectedTextSize] = useState<TextSizeSetting>(getStoredTextSize);
  const [selectedIgnoreLeadingThe, setSelectedIgnoreLeadingThe] = useState<boolean>(ignoreLeadingThe);

  // モーダルが開くたびに現在の設定を反映
  useEffect(() => {
    if (isOpen) {
      setSelectedSetting(languageSetting);
      setSelectedTextSize(getStoredTextSize());
      setSelectedIgnoreLeadingThe(ignoreLeadingThe);
    }
  }, [isOpen, languageSetting, ignoreLeadingThe]);

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

  if (!isOpen) return null;

  const handleSave = () => {
    setLanguageSetting(selectedSetting);
    applyTextSize(selectedTextSize);
    saveIgnoreLeadingThe(selectedIgnoreLeadingThe);
    onSaveIgnoreLeadingThe(selectedIgnoreLeadingThe);
    onClose();
  };

  const languageOptions: {
    value: LanguageSetting;
    label: string;
  }[] = [
    {
      value: "auto",
      label: t.settings.languageAuto,
    },
    {
      value: "ja",
      label: t.settings.languageJa,
    },
    {
      value: "en",
      label: t.settings.languageEn,
    },
  ];

  const textSizeOptions: {
    value: TextSizeSetting;
    label: string;
  }[] = [
    {
      value: "100%",
      label: "100%",
    },
    {
      value: "110%",
      label: "110%",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden select-none animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/90 shrink-0">
          <h2 className="text-base font-bold text-zinc-100">{t.settings.title}</h2>

          <div className="flex items-center gap-2.5">
            <span className="text-xs font-mono text-zinc-400 select-all">
              {`v${__APP_VERSION__}`}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              title={t.common.close}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4">
          {/* 文字サイズ設定 */}
          <div>
            <label className="text-xs font-semibold text-zinc-300 block mb-2.5">
              {t.settings.textSize}
            </label>

            <div className="grid grid-cols-2 gap-2">
              {textSizeOptions.map((opt) => {
                const isSelected = selectedTextSize === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedTextSize(opt.value)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600/15 border-indigo-500/60 text-zinc-100 shadow-xs"
                        : "bg-zinc-950/50 border-zinc-800/80 hover:bg-zinc-800/50 text-zinc-300"
                    }`}
                  >
                    <span className="text-xs font-semibold tracking-wide">
                      {opt.label}
                    </span>
                    {isSelected && (
                      <div className="h-5 w-5 rounded-full bg-indigo-600 flex items-center justify-center text-white shrink-0">
                        <Check className="h-3 w-3 stroke-[2.5]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* タグの並び順設定 */}
          <div className="pt-2 border-t border-zinc-800/80">
            <label className="text-xs font-semibold text-zinc-300 block mb-2.5">
              {t.sidebar.sortLabel}
            </label>

            <label
              className={`flex items-start gap-3 p-3 rounded-xl border text-left transition cursor-pointer select-none ${
                selectedIgnoreLeadingThe
                  ? "bg-indigo-600/15 border-indigo-500/60 text-zinc-100 shadow-xs"
                  : "bg-zinc-950/50 border-zinc-800/80 hover:bg-zinc-800/50 text-zinc-300"
              }`}
            >
              <div className="pt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={selectedIgnoreLeadingThe}
                  onChange={(e) => setSelectedIgnoreLeadingThe(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-zinc-900 cursor-pointer accent-indigo-600"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-zinc-100">
                  {t.settings.ignoreLeadingThe}
                </span>
                <span className="text-[11px] text-zinc-400 mt-0.5">
                  {t.settings.ignoreLeadingTheHint}
                </span>
              </div>
            </label>
          </div>

          {/* 言語設定 */}
          <div className="pt-2 border-t border-zinc-800/80">
            <label className="text-xs font-semibold text-zinc-300 block mb-2.5">
              {t.settings.language}
            </label>

            <div className="relative">
              <select
                value={selectedSetting}
                onChange={(e) => setSelectedSetting(e.target.value as LanguageSetting)}
                className="w-full appearance-none bg-zinc-950/60 border border-zinc-800/80 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 font-medium hover:border-zinc-700 focus:outline-hidden focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/50 transition cursor-pointer pr-10"
              >
                {languageOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-100">
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-400">
                <ChevronDown className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-zinc-950/60 border-t border-zinc-800/80 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200 text-xs font-medium transition cursor-pointer active:scale-95 shadow-xs"
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition cursor-pointer active:scale-95 shadow-sm"
          >
            {t.common.save}
          </button>
        </div>
      </div>
    </div>
  );
};
