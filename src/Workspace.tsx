import React, { useEffect } from "react";
import { WorkspaceGate } from "../MIHIR/src/components/WorkspaceGate";
import { MihirWorkspaceApp } from "../MIHIR/src/MihirWorkspaceApp";
import { WorkspaceExperience } from "./workspace/WorkspaceExperience";
export default function Workspace() {
  useEffect(() => {
    document.title = "MIHIR Workspace — The Daily Thread";
  }, []);
  return (
    <WorkspaceExperience><WorkspaceGate>
      <MihirWorkspaceApp />
    </WorkspaceGate></WorkspaceExperience>
  );
}
