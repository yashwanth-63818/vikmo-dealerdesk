import type {
  Product,
  InventoryUpdatePayload,
  InventoryUpdateResponse,
  Dealer,
  DealerCreatePayload,
  Order,
  OrderCreatePayload,
  OrderUpdatePayload,
  PaginatedResponse,
  SupplierSyncResult,
  HealthResponse,
  APIErrorShape
} from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export class APIClientError extends Error {
  code: string;
  details: any[];
  status: number;

  constructor(code: string, message: string, details: any[] = [], status = 400) {
    super(message);
    this.name = 'APIClientError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      data = await response.text();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (data && typeof data === 'object' && 'error' in data) {
      const errShape = data as APIErrorShape;
      throw new APIClientError(
        errShape.error.code || 'UNKNOWN_ERROR',
        errShape.error.message || `Request failed with status ${response.status}`,
        errShape.error.details || [],
        response.status
      );
    }
    const message = typeof data === 'string' && data ? data : `Request failed with status ${response.status}`;
    throw new APIClientError('HTTP_ERROR', message, [], response.status);
  }

  return data as T;
}

export const api = {
  // System Health
  getHealth: () => request<HealthResponse>('/api/health/'),

  // Products
  getProducts: (params?: { search?: string; category?: string; vehicle?: string; page?: number; page_size?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.category) query.set('category', params.category);
    if (params?.vehicle) query.set('vehicle', params.vehicle);
    if (params?.page) query.set('page', String(params.page));
    if (params?.page_size) query.set('page_size', String(params.page_size));
    const qs = query.toString();
    return request<PaginatedResponse<Product>>(`/api/products/${qs ? `?${qs}` : ''}`);
  },

  getProduct: (sku: string) => request<Product>(`/api/products/${encodeURIComponent(sku)}/`),

  // Inventory
  updateInventory: (sku: string, payload: InventoryUpdatePayload) =>
    request<InventoryUpdateResponse>(`/api/inventory/${encodeURIComponent(sku)}/`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // Dealers
  getDealers: (params?: { page?: number; page_size?: number }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.page_size) query.set('page_size', String(params.page_size));
    const qs = query.toString();
    return request<PaginatedResponse<Dealer>>(`/api/dealers/${qs ? `?${qs}` : ''}`);
  },

  getDealer: (id: number) => request<Dealer>(`/api/dealers/${id}/`),

  createDealer: (payload: DealerCreatePayload) =>
    request<Dealer>('/api/dealers/', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Orders
  getOrders: (params?: { dealer_id?: number; status?: string; page?: number; page_size?: number }) => {
    const query = new URLSearchParams();
    if (params?.dealer_id) query.set('dealer_id', String(params.dealer_id));
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.page_size) query.set('page_size', String(params.page_size));
    const qs = query.toString();
    return request<PaginatedResponse<Order>>(`/api/orders/${qs ? `?${qs}` : ''}`);
  },

  getOrder: (orderNumber: string) => request<Order>(`/api/orders/${encodeURIComponent(orderNumber)}/`),

  createOrder: (payload: OrderCreatePayload, idempotencyKey?: string) => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    return request<Order>('/api/orders/', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  },

  updateOrder: (orderNumber: string, payload: OrderUpdatePayload) =>
    request<Order>(`/api/orders/${encodeURIComponent(orderNumber)}/`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  confirmOrder: (orderNumber: string) =>
    request<Order>(`/api/orders/${encodeURIComponent(orderNumber)}/confirm/`, {
      method: 'POST',
    }),

  dispatchOrder: (orderNumber: string) =>
    request<Order>(`/api/orders/${encodeURIComponent(orderNumber)}/dispatch/`, {
      method: 'POST',
    }),

  deliverOrder: (orderNumber: string) =>
    request<Order>(`/api/orders/${encodeURIComponent(orderNumber)}/deliver/`, {
      method: 'POST',
    }),

  cancelOrder: (orderNumber: string) =>
    request<Order>(`/api/orders/${encodeURIComponent(orderNumber)}/cancel/`, {
      method: 'POST',
    }),

  // Supplier Sync
  syncSupplier: () =>
    request<SupplierSyncResult>('/api/sync/supplier/', {
      method: 'POST',
    }),
};
