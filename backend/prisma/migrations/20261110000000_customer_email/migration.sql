-- Email khách (không bắt buộc) để gửi xác nhận đơn và thông báo trạng thái.
ALTER TABLE "Order" ADD COLUMN "email" TEXT NOT NULL DEFAULT '';
