#!/usr/bin/env bash
set -euo pipefail

BUILD_ROOT=".aws-sam/build"
MAX_BYTES=$((5 * 1024 * 1024))

if [ ! -d "$BUILD_ROOT" ]; then
  echo "Build directory not found: $BUILD_ROOT"
  echo "Run 'sam build' before running this script."
  exit 1
fi

printf '%-36s %12s\n' "Function" "Bundle Size"
printf '%-36s %12s\n' "------------------------------------" "------------"

failed=0

for function_dir in "$BUILD_ROOT"/*; do
  if [ ! -d "$function_dir" ]; then
    continue
  fi

  function_name="$(basename "$function_dir")"

  template_file="$function_dir/template.yaml"
  if [ -f "$template_file" ]; then
    continue
  fi

  size_kb=$(du -sk "$function_dir" | cut -f1)
  size_bytes=$((size_kb * 1024))
  size_mb=$(python3 - "$size_bytes" <<'PY'
import sys
size_bytes = int(sys.argv[1])
print(f"{size_bytes / (1024 * 1024):.2f} MB")
PY
)

  printf '%-36s %12s\n' "$function_name" "$size_mb"

  if [ "$size_bytes" -gt "$MAX_BYTES" ]; then
    failed=1
  fi

done

if [ "$failed" -ne 0 ]; then
  echo "\nOne or more function bundles exceed 5MB."
  exit 1
fi

echo "\nAll function bundles are under 5MB."
