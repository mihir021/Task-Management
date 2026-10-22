# Kubernetes job-service logs

In **Scripts**, select **Kubernetes · ray-job-service logs** and press **Run in
terminal**. The saved preset uses:

- Kubeconfig: `/home/mihir-rathod/TEMP/k8s-readonly-user-raylife`
- Namespace: `default`
- Pod name prefix: `ray-job-service`
- Filter: `ERROR only` (case insensitive)
- Initial history: up to 200 lines per container from the last 10 minutes
- Live follow and pod rediscovery enabled; no sudo

The actual pods have generated names. The script discovers all matching replicas
instead of assuming a pod named exactly `ray-job-service`. It lists their phase
and restart counts, then prefixes each log line with the pod/container name and a
timestamp. It uses only `kubectl get pods` and `kubectl logs` with the supplied
kubeconfig. It does not change the cluster, workloads or kubeconfig file.

Change **Log filter** to **All log lines**, **ERROR + WARN**, or a custom extended
regular expression. Kubernetes errors on stderr remain visible regardless of the
filter. An empty ERROR result is normal; it does not count as a failed monitor.
Change namespace, pod prefix, container, history or tail count in the form and
save the script to retain those defaults.

## Read logs as a table

Kubernetes runs open in **Log table** by default. Each row shows the source time
in IST, level, pod/container and a compact message. JSON log fields are extracted
instead of displaying the entire encoded payload. The table uses the workspace
width and supports search, pod and level filters, pagination and filtered CSV
export. It retains up to 500 rows and 2 million raw characters in the browser;
each raw record is capped at 256,000 characters. Counts describe the retained
records received by this view, rather than cluster-wide error totals.

Choose **View details** for the formatted message, stack trace, logger, thread,
trace ID, JSON fields and original record. Common escaped newlines are formatted
for reading; the raw record remains available separately. Very large records are
marked as shortened. **Raw terminal** retains the original terminal view and
interactive input. Connection errors stay visible in the table; routine monitor
events can be included with the checkbox. The existing Output download contains
the saved run log and is subject to its retention limit.

**Follow live logs** keeps the streams open. **Reconnect and discover replacement
pods** checks the pod list every 10 seconds, starts streams for replacement pods,
and reconnects exited streams. Recent log lines can repeat after reconnecting.
Repeated query/stream failures stop the monitor with an error after five failures.
Uncheck Follow for a bounded log snapshot; snapshot requests time out after 20s.

Press **Interrupt** to stop all streams belonging to the monitor. Leaving the
page does not stop it; return to Scripts to reconnect. A monitoring run remains
Running until stopped. Up to three Kubernetes or non-root custom sessions can run concurrently, each in
its own output window. Docker and root workflows run exclusively.

The kubeconfig stays on disk; only its path is saved in script settings. The
cluster may return application data in logs, so the existing private log files and
local-only Scripts endpoints are used. Script output history and downloads follow
the Scripts section's 5 MiB retention limit.

The standalone `monitor-ray-job-logs.sh` uses the same defaults. Run it with Bash
on the same computer and edit the settings near the top when necessary. Stop with
Ctrl+C. Its log flags follow the official
[kubectl logs reference](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/).
