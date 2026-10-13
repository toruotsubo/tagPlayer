import { useState, useEffect } from "react";

export type TextSizeSetting = "100%" | "110%";

const STORAGE_KEY = "tagPlayer_textSize";

export function getStoredTextSize(): TextSizeSetting {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "110%" || saved === "100%") {
      return saved;
    }
  } catch (e) {
    console.error("Failed to read text size from localStorage", e);
  }
  return "100%";
}

export function applyTextSize(size: TextSizeSetting) {
  document.documentElement.style.fontSize = size;
  try {
    localStorage.setItem(STORAGE_KEY, size);
  } catch (e) {
    console.error("Failed to save text size to localStorage", e);
  }
}

export function useTextSize() {
  const [textSize, setTextSizeState] = useState<TextSizeSetting>(getStoredTextSize);

  useEffect(() => {
    // マウント時に確実に反映
    applyTextSize(textSize);
  }, [textSize]);

  const setTextSize = (newSize: TextSizeSetting) => {
    setTextSizeState(newSize);
    applyTextSize(newSize);
  };

  return {
    textSize,
    setTextSize,
  };
}
