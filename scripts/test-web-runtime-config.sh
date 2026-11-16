#!/bin/sh
set -eu

repo_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
check_dir="$(mktemp -d)"
trap 'rm -f "$check_dir/config.sh" "$check_dir/runtime-config.js"; rmdir "$check_dir"' EXIT
sed "s|/usr/share/nginx/html/runtime-config.js|$check_dir/runtime-config.js|" \
  "$repo_dir/deploy/nginx/40-runtime-config.sh" > "$check_dir/config.sh"
unset PUBLIC_API_BASE_URL API_BASE_URL

check_value() {
  PUBLIC_API_BASE_URL="$1" sh "$check_dir/config.sh"
  grep -Fxq "window.__FASHION_CONFIG__ = Object.freeze({\"apiBaseUrl\":\"$2\"});" "$check_dir/runtime-config.js"
}

check_value '' '/api/v1'
check_value '/api/v1/' '/api/v1'
check_value ' https://api.example.com/api/v1/// ' 'https://api.example.com/api/v1'
check_value 'http://192.0.2.10:3000/api/v1' 'http://192.0.2.10:3000/api/v1'
check_value 'http://[::1]:3000/api/v1' 'http://[::1]:3000/api/v1'
API_BASE_URL='https://legacy.example.com/api/v1' sh "$check_dir/config.sh"
grep -Fq 'https://legacy.example.com/api/v1' "$check_dir/runtime-config.js"
API_BASE_URL='https://legacy.example.com/api/v1' check_value 'https://new.example.com/api/v1' 'https://new.example.com/api/v1'

for value in '//evil.example/api' 'javascript:alert(1)' 'https://user:pass@api.example.com/api/v1' \
  'https://api.example.com/api/v1?key=value' 'https://api.example.com/api/v1#fragment'; do
  if PUBLIC_API_BASE_URL="$value" sh "$check_dir/config.sh" 2>/dev/null; then
    echo "Unexpectedly accepted PUBLIC_API_BASE_URL: $value" >&2
    exit 1
  fi
done
echo 'Container runtime config checks passed.'
