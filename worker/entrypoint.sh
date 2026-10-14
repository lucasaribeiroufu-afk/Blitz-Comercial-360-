#!/bin/sh
set -eu
# Optional public CA mounted read-only by the managed runtime, never copied into image layers.
if [ -n "${NODE_EXTRA_CA_CERTS:-}" ]; then
  mkdir -p "$HOME/.pki/nssdb"
  if [ ! -f "$HOME/.pki/nssdb/cert9.db" ]; then certutil -N --empty-password -d "sql:$HOME/.pki/nssdb"; fi
  certutil -A -d "sql:$HOME/.pki/nssdb" -n blitz-session-proxy -t 'C,,' -i "$NODE_EXTRA_CA_CERTS"
fi
exec "$@"
