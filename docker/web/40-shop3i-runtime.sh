#!/bin/sh
set -eu
# Only a public origin is written; never copy the container environment wholesale.
origin="${MINIAPP_ASSET_ORIGIN:-}"
if [ -n "$origin" ] && ! printf '%s' "$origin" | grep -Eq '^(https://[A-Za-z0-9.-]+|http://([A-Za-z0-9-]+\.)*localhost)(:[0-9]{1,5})?$'; then
    echo 'Invalid MINIAPP_ASSET_ORIGIN' >&2
    exit 1
fi
printf '{"miniappAssetOrigin":"%s"}\n' "$origin" > /usr/share/nginx/html/shop3i-runtime.json
# Optional public company profile is mounted separately from secrets. The client
# validates its strict schema before presenting a company experience.
if [ -f /etc/shop3i/profile.json ]; then
    cp /etc/shop3i/profile.json /usr/share/nginx/html/shop3i-profile.json
fi
