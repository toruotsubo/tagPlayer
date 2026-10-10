import React, { createContext, useContext, useState, ReactNode } from "react";
import { Language, LanguageSetting, Translations } from "./types";
import { ja } from "./ja";
import { en } from "./en";

export * from "./types";
export { ja } from "./ja";
export { en } from "./en";

const translations: Record<Language, Translations> = {
  ja,
  en,
};

/**
 * OS/ブラウザ環境の言語を判定。
 * 日本語を第一候補、それ以外（または取得失敗時）は英語を第二候補とする。
 */
export const detectSystemLanguage = (): Language => {
  try {
    const navLang =
      (typeof navigator !== "undefined" &&
        (navigator.language || (navigator.languages && navigator.languages[0]))) ||
      "";
    if (navLang.toLowerCase().startsWith("ja")) {
      return "ja";
    }
  } catch {}
  return "en";
};

export const resolveLanguage = (setting: LanguageSetting): Language => {
  if (setting === "auto") {
    return detectSystemLanguage();
  }
  return setting;
};

interface I18nContextValue {
  languageSetting: LanguageSetting;
  setLanguageSetting: (setting: LanguageSetting) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  detectedLanguage: Language;
  t: Translations;
}

const defaultLanguage: Language = "ja";
const defaultSetting: LanguageSetting = "ja";

const I18nContext = createContext<I18nContextValue>({
  languageSetting: defaultSetting,
  setLanguageSetting: () => {},
  language: defaultLanguage,
  setLanguage: () => {},
  detectedLanguage: "ja",
  t: translations[defaultLanguage],
});

export const I18nProvider: React.FC<{
  children: ReactNode;
  initialSetting?: LanguageSetting;
}> = ({ children, initialSetting = defaultSetting }) => {
  const [languageSetting, setLanguageSettingState] = useState<LanguageSetting>(() => {
    try {
      const savedSetting = localStorage.getItem("tagPlayer_language_setting") as LanguageSetting;
      if (savedSetting && (savedSetting === "auto" || savedSetting === "ja" || savedSetting === "en")) {
        return savedSetting;
      }
      const legacySaved = localStorage.getItem("tagPlayer_language") as Language;
      if (legacySaved && translations[legacySaved]) {
        return legacySaved;
      }
    } catch {}
    return initialSetting;
  });

  const detectedLanguage = detectSystemLanguage();
  const effectiveLanguage = resolveLanguage(languageSetting);

  const handleSetLanguageSetting = (setting: LanguageSetting) => {
    setLanguageSettingState(setting);
    try {
      localStorage.setItem("tagPlayer_language_setting", setting);
      // 後方互換のため実効言語も保存
      localStorage.setItem("tagPlayer_language", resolveLanguage(setting));
    } catch {}
  };

  const handleSetLanguage = (lang: Language) => {
    handleSetLanguageSetting(lang);
  };

  const t = translations[effectiveLanguage] || translations[defaultLanguage];

  return (
    <I18nContext.Provider
      value={{
        languageSetting,
        setLanguageSetting: handleSetLanguageSetting,
        language: effectiveLanguage,
        setLanguage: handleSetLanguage,
        detectedLanguage,
        t,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = (): I18nContextValue => {
  return useContext(I18nContext);
};

export const getTranslation = (lang: Language = defaultLanguage): Translations => {
  return translations[lang] || translations[defaultLanguage];
};
