import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Product, Order } from '../types';
import {
  Package,
  Users,
  ShoppingCart,
  AlertTriangle,
  ArrowRight,
  PlusCircle,
  Boxes,
  RefreshCw,
  Clock,
  CheckCircle2,
  Truck,
  XCircle
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [totalProducts, setTotalProducts] = useState<number | null>(null);
  const [totalDealers, setTotalDealers] = useState<number | null>(null);
  const [totalOrders, setTotalOrders] = useState<number | null>(null);

  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsRes, dealersRes, ordersRes] = await Promise.all([
        api.getProducts({ page_size: 25 }),
        api.getDealers({ page_size: 1 }),
        api.getOrders({ page_size: 5 }),
      ]);

      setTotalProducts(productsRes.count);
      setTotalDealers(dealersRes.count);
      setTotalOrders(ordersRes.count);
      setRecentOrders(ordersRes.results || []);

      // Identify low stock items (e.g. stock <= 15) from the catalogue feed
      const lowStock = (productsRes.results || []).filter((p) => p.stock <= 15);
      setLowStockProducts(lowStock.slice(0, 5));
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard operational data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'DRAFT':
        return <span className="badge badge-warning"><Clock size={12} /> DRAFT</span>;
      case 'CONFIRMED':
        return <span className="badge badge-primary"><CheckCircle2 size={12} /> CONFIRMED</span>;
      case 'DISPATCHED':
        return <span className="badge badge-info"><Truck size={12} /> DISPATCHED</span>;
      case 'DELIVERED':
        return <span className="badge badge-success"><CheckCircle2 size={12} /> DELIVERED</span>;
      case 'CANCELLED':
        return <span className="badge badge-danger"><XCircle size={12} /> CANCELLED</span>;
    }
  };

  return (
    <div className="page-container">
      {/* Quick Actions Row */}
      <div className="dashboard-quick-actions-bar">
        <span className="quick-actions-label">Quick Actions:</span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => navigate('/orders', { state: { openCreate: true } })}
        >
          <PlusCircle size={15} />
          <span>New Order</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => navigate('/inventory')}
        >
          <Boxes size={15} />
          <span>Adjust Stock</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => navigate('/products')}
        >
          <Package size={15} />
          <span>Catalogue Search</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => navigate('/supplier-sync')}
        >
          <RefreshCw size={15} />
          <span>Supplier Sync</span>
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon"
          title="Refresh Data"
          onClick={loadDashboardData}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertTriangle size={18} />
          <div>
            <strong>Error connecting to API:</strong> {error}
          </div>
        </div>
      )}

      {/* Operational Metric Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon-wrap metric-icon-blue">
            <Package size={22} />
          </div>
          <div className="metric-data">
            <span className="metric-label">Catalogue Products</span>
            <span className="metric-value">
              {loading ? '...' : totalProducts !== null ? totalProducts.toLocaleString() : 'N/A'}
            </span>
            <span className="metric-sub">Seeded 2-wheeler SKUs</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon-wrap metric-icon-emerald">
            <Users size={22} />
          </div>
          <div className="metric-data">
            <span className="metric-label">Registered Dealers</span>
            <span className="metric-value">
              {loading ? '...' : totalDealers !== null ? totalDealers.toLocaleString() : 'N/A'}
            </span>
            <span className="metric-sub">Active distribution accounts</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon-wrap metric-icon-purple">
            <ShoppingCart size={22} />
          </div>
          <div className="metric-data">
            <span className="metric-label">Total Orders</span>
            <span className="metric-value">
              {loading ? '...' : totalOrders !== null ? totalOrders.toLocaleString() : '0'}
            </span>
            <span className="metric-sub">Across all lifecycle states</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon-wrap metric-icon-amber">
            <AlertTriangle size={22} />
          </div>
          <div className="metric-data">
            <span className="metric-label">Low Stock Alerts</span>
            <span className="metric-value">
              {loading ? '...' : lowStockProducts.length}
            </span>
            <span className="metric-sub">SKUs with ≤ 15 units available</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Recent Orders & Low Stock Table */}
      <div className="dashboard-grid-2col">
        {/* Recent Orders Card */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Recent Orders</h2>
              <p className="card-subtitle">Latest order activity and state transitions</p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/orders')}
            >
              <span>View All</span>
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="card-body p-0">
            {loading ? (
              <div className="table-loading">Loading recent orders...</div>
            ) : recentOrders.length === 0 ? (
              <div className="empty-state">
                <ShoppingCart size={32} className="empty-state-icon" />
                <p className="empty-state-text">No orders placed yet.</p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate('/orders', { state: { openCreate: true } })}
                >
                  Create First Order
                </button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Order #</th>
                      <th>Dealer ID</th>
                      <th>Status</th>
                      <th className="text-right">Grand Total</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr
                        key={order.order_number}
                        className="clickable-row"
                        onClick={() => navigate('/orders', { state: { selectedOrder: order.order_number } })}
                      >
                        <td className="font-mono font-medium text-blue">{order.order_number}</td>
                        <td>Dealer #{order.dealer_id}</td>
                        <td>{getStatusBadge(order.status)}</td>
                        <td className="text-right font-medium">₹{order.grand_total}</td>
                        <td className="text-muted text-sm">
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Low Stock Alerts Card */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Low Stock Watchlist</h2>
              <p className="card-subtitle">Fast-moving parts requiring inventory replenishment</p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/inventory')}
            >
              <span>Manage Inventory</span>
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="card-body p-0">
            {loading ? (
              <div className="table-loading">Checking inventory levels...</div>
            ) : lowStockProducts.length === 0 ? (
              <div className="empty-state">
                <CheckCircle2 size={32} className="empty-state-icon text-emerald" />
                <p className="empty-state-text">All checked catalogue items have sufficient stock levels.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Product</th>
                      <th>Category</th>
                      <th className="text-right">Available Stock</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockProducts.map((p) => (
                      <tr key={p.sku}>
                        <td className="font-mono text-sm">{p.sku}</td>
                        <td>
                          <div className="font-medium text-sm">{p.name}</div>
                          <div className="text-muted text-xs">{p.vehicle_fitment}</div>
                        </td>
                        <td><span className="badge badge-secondary">{p.category}</span></td>
                        <td className="text-right">
                          <span className={`badge ${p.stock === 0 ? 'badge-danger' : 'badge-warning'}`}>
                            {p.stock} units
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => navigate('/inventory', { state: { selectedSku: p.sku } })}
                          >
                            Update
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
