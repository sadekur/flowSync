#!/usr/bin/env sh
# Self-signed certificate for running docker-compose.yml at https://localhost.
# Browsers will warn once (it's not from a trusted CA). For a real domain,
# put a Let's Encrypt fullchain.pem / privkey.pem in deploy/nginx/certs/.
set -eu
dir="$(dirname "$0")/nginx/certs"
mkdir -p "$dir"
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout "$dir/privkey.pem" -out "$dir/fullchain.pem" \
  -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
echo "Wrote $dir/fullchain.pem and $dir/privkey.pem"
