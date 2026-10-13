import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./i18n";

import { getStoredTextSize, applyTextSize } from "./hooks/useTextSize";

// 初回レンダリング前に保存されたテキストサイズを適用
applyTextSize(getStoredTextSize());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
