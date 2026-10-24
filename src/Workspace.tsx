import React, { useEffect } from "react";
import { WorkspaceGate } from "../MIHIR/src/components/WorkspaceGate";
import { MihirWorkspaceApp } from "../MIHIR/src/MihirWorkspaceApp";
export default function Workspace() {
  useEffect(() => {
    document.title = "MIHIR Workspace — Tasks and Ports Monitoring";
  }, []);
  return (
    <WorkspaceGate>
      <MihirWorkspaceApp />
    </WorkspaceGate>
  );
}
