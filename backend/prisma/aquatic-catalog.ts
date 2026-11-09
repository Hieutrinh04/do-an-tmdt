const sheets = 'https://ornamentalfish.org/what-we-do/advice-information/care-sheets/';
const tropical = sheets + 'caresheets-tropical-freshwater-fish/';
const cold = sheets + 'caresheets-coldwater-fish/';
const care = (scientificName: string, adultCm: number, temperature: string, ph: string,
  temperament: string, difficulty: string, food: string, minTankLiters: number, community: boolean,
  source: string, algaeEater = false, compact = false) => ({
  scientificName, adultCm, temperature, ph, temperament, difficulty, food, minTankLiters,
  community, algaeEater, compact, source,
});

const betta = care('Betta splendens', 7, '24–28 °C', '6,0–8,0', 'Nuôi riêng cá đực từ 20 L. Nhóm cá cái cần từ 60 L và theo dõi tính lãnh thổ. Dùng bể có nắp, lọc dòng nhẹ.', 'Dễ', 'Hạt chuyên dụng, artemia đông lạnh', 20, false, tropical + 'how-to-look-after-siamese-fighting-fish-bettas/', false, true);
const guppy = care('Poecilia reticulata', 5, '20–28 °C', '7,0–8,0', 'Nuôi nhóm với cá hiền có nhu cầu nước tương tự.', 'Dễ', 'Thức ăn mảnh hoặc hạt nhỏ, artemia', 45, true, tropical + 'how-to-look-after-guppies-and-mollies/');
const tetra = care('Paracheirodon innesi', 4, '22–26 °C', '6,0–7,5', 'Nuôi đàn từ 6 con với cá nhỏ hiền, trong bể ổn định.', 'Dễ', 'Hạt mịn, thức ăn mảnh và artemia nhỏ', 45, true, tropical + 'how-to-look-after-tetras-and-pencilfish/');
const goldfish = care('Carassius auratus', 25, '18–24 °C', '6,0–8,0', 'Nuôi cùng cá vàng thân tròn tương đương, lọc tốt.', 'Trung bình', 'Hạt chìm cho cá vàng và rau phù hợp', 100, false, cold + 'how-to-look-after-goldfish-in-an-aquarium-fish-tank/');

export const fish = [
  ['Betta Halfmoon', 'betta-halfmoon', 'Betta', 69000, 'betta', 'Đỏ', 'Xanh dương', '3–4 cm', 1, betta],
  ['Betta Plakat Koi', 'betta-plakat-koi', 'Betta', 89000, 'betta', 'Koi', 'Platinum', '3–4 cm', 1, betta],
  ['Betta Crowntail', 'betta-crowntail', 'Betta', 75000, 'betta', 'Đỏ', 'Xanh dương', '3–4 cm', 1, betta],
  ['Guppy Fancy', 'guppy-fancy', 'Guppy', 28000, 'guppy', 'Mix', 'Vàng', '3–4 cm', 1, guppy],
  ['Guppy Full Red', 'guppy-full-red', 'Guppy', 35000, 'guppy', 'Đỏ', 'Đỏ cam', '3–4 cm', 1, guppy],
  ['Cá bảy màu Snake Skin', 'guppy-snake-skin', 'Guppy', 39000, 'guppy', 'Vàng', 'Mix', '3–4 cm', 1, guppy],
  ['Neon Tetra', 'neon-tetra', 'Cá đàn', 14000, 'neon', 'Xanh đỏ', 'Xanh ánh kim', '2–3 cm', 6, tetra],
  ['Cardinal Tetra', 'cardinal-tetra', 'Cá đàn', 24000, 'neon', 'Xanh đỏ', 'Đỏ', '2–3 cm', 6,
    {...tetra, scientificName: 'Paracheirodon axelrodi', adultCm: 5, minTankLiters: 80, temperature: '24–28 °C', ph: '5,5–7,0'}],
  ['Molly đen', 'molly-den', 'Cá đàn', 32000, 'molly', 'Đen', 'Trắng', '3–4 cm', 1,
    {...guppy, scientificName: 'Poecilia sphenops', adultCm: 10, minTankLiters: 75, food: 'Hạt hoặc thức ăn mảnh có thành phần tảo'}],
  ['Platy đỏ', 'platy-do', 'Cá đàn', 26000, 'platy', 'Đỏ', 'Cam', '3–4 cm', 1,
    {...guppy, scientificName: 'Xiphophorus maculatus', adultCm: 6, temperature: '22–27 °C', food: 'Hạt hoặc thức ăn mảnh có thành phần tảo', source: tropical + 'how-to-look-after-platies-and-swordtails/'}],
  ['Cá vàng Ranchu', 'ca-vang-ranchu', 'Cá vàng và Koi', 149000, 'goldfish', 'Cam', 'Trắng đỏ', '5–6 cm', 1, goldfish],
  ['Cá vàng Oranda', 'ca-vang-oranda', 'Cá vàng và Koi', 119000, 'goldfish', 'Đỏ', 'Trắng đỏ', '5–6 cm', 1, goldfish],
  ['Koi mini (cá non)', 'koi-mini', 'Cá vàng và Koi', 69000, 'koi', 'Koi', 'Mix', '7–9 cm', 1,
    care('Cyprinus carpio', 75, '4–24 °C', '6,5–8,5', 'Cỡ bán là cá non. Cần hồ ngoài trời đủ lớn khi trưởng thành.', 'Nâng cao', 'Hạt cho Koi theo nhiệt độ nước', 4500, false, cold + 'how-to-look-after-pond-fish/')],
  ['Cá la hán', 'ca-la-han', 'Cá cao cấp', 490000, 'flowerhorn', 'Đỏ châu', 'Đỏ', '10 cm+', 1,
    care('Cichlid lai', 30, '26–30 °C', '7,0–8,0', 'Có tính lãnh thổ, nên nuôi riêng.', 'Nâng cao', 'Hạt chuyên dụng cho cichlid', 200, false, tropical + 'how-to-look-after-american-cichlids/')],
  ['Cá thần tiên', 'ca-than-tien', 'Cá cao cấp', 89000, 'angel', 'Platinum', 'Vằn đen', '5–6 cm', 1,
    care('Pterophyllum scalare', 15, '24–28 °C', '6,0–7,5', 'Cần bể cao. Có thể ăn cá rất nhỏ.', 'Trung bình', 'Hạt, thức ăn mảnh, artemia', 120, false, 'https://www.fishbase.se/summary/Pterophyllum-scalare.html')],
  ['Cá dĩa', 'ca-dia', 'Cá cao cấp', 265000, 'discus', 'Đỏ', 'Xanh ngọc', '7–9 cm', 1,
    care('Symphysodon spp.', 20, '26–30 °C', '6,0–7,5', 'Nuôi nhóm trong bể ổn định, cân nhắc bạn bể cùng nhiệt độ.', 'Nâng cao', 'Hạt cho cá dĩa, artemia đông lạnh', 200, false, tropical + 'how-to-look-after-discus/')],
  ['Cá chuột đồng', 'ca-chuot-dong', 'Cá tầng đáy', 27000, 'catfish', 'Đồng', 'Albino', '3–4 cm', 5,
    care('Corydoras aeneus', 7, '22–27 °C', '6,0–8,0', 'Nuôi nhóm trên nền mịn với cá hiền.', 'Dễ', 'Viên chìm chuyên dụng', 60, true, tropical + 'how-to-look-after-catfish/')],
  ['Pleco Bristlenose', 'pleco-bristlenose', 'Cá tầng đáy', 79000, 'pleco', 'Nâu', 'Albino', '5–6 cm', 1,
    care('Ancistrus spp.', 13, '23–27 °C', '6,5–7,5', 'Có thể nuôi với cá hiền, cần chỗ trú riêng.', 'Trung bình', 'Viên tảo chìm và rau phù hợp', 80, true, 'https://ornamentalfish.org/wp-content/uploads/Tropical-algae-eaters-.pdf', true)],
] as const;

export const supplies = [
  ['Hạt nổi cho Betta', 'hat-betta', 'Thức ăn', 45000, 'food', '25 g', 'gói', 'Hạt nổi kích thước nhỏ dành cho Betta. Cho ăn lượng vừa đủ.'],
  ['Artemia sấy', 'artemia-say', 'Thức ăn', 58000, 'food', '20 g', 'gói', 'Thức ăn bổ sung cho cá phù hợp với kích thước hạt.'],
  ['Bể kính 40 cm', 'be-kinh-40', 'Thiết bị', 275000, 'tank', '40 × 25 × 25 cm', 'cái', 'Bể kính trống. Dung tích sử dụng phụ thuộc mực nước và vật liệu nền.'],
  ['Lọc thác', 'loc-thac', 'Thiết bị', 175000, 'equipment', '20 W', 'cái', 'Lọc thác có ngăn vật liệu lọc. Điều chỉnh dòng chảy theo loài.'],
  ['Đèn LED thủy sinh', 'den-led', 'Thiết bị', 220000, 'equipment', '40 cm', 'cái', 'Đèn chiếu sáng cho bể thủy sinh có kích thước phù hợp.'],
  ['Sưởi có chỉnh nhiệt', 'suoi-be-ca', 'Thiết bị', 159000, 'equipment', '50 W', 'cái', 'Sưởi chìm có điều chỉnh nhiệt độ. Đọc hướng dẫn trước khi lắp.'],
  ['Bộ sủi oxy', 'sui-oxy', 'Thiết bị', 105000, 'equipment', 'Mặc định', 'bộ', 'Bộ gồm máy sủi, dây và đá sủi.'],
  ['Ráy Nana', 'ray-nana', 'Cây thủy sinh', 55000, 'plant', 'Chậu nhỏ', 'cái', 'Cây Anubias barteri var. nana. Gắn thân rễ lên lũa hoặc đá.'],
  ['Vi sinh xử lý nước', 'vi-sinh', 'Chăm sóc nước', 89000, 'equipment', '100 mL', 'cái', 'Vi sinh hỗ trợ lọc sinh học. Dùng theo nhãn và kiểm tra nước định kỳ.'],
] as const;

