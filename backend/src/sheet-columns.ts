export const sheetColumns = {
  Long_Fish_Orders: ['code', 'createdAt', 'customer', 'phone', 'address', 'products', 'quantity', 'subtotal', 'shippingFee', 'total',
    'paymentMethod', 'paymentStatus', 'status', 'gender', 'packingFee', 'hasLiveFish', 'preferredDelivery', 'deliveryNote'],
  Daily_Revenue: ['period', 'orders', 'revenue', 'cancelled'],
  Monthly_Revenue: ['period', 'orders', 'revenue', 'cancelled'],
} as const;
