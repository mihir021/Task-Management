import React, { Suspense, lazy } from "react";
const FanExperience = lazy(() => import("./fan/FanExperience"));
const Workspace = lazy(() => import("./Workspace"));
export default function App() {
  return (
    <Suspense
      fallback={
        <div
          style={{ minHeight: "100vh", background: "#F6F1E7" }}
          aria-label="Loading experience"
        />
      }
    >
      {window.location.pathname.startsWith("/workspace") ? (
        <Workspace />
      ) : (
        <FanExperience />
      )}
    </Suspense>
  );
}
