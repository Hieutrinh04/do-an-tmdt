import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { expect, test } from 'vitest';

test('WF1 kiểm HMAC raw body, chặn chữ ký sai và nhận postback', async () => {
  const workflow = JSON.parse(readFileSync('../n8n/workflows/1-messenger.json', 'utf8'));
  const code = workflow.nodes.find((node: { name: string }) => node.name === 'Kiểm chữ ký và lọc sự kiện').parameters.jsCode;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction('$input', '$env', 'require', code);
  const secret = 'test-secret';
  const body = JSON.stringify({ object: 'page', entry: [{ messaging: [
    { sender: { id: '123' }, timestamp: 1, postback: { mid: 'postback-1', payload: 'Danh mục' } },
    { sender: { id: '123' }, message: { mid: 'echo-1', is_echo: true, text: 'echo' } },
  ] }] });
  const request = (signature: string) => ({ first: () => ({ json: { body, headers: { 'x-hub-signature-256': signature } } }) });
  const environment = { MOCK_INTEGRATIONS: 'false', META_APP_SECRET: secret };
  const valid = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  const result = await execute.call({}, request(valid), environment, () => ({ createHmac, timingSafeEqual: require('node:crypto').timingSafeEqual }));
  expect(result[0].json).toMatchObject({ ok: true, events: [{ psid: '123', mid: 'postback-1', text: 'Danh mục' }] });
  expect((await execute.call({}, request('sha256=bad'), environment, () => ({ createHmac })))[0].json.ok).toBe(false);
  expect((await execute.call({}, request('sha256=' + 'é'.repeat(64)), environment, () => ({ createHmac })))[0].json.ok).toBe(false);
});

test('WF1 truyền attachment/sticker/location có mid sang bot mà không gọi AI', async () => {
  const workflow = JSON.parse(readFileSync('../n8n/workflows/1-messenger.json', 'utf8'));
  const code = workflow.nodes.find((node: {name:string})=>node.name==='Kiểm chữ ký và lọc sự kiện').parameters.jsCode;
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const body={object:'page',entry:[{messaging:[
    {sender:{id:'123'},message:{mid:'image-1',attachments:[{type:'image',payload:{url:'https://example.com/test.png'}}]}},
    {sender:{id:'123'},message:{mid:'sticker-1',sticker_id:1}},
    {sender:{id:'123'},message:{mid:'location-1',attachments:[{type:'location',payload:{coordinates:{lat:1,long:1}}}]}}
  ]}]};
  const result=await new AsyncFunction('$input','$env','require',code).call({}, {first:()=>({json:{body}})}, {MOCK_INTEGRATIONS:'true'}, require);
  expect(result[0].json.events.map((row:{attachmentType:string})=>row.attachmentType)).toEqual(['image','sticker','location']);
  const condition=workflow.nodes.find((node:{name:string})=>node.name==='AI bật và tin nhắn tự do?').parameters.conditions.conditions[0].leftValue;
  const enabled=new Function('$env','$json','return ('+condition.slice(3,-2)+');');
  expect(enabled({AI_ENABLED:'true',AI_API_KEY:'fixture'}, {text:'Xin xem hình cá trong bể nhỏ',attachmentType:'image'})).toBe(false);
});

test('WF3 thông báo riêng khi đối soát thanh toán và giữ thông báo trạng thái', () => {
  const workflow = JSON.parse(readFileSync('../n8n/workflows/3-order-status.json', 'utf8'));
  const code = workflow.nodes.find((node: { name: string }) => node.name === 'Chuẩn bị Sheets và thông báo').parameters.jsCode;
  const order = {
    code: 'DH20261109-0001', createdAt: new Date().toISOString(), customerName: 'Khách thử', phone: '0901234567',
    address: 'Địa chỉ thử', items: [], subtotal: 100000, shippingFee: 20000, packingFee: 0, hasLiveFish: false,
    preferredDelivery: '', note: '', total: 120000, paymentMethod: 'BANK_QR', paymentStatus: 'UNPAID',
    psid: '123', doaPolicy: 'Chính sách thử',
  };
  const run = (kind: string) => {
    const body = { code: order.code, kind, status: 'PENDING' };
    const $input = { first: () => ({ json: order }) };
    const $ = () => ({ first: () => ({ json: { body } }) });
    return new Function('$input', '$', '$env', code)($input, $, { SITE_URL: 'https://long-fish.example' })[0].json;
  };
  expect(run('payment').message.text).toContain('Đã nhận thanh toán');
  expect(run('status').message.text).toContain('Chờ xác nhận');
});
