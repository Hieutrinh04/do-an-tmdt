-- Giá khuyến mãi theo lịch, sản phẩm mua kèm, mã giảm giá, tài khoản khách hàng, phương thức vận chuyển.
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL,
    "shippingAddress" JSONB,
    "billingAddress" JSONB,
    "resetTokenHash" TEXT,
    "resetExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "minSubtotal" INTEGER NOT NULL DEFAULT 0,
    "categories" JSONB NOT NULL,
    "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "perCustomerLimit" INTEGER NOT NULL DEFAULT 0,
    "usageLimit" INTEGER NOT NULL DEFAULT 0,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" DATETIME,
    "expiresAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");
ALTER TABLE "Product" ADD COLUMN "salePrice" INTEGER;
ALTER TABLE "Product" ADD COLUMN "saleStartsAt" DATETIME;
ALTER TABLE "Product" ADD COLUMN "saleEndsAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "customerId" TEXT REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD COLUMN "couponCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Order" ADD COLUMN "discount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "shippingDiscount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "shippingMethod" TEXT NOT NULL DEFAULT 'STANDARD';
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");
CREATE TABLE "ProductLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "linkedId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "ProductLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductLink_linkedId_fkey" FOREIGN KEY ("linkedId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductLink_productId_linkedId_type_key" ON "ProductLink"("productId", "linkedId", "type");
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "couponId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CouponRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CouponRedemption_orderId_key" ON "CouponRedemption"("orderId");
CREATE INDEX "CouponRedemption_couponId_customerKey_idx" ON "CouponRedemption"("couponId", "customerKey");
