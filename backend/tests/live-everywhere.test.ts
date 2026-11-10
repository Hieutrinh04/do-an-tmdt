import { expect, test } from 'vitest';

process.env.LIVE_FISH_PROVINCES_JSON = '["*"]';
process.env.LIVE_FISH_PACKING_FEE = '30000';
process.env.SHIPPING_FREE_THRESHOLD = '600000';
process.env.SHIPPING_DEFAULT_FEE = '35000';
process.env.SHIPPING_FEES_JSON = '{"Hồ Chí Minh":20000}';

test('LIVE_FISH_PROVINCES_JSON=["*"] cho giao cá sống toàn quốc, vẫn tính phí đóng gói và phí ship mặc định', async () => {
  const { quote, liveEverywhere, provinces } = await import('../src/domain');
  expect(liveEverywhere).toBe(true);
  const far = quote('An Giang', 100000, true);
  expect(far.liveDeliveryAvailable).toBe(true);
  expect(far.packingFee).toBe(30000);
  expect(far.shippingFee).toBe(35000);
  expect(far.total).toBe(165000);
  expect(quote('Cà Mau', 100000, false).packingFee).toBe(0);
  expect(provinces).toContain('Hồ Chí Minh');
  expect(provinces.length).toBeGreaterThanOrEqual(34);
});
