import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { RepoProvider } from "./RepoContext.js";
import "./styles.css";

const crloopMatch = /^\/crloop\/([^/]+)/.exec(window.location.pathname);
const crloopRepoId = crloopMatch?.[1] ?? null;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RepoProvider crloopRepoId={crloopRepoId}>
      <App crloopRepoId={crloopRepoId} />
    </RepoProvider>
  </React.StrictMode>
);
