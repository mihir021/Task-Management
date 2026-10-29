import React, { Suspense, lazy } from "react";
const Workspace = lazy(() => import("./Workspace"));
export default function App() {
  return <Suspense fallback={<div style={{ minHeight: "100vh", background: "#f8f6f0" }} aria-label="Loading workspace" />}><Workspace /></Suspense>;
}
