import { env } from './env';
import { normalize, shippingInfo, doaPolicy } from './domain';

// Nội dung cố định của website phục vụ SEO: thông tin cửa hàng, mô tả danh mục, trang giới thiệu/chính sách.
// Các điều khoản kinh doanh (số ngày đổi trả, thời gian hoàn tiền) là mặc định có thể chỉnh bằng .env; chủ shop cần xác nhận.

const money = (amount: number) => new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';

export function siteInfo() {
  const days = (env.SHOP_OPEN_DAYS || '1,2,3,4,5,6,7').split(',').map(value => Number(value.trim())).filter(value => value >= 1 && value <= 7).sort();
  const names = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
  const consecutive = days.length > 1 && days.every((day, index) => index === 0 || day === days[index - 1] + 1);
  const dayText = days.length === 7 ? 'Hằng ngày' : consecutive ? names[days[0]] + ' – ' + names[days[days.length - 1]] : days.map(day => names[day]).join(', ');
  const open = Number(env.SHOP_OPEN_HOUR ?? 8);
  const close = Number(env.SHOP_CLOSE_HOUR ?? 21);
  return {
    name: env.SHOP_NAME?.trim() || 'Long Fish',
    address: env.SHOP_ADDRESS?.trim() || '', phone: env.SHOP_PHONE?.trim() || '', email: env.SHOP_EMAIL?.trim() || '',
    facebook: env.SHOP_FACEBOOK_URL?.trim() || '', tiktok: env.SHOP_TIKTOK_URL?.trim() || '', instagram: env.SHOP_INSTAGRAM_URL?.trim() || '',
    hours: dayText + ', ' + open + ':00 – ' + close + ':00',
  };
}

export type Category = { slug: string; name: string; description: string };
const category = (name: string, description: string): Category => ({ slug: normalize(name).replace(/\s+/g, '-'), name, description });

// Slug = tên danh mục không dấu, ngăn cách bằng gạch ngang. Tên phải trùng cột Product.category.
export const categories: Category[] = [
  category('Betta', 'Betta (cá xiêm) nổi bật với màu sắc rực rỡ và vây dài mềm mại như halfmoon, crowntail hay plakat. Betta đực nên nuôi riêng, bể từ khoảng 20 lít là phù hợp để cá bơi thoải mái. Long Fish chọn lọc cá khỏe, ăn tốt, đóng gói riêng từng con kèm thông số nuôi rõ ràng về nhiệt độ, pH và thức ăn. Phù hợp để bàn làm việc, bể mini hoặc người mới chơi cá cảnh.'),
  category('Guppy', 'Guppy (cá bảy màu) là dòng cá nhỏ dễ nuôi, sinh sản nhanh và có vô số biến thể màu như Fancy, Full Red hay Snake Skin. Chúng sống thành đàn, hiền, hợp nuôi chung trong bể cộng đồng nhỏ khi nước ổn định. Mỗi con tại Long Fish được kiểm tra sức khỏe trước khi đóng gói, kèm hướng dẫn nhiệt độ, pH và thức ăn để người mới cũng có thể nuôi ngay.'),
  category('Cá đàn', 'Cá đàn như Neon Tetra, Cardinal Tetra, Molly hay Platy sống thành bầy, bơi lội linh hoạt và tạo hiệu ứng sinh động cho bể thủy sinh. Đây là nhóm cá nhỏ hiền, dễ nuôi chung, thường nên mua từ 6 con trở lên để cá yên tâm và lên màu đẹp. Long Fish cung cấp thông số nuôi, kích thước trưởng thành và gợi ý số lượng phù hợp với dung tích bể của bạn.'),
  category('Cá vàng và Koi', 'Cá vàng Ranchu, Oranda và Koi mini mang vẻ đẹp truyền thống với thân tròn, màu rực và tính cách hiền. Nhóm cá này ăn khỏe, thải nhiều nên cần bể rộng và hệ thống lọc tốt để nước luôn trong. Long Fish ghi rõ kích thước trưởng thành và dung tích bể tối thiểu của từng loài để bạn chọn đúng, tránh nuôi chật làm cá chậm lớn hoặc dễ bệnh.'),
  category('Cá cao cấp', 'Nhóm cá cao cấp gồm cá la hán, cá thần tiên (Angelfish) và cá dĩa (Discus) dành cho người chơi muốn bể cá nổi bật. Các loài này cần bể lớn, nguồn nước sạch ổn định và chế độ ăn phù hợp nên được xếp mức nuôi trung bình đến nâng cao. Long Fish tư vấn thông số nhiệt độ, pH, thức ăn và khả năng nuôi chung để bạn chọn đúng cá cho bể của mình.'),
  category('Cá tầng đáy', 'Cá chuột đồng và Pleco Bristlenose là nhóm cá tầng đáy giúp dọn thức ăn thừa và rêu hại, giữ bể sạch hơn. Chúng hiền, ít chiếm chỗ và hợp nuôi chung với nhiều loài cá nhỏ. Long Fish cung cấp thông tin kích thước trưởng thành, nhiệt độ, pH và gợi ý bể tối thiểu, kèm chính sách cá sống khi nhận để bạn yên tâm đặt mua.'),
  category('Thức ăn', 'Thức ăn đúng loại giúp cá lên màu, khỏe mạnh và hạn chế ô nhiễm nước. Danh mục này gồm hạt nổi cho Betta và Artemia sấy giàu đạm, phù hợp cá nhỏ và cá con. Mỗi sản phẩm ghi rõ đối tượng sử dụng và khối lượng. Nên cho ăn lượng vừa đủ, cá ăn hết trong vài phút để tránh dư thừa làm đục nước và hại sức khỏe cá.'),
  category('Thiết bị', 'Thiết bị là nền tảng của một bể cá khỏe: bể kính, lọc thác, đèn LED thủy sinh, sưởi có chỉnh nhiệt và bộ sủi oxy. Long Fish liệt kê kích thước, công suất và phân loại để bạn chọn đồng bộ cho bể 40 cm hoặc nhỏ hơn. Giá ghi rõ, tồn kho kiểm tra theo từng phân loại, đặt hàng trực tuyến và giao tận nơi.'),
  category('Cây thủy sinh', 'Cây thủy sinh như Ráy Nana giúp hấp thụ chất thải, tạo nơi ẩn nấp cho cá và làm bể đẹp tự nhiên. Đây là loại cây dễ trồng, chịu được ánh sáng thấp, phù hợp người mới bắt đầu. Long Fish cung cấp cây khỏe kèm hướng dẫn trồng và chăm sóc, có thể kết hợp với đèn LED thủy sinh và vi sinh xử lý nước để bể ổn định lâu dài.'),
  category('Chăm sóc nước', 'Nước sạch quyết định sức khỏe của cá. Danh mục chăm sóc nước gồm vi sinh xử lý nước giúp ổn định hệ vi sinh, phân hủy chất thải và hạn chế mùi hôi. Sản phẩm phù hợp bể mới setup hoặc khi thay nước định kỳ. Hãy đọc hướng dẫn liều dùng trên từng sản phẩm và kiểm tra nhiệt độ, pH của bể thường xuyên để cá luôn khỏe.'),
];
export const categoryBySlug = (slug: string) => categories.find(item => item.slug === slug);
export const categoryByName = (name: string) => categories.find(item => item.name === name);

export type Section = { heading: string; paragraphs?: string[]; items?: string[]; table?: { head: string[]; rows: string[][] } };
export type Page = { slug: string; path: string; title: string; description: string; h1: string; intro: string; sections: Section[] };

function pages(): Page[] {
  const info = siteInfo();
  const ship = shippingInfo();
  const returnDays = Number(env.SHOP_RETURN_DAYS) > 0 ? Number(env.SHOP_RETURN_DAYS) : 7;
  const refundDays = env.SHOP_REFUND_DAYS?.trim() || '3–5 ngày làm việc';
  const rows = [...Object.entries(ship.fees).map(([name, fee]) => [name, money(fee)]), ['Các tỉnh/thành khác', money(ship.defaultFee)]];
  const area = ship.liveEverywhere ? 'toàn quốc' : ship.liveProvinces.join(', ');
  return [
    {
      slug: 'gioi-thieu', path: '/gioi-thieu', title: 'Giới thiệu ' + info.name + ' – Cá cảnh nước ngọt & thủy sinh',
      description: 'Giới thiệu ' + info.name + ': cửa hàng cá cảnh nước ngọt, cây thủy sinh, thức ăn và thiết bị. Thông số nuôi minh bạch, đóng gói cá sống riêng, đặt hàng trực tuyến dễ dàng.',
      h1: 'Giới thiệu ' + info.name,
      intro: info.name + ' là cửa hàng cá cảnh nước ngọt trực tuyến, tập trung vào những loài dễ nuôi và đẹp mắt như Betta, Guppy, Neon Tetra, cá vàng hay Koi mini, cùng cây thủy sinh, thức ăn và thiết bị cho bể cá.',
      sections: [
        { heading: 'Câu chuyện của ' + info.name, paragraphs: [
          'Nhiều người mới chơi cá cảnh gặp khó khăn ở những bước đầu: không biết loài nào hợp với bể nhỏ, nuôi chung được hay không, nhiệt độ và pH ra sao. ' + info.name + ' ra đời để giải quyết đúng những băn khoăn đó bằng thông tin rõ ràng ngay trên từng sản phẩm.',
          'Mỗi loài cá đều có thông số nuôi tham khảo: kích thước trưởng thành, nhiệt độ, pH, tính cách, thức ăn và dung tích bể tối thiểu. Bạn có thể lọc theo độ khó nuôi và kích thước để tìm đúng cá cho bể của mình, hoặc nhắn tin cho Fanpage để được gợi ý.',
        ] },
        { heading: 'Chúng tôi cam kết', items: [
          'Thông tin sản phẩm, giá và tồn kho minh bạch, cập nhật theo từng phân loại (dòng màu, cỡ, giới tính).',
          'Cá sống được đóng gói riêng với túi oxy và thùng xốp khi giao hàng.',
          'Chính sách cá chết khi nhận rõ ràng: quay video mở thùng trong thời hạn quy định để được xem xét bù cá hoặc hoàn tiền.',
          'Đặt hàng đơn giản: thanh toán khi nhận hàng hoặc chuyển khoản bằng mã VietQR, tra cứu trạng thái đơn bằng mã đơn và số điện thoại.',
        ] },
        { heading: 'Tư vấn qua Messenger', paragraphs: ['Chatbot trên Fanpage ' + info.name + ' giúp bạn xem giá, kiểm tra còn hàng, gợi ý cá theo ngân sách và dung tích bể, rồi gửi sẵn đường dẫn để chốt đơn trên website. Khi cần, bạn có thể yêu cầu gặp nhân viên tư vấn trực tiếp.'] },
      ],
    },
    {
      slug: 'lien-he', path: '/lien-he', title: 'Liên hệ ' + info.name + ' – Tư vấn cá cảnh & đặt hàng',
      description: 'Liên hệ ' + info.name + ' để được tư vấn chọn cá, thiết bị và hỗ trợ đơn hàng. Gửi tin nhắn qua biểu mẫu hoặc Fanpage, chúng tôi phản hồi trong giờ làm việc.',
      h1: 'Liên hệ ' + info.name,
      intro: 'Bạn cần tư vấn chọn cá, hỏi về đơn hàng hay chính sách cá sống? Hãy gửi tin nhắn cho ' + info.name + ' qua biểu mẫu bên dưới hoặc nhắn trực tiếp Fanpage. Giờ làm việc: ' + info.hours + '.',
      sections: [],
    },
    {
      slug: 'chinh-sach-doi-tra', path: '/chinh-sach-doi-tra', title: 'Chính sách đổi trả & hoàn tiền | ' + info.name,
      description: 'Chính sách đổi trả và hoàn tiền của ' + info.name + ': điều kiện, thời hạn, quy trình xử lý cá chết khi nhận và đổi trả phụ kiện, thời gian hoàn tiền.',
      h1: 'Chính sách đổi trả & hoàn tiền',
      intro: info.name + ' mong muốn mọi đơn hàng đều đến tay bạn trong tình trạng tốt nhất. Chính sách dưới đây áp dụng cho cá sống và phụ kiện mua trực tuyến.',
      sections: [
        { heading: 'Cá sống chết hoặc bệnh khi nhận', paragraphs: [doaPolicy] },
        { heading: 'Điều kiện được đổi trả', items: [
          'Cá sống: có video liền mạch quay lúc mở thùng, thấy rõ mã đơn và tình trạng cá, gửi trong thời hạn nêu ở trên.',
          'Phụ kiện, thiết bị: còn nguyên tình trạng, chưa qua sử dụng, yêu cầu đổi trả trong vòng ' + returnDays + ' ngày kể từ khi nhận hàng.',
          'Sản phẩm giao sai mẫu, sai phân loại hoặc lỗi từ nhà sản xuất sẽ được đổi mới hoặc hoàn tiền.',
        ] },
        { heading: 'Trường hợp không áp dụng đổi trả', items: [
          'Cá chết sau khi đã nhận quá thời hạn, hoặc không có video chứng minh lúc mở thùng.',
          'Cá yếu hoặc chết do môi trường nuôi của khách (nước chưa xử lý, nhiệt độ không phù hợp, nuôi chung sai loài).',
          'Thức ăn và vi sinh đã mở nắp hoặc đã sử dụng.',
        ] },
        { heading: 'Quy trình đổi trả', items: [
          'Bước 1: nhắn cho Fanpage hoặc gửi biểu mẫu liên hệ kèm mã đơn, video hoặc ảnh sản phẩm.',
          'Bước 2: nhân viên xác nhận và phản hồi phương án: bù cá, đổi sản phẩm hoặc hoàn tiền.',
          'Bước 3: với phụ kiện cần gửi lại, ' + info.name + ' hướng dẫn cách gửi; sản phẩm đổi mới được giao sau khi nhận lại hàng.',
        ] },
        { heading: 'Hoàn tiền', paragraphs: ['Tiền được hoàn theo hình thức khách đã thanh toán (chuyển khoản về tài khoản đã dùng hoặc đối trừ vào đơn sau). Thời gian hoàn tiền dự kiến ' + refundDays + ' kể từ khi yêu cầu được xác nhận.'] },
      ],
    },
    {
      slug: 'chinh-sach-bao-mat', path: '/chinh-sach-bao-mat', title: 'Chính sách bảo mật thông tin | ' + info.name,
      description: info.name + ' thu thập thông tin gì, dùng để làm gì, chia sẻ với ai và quyền của khách hàng trong việc xem, sửa hoặc xóa dữ liệu cá nhân.',
      h1: 'Chính sách bảo mật',
      intro: info.name + ' chỉ thu thập những thông tin cần thiết để xử lý đơn hàng và hỗ trợ bạn, đồng thời cam kết không bán dữ liệu cá nhân cho bên thứ ba.',
      sections: [
        { heading: 'Thông tin chúng tôi thu thập', items: [
          'Họ tên, số điện thoại, địa chỉ nhận hàng và ghi chú đơn hàng khi bạn đặt mua.',
          'Email (không bắt buộc) nếu bạn muốn nhận xác nhận đơn và thông báo giao hàng.',
          'Mã định danh trên Messenger (PSID) khi bạn nhắn tin cho Fanpage hoặc bấm liên kết đặt hàng từ cuộc trò chuyện, để gửi lại xác nhận đúng người.',
          'Nội dung tin nhắn gửi qua biểu mẫu liên hệ.',
        ] },
        { heading: 'Mục đích sử dụng', items: [
          'Xử lý, đóng gói và giao đơn hàng; thông báo trạng thái đơn.',
          'Tư vấn sản phẩm, hỗ trợ đổi trả và giải quyết khiếu nại.',
          'Thống kê nội bộ (doanh thu, số đơn) không gắn với thông tin cá nhân công khai.',
        ] },
        { heading: 'Bên thứ ba nhận thông tin', paragraphs: ['Dữ liệu được xử lý qua các dịch vụ cần thiết để vận hành cửa hàng: nền tảng Messenger của Meta để nhắn tin, Google Sheets để lưu bảng đơn hàng nội bộ, dịch vụ email để gửi xác nhận và đơn vị vận chuyển để giao hàng. Các bên này chỉ nhận lượng thông tin tối thiểu phục vụ đúng mục đích.'] },
        { heading: 'Quyền của khách hàng', items: [
          'Yêu cầu xem, chỉnh sửa hoặc xóa thông tin cá nhân của bạn.',
          'Từ chối nhận email thông báo bất kỳ lúc nào.',
          'Cách liên hệ: gửi biểu mẫu trên trang Liên hệ' + (info.email ? ' hoặc email ' + info.email : '') + ' kèm mã đơn hoặc số điện thoại để xác minh.',
        ] },
      ],
    },
    {
      slug: 'chinh-sach-van-chuyen', path: '/chinh-sach-van-chuyen', title: 'Chính sách vận chuyển & phí giao hàng | ' + info.name,
      description: 'Phạm vi giao hàng, bảng phí vận chuyển, phí đóng gói cá sống, miễn phí giao hàng từ ' + money(ship.freeThreshold) + ' và cách xử lý hàng hư hỏng khi giao tại ' + info.name + '.',
      h1: 'Chính sách vận chuyển',
      intro: info.name + ' giao hàng ' + area + '. Cá sống được đóng gói riêng trong túi oxy và thùng xốp để hạn chế sốc nhiệt và va đập khi vận chuyển.',
      sections: [
        { heading: 'Phạm vi giao hàng', paragraphs: ['Cá sống: giao ' + area + '. Phụ kiện, thiết bị, thức ăn và cây thủy sinh giao toàn quốc.'] },
        { heading: 'Bảng phí vận chuyển', table: { head: ['Khu vực', 'Phí giao hàng'], rows }, paragraphs: [
          'Đơn hàng từ ' + money(ship.freeThreshold) + ' được miễn phí giao hàng. Đơn có cá sống phát sinh thêm phí đóng gói ' + money(ship.packingFee) + ' (túi oxy, thùng xốp). Phí chính xác được hiển thị khi bạn nhập địa chỉ ở bước thanh toán.',
        ] },
        { heading: 'Thời gian giao hàng', paragraphs: ['Thời gian giao dự kiến phụ thuộc khu vực và đơn vị vận chuyển. Nhân viên sẽ xác nhận lịch giao với bạn sau khi đơn được xác nhận; bạn có thể ghi ngày giờ nhận mong muốn trong ghi chú đơn hàng.'] },
        { heading: 'Hàng thất lạc hoặc hư hỏng khi giao', items: [
          'Kiểm tra và quay video liền mạch khi mở thùng, đặc biệt với cá sống.',
          'Liên hệ ngay với mã đơn và video; ' + info.name + ' xử lý theo Chính sách đổi trả & hoàn tiền.',
          'Nếu đơn bị thất lạc, chúng tôi làm việc với đơn vị vận chuyển và gửi lại hàng hoặc hoàn tiền.',
        ] },
      ],
    },
  ];
}
export const sitePages = pages;
export const pageBySlug = (slug: string) => pages().find(page => page.slug === slug);

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
export const pageWords = (page: Page) => wordCount([page.intro, ...page.sections.flatMap(section => [section.heading, ...(section.paragraphs || []), ...(section.items || [])])].join(' '));
