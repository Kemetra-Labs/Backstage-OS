#!/usr/bin/env bash
# The required aggregate check (BACK-93). Reads the workflow's `needs` context as JSON from $NEEDS and fails unless:
#   - the classify job succeeded and every suite flag it produced is exactly "true" or "false";
#   - every job whose suite was selected succeeded AND reported ran=true from its last step;
#   - every job whose suite was not selected was skipped (a run the classifier did not ask for means the wiring drifted).
# A failed, cancelled, missing or unexpectedly skipped job therefore fails the gate; it never passes on a skip it did not expect.
# Tests: .github/scripts/test-ci-gate.sh
set -uo pipefail

# job name -> classifier flag that selects it
JOBS=(root:root app-check:app app-e2e:app_e2e live-e2e:live_e2e server:server g1:g1)

die() { echo "ci-gate: FAIL: $*" >&2; exit 1; }

[[ -n "${NEEDS:-}" ]] || die "NEEDS is empty"
jq -e 'type == "object"' >/dev/null 2>&1 <<<"$NEEDS" || die "NEEDS is not a JSON object"

get() { jq -r "$1 // \"<missing>\"" <<<"$NEEDS"; }

[[ "$(get '.classify.result')" == "success" ]] || die "classify job result is $(get '.classify.result')"
echo "Classifier: mode=$(get '.classify.outputs.mode'), reason=$(get '.classify.outputs.reason')"

STATUS=0
for entry in "${JOBS[@]}"; do
  job="${entry%%:*}"; flag="${entry#*:}"
  want="$(get ".classify.outputs.\"$flag\"")"
  result="$(get ".\"$job\".result")"
  ran="$(get ".\"$job\".outputs.ran")"
  case "$want" in
    true)
      if [[ "$result" == "success" && "$ran" == "true" ]]; then
        echo "  ok    $job: selected, succeeded, ran"
      else
        echo "  FAIL  $job: selected, but result=$result ran=$ran" >&2; STATUS=1
      fi
      ;;
    false)
      if [[ "$result" == "skipped" ]]; then
        echo "  ok    $job: not selected, skipped"
      else
        echo "  FAIL  $job: not selected, but result=$result" >&2; STATUS=1
      fi
      ;;
    *) echo "  FAIL  $job: classifier flag $flag is '$want'" >&2; STATUS=1 ;;
  esac
done

[[ "$STATUS" -eq 0 ]] || die "one or more jobs did not match the classification"
echo "ci-gate: all selected suites ran and passed"
