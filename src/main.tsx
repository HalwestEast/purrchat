import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
// import "@fontsource-variable/roboto";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { TooltipProvider } from "./components/ui/tooltip.tsx";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ConvexAuthProvider>
  </StrictMode>,
);
