/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkspaceGate } from '../MIHIR/src/components/WorkspaceGate';
import { MihirWorkspaceApp } from '../MIHIR/src/MihirWorkspaceApp';

export default function App() {
  return <WorkspaceGate><MihirWorkspaceApp /></WorkspaceGate>;
}
