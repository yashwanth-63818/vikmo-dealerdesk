import React, { useEffect, useState, useCallback } from 'react';
import { api, APIClientError } from '../api/client';
import type { Dealer, Order } from '../types';
import { Modal } from '../components/Modal';
import { useToast } from '../context/ToastContext';
import {
  Users,
  PlusCircle,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  AlertCircle,
  ShoppingCart
} from 'lucide-react';

export const DealersPage: React.FC = () => {
  const toast = useToast();

  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 12;

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
  const [dealerOrders, setDealerOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    dealer_code: '',
    name: '',
    city: '',
    phone: '',
    email: '',
    gstin: '',
    credit_limit: '100000.00',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const loadDealers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDealers({ page, page_size: pageSize });
      setDealers(res.results || []);
      setTotalCount(res.count || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dealers');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadDealers();
  }, [loadDealers]);

  const handleOpenDealerDetails = async (dealer: Dealer) => {
    setSelectedDealer(dealer);
    setLoadingOrders(true);
    try {
      const res = await api.getOrders({ dealer_id: dealer.id, page_size: 5 });
      setDealerOrders(res.results || []);
    } catch {
      setDealerOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!formData.dealer_code.trim()) {
      errors.dealer_code = 'Dealer code is required (e.g. DLR-026)';
    }
    if (!formData.name.trim()) {
      errors.name = 'Dealer business name is required';
    }
    if (formData.credit_limit && isNaN(Number(formData.credit_limit))) {
      errors.credit_limit = 'Credit limit must be a valid numeric amount';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    setFormErrors({});
    try {
      const created = await api.createDealer({
        dealer_code: formData.dealer_code.trim(),
        name: formData.name.trim(),
        city: formData.city.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        email: formData.email.trim() || undefined,
        gstin: formData.gstin.trim() || undefined,
        credit_limit: formData.credit_limit || undefined,
      });

      toast.success(`Dealer ${created.name} (${created.dealer_code}) created successfully.`);
      setIsCreateOpen(false);
      setFormData({
        dealer_code: '',
        name: '',
        city: '',
        phone: '',
        email: '',
        gstin: '',
        credit_limit: '100000.00',
      });
      loadDealers();
    } catch (err: any) {
      if (err instanceof APIClientError) {
        if (err.code === 'DUPLICATE') {
          setFormErrors({ dealer_code: 'A dealer with this code already exists.' });
          toast.error('Dealer code already exists. Please choose a unique code.');
        } else {
          toast.error(err.message, 'Failed to create dealer');
        }
      } else {
        toast.error(err?.message || 'Unexpected error occurred.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="page-container">
      {/* Header Toolbar */}
      <div className="toolbar-card">
        <div className="toolbar-row flex-between">
          <div>
            <span className="results-count-text">
              Showing {dealers.length} of {totalCount} registered dealers
            </span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              title="Refresh dealers"
              onClick={loadDealers}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsCreateOpen(true)}
            >
              <PlusCircle size={16} />
              <span>Add Authorized Dealer</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertCircle size={18} />
          <div>{error}</div>
        </div>
      )}

      {/* Dealers Table Card */}
      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="table-loading">Loading authorized dealers...</div>
          ) : dealers.length === 0 ? (
            <div className="empty-state">
              <Users size={36} className="empty-state-icon" />
              <p className="empty-state-title">No dealers found</p>
              <p className="empty-state-text">Click "Add Authorized Dealer" to register a partner.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Code</th>
                    <th>Dealer Name</th>
                    <th>City</th>
                    <th>Contact</th>
                    <th className="text-right">Credit Limit</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dealers.map((d) => (
                    <tr key={d.id} className="hover-row">
                      <td className="text-muted text-sm">#{d.id}</td>
                      <td className="font-mono font-medium text-sm text-blue">{d.dealer_code}</td>
                      <td>
                        <div className="font-medium text-sm">{d.name}</div>
                        {d.gstin && <div className="text-muted text-xs">GST: {d.gstin}</div>}
                      </td>
                      <td className="text-sm">
                        <span className="flex items-center gap-1 text-slate-700">
                          <MapPin size={13} className="text-muted" />
                          {d.city || 'N/A'}
                        </span>
                      </td>
                      <td className="text-sm">
                        <div className="flex flex-col gap-0.5">
                          {d.phone && (
                            <span className="text-xs text-slate-700 flex items-center gap-1">
                              <Phone size={11} className="text-muted" /> {d.phone}
                            </span>
                          )}
                          {d.email && (
                            <span className="text-xs text-muted flex items-center gap-1">
                              <Mail size={11} className="text-muted" /> {d.email}
                            </span>
                          )}
                          {!d.phone && !d.email && <span className="text-xs text-muted">—</span>}
                        </div>
                      </td>
                      <td className="text-right font-medium">₹{d.credit_limit}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => handleOpenDealerDetails(d)}
                        >
                          <Eye size={13} />
                          <span>View</span>
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

      {/* Create Dealer Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Add Authorized Dealer"
        subtitle="Register a new distribution account in DealerDesk"
        maxWidth="md"
        footer={
          <div className="modal-footer-between">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsCreateOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-dealer-form"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Register Dealer'}
            </button>
          </div>
        }
      >
        <form id="create-dealer-form" onSubmit={handleCreateSubmit} className="form-grid">
          <div className="form-group">
            <label className="form-label">
              Dealer Code <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className={`input ${formErrors.dealer_code ? 'input-error' : ''}`}
              placeholder="e.g. DLR-026"
              value={formData.dealer_code}
              onChange={(e) => setFormData({ ...formData, dealer_code: e.target.value })}
            />
            {formErrors.dealer_code && (
              <span className="form-error-text">{formErrors.dealer_code}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">
              Business Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className={`input ${formErrors.name ? 'input-error' : ''}`}
              placeholder="e.g. Apex Auto Spares"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            {formErrors.name && (
              <span className="form-error-text">{formErrors.name}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">City</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Chennai, Bangalore"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Credit Limit (₹)</label>
            <input
              type="text"
              className={`input ${formErrors.credit_limit ? 'input-error' : ''}`}
              placeholder="100000.00"
              value={formData.credit_limit}
              onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
            />
            {formErrors.credit_limit && (
              <span className="form-error-text">{formErrors.credit_limit}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input
              type="text"
              className="input"
              placeholder="+91 98765 43210"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="input"
              placeholder="dealer@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="form-group col-span-2">
            <label className="form-label">GSTIN</label>
            <input
              type="text"
              className="input"
              placeholder="29AAAAA0000A1Z5"
              value={formData.gstin}
              onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
            />
          </div>
        </form>
      </Modal>

      {/* Dealer Details Modal */}
      {selectedDealer && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedDealer(null)}
          title={selectedDealer.name}
          subtitle={`Dealer Code: ${selectedDealer.dealer_code} • ID: #${selectedDealer.id}`}
          maxWidth="lg"
          footer={
            <div className="modal-footer-end">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedDealer(null)}
              >
                Close
              </button>
            </div>
          }
        >
          <div className="product-details-grid mb-6">
            <div className="detail-item">
              <span className="detail-label">Location</span>
              <span className="detail-value flex items-center gap-1">
                <MapPin size={15} className="text-blue" />
                {selectedDealer.city || 'Not specified'}
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Credit Limit</span>
              <span className="detail-value text-emerald font-bold">
                ₹{selectedDealer.credit_limit}
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Phone</span>
              <span className="detail-value">{selectedDealer.phone || '—'}</span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Email</span>
              <span className="detail-value">{selectedDealer.email || '—'}</span>
            </div>

            <div className="detail-item col-span-2">
              <span className="detail-label">GSTIN</span>
              <span className="detail-value font-mono text-sm">
                {selectedDealer.gstin || 'Not registered'}
              </span>
            </div>
          </div>

          {/* Orders by this dealer */}
          <div>
            <h4 className="font-semibold text-sm text-slate-800 mb-2 flex items-center gap-1.5">
              <ShoppingCart size={16} className="text-blue" />
              Recent Orders Placed by {selectedDealer.name}
            </h4>
            {loadingOrders ? (
              <div className="text-sm text-muted py-3">Loading order history...</div>
            ) : dealerOrders.length === 0 ? (
              <div className="text-sm text-muted py-3 bg-slate-50 rounded border border-slate-200 px-4">
                No orders placed by this dealer yet.
              </div>
            ) : (
              <table className="table text-sm">
                <thead>
                  <tr>
                    <th>Order Number</th>
                    <th>Status</th>
                    <th className="text-right">Grand Total</th>
                    <th>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {dealerOrders.map((o) => (
                    <tr key={o.order_number}>
                      <td className="font-mono text-blue">{o.order_number}</td>
                      <td><span className="badge badge-secondary">{o.status}</span></td>
                      <td className="text-right font-medium">₹{o.grand_total}</td>
                      <td className="text-muted text-xs">
                        {new Date(o.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
