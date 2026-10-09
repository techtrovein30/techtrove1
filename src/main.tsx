import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EventClosed } from "./components/site/EventClosed";
import { AppRoot } from "./AppRoot";
import "./index.css";

// Kill switch: set VITE_EVENT_CLOSED=true to take the site offline without
// touching the backend. When enabled the app (and its Supabase client) is never
// imported, so no queries, auth, or realtime connections are made.
const eventClosed = import.meta.env.VITE_EVENT_CLOSED === "true";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{eventClosed ? <EventClosed /> : <AppRoot />}</StrictMode>,
);
