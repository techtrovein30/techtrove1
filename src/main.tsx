import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EventClosed } from "./components/site/EventClosed";
import { AppRoot } from "./AppRoot";
import "./index.css";

// Kill switch: the site is CLOSED BY DEFAULT now that the event is over. Set
// VITE_EVENT_CLOSED=false to reopen it. When closed the app (and its Supabase
// client) is never imported, so no queries, auth, or realtime connections run.
const eventClosed = import.meta.env.VITE_EVENT_CLOSED !== "false";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{eventClosed ? <EventClosed /> : <AppRoot />}</StrictMode>,
);
