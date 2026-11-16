#!/bin/sh
set -eu

# API_BASE_URL remains an alias for existing deployments.
api_base_url="${PUBLIC_API_BASE_URL:-${API_BASE_URL:-/api/v1}}"
api_base_url="$(printf '%s' "$api_base_url" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s:/*$::')"
if ! printf '%s' "$api_base_url" | grep -Eiq '^(/[A-Za-z0-9_.~%-][A-Za-z0-9/_.~%-]*|https?://[][A-Za-z0-9:.-]+(/[A-Za-z0-9/_.~%-]*)?)$'; then
  echo "PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL or a root-relative path, without credentials, query, or fragment" >&2
  exit 1
fi

printf 'window.__FASHION_CONFIG__ = Object.freeze({"apiBaseUrl":"%s"});\n' "$api_base_url" > /usr/share/nginx/html/runtime-config.js
