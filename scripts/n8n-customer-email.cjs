#!/usr/bin/env node
// Thêm nhánh "gửi email cho khách" vào workflow Đơn hàng mới và Cập nhật trạng thái.
// Chạy lại nhiều lần vẫn an toàn (idempotent).
//
//   node scripts/n8n-customer-email.cjs n8n/workflows/2-order-created.json n8n/workflows/3-order-status.json
//   node scripts/n8n-customer-email.cjs /tmp/wf.json --smtp-id=lfxSmtpGmail0001 --smtp-name="Long Fish Gmail SMTP"
//
// --smtp-id/--smtp-name gắn credential SMTP có sẵn trong n8n vào node gửi khách (dùng khi vá workflow đang chạy).
const fs = require('node:fs');

const PREP = 'Chuẩn bị Sheets và thông báo';
const NEXT = 'Có PSID?';
const N = {
  hasEmail: 'Có email khách?',
  mock: 'Email khách · mock?',
  log: 'Email khách · Log',
  smtp: 'SMTP · Gửi khách',
};
const MARK = '// --- Email gửi khách (thêm bởi scripts/n8n-customer-email.cjs) ---';

const customerCode = `${MARK}
const customerLabels = {CONFIRMED:'Đơn đã được xác nhận. Long Fish đang chuẩn bị hàng cho bạn.',
  SHIPPING:'Đơn đang được giao tới bạn.',DELIVERED:'Đơn đã được giao. Cảm ơn bạn đã mua hàng tại Long Fish.',
  CANCELLED:'Đơn đã được hủy. Nếu bạn không yêu cầu hủy, hãy trả lời email này hoặc nhắn Fanpage Long Fish.',
  PENDING:'Long Fish đã nhận đơn và sẽ xác nhận sớm.'};
const wantsEmail = !!order.email && !(event.kind === 'payment' && event.notify === false);
const customerEmail = wantsEmail ? String(order.email) : '';
const shell = (title, body) => '<div style="font-family:Arial,sans-serif;max-width:560px;color:#0e2a2b">' +
  '<p style="font-size:13px;color:#1f5c46;font-weight:bold;letter-spacing:.08em">LONG FISH · CÁ CẢNH VÀ THỦY SINH</p>' +
  '<h2 style="margin:0 0 12px">' + title + '</h2>' + body +
  '<p><a href="' + esc(url) + '" style="display:inline-block;background:#1f5c46;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Tra cứu đơn ' + esc(order.code) + '</a></p>' +
  '<p style="font-size:12px;color:#4a6661">Bạn nhận email này vì đã nhập địa chỉ email khi đặt hàng tại Long Fish. Email chỉ dùng cho thông báo đơn hàng.</p></div>';
const itemsTable = '<table cellpadding="6" style="border-collapse:collapse;width:100%;font-size:14px">' +
  order.items.map(item => '<tr style="border-bottom:1px solid #cfe2d8"><td>' + esc(item.productName) + '<br><small>' + esc(item.color) + ' / ' +
    esc(item.size) + ' / ' + esc(item.gender) + '</small></td><td>' + item.quantity + ' ' + esc(item.unit) + '</td><td style="text-align:right">' +
    esc(money(item.unitPrice * item.quantity)) + '</td></tr>').join('') + '</table>';
const totals = '<p>Tiền hàng ' + esc(money(order.subtotal)) + '<br>Giao hàng ' + esc(money(order.shippingFee)) +
  (order.packingFee ? '<br>Đóng gói cá sống ' + esc(money(order.packingFee)) : '') + '<br><strong>Tổng ' + esc(money(order.total)) + '</strong></p>';
const payHtml = order.paymentMethod === 'BANK_QR'
  ? '<p><strong>Chuyển khoản:</strong> đúng ' + esc(money(order.total)) + ', nội dung <strong>' + esc(order.code) + '</strong>.</p>' +
    (order.qrUrl ? '<p><img src="' + esc(order.qrUrl) + '" alt="Mã VietQR đơn ' + esc(order.code) + '" width="220"></p>' : '')
  : '<p><strong>Thanh toán:</strong> tiền mặt khi nhận hàng.</p>';
const policyHtml = order.hasLiveFish && order.doaPolicy ? '<p style="background:#eaf4ef;padding:10px;border-left:4px solid #f0642b">' + esc(order.doaPolicy) + '</p>' : '';
let customerSubject = '';
let customerHtml = '';
if (event.kind === 'created') {
  customerSubject = '[Long Fish] Xác nhận đơn ' + order.code;
  customerHtml = shell('Cảm ơn ' + esc(order.customerName) + ', Long Fish đã nhận đơn ' + esc(order.code),
    '<p>Giao tới: ' + esc(order.address) + '</p>' + itemsTable + totals + payHtml + policyHtml);
} else if (event.kind === 'payment') {
  customerSubject = '[Long Fish] Đã nhận thanh toán đơn ' + order.code;
  customerHtml = shell('Đã nhận thanh toán ' + esc(money(order.total)), '<p>Long Fish đã nhận tiền chuyển khoản cho đơn ' + esc(order.code) + '.</p>');
} else {
  customerSubject = '[Long Fish] Đơn ' + order.code + ': ' + labels[status];
  customerHtml = shell('Đơn ' + esc(order.code) + ': ' + esc(labels[status]), '<p>' + esc(customerLabels[status] || '') + '</p>' + (status === 'SHIPPING' ? policyHtml : ''));
}
`;

function ifNode(name, id, expression, position, note) {
  return {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expression, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
      options: {},
    },
    id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position, notes: note, notesInFlow: true,
  };
}

function patch(workflow, smtp) {
  const prep = workflow.nodes.find(node => node.name === PREP);
  if (!prep) throw new Error('Không thấy node "' + PREP + '" trong ' + workflow.name);
  if (!workflow.nodes.some(node => node.name === NEXT)) throw new Error('Không thấy node "' + NEXT + '"');
  const prepRef = "$('" + PREP + "').first().json";

  // 1. Code node: dựng nội dung email cho khách, trả thêm customerEmail/customerSubject/customerHtml.
  let code = prep.parameters.jsCode;
  if (!code.includes(MARK)) {
    const at = code.lastIndexOf('return [{ json: {');
    if (at < 0) throw new Error('Không tìm thấy câu lệnh return trong node chuẩn bị.');
    code = code.slice(0, at) + customerCode + code.slice(at).replace('return [{ json: {row,', 'return [{ json: {row, customerEmail, customerSubject, customerHtml,');
    if (!code.includes('customerEmail, customerSubject, customerHtml')) throw new Error('Không chèn được trường email khách vào return.');
    prep.parameters.jsCode = code;
  }

  // 2. Các node mới.
  const base = prep.id.slice(0, -3);
  const wanted = [
    ifNode(N.hasEmail, base + 'e01', '={{ !!' + prepRef + '.customerEmail }}', [1000, 200], 'Chỉ gửi khi khách để lại email.'),
    ifNode(N.mock, base + 'e02', "={{ $env.MOCK_INTEGRATIONS !== 'false' }}", [1200, 200], 'Chế độ mock chỉ ghi log, không gửi mail thật.'),
    {
      parameters: {
        method: 'POST', url: 'http://backend:3001/api/internal/mock/email', sendHeaders: true,
        headerParameters: { parameters: [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
        sendBody: true, specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({subject:' + prepRef + '.customerSubject,html:' + prepRef + '.customerHtml,to:' + prepRef + '.customerEmail}) }}',
        options: { timeout: 18000 },
      },
      id: base + 'e03', name: N.log, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1400, 200],
      notes: 'In email gửi khách trong chế độ mock.', notesInFlow: true,
    },
    {
      parameters: {
        fromEmail: '={{ $env.MAIL_FROM }}', toEmail: '={{ ' + prepRef + '.customerEmail }}',
        subject: '={{ ' + prepRef + '.customerSubject }}', emailFormat: 'html', html: '={{ ' + prepRef + '.customerHtml }}',
        options: { appendAttribution: false },
      },
      id: base + 'e04', name: N.smtp, type: 'n8n-nodes-base.emailSend', typeVersion: 2.1, position: [1400, 400],
      onError: 'continueRegularOutput',
      notes: 'Gửi email cho khách. Lỗi gửi (ví dụ địa chỉ sai) không chặn các bước sau.', notesInFlow: true,
    },
  ];
  for (const node of wanted) {
    const current = workflow.nodes.find(row => row.name === node.name);
    if (current) Object.assign(current, { ...node, credentials: current.credentials }); else workflow.nodes.push(node);
  }
  if (smtp) workflow.nodes.find(row => row.name === N.smtp).credentials = { smtp };

  // 3. Nối dây: mọi node đang trỏ tới "Có PSID?" giờ đi qua nhánh email khách trước.
  const newNames = new Set(Object.values(N));
  for (const [from, conn] of Object.entries(workflow.connections)) {
    if (newNames.has(from)) continue;
    for (const output of conn.main || []) for (const link of output || []) if (link.node === NEXT) link.node = N.hasEmail;
  }
  const to = node => [{ node, type: 'main', index: 0 }];
  workflow.connections[N.hasEmail] = { main: [to(N.mock), to(NEXT)] };
  workflow.connections[N.mock] = { main: [to(N.log), to(N.smtp)] };
  workflow.connections[N.log] = { main: [to(NEXT)] };
  workflow.connections[N.smtp] = { main: [to(NEXT)] };
  return workflow;
}

const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith('--' + name + '='))?.split('=').slice(1).join('=');
const files = args.filter(arg => !arg.startsWith('--'));
if (!files.length) { console.error('Cần ít nhất một file workflow JSON.'); process.exit(1); }
const smtp = option('smtp-id') ? { id: option('smtp-id'), name: option('smtp-name') || 'SMTP' } : undefined;
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = Array.isArray(data) ? data : [data];
  list.forEach(workflow => patch(workflow, smtp));
  fs.writeFileSync(file, JSON.stringify(Array.isArray(data) ? list : list[0], null, 2) + '\n');
  console.log('Đã thêm nhánh email khách: ' + list.map(w => w.name).join(', '));
}
