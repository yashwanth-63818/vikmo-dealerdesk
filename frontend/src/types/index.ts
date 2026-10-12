// Core Data Types matching API_CONTRACT.md

export interface Product {
  sku: string;
  name: string;
  category: string;
  brand: string;
  vehicle_fitment: string;
  price: string; // e.g. "1459.50"
  stock: number;
  description: string;
}

export interface InventoryUpdatePayload {
  quantity: number;
  reason: string;
}

export interface InventoryUpdateResponse {
  sku: string;
  quantity: number;
}

export interface Dealer {
  id: number;
  dealer_code: string;
  name: string;
  city: string;
  phone: string;
  email: string;
  gstin: string;
  credit_limit: string;
}

export interface DealerCreatePayload {
  dealer_code: string;
  name: string;
  city?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  credit_limit?: string;
}

export interface OrderItemInput {
  sku: string;
  quantity: number;
}

export interface OrderCreatePayload {
  dealer_id: number;
  items: OrderItemInput[];
}

export interface OrderUpdatePayload {
  dealer_id?: number;
  items: OrderItemInput[];
}

export interface OrderItemOutput {
  sku: string;
  name: string;
  quantity: number;
  unit_price: string;
  line_subtotal: string;
  line_tax: string;
  line_total: string;
}

export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';

export interface Order {
  order_number: string;
  dealer_id: number;
  status: OrderStatus;
  items: OrderItemOutput[];
  subtotal: string;
  tax_total: string;
  grand_total: string;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface SupplierSyncResult {
  created: number;
  updated: number;
  unchanged: number;
  rejected: Array<{ supplier_sku?: string; reason: string }>;
  pages_fetched: number;
  requests_made: number;
}

export interface APIErrorDetail {
  field?: string;
  message?: string;
  sku?: string;
  requested?: number;
  available?: number;
  name?: string;
}

export interface APIErrorShape {
  error: {
    code: string;
    message: string;
    details: APIErrorDetail[];
  };
}

export interface HealthResponse {
  status: string;
}
