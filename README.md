# MIHIR Workspace

See [`MIHIR/README.md`](./MIHIR/README.md) for full architecture, database & uploads paths (`MIHIR/data/mihir_workspace.sqlite` and `MIHIR/uploads/`), backup/restore instructions, and usage guide.

## Quick Start

```bash
npm install
npm run dev
```

## Use without a browser

With the server running, use `npm run workspace -- status` or
`npm run workspace -- help`. The local client can read and update tasks, work
notes, and time entries using the existing API. See [CLI guide](MIHIR/CLI.md).
Run `npm run test:workspace-client` with Node 22 to verify the client.

## Monitor Jenkins

The **Monitor** sidebar section lists tasks in **Monitor Logs & Process** and
shows their repository's Jenkins build history and console output. Configure
server-side credentials and repository job names using the [Monitor guide](MIHIR/MONITOR.md).

## Run local scripts

Open **Scripts** for the saved **Pull and run containers** workflow, selectable
steps, custom Bash scripts, and an interactive local terminal. See the
[Scripts guide](MIHIR/SCRIPTS.md) for sudo, container selection and output history.

The saved **Kubernetes · ray-job-service logs** script discovers matching pods
with your read-only kubeconfig, filters errors, and follows replacement pods.
See the [Kubernetes logs guide](MIHIR/KUBERNETES-LOGS.md) for its controls.
