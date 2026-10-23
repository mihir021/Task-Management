# Hosted Scripts with your local terminal

Vercel serves the task app, but cannot access your computer's terminal, Docker socket, local files or Kubernetes credentials. Scripts uses a separate runner on your own computer.

1. Open your system terminal:
   ```bash
   cd /home/mihir-rathod/antigravity/MIHIR-Workspace
   ./scripts/start-terminal-runner.sh
   ```
   The launcher finds an installed Node 22 without downloading software. Alternatively, with Node 22 active, use `npm run terminal:runner`.
2. Keep this terminal open. Copy its pairing token into **Scripts → Connect local terminal** on https://task-management-azure-iota.vercel.app/.
3. Allow local-network access if your browser asks. Choose a script and **Run in new window**. Each command runs as your user in a real local pseudo-terminal. Root workflows ask for sudo inside that web terminal; no password is saved.
4. **Terminal** is the default view and receives the raw process output, including ANSI colours. Use **Log table** for parsed logs. Typing into a running terminal sends input to that session. Download retrieves the saved raw output, capped at 5 MiB; earlier terminal replay is capped at 200,000 bytes and is labelled when omitted. Live output continues after that storage cap.
5. Stop a command with its **Stop** button or Ctrl+C in the web terminal. Closing a view or disconnecting the browser does not stop a command. Stop active commands before closing the runner; otherwise their exit state may be unknown on restart.

The runner binds only to `127.0.0.1:43123`; no port forwarding or public tunnel is needed. Only the exact hosted origin is allowed via CORS. Every read, stream, download, input and launch request requires its random session token. The token stays in this browser tab's session storage and in authentication headers, never URLs. Restarting the runner rotates it. To end pairing, click **Disconnect** and stop the runner. Scripts and local run logs stay under `MIHIR/data/scripts`; they are not uploaded to Vercel.

This starts new terminal sessions for scripts launched in the web app. It does not automatically capture unrelated terminals you already have open. To see an existing service's output, run its log command (for example `kubectl logs` or `docker logs`) as a script.

If connection fails, confirm the runner is still running, re-copy the current token, and check the browser's local-network permission. Some browsers or policies block HTTPS-to-loopback requests; use the local workspace's Scripts page in that case. Never bypass certificate warnings or expose this runner on a network address.

Deploy the updated frontend and serverless API together. The hosted `/api/scripts` intentionally returns JSON `503 LOCAL_RUNNER_REQUIRED`; execution happens in the local companion, not in a Vercel function.

## Live pods and ports

Open **Ports Monitoring** from the sidebar to see a current table of matching pods, readiness,
status, restarts, age, IP and declared container ports, followed by service ports,
target ports, NodePorts and endpoints. The table refreshes every 30 seconds after
each completed request; **Refresh now** and **Pause refresh** are available. A
failed refresh keeps the last successful snapshot and shows the error. Missing
permission to list services or EndpointSlices does not hide readable pods.

These read-only queries run as the local runner user and do not occupy a terminal
session. Kubernetes credentials stay on your computer. After updating the runner
code, stop and restart the runner and pair its new token.

Starting the runner from `sudo su` can make HOME point to `/root`. The runner now
resolves the original user from SUDO_USER or repository ownership. Existing Ray
presets using the unreadable `/root/TEMP/k8s-readonly-user-raylife` path are repaired
only when the corresponding original-user file is readable. Custom paths remain
unchanged; use **Connection settings** to choose a different kubeconfig.

Ports Monitoring groups Ray app → ray-controller-service, Job app → ray-job-service,
Gateway → ray-gateway-service, and Hub app → ray-hub-service. Cards show live
NodePort → service port → target port mappings and ready pod counts. Select a card
to filter the tables, or choose Show all apps. Internal and headless variants stay
visible with their full service names. One namespace snapshot feeds all four apps
every 30 seconds. Scripts retains log workflows; port inspection has moved out.
