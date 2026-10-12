import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { api, APIClientError } from '../api/client';
import type { Order, Dealer, Product, OrderStatus } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../context/ToastContext';
import {
  ShoppingCart,
  PlusCircle,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  PackageCheck,
  AlertTriangle,
  Trash2,
  Edit2,
  FileText
} from 'lucide-react';

export const OrdersPage: React.FC = () => {
  const toast = useToast();
  const location = useLocation();

  const [orders, setOrders] = useState<Order[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dealerFilter, setDealerFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Selected Order for Details View
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Create Order Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDealerId, setSelectedDealerId] = useState<number | ''>('');
  const [orderItems, setOrderItems] = useState<Array<{ sku: string; quantity: number }>>([
    { sku: '', quantity: 1 },
  ]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit DRAFT Order Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editOrderNumber, setEditOrderNumber] = useState<string>('');
  const [editItems, setEditItems] = useState<Array<{ sku: string; quantity: number }>>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Transition Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
    variant: 'danger' | 'warning' | 'primary';
    confirmLabel: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: async () => {},
    variant: 'primary',
    confirmLabel: 'Confirm',
  });
  const [actionLoading, setActionLoading] = useState(false);

  const loadSpecificOrder = useCallback(async (orderNumber: string) => {
    setLoadingDetails(true);
    try {
      const o = await api.getOrder(orderNumber);
      setSelectedOrder(o);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to fetch order details');
    } finally {
      setLoadingDetails(false);
    }
  }, [toast]);

  // Auto-open create modal if navigated with state.openCreate
  useEffect(() => {
    if (location.state && (location.state as any).openCreate) {
      setIsCreateOpen(true);
    }
    if (location.state && (location.state as any).selectedOrder) {
      loadSpecificOrder((location.state as any).selectedOrder);
    }
  }, [location.state, loadSpecificOrder]);

  const loadDealersAndProducts = async () => {
    try {
      const [dRes, pRes] = await Promise.all([
        api.getDealers({ page_size: 100 }),
        api.getProducts({ page_size: 100 }),
      ]);
      setDealers(dRes.results || []);
      setProducts(pRes.results || []);
    } catch {
      // Non-blocking fallback
    }
  };

  useEffect(() => {
    loadDealersAndProducts();
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOrders({
        status: statusFilter,
        dealer_id: dealerFilter ? Number(dealerFilter) : undefined,
        page,
        page_size: pageSize,
      });
      setOrders(res.results || []);
      setTotalCount(res.count || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dealerFilter, page]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Helper to get dealer info
  const getDealerName = (dealerId: number) => {
    const d = dealers.find((dl) => dl.id === dealerId);
    return d ? `${d.name} (${d.dealer_code})` : `Dealer #${dealerId}`;
  };

  // Helper to find product details by SKU
  const findProduct = (sku: string) => products.find((p) => p.sku === sku);

  // Provisional preview calculations for Create Modal
  const calculateProvisional = (items: Array<{ sku: string; quantity: number }>) => {
    let subtotal = 0;
    for (const it of items) {
      if (!it.sku) continue;
      const prod = findProduct(it.sku);
      if (prod) {
        subtotal += parseFloat(prod.price) * (it.quantity || 0);
      }
    }
    const tax = Math.round(subtotal * 0.18 * 100) / 100;
    const grand = subtotal + tax;
    return {
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      grand: grand.toFixed(2),
    };
  };

  // Create Order Submit
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDealerId) {
      setCreateError('Please select a purchasing dealer.');
      return;
    }

    const validItems = orderItems.filter((i) => i.sku && i.quantity >= 1);
    if (validItems.length === 0) {
      setCreateError('Please specify at least one product with quantity ≥ 1.');
      return;
    }

    const skus = validItems.map((i) => i.sku);
    if (new Set(skus).size !== skus.length) {
      setCreateError('Duplicate SKUs in the same order are not allowed.');
      return;
    }

    setCreateSubmitting(true);
    setCreateError(null);

    // Generate unique UUID for Idempotency-Key
    const idempotencyKey =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      const created = await api.createOrder(
        {
          dealer_id: Number(selectedDealerId),
          items: validItems,
        },
        idempotencyKey
      );

      toast.success(`Draft order ${created.order_number} created successfully.`);
      setIsCreateOpen(false);
      setSelectedDealerId('');
      setOrderItems([{ sku: '', quantity: 1 }]);
      loadOrders();
      setSelectedOrder(created);
    } catch (err: any) {
      if (err instanceof APIClientError) {
        setCreateError(err.message);
        toast.error(err.message, 'Order Creation Failed');
      } else {
        setCreateError(err?.message || 'Unexpected network error');
      }
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Open Edit Draft Modal
  const handleOpenEditDraft = (order: Order) => {
    if (order.status !== 'DRAFT') {
      toast.error('Only DRAFT orders can be modified.');
      return;
    }
    setEditOrderNumber(order.order_number);
    setEditItems(
      order.items.map((i) => ({
        sku: i.sku,
        quantity: i.quantity,
      }))
    );
    setEditError(null);
    setIsEditOpen(true);
  };

  // Submit Edit Draft
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = editItems.filter((i) => i.sku && i.quantity >= 1);
    if (validItems.length === 0) {
      setEditError('Order must have at least one valid product.');
      return;
    }
    const skus = validItems.map((i) => i.sku);
    if (new Set(skus).size !== skus.length) {
      setEditError('Duplicate SKUs are not allowed.');
      return;
    }

    setEditSubmitting(true);
    setEditError(null);
    try {
      const updated = await api.updateOrder(editOrderNumber, {
        items: validItems,
      });
      toast.success(`Order ${updated.order_number} updated successfully.`);
      setIsEditOpen(false);
      setSelectedOrder(updated);
      loadOrders();
    } catch (err: any) {
      if (err instanceof APIClientError) {
        setEditError(err.message);
        toast.error(err.message, 'Update Failed');
      } else {
        setEditError(err?.message || 'Network error');
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  // Lifecycle Transition Handlers
  const triggerConfirmOrder = (order: Order) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Order & Lock Stock',
      message: `Confirming order ${order.order_number} will lock item prices and deduct stock from inventory. This action is all-or-nothing. Proceed?`,
      variant: 'primary',
      confirmLabel: 'Confirm Order',
      action: async () => {
        try {
          const res = await api.confirmOrder(order.order_number);
          toast.success(`Order ${res.order_number} is now CONFIRMED. Stock successfully reserved.`);
          setSelectedOrder(res);
          loadOrders();
        } catch (err: any) {
          if (err instanceof APIClientError && err.code === 'INSUFFICIENT_STOCK') {
            const shortDetails = err.details?.map(
              (d: any) => `SKU ${d.sku}: Requested ${d.requested}, but only ${d.available} available.`
            );
            toast.error(err.message, 'Insufficient Stock', shortDetails);
          } else {
            toast.error(err?.message || 'Failed to confirm order', 'Error');
          }
        }
      },
    });
  };

  const triggerDispatchOrder = (order: Order) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Dispatch Order',
      message: `Mark order ${order.order_number} as DISPATCHED for transport?`,
      variant: 'primary',
      confirmLabel: 'Mark Dispatched',
      action: async () => {
        try {
          const res = await api.dispatchOrder(order.order_number);
          toast.success(`Order ${res.order_number} has been marked as DISPATCHED.`);
          setSelectedOrder(res);
          loadOrders();
        } catch (err: any) {
          toast.error(err?.message || 'Failed to dispatch order');
        }
      },
    });
  };

  const triggerDeliverOrder = (order: Order) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Deliver Order',
      message: `Mark order ${order.order_number} as DELIVERED to dealer? This is a terminal state.`,
      variant: 'primary',
      confirmLabel: 'Mark Delivered',
      action: async () => {
        try {
          const res = await api.deliverOrder(order.order_number);
          toast.success(`Order ${res.order_number} marked as DELIVERED.`);
          setSelectedOrder(res);
          loadOrders();
        } catch (err: any) {
          toast.error(err?.message || 'Failed to deliver order');
        }
      },
    });
  };

  const triggerCancelOrder = (order: Order) => {
    const isConfirmed = order.status === 'CONFIRMED';
    setConfirmDialog({
      isOpen: true,
      title: 'Cancel Order',
      message: isConfirmed
        ? `Order ${order.order_number} is CONFIRMED. Cancelling it will restore all deducted stock back to inventory exactly once. Are you sure you want to cancel?`
        : `Are you sure you want to cancel draft order ${order.order_number}?`,
      variant: 'danger',
      confirmLabel: 'Cancel Order',
      action: async () => {
        try {
          const res = await api.cancelOrder(order.order_number);
          toast.warning(
            `Order ${res.order_number} has been CANCELLED.${
              isConfirmed ? ' Reserved inventory has been restored.' : ''
            }`
          );
          setSelectedOrder(res);
          loadOrders();
        } catch (err: any) {
          toast.error(err?.message || 'Failed to cancel order');
        }
      },
    });
  };

  const executeConfirmAction = async () => {
    setActionLoading(true);
    try {
      await confirmDialog.action();
      setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'DRAFT':
        return <span className="badge badge-warning"><Clock size={12} /> DRAFT</span>;
      case 'CONFIRMED':
        return <span className="badge badge-primary"><CheckCircle2 size={12} /> CONFIRMED</span>;
      case 'DISPATCHED':
        return <span className="badge badge-info"><Truck size={12} /> DISPATCHED</span>;
      case 'DELIVERED':
        return <span className="badge badge-success"><PackageCheck size={12} /> DELIVERED</span>;
      case 'CANCELLED':
        return <span className="badge badge-danger"><XCircle size={12} /> CANCELLED</span>;
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const prov = calculateProvisional(orderItems);
  const editProv = calculateProvisional(editItems);

  return (
    <div className="page-container">
      {/* Orders Filter Toolbar */}
      <div className="toolbar-card">
        <div className="toolbar-row flex-between">
          <div className="flex gap-3 items-center flex-wrap">
            <div className="select-wrap">
              <span className="text-xs text-muted font-medium mr-1">Status:</span>
              <select
                className="input select-input"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">DRAFT</option>
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="DISPATCHED">DISPATCHED</option>
                <option value="DELIVERED">DELIVERED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>

            <div className="select-wrap">
              <span className="text-xs text-muted font-medium mr-1">Dealer:</span>
              <select
                className="input select-input"
                value={dealerFilter}
                onChange={(e) => {
                  setDealerFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Dealers</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.dealer_code})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-icon"
              title="Refresh orders"
              onClick={loadOrders}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>

          <div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsCreateOpen(true)}
            >
              <PlusCircle size={16} />
              <span>Create Draft Order</span>
            </button>
          </div>
        </div>

        <div className="toolbar-stats-row">
          <span className="results-count-text">
            Showing {orders.length} of {totalCount} total orders
          </span>
          {(statusFilter !== 'ALL' || dealerFilter) && (
            <button
              type="button"
              className="btn-link text-xs text-blue"
              onClick={() => {
                setStatusFilter('ALL');
                setDealerFilter('');
                setPage(1);
              }}
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertTriangle size={18} />
          <div>{error}</div>
        </div>
      )}

      {/* Orders Table */}
      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="table-loading">Loading order records...</div>
          ) : orders.length === 0 ? (
            <div className="empty-state">
              <ShoppingCart size={36} className="empty-state-icon" />
              <p className="empty-state-title">No orders found</p>
              <p className="empty-state-text">Click "Create Draft Order" to start a new purchase order.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order Number</th>
                    <th>Dealer Account</th>
                    <th>Status</th>
                    <th>Items</th>
                    <th className="text-right">Subtotal</th>
                    <th className="text-right">Tax (18%)</th>
                    <th className="text-right">Grand Total</th>
                    <th>Created Date</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr
                      key={o.order_number}
                      className="hover-row cursor-pointer"
                      onClick={() => setSelectedOrder(o)}
                    >
                      <td className="font-mono font-medium text-sm text-blue">{o.order_number}</td>
                      <td>
                        <div className="font-medium text-sm">{getDealerName(o.dealer_id)}</div>
                      </td>
                      <td>{getStatusBadge(o.status)}</td>
                      <td className="text-sm">
                        <span className="badge badge-secondary">
                          {o.items?.length || 0} line{o.items?.length === 1 ? '' : 's'}
                        </span>
                      </td>
                      <td className="text-right text-muted text-sm">₹{o.subtotal}</td>
                      <td className="text-right text-muted text-sm">₹{o.tax_total}</td>
                      <td className="text-right font-bold text-slate-900">₹{o.grand_total}</td>
                      <td className="text-sm text-muted">
                        {new Date(o.created_at).toLocaleDateString()}
                      </td>
                      <td className="text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => setSelectedOrder(o)}
                        >
                          <Eye size={13} />
                          <span>Details</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="pagination-bar">
            <span className="text-sm text-muted">
              Page {page} of {totalPages}
            </span>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1 || loading}
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page >= totalPages || loading}
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE DRAFT ORDER MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Draft Order"
        subtitle="Generates an atomic ORD-YYYYMMDD-NNNN order. Prices and 18% GST calculated by backend."
        maxWidth="lg"
        footer={
          <div className="modal-footer-between">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsCreateOpen(false)}
              disabled={createSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-order-form"
              className="btn btn-primary"
              disabled={createSubmitting}
            >
              {createSubmitting ? 'Submitting to Backend...' : 'Submit Draft Order'}
            </button>
          </div>
        }
      >
        <form id="create-order-form" onSubmit={handleCreateOrder} className="space-y-4">
          <div className="form-group">
            <label className="form-label">
              Select Purchasing Dealer <span className="text-danger">*</span>
            </label>
            <select
              className="input select-input"
              value={selectedDealerId}
              onChange={(e) =>
                setSelectedDealerId(e.target.value === '' ? '' : Number(e.target.value))
              }
              required
            >
              <option value="">-- Choose Authorized Dealer --</option>
              {dealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.dealer_code}) — {d.city}
                </option>
              ))}
            </select>
          </div>

          <div className="order-items-section">
            <div className="flex-between mb-2">
              <label className="form-label mb-0">
                Order Items <span className="text-danger">*</span>
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setOrderItems([...orderItems, { sku: '', quantity: 1 }])}
              >
                <PlusCircle size={13} />
                <span>Add Item Line</span>
              </button>
            </div>

            <div className="order-items-table-wrap">
              <table className="table text-sm">
                <thead>
                  <tr>
                    <th style={{ width: '50%' }}>Product SKU & Name</th>
                    <th style={{ width: '20%' }}>Unit Price</th>
                    <th style={{ width: '20%' }}>Qty</th>
                    <th style={{ width: '10%' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item, idx) => {
                    const prod = findProduct(item.sku);
                    return (
                      <tr key={idx}>
                        <td>
                          <select
                            className="input select-input text-sm py-1.5"
                            value={item.sku}
                            onChange={(e) => {
                              const next = [...orderItems];
                              next[idx].sku = e.target.value;
                              setOrderItems(next);
                            }}
                            required
                          >
                            <option value="">-- Select Product --</option>
                            {products.map((p) => (
                              <option key={p.sku} value={p.sku}>
                                [{p.sku}] {p.name} ({p.stock} in stock)
                              </option>
                            ))}
                          </select>
                          {prod && (
                            <div className="text-xs text-muted mt-1 flex gap-2">
                              <span>Stock: {prod.stock} units</span>
                              <span>•</span>
                              <span>{prod.vehicle_fitment}</span>
                            </div>
                          )}
                        </td>
                        <td className="text-sm font-medium">
                          {prod ? `₹${prod.price}` : '—'}
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            className="input py-1 text-sm text-center"
                            value={item.quantity}
                            onChange={(e) => {
                              const next = [...orderItems];
                              next[idx].quantity = Math.max(1, parseInt(e.target.value || '1', 10));
                              setOrderItems(next);
                            }}
                            required
                          />
                        </td>
                        <td className="text-center">
                          {orderItems.length > 1 && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs text-danger"
                              onClick={() => {
                                setOrderItems(orderItems.filter((_, i) => i !== idx));
                              }}
                              title="Remove item"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Provisional Totals Preview */}
            <div className="provisional-summary-box">
              <div className="text-xs text-muted mb-1 flex items-center gap-1 font-medium">
                <FileText size={13} />
                <span>Provisional Calculation Preview (GST 18%):</span>
              </div>
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-slate-600">Provisional Subtotal:</span>
                <span className="font-medium">₹{prov.subtotal}</span>
              </div>
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-slate-600">Provisional GST (18%):</span>
                <span className="font-medium">₹{prov.tax}</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-1 border-t border-slate-200 mt-1">
                <span className="text-slate-800">Provisional Total:</span>
                <span className="text-blue">₹{prov.grand}</span>
              </div>
              <div className="text-xs text-muted mt-2 italic">
                * Note: Final invoice totals and line tax rounding are strictly verified and locked by the Django backend upon submission.
              </div>
            </div>
          </div>

          {createError && (
            <div className="alert alert-danger text-sm">
              <AlertTriangle size={16} />
              <div>{createError}</div>
            </div>
          )}
        </form>
      </Modal>

      {/* EDIT DRAFT ORDER MODAL */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title={`Edit Draft Items — ${editOrderNumber}`}
        subtitle="Replaces all line items for this DRAFT order (PUT /api/orders/{order_number}/)."
        maxWidth="lg"
        footer={
          <div className="modal-footer-between">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsEditOpen(false)}
              disabled={editSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-order-form"
              className="btn btn-primary"
              disabled={editSubmitting}
            >
              {editSubmitting ? 'Updating...' : 'Save Updated Items'}
            </button>
          </div>
        }
      >
        <form id="edit-order-form" onSubmit={handleEditSubmit} className="space-y-4">
          <div className="flex-between mb-2">
            <label className="form-label mb-0">Replace Items List</label>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => setEditItems([...editItems, { sku: '', quantity: 1 }])}
            >
              <PlusCircle size={13} />
              <span>Add Line</span>
            </button>
          </div>

          <div className="order-items-table-wrap">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th style={{ width: '50%' }}>Product</th>
                  <th style={{ width: '20%' }}>Unit Price</th>
                  <th style={{ width: '20%' }}>Qty</th>
                  <th style={{ width: '10%' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {editItems.map((item, idx) => {
                  const prod = findProduct(item.sku);
                  return (
                    <tr key={idx}>
                      <td>
                        <select
                          className="input select-input text-sm py-1.5"
                          value={item.sku}
                          onChange={(e) => {
                            const next = [...editItems];
                            next[idx].sku = e.target.value;
                            setEditItems(next);
                          }}
                          required
                        >
                          <option value="">-- Select Product --</option>
                          {products.map((p) => (
                            <option key={p.sku} value={p.sku}>
                              [{p.sku}] {p.name} ({p.stock} available)
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="font-medium">{prod ? `₹${prod.price}` : '—'}</td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="input py-1 text-sm text-center"
                          value={item.quantity}
                          onChange={(e) => {
                            const next = [...editItems];
                            next[idx].quantity = Math.max(1, parseInt(e.target.value || '1', 10));
                            setEditItems(next);
                          }}
                          required
                        />
                      </td>
                      <td className="text-center">
                        {editItems.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs text-danger"
                            onClick={() => {
                              setEditItems(editItems.filter((_, i) => i !== idx));
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="provisional-summary-box">
            <div className="flex justify-between text-sm py-0.5">
              <span>Updated Subtotal:</span>
              <span className="font-medium">₹{editProv.subtotal}</span>
            </div>
            <div className="flex justify-between text-sm py-0.5">
              <span>Updated Tax (18%):</span>
              <span className="font-medium">₹{editProv.tax}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-1 border-t border-slate-200 mt-1">
              <span>Updated Total:</span>
              <span className="text-blue">₹{editProv.grand}</span>
            </div>
          </div>

          {editError && (
            <div className="alert alert-danger text-sm">
              <AlertTriangle size={16} />
              <div>{editError}</div>
            </div>
          )}
        </form>
      </Modal>

      {/* ORDER DETAILS & LIFECYCLE MODAL */}
      {selectedOrder && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedOrder(null)}
          title={`Order: ${selectedOrder.order_number}`}
          subtitle={`Placed by ${getDealerName(selectedOrder.dealer_id)} • ${new Date(
            selectedOrder.created_at
          ).toLocaleString()}`}
          maxWidth="2xl"
          footer={
            <div className="order-details-modal-footer">
              <div className="status-lifecycle-actions">
                {/* Permitted Actions based on API Contract */}
                {selectedOrder.status === 'DRAFT' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => triggerConfirmOrder(selectedOrder)}
                    >
                      <CheckCircle2 size={15} />
                      <span>Confirm Order (Lock Stock)</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleOpenEditDraft(selectedOrder)}
                    >
                      <Edit2 size={15} />
                      <span>Edit Items</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => triggerCancelOrder(selectedOrder)}
                    >
                      <XCircle size={15} />
                      <span>Cancel Order</span>
                    </button>
                  </>
                )}

                {selectedOrder.status === 'CONFIRMED' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-info"
                      onClick={() => triggerDispatchOrder(selectedOrder)}
                    >
                      <Truck size={15} />
                      <span>Dispatch Order</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => triggerCancelOrder(selectedOrder)}
                    >
                      <XCircle size={15} />
                      <span>Cancel & Restore Stock</span>
                    </button>
                  </>
                )}

                {selectedOrder.status === 'DISPATCHED' && (
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => triggerDeliverOrder(selectedOrder)}
                  >
                    <PackageCheck size={15} />
                    <span>Mark as Delivered</span>
                  </button>
                )}

                {(selectedOrder.status === 'DELIVERED' ||
                  selectedOrder.status === 'CANCELLED') && (
                  <span className="text-sm text-muted italic">
                    Final status reached ({selectedOrder.status}). No further state transitions allowed.
                  </span>
                )}
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedOrder(null)}
              >
                Close
              </button>
            </div>
          }
        >
          {loadingDetails ? (
            <div className="py-8 text-center text-muted">Refreshing details...</div>
          ) : (
            <div className="space-y-6">
              {/* Order Status Banner */}
              <div className="order-banner flex-between p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-muted uppercase font-semibold">Current State:</div>
                  <div>{getStatusBadge(selectedOrder.status)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted">Grand Total (Inc. 18% GST)</div>
                  <div className="text-xl font-extrabold text-blue">₹{selectedOrder.grand_total}</div>
                </div>
              </div>

              {/* Order Items Table */}
              <div>
                <h4 className="font-semibold text-sm text-slate-800 mb-2">Ordered Parts & Line Taxes</h4>
                <div className="table-responsive border border-slate-200 rounded">
                  <table className="table text-sm">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Product Name</th>
                        <th className="text-center">Qty</th>
                        <th className="text-right">Unit Price</th>
                        <th className="text-right">Subtotal</th>
                        <th className="text-right">GST (18%)</th>
                        <th className="text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items?.map((item, idx) => (
                        <tr key={idx}>
                          <td className="font-mono text-xs text-blue">{item.sku}</td>
                          <td className="font-medium text-xs">{item.name}</td>
                          <td className="text-center font-bold">{item.quantity}</td>
                          <td className="text-right">₹{item.unit_price}</td>
                          <td className="text-right">₹{item.line_subtotal}</td>
                          <td className="text-right text-muted">₹{item.line_tax}</td>
                          <td className="text-right font-semibold">₹{item.line_total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Breakdown Card */}
              <div className="financial-totals-card">
                <div className="totals-row">
                  <span className="text-muted">Subtotal:</span>
                  <span className="font-semibold">₹{selectedOrder.subtotal}</span>
                </div>
                <div className="totals-row">
                  <span className="text-muted">Tax Total (18% GST ROUND_HALF_UP):</span>
                  <span className="font-semibold">₹{selectedOrder.tax_total}</span>
                </div>
                <div className="totals-row grand-total-row">
                  <span className="text-base font-bold text-slate-900">Grand Total:</span>
                  <span className="text-lg font-extrabold text-blue">₹{selectedOrder.grand_total}</span>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Confirmation Dialog for Destructive / State Transition Actions */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={executeConfirmAction}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        isLoading={actionLoading}
      />
    </div>
  );
};
