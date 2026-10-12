import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api/client';
import type { Product } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../context/ToastContext';
import {
  Boxes,
  Search,
  RefreshCw,
  Edit3,
  AlertTriangle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export const InventoryPage: React.FC = () => {
  const toast = useToast();
  const location = useLocation();

  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Selected for edit
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [newQuantity, setNewQuantity] = useState<number | ''>('');
  const [updateReason, setUpdateReason] = useState('Physical audit count');
  const [formError, setFormError] = useState<string | null>(null);

  // Confirmation dialog
  const [showConfirm, setShowConfirm] = useState(false);
  const [updating, setUpdating] = useState(false);

  // If navigated with state.selectedSku
  useEffect(() => {
    if (location.state && (location.state as any).selectedSku) {
      setSearch((location.state as any).selectedSku);
    }
  }, [location.state]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProducts({
        search: debouncedSearch || undefined,
        page,
        page_size: pageSize,
      });
      let results = res.results || [];
      if (filterLowStock) {
        results = results.filter((p) => p.stock <= 15);
      }
      setProducts(results);
      setTotalCount(res.count || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, filterLowStock]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const handleOpenEdit = (p: Product) => {
    setSelectedProduct(p);
    setNewQuantity(p.stock);
    setUpdateReason('Physical stock count correction');
    setFormError(null);
  };

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newQuantity === '' || isNaN(Number(newQuantity)) || Number(newQuantity) < 0) {
      setFormError('Quantity must be an integer greater than or equal to 0.');
      return;
    }
    if (!updateReason.trim()) {
      setFormError('Please specify a reason for this inventory adjustment.');
      return;
    }
    setFormError(null);
    setShowConfirm(true);
  };

  const handleConfirmUpdate = async () => {
    if (!selectedProduct || newQuantity === '') return;
    setUpdating(true);
    try {
      const res = await api.updateInventory(selectedProduct.sku, {
        quantity: Number(newQuantity),
        reason: updateReason.trim(),
      });

      toast.success(
        `SKU ${res.sku} stock updated from ${selectedProduct.stock} to ${res.quantity} units.`
      );
      setShowConfirm(false);
      setSelectedProduct(null);
      // Immediate refresh
      await loadInventory();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update inventory', 'Stock Adjustment Failed');
      setShowConfirm(false);
    } finally {
      setUpdating(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="page-container">
      {/* Toolbar */}
      <div className="toolbar-card">
        <div className="toolbar-row">
          <div className="search-input-wrap">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="input search-input"
              placeholder="Search parts by SKU, description, or brand..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="input-clear-btn"
                onClick={() => setSearch('')}
              >
                ×
              </button>
            )}
          </div>

          <div className="flex gap-2 items-center">
            <label className="checkbox-label cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterLowStock}
                onChange={(e) => {
                  setFilterLowStock(e.target.checked);
                  setPage(1);
                }}
              />
              <span className="text-sm font-medium text-slate-700">Show Low Stock Only (≤ 15)</span>
            </label>

            <button
              type="button"
              className="btn btn-secondary btn-icon ml-2"
              title="Refresh inventory"
              onClick={loadInventory}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        <div className="toolbar-stats-row">
          <span className="results-count-text">
            Showing {products.length} of {totalCount.toLocaleString()} tracked inventory items
          </span>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertTriangle size={18} />
          <div>{error}</div>
        </div>
      )}

      {/* Inventory Table */}
      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="table-loading">Loading inventory data...</div>
          ) : products.length === 0 ? (
            <div className="empty-state">
              <Boxes size={36} className="empty-state-icon" />
              <p className="empty-state-title">No matching inventory items</p>
              <p className="empty-state-text">
                Check your search term or uncheck the low stock filter.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product & Vehicle Fitment</th>
                    <th>Category</th>
                    <th className="text-right">Unit Price</th>
                    <th className="text-center">Current Stock</th>
                    <th>Stock Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.sku} className="hover-row">
                      <td className="font-mono font-medium text-sm text-blue">{p.sku}</td>
                      <td>
                        <div className="font-medium text-sm">{p.name}</div>
                        <div className="text-muted text-xs">{p.vehicle_fitment}</div>
                      </td>
                      <td>
                        <span className="badge badge-secondary">{p.category}</span>
                      </td>
                      <td className="text-right font-medium">₹{p.price}</td>
                      <td className="text-center font-bold text-base">
                        {p.stock}
                      </td>
                      <td>
                        {p.stock === 0 ? (
                          <span className="badge badge-danger">OUT OF STOCK</span>
                        ) : p.stock <= 15 ? (
                          <span className="badge badge-warning">LOW STOCK</span>
                        ) : (
                          <span className="badge badge-success">HEALTHY</span>
                        )}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn btn-primary btn-xs"
                          onClick={() => handleOpenEdit(p)}
                        >
                          <Edit3 size={13} />
                          <span>Adjust Stock</span>
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

      {/* Adjust Stock Modal */}
      {selectedProduct && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedProduct(null)}
          title="Adjust Warehouse Stock"
          subtitle={`Updating stock for SKU: ${selectedProduct.sku}`}
          maxWidth="sm"
          footer={
            <div className="modal-footer-between">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedProduct(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="adjust-stock-form"
                className="btn btn-primary"
              >
                Review & Confirm
              </button>
            </div>
          }
        >
          <form id="adjust-stock-form" onSubmit={handlePreSubmit} className="space-y-4">
            <div className="bg-slate-50 p-3 rounded border border-slate-200 mb-3">
              <div className="text-xs text-muted mb-1">Target Product</div>
              <div className="font-semibold text-sm text-slate-800">{selectedProduct.name}</div>
              <div className="flex justify-between items-center mt-2 text-sm">
                <span className="text-muted">Current Available:</span>
                <span className="font-bold text-slate-800">{selectedProduct.stock} units</span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                New Available Quantity <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                className={`input ${formError ? 'input-error' : ''}`}
                value={newQuantity}
                onChange={(e) =>
                  setNewQuantity(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                }
                autoFocus
              />
              <span className="text-xs text-muted">
                Must be an integer ≥ 0. Sets exact available stock count.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">
                Adjustment Reason <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Physical audit count correction, Damaged batch write-off"
                value={updateReason}
                onChange={(e) => setUpdateReason(e.target.value)}
              />
            </div>

            {formError && (
              <div className="form-error-banner text-xs text-danger flex items-center gap-1">
                <AlertTriangle size={14} />
                <span>{formError}</span>
              </div>
            )}
          </form>
        </Modal>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirmUpdate}
        title="Confirm Inventory Adjustment"
        message={`Are you sure you want to update stock for SKU "${selectedProduct?.sku}" to ${newQuantity} units? Reason: "${updateReason}".`}
        confirmLabel="Apply Stock Update"
        variant="warning"
        isLoading={updating}
      />
    </div>
  );
};
