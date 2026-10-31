import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { QuickCapture } from "./components/quick-capture";
import { CAPTURE_WINDOW } from "./lib/quick-capture";
import "./index.css";

// The quick capture window loads the same page; its label decides what it shows.
const capture = getCurrentWindow().label === CAPTURE_WINDOW;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{capture ? <QuickCapture /> : <App />}</React.StrictMode>,
);
