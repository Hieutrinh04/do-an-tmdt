import 'dotenv/config';

async function main() {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_VERSION || 'v23.0';
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('META_GRAPH_VERSION không hợp lệ.');
  const body = {
    get_started: { payload: 'Xin chào' },
    persistent_menu: [{ locale: 'default', composer_input_disabled: false, call_to_actions: [
      { type: 'postback', title: 'Xem cá', payload: 'Danh mục' },
      { type: 'postback', title: 'Tra cứu đơn', payload: 'Tra cứu đơn' },
      { type: 'postback', title: 'Gặp nhân viên', payload: 'Gặp nhân viên' },
    ] }],
  };
  if (process.argv.includes('--dry-run')) { console.log(JSON.stringify(body, null, 2)); return; }
  if (!token) throw new Error('Thiếu META_PAGE_ACCESS_TOKEN.');
  const response = await fetch('https://graph.facebook.com/' + version + '/me/messenger_profile', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Messenger Profile API trả HTTP ' + response.status);
  console.log('OK · Đã cấu hình nút Bắt đầu và ba mục menu.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
