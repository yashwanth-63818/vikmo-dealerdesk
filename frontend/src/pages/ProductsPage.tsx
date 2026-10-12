import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import type { Product } from '../types';
import { Modal } from '../components/Modal';
import {
  Search,
  Filter,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Package,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

export const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Selected product for details modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProducts({
        search: debouncedSearch || undefined,
        category: category || undefined,
        vehicle: vehicle || undefined,
        page,
        page_size: pageSize,
      });
      setProducts(res.results || []);
      setTotalCount(res.count || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, category, vehicle, page]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const categories = [
    'All Categories',
    'Brakes',
    'Electrical',
    'Engine',
    'Suspension',
    'Filters',
    'Transmission',
    'Cables',
    'Body Parts',
    'Exhaust',
  ];

  return (
    <div className="page-container">
      {/* Search and Filters Toolbar */}
      <div className="toolbar-card">
        <div className="toolbar-row">
          <div className="search-input-wrap">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="input search-input"
              placeholder="Search by SKU, part name, or brand..."
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

          <div className="filter-group">
            <div className="select-wrap">
              <Filter size={15} className="select-icon" />
              <select
                className="input select-input"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value === 'All Categories' ? '' : e.target.value);
                  setPage(1);
                }}
              >
                {categories.map((c) => (
                  <option key={c} value={c === 'All Categories' ? '' : c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="search-input-wrap vehicle-input-wrap">
              <input
                type="text"
                className="input"
                placeholder="Filter by vehicle (e.g. Pulsar, Activa)..."
                value={vehicle}
                onChange={(e) => {
                  setVehicle(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-icon"
              title="Refresh catalogue"
              onClick={loadProducts}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        <div className="toolbar-stats-row">
          <span className="results-count-text">
            Showing {products.length} of {totalCount.toLocaleString()} products
          </span>
          {(search || category || vehicle) && (
            <button
              type="button"
              className="btn-link text-xs text-blue"
              onClick={() => {
                setSearch('');
                setCategory('');
                setVehicle('');
                setPage(1);
              }}
            >
              Clear all filters
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertCircle size={18} />
          <div>{error}</div>
        </div>
      )}

      {/* Products Table Card */}
      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="table-loading">Loading parts catalogue...</div>
          ) : products.length === 0 ? (
            <div className="empty-state">
              <Package size={36} className="empty-state-icon" />
              <p className="empty-state-title">No products found</p>
              <p className="empty-state-text">
                Try modifying your search query or removing the category/vehicle filter.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product Name</th>
                    <th>Category</th>
                    <th>Brand</th>
                    <th>Vehicle Fitment</th>
                    <th className="text-right">Price</th>
                    <th className="text-center">Stock</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.sku} className="hover-row">
                      <td className="font-mono font-medium text-sm text-blue">{p.sku}</td>
                      <td>
                        <div className="font-medium text-sm">{p.name}</div>
                        {p.description && (
                          <div className="text-muted text-xs truncate max-w-xs">{p.description}</div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-secondary">{p.category}</span>
                      </td>
                      <td className="text-sm font-medium">{p.brand}</td>
                      <td className="text-sm text-muted">{p.vehicle_fitment}</td>
                      <td className="text-right font-medium">₹{p.price}</td>
                      <td className="text-center">
                        <span
                          className={`badge ${
                            p.stock === 0
                              ? 'badge-danger'
                              : p.stock <= 15
                              ? 'badge-warning'
                              : 'badge-success'
                          }`}
                        >
                          {p.stock}
                        </span>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => setSelectedProduct(p)}
                          title="View Product Details"
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

      {/* Product Details Modal */}
      {selectedProduct && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedProduct(null)}
          title={selectedProduct.name}
          subtitle={`Catalogue SKU: ${selectedProduct.sku}`}
          maxWidth="md"
          footer={
            <div className="modal-footer-end">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedProduct(null)}
              >
                Close
              </button>
            </div>
          }
        >
          <div className="product-details-grid">
            <div className="detail-item">
              <span className="detail-label">Brand</span>
              <span className="detail-value flex items-center gap-1">
                <ShieldCheck size={16} className="text-blue" />
                {selectedProduct.brand}
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Category</span>
              <span className="detail-value">
                <span className="badge badge-secondary">{selectedProduct.category}</span>
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Vehicle Fitment</span>
              <span className="detail-value">{selectedProduct.vehicle_fitment || 'Universal'}</span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Catalogue Price</span>
              <span className="detail-value text-blue text-lg font-bold">
                ₹{selectedProduct.price}
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-label">Available Stock</span>
              <span className="detail-value">
                <span
                  className={`badge ${
                    selectedProduct.stock === 0
                      ? 'badge-danger'
                      : selectedProduct.stock <= 15
                      ? 'badge-warning'
                      : 'badge-success'
                  }`}
                >
                  {selectedProduct.stock} units available
                </span>
              </span>
            </div>

            <div className="detail-item col-span-2">
              <span className="detail-label">Product Description</span>
              <p className="detail-value text-sm text-slate-700 bg-slate-50 p-3 rounded border border-slate-200">
                {selectedProduct.description || 'No detailed specifications provided.'}
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
