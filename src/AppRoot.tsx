import { Suspense, lazy } from "react";

// Loaded lazily so that when the kill switch is on (see main.tsx) the app —
// and its Supabase client — is never imported and no network calls are made.
const App = lazy(() => import("./App"));

export function AppRoot() {
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
