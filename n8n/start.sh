#!/bin/sh
set -eu
if [ -z "${INTERNAL_API_KEY:-}" ]; then export INTERNAL_API_KEY="$(cat /shared/api-key)"; fi
if [ -z "${N8N_WEBHOOK_SECRET:-}" ]; then export N8N_WEBHOOK_SECRET="$(cat /shared/webhook-secret)"; fi
if [ -z "${META_VERIFY_TOKEN:-}" ] && [ "${MOCK_INTEGRATIONS:-true}" = "true" ]; then
  export META_VERIFY_TOKEN="$N8N_WEBHOOK_SECRET"
fi
if [ ! -f /home/node/.n8n/.long-fish-imported ]; then
  n8n import:workflow --separate --input=/workflows
  for id in lfxError00000005 lfxMessenger0001 lfxCreated000002 lfxStatus0000003 lfxReports000004; do
    n8n publish:workflow --id="$id"
  done
  touch /home/node/.n8n/.long-fish-imported
fi
exec n8n start

