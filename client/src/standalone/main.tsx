// FORK(gr): entry point of the standalone build, used instead of
// `src/script.tsx` (see `vite.standalone.config.js`).
// The page is opened as a local file, so routes live in the hash
// (`localthreat.html#/<id>`). The routers inside `App` have no `hook` prop,
// so they inherit this one.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { App } from "~/components/App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element.");
}

createRoot(root).render(
  <StrictMode>
    <Router hook={useHashLocation}>
      <App />
    </Router>
  </StrictMode>,
);
