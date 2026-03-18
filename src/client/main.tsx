import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { RepoProvider } from "./RepoContext.js";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RepoProvider>
      <App />
    </RepoProvider>
  </React.StrictMode>
);
