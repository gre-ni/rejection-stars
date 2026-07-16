import { useState } from "react";
import type { Screen } from "./types";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import GridPage from "./pages/GridPage";

// Minimal state-based router. Three screens, no navigation library needed yet.
// When auth + deep-linking arrive, swap this for a real router.
export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");

  switch (screen) {
    case "landing":
      return <LandingPage onEnter={() => setScreen("auth")} />;
    case "auth":
      // Auth is stubbed for now — both actions just proceed to the grid.
      return <AuthPage onAuthenticated={() => setScreen("grid")} />;
    case "grid":
      return <GridPage />;
  }
}
