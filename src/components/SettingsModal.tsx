import React, { useState, useEffect } from "react";
import { Settings, X, Globe, Check } from "lucide-react";
import { useTranslation, LanguageSetting } from "../i18n";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t, languageSetting, setLanguageSetting, detectedLanguage } = useTranslation();
  const [selectedSetting, setSelectedSetting] = useState<LanguageSetting>(languageSetting);

  // モーダルが開くたびに現在の設定を反映
  useEffect(() => {
    if (isOpen) {
      setSelectedSetting(languageSetting);
    }
  }, [isOpen, languageSetting]);

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
    onClose();
  };

  const detectedLabel = detectedLanguage === "ja" ? t.settings.languageJa : t.settings.languageEn;

  const languageOptions: {
    value: LanguageSetting;
    label: string;
    subLabel?: string;
  }[] = [
    {
      value: "auto",
      label: t.settings.languageAuto,
      subLabel: t.settings.languageAutoHint(detectedLabel),
    },
    {
      value: "en",
      label: t.settings.languageEn,
    },
    {
      value: "ja",
      label: t.settings.languageJa,
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
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">{t.settings.title}</h2>
            </div>
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
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-2 mb-2.5">
              <Globe className="h-4 w-4 text-indigo-400" />
              <span>{t.settings.language}</span>
            </label>

            <div className="flex flex-col gap-2">
              {languageOptions.map((opt) => {
                const isSelected = selectedSetting === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedSetting(opt.value)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600/15 border-indigo-500/60 text-zinc-100 shadow-xs"
                        : "bg-zinc-950/50 border-zinc-800/80 hover:bg-zinc-800/50 text-zinc-300"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">{opt.label}</span>
                      {opt.subLabel && (
                        <span className="text-[11px] text-zinc-400 mt-0.5">
                          {opt.subLabel}
                        </span>
                      )}
                    </div>
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
