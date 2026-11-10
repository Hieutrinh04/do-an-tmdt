#!/bin/sh
set -eu
if [ -z "${INTERNAL_API_KEY:-}" ]; then export INTERNAL_API_KEY="$(cat /shared/api-key)"; fi
if [ -z "${N8N_WEBHOOK_SECRET:-}" ]; then export N8N_WEBHOOK_SECRET="$(cat /shared/webhook-secret)"; fi
if [ -z "${META_VERIFY_TOKEN:-}" ] && [ "${MOCK_INTEGRATIONS:-true}" = "true" ]; then
  export META_VERIFY_TOKEN="$N8N_WEBHOOK_SECRET"
fi

# Nạp credential cho chế độ thật mỗi lần khởi động (cùng ID nên chỉ cập nhật, không nhân đôi).
# Workflow trong n8n/workflows đã trỏ sẵn tới hai ID này.
#   - Google Sheets: file Service Account gắn vào /secrets (xem docker-compose.yml).
#   - Gmail/SMTP: SMTP_USER, SMTP_PASSWORD (và SMTP_HOST, SMTP_PORT) trong .env.
# Chế độ mock bỏ qua bước này để stack kiểm thử không chứa khóa thật.
GOOGLE_SA_FILE="${GOOGLE_SA_FILE:-/secrets/google-service-account.json}"
import_credential() {
  file="$1"; label="$2"
  if n8n import:credentials --input="$file" > /tmp/lf-cred.log 2>&1; then
    echo "Long Fish: đã nạp credential $label."
  else
    echo "Long Fish: KHÔNG nạp được credential $label:"; grep -v "Error tracking" /tmp/lf-cred.log | tail -3
  fi
  rm -f "$file" /tmp/lf-cred.log
}
if [ "${MOCK_INTEGRATIONS:-true}" = "false" ]; then
  old_umask="$(umask)"; umask 077
  if [ -f "$GOOGLE_SA_FILE" ]; then
    if node -e '
      const k = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      if (!k.client_email || !k.private_key) throw new Error("File Service Account thiếu client_email hoặc private_key.");
      process.stdout.write(JSON.stringify([{ id: "lfxGoogleSheets1", name: "Long Fish Google Sheets", type: "googleApi",
        data: { email: k.client_email, privateKey: k.private_key, inpersonate: false, httpNode: false } }]));
    ' "$GOOGLE_SA_FILE" > /tmp/lf-google.json; then import_credential /tmp/lf-google.json "Google Sheets"
    else rm -f /tmp/lf-google.json; echo "Long Fish: file Service Account không hợp lệ."; fi
  else
    echo "Long Fish: chưa có $GOOGLE_SA_FILE, bỏ qua credential Google Sheets."
  fi
  if [ -n "${SMTP_USER:-}" ] && [ -n "${SMTP_PASSWORD:-}" ]; then
    node -e '
      const port = Number(process.env.SMTP_PORT || 587);
      process.stdout.write(JSON.stringify([{ id: "lfxSmtpGmail0001", name: "Long Fish Gmail SMTP", type: "smtp",
        data: { user: process.env.SMTP_USER, password: process.env.SMTP_PASSWORD, host: process.env.SMTP_HOST || "smtp.gmail.com", port, secure: port === 465 } }]));
    ' > /tmp/lf-smtp.json
    import_credential /tmp/lf-smtp.json "SMTP"
  else
    echo "Long Fish: chưa có SMTP_USER/SMTP_PASSWORD, bỏ qua credential SMTP."
  fi
  umask "$old_umask"
fi
# Mật khẩu SMTP chỉ cần cho bước nạp credential; không để lộ cho code node của workflow.
unset SMTP_PASSWORD

if [ ! -f /home/node/.n8n/.long-fish-imported ]; then
  n8n import:workflow --separate --input=/workflows
  for id in lfxError00000005 lfxMessenger0001 lfxCreated000002 lfxStatus0000003 lfxReports000004; do
    n8n publish:workflow --id="$id"
  done
  touch /home/node/.n8n/.long-fish-imported
fi
exec n8n start
