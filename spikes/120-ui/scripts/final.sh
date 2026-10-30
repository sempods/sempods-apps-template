#!/bin/sh
# Re-runs all evidence for the write-up, in order. PROMPT_RUNS points at the
# folder of prompt-run copies (scripts/prompt-copy.mjs), if any.
set -e
cd "$(dirname "$0")/.."
node scripts/gate.mjs > evidence/gate.log 2>&1
node scripts/interaction.mjs > evidence/interaction.log 2>&1
node scripts/evidence.mjs base aria --contrast > evidence/contrast.log 2>&1
node scripts/evidence.mjs base aria --shots --combos=calm/solid/tonal > evidence/shots.log 2>&1
for v in base aria; do
  node scripts/sheets.mjs evidence/contract/shots/$v/calm-solid-tonal evidence/sheets/$v.jpg "$v · theme calm, solid actions, tonal secondary · SDK main"
done
if [ -n "$PROMPT_RUNS" ]; then
  for run in base-invert base-outline base-warm aria-invert aria-outline aria-warm; do
    v=${run%%-*}
    node scripts/evidence.mjs $v --contrast --shots --combos=-/-/- --apps="$PROMPT_RUNS/$run/apps" --label=prompt-$run > evidence/prompt-$run.log 2>&1
    node scripts/sheets.mjs evidence/prompt-$run/shots/$v/app-defaults evidence/sheets/prompt-$run.jpg "$v · prompt run $run"
  done
fi
node scripts/sizes.mjs > evidence/sizes.log 2>&1
echo done
