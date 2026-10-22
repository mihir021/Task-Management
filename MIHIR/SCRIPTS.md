# Scripts and local terminal

Open **Scripts** in the sidebar. The saved **Pull and run containers** preset
uses `/home/mihir-rathod` as its base directory and selects these steps:

1. `bash -e /home/mihir-rathod/ray/docker/scripts/pull.sh`
2. `bash -e /home/mihir-rathod/ray/docker/scripts/up.sh`
3. Start the 13 supplied containers.
4. Print each selected container's status and healthcheck result.

**Run as root using sudo** is selected for this preset. The app starts a separate
root Bash process through sudo; it does not run the entire web server as root.
The existing HOME environment value is preserved so the Docker scripts' `~/ray`
paths resolve to the user's Ray directory. When prompted, click the terminal,
type your sudo password, and press Enter. Input is forwarded to the terminal;
it is not recorded in script output or saved in the browser. Credentials typed
into a script body, or printed by a custom command, will be saved with that script
or its output; keep passwords out of script text.

## Choose what to run

- **Pull only** selects just `pull.sh` without up/start/restart/stop steps.
- **Pull & run** pulls images, runs `up.sh`, then starts the selected containers.
- **Start only** or **Restart only** acts on the selected containers and prints status.
- The checkboxes let you combine steps. **Stop ALL running Docker containers** is
  disabled by default. If selected, it stops every running Docker container on the
  machine, including containers outside the selected list. An empty running list
  is handled without calling `docker stop` with no arguments.
- Expand **Containers / services** to choose the containers. To scope pull/up too,
  enable **Apply pull.sh / up.sh only to selected Compose services**. These names
  must be valid services in your Compose file as well as container names.
- **Custom Bash** lets you edit the commands directly. The root toggle and base
  directory apply to custom commands too. New custom scripts default to non-root.
- **Preview exact Bash script** shows the generated commands. **Save script**
  persists the current settings; **Run in terminal** executes the current editor
  contents, including unsaved changes. The run uses a saved execution snapshot.

## Terminal and status

The terminal is a real local pseudo-terminal rendered with
[xterm.js](https://xtermjs.org/docs/guides/using-addons/), with ANSI colors and
interactive prompts. It is embedded in the web app; it does not open a separate
desktop terminal window. Command output streams live. Each selected step shows
Pending, Running, Passed, Failed, or Interrupted. The overall run displays its
exit code and duration. A successful script exit does not guarantee every service
is healthy: inspect the printed Docker healthcheck results.

**Interrupt** sends Ctrl+C to the foreground process. The UI waits for a real
exit before marking the run interrupted. Up to three non-root custom or Kubernetes sessions can run at once. Docker step workflows and root scripts run exclusively.
Navigating away or closing the browser does not stop it; return to Scripts to
reconnect. Download saved output from the terminal toolbar. The first 5 MiB of
output is retained on disk; additional output still streams live. Terminal replay
uses the final 200,000 bytes of the saved portion. Run history lists the latest 30
runs. An app server restart can disconnect a running terminal; such runs show
Unknown and require checking the processes in a system terminal before retrying.

Saved definitions and run snapshots live under `MIHIR/data/scripts/` with private
file permissions. The runner inherits a small terminal environment rather than
the web server's API credentials. Script routes accept only loopback clients
using localhost, with same-origin checks and a session token on mutations.
Do not publish the Scripts endpoints through a public reverse proxy.

Run `npm run test:scripts` with Node 22 to test command construction, PTY input and
output, failure results, cancellation, fake Docker sequencing, and route access.


## Output workspace

Each run opens its own output window. Up to three windows can be tiled side by
side, depending on screen width. Each window owns its terminal, table filters,
follow setting, status, download and Stop control. Expand a window to inspect the
full table; restore it to return to the grid. Other sessions keep streaming while
one is expanded. Closing a view does not stop its process. Reopen it with Open
recent run. The browser remembers open windows across reloads.

Use New monitor to configure another Kubernetes service. Enter its pod prefix,
namespace and log settings, then Run in new window. Saved scripts can be launched
from Script settings. Run history opens an existing output without re-executing
commands. Finished windows can be replaced when another run is opened.
