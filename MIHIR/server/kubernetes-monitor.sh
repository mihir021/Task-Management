# Settings and strict mode are supplied by the script builder.
declare -A monitor_pids=() monitor_versions=() monitor_failures=() monitor_present=()
monitor_cleanup() {
  trap - EXIT INT TERM
  for monitor_pid in "${monitor_pids[@]}"; do
    kill -TERM -- "-$monitor_pid" 2>/dev/null || kill -TERM "$monitor_pid" 2>/dev/null || true
  done
  for monitor_pid in "${monitor_pids[@]}"; do wait "$monitor_pid" 2>/dev/null || true; done
}
trap monitor_cleanup EXIT
trap 'exit 130' INT TERM

monitor_stream_pod() {
  set -o pipefail
  local monitor_pod="$1"
  local -a monitor_args=(--namespace "$monitor_namespace" logs "$monitor_pod" --timestamps=true --prefix=true --tail="$monitor_tail" --since="$monitor_since")
  if [[ -n "$monitor_container" ]]; then monitor_args+=(--container "$monitor_container"); else monitor_args+=(--all-containers=true); fi
  if [[ "$monitor_follow" == true ]]; then monitor_args+=(--follow=true); else monitor_args+=(--request-timeout=20s); fi
  if [[ -z "$monitor_filter" ]]; then
    kubectl "${monitor_args[@]}"
  else
    kubectl "${monitor_args[@]}" | { grep --line-buffered -Ei -- "$monitor_filter" || [[ $? == 1 ]]; }
  fi
}
export -f monitor_stream_pod

monitor_query_failures=0
while true; do
  if ! monitor_snapshot=$(kubectl --namespace "$monitor_namespace" --request-timeout=15s get pods -o 'jsonpath={range .items[*]}{.metadata.name}{"|"}{.status.phase}{"|"}{.metadata.uid}{"|"}{range .status.containerStatuses[*]}{.restartCount}{","}{end}{"\n"}{end}'); then
    monitor_query_failures=$((monitor_query_failures + 1))
    printf '[monitor] Pod query failed (%s/5). Check network, kubeconfig and permissions.\n' "$monitor_query_failures" >&2
    if [[ "$monitor_reconnect" != true ]] || (( monitor_query_failures >= 5 )); then exit 1; fi
    sleep 10; continue
  fi
  monitor_query_failures=0
  monitor_present=()
  monitor_matches=0
  while IFS='|' read -r monitor_name monitor_phase monitor_uid monitor_restarts; do
    [[ "$monitor_name" == "$monitor_pod_prefix" || "$monitor_name" == "$monitor_pod_prefix"-* ]] || continue
    monitor_matches=$((monitor_matches + 1))
    monitor_present["$monitor_name"]=1
    monitor_version="$monitor_uid/$monitor_restarts"
    monitor_old_pid="${monitor_pids[$monitor_name]-}"
    if [[ -n "$monitor_old_pid" ]]; then
      monitor_expected_restart=false
      if kill -0 "$monitor_old_pid" 2>/dev/null && [[ "${monitor_versions[$monitor_name]-}" == "$monitor_version" && "$monitor_phase" == Running ]]; then continue; fi
      if kill -0 "$monitor_old_pid" 2>/dev/null; then
        monitor_expected_restart=true
        kill -TERM -- "-$monitor_old_pid" 2>/dev/null || kill -TERM "$monitor_old_pid" 2>/dev/null || true
      fi
      monitor_worker_code=0; wait "$monitor_old_pid" || monitor_worker_code=$?
      if (( monitor_worker_code != 0 )) && [[ "$monitor_expected_restart" == false ]]; then
        monitor_failures["$monitor_name"]=$((${monitor_failures[$monitor_name]:-0} + 1))
        if (( ${monitor_failures[$monitor_name]} >= 5 )); then printf '[monitor] Log stream repeatedly failed for %s. Check the errors above.\n' "$monitor_name" >&2; exit 1; fi
      else
        monitor_failures["$monitor_name"]=0
      fi
      unset 'monitor_pids[$monitor_name]'
    fi
    printf '[monitor] %s | %s | restarts=%s\n' "$monitor_name" "$monitor_phase" "$monitor_restarts"
    [[ "$monitor_phase" == Running ]] || continue
    printf '[monitor] Attaching logs: %s (history %s, tail %s per container).\n' "$monitor_name" "$monitor_since" "$monitor_tail"
    setsid bash -c 'monitor_stream_pod "$1"' _ "$monitor_name" &
    monitor_pids["$monitor_name"]=$!
    monitor_versions["$monitor_name"]="$monitor_version"
  done <<< "$monitor_snapshot"

  for monitor_name in "${!monitor_pids[@]}"; do
    if [[ -z "${monitor_present[$monitor_name]-}" ]]; then
      monitor_pid="${monitor_pids[$monitor_name]}"
      kill -TERM -- "-$monitor_pid" 2>/dev/null || kill -TERM "$monitor_pid" 2>/dev/null || true
      wait "$monitor_pid" 2>/dev/null || true
      unset 'monitor_pids[$monitor_name]' 'monitor_versions[$monitor_name]' 'monitor_failures[$monitor_name]'
      printf '[monitor] Pod removed: %s\n' "$monitor_name"
    fi
  done
  if (( monitor_matches == 0 )); then printf '[monitor] No matching pods in namespace %s.\n' "$monitor_namespace"; fi
  if [[ "$monitor_reconnect" != true ]]; then
    (( monitor_matches > 0 && ${#monitor_pids[@]} > 0 )) || exit 1
    monitor_result=0
    for monitor_pid in "${monitor_pids[@]}"; do wait "$monitor_pid" || monitor_result=1; done
    monitor_pids=()
    (( monitor_result == 0 )) || exit "$monitor_result"
    break
  fi
  sleep 10
done
