import React, { useState } from 'react';
import { api, APIClientError } from '../api/client';
import type { SupplierSyncResult } from '../types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../context/ToastContext';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  CloudLightning,
  AlertCircle
} from 'lucide-react';

export const SupplierSyncPage: React.FC = () => {
  const toast = useToast();

  const [syncing, setSyncing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [syncResult, setSyncResult] = useState<SupplierSyncResult | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStartSync = async () => {
    setShowConfirm(false);
    setSyncing(true);
    setError(null);
    try {
      const res = await api.syncSupplier();
      setSyncResult(res);
      setLastSyncTime(new Date().toLocaleTimeString());
      toast.success(
        `Supplier sync completed: ${res.created} created, ${res.updated} updated, ${res.unchanged} unchanged.`
      );
    } catch (err: any) {
      if (err instanceof APIClientError) {
        setError(`${err.code}: ${err.message}`);
        toast.error(err.message, 'Supplier Sync Failed');
      } else {
        const msg = err?.message || 'Network timeout or gateway error';
        setError(msg);
        toast.error(msg, 'Supplier Sync Failed');
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="page-container">
      {/* Intro Card */}
      <div className="card mb-6">
        <div className="card-body">
          <div className="flex-between flex-wrap gap-4">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-1">
                <CloudLightning size={20} className="text-blue" />
                <h2 className="card-title text-base">Upstream Catalogue Synchronization</h2>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Connects directly to the external manufacturer supplier API (via Django's secure backend worker).
                Pulls all paginated product records, resolves duplicate SKUs using latest timestamp, updates existing product details without touching local stock, and creates newly catalogued parts with initial stock 0.
              </p>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-1">
                  <Database size={13} className="text-emerald" />
                  PostgreSQL Atomic Guarantee (All-or-Nothing)
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={13} className="text-amber" />
                  Max 5 Retries on 429 Rate Limits / 5xx
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowConfirm(true)}
                disabled={syncing}
              >
                <RefreshCw size={16} className={syncing ? 'spin' : ''} />
                <span>{syncing ? 'Syncing Catalogue...' : 'Sync Supplier Now'}</span>
              </button>
              {lastSyncTime && (
                <span className="text-xs text-muted">Last sync session: {lastSyncTime}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* In-Flight Progress Alert */}
      {syncing && (
        <div className="sync-in-progress-card">
          <RefreshCw size={28} className="spin text-blue mb-2" />
          <h3 className="font-bold text-slate-800 text-base mb-1">
            Supplier Feed Sync in Progress...
          </h3>
          <p className="text-sm text-slate-600 max-w-md text-center">
            Django is iterating through supplier cursor pagination, handling rate limit backoffs (Retry-After), and preparing transactional database writes. Please do not navigate away or refresh.
          </p>
        </div>
      )}

      {/* Error Alert */}
      {error && !syncing && (
        <div className="alert alert-danger mb-6">
          <AlertCircle size={20} />
          <div>
            <strong>Supplier Sync Error:</strong> {error}
            <div className="text-xs mt-1 text-slate-700">
              The Django transaction guarantees zero database writes occurred. Existing catalogue and stock remain unchanged.
            </div>
          </div>
        </div>
      )}

      {/* Sync Results Card */}
      {syncResult && !syncing && (
        <div className="space-y-6">
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-icon-wrap metric-icon-emerald">
                <CheckCircle2 size={22} />
              </div>
              <div className="metric-data">
                <span className="metric-label">New SKUs Created</span>
                <span className="metric-value text-emerald font-extrabold">
                  {syncResult.created}
                </span>
                <span className="metric-sub">Added with stock: 0</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon-wrap metric-icon-blue">
                <RefreshCw size={22} />
              </div>
              <div className="metric-data">
                <span className="metric-label">Products Updated</span>
                <span className="metric-value text-blue font-extrabold">
                  {syncResult.updated}
                </span>
                <span className="metric-sub">Price / spec changes applied</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon-wrap metric-icon-purple">
                <Database size={22} />
              </div>
              <div className="metric-data">
                <span className="metric-label">Unchanged SKUs</span>
                <span className="metric-value text-purple font-extrabold">
                  {syncResult.unchanged}
                </span>
                <span className="metric-sub">Already in sync</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon-wrap metric-icon-amber">
                <AlertTriangle size={22} />
              </div>
              <div className="metric-data">
                <span className="metric-label">Rejected Feeds</span>
                <span className="metric-value text-amber font-extrabold">
                  {syncResult.rejected?.length || 0}
                </span>
                <span className="metric-sub">Skipped invalid items</span>
              </div>
            </div>
          </div>

          {/* Sync Metadata Details */}
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Synchronization Telemetry</h3>
                <p className="card-subtitle">API request efficiency and network diagnostics</p>
              </div>
              <span className="badge badge-success flex items-center gap-1">
                <CheckCircle2 size={13} /> Synchronized
              </span>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-slate-50 p-3 rounded border border-slate-200">
                  <span className="text-muted text-xs block mb-1">Cursor Pages Fetched</span>
                  <span className="font-bold text-slate-800 text-lg">
                    {syncResult.pages_fetched} pages
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded border border-slate-200">
                  <span className="text-muted text-xs block mb-1">Total HTTP Requests Made</span>
                  <span className="font-bold text-slate-800 text-lg">
                    {syncResult.requests_made} requests (inc. retries)
                  </span>
                </div>
              </div>

              {/* Rejected items list */}
              {syncResult.rejected && syncResult.rejected.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold text-sm text-slate-800 mb-2 flex items-center gap-1.5 text-amber">
                    <AlertTriangle size={15} />
                    Items Rejected from Feed ({syncResult.rejected.length})
                  </h4>
                  <div className="table-responsive border border-slate-200 rounded">
                    <table className="table text-sm">
                      <thead>
                        <tr>
                          <th>Supplier SKU</th>
                          <th>Rejection Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syncResult.rejected.map((rej, i) => (
                          <tr key={i}>
                            <td className="font-mono text-xs">{rej.supplier_sku || 'N/A'}</td>
                            <td className="text-danger text-xs font-medium">{rej.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog before Sync */}
      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleStartSync}
        title="Start Supplier Catalogue Sync?"
        message="This will connect to the external supplier API, fetch all pages, and atomically update catalogue records in PostgreSQL. Depending on feed length and rate limiting, this may take 10 to 45 seconds. Continue?"
        confirmLabel="Proceed with Sync"
        variant="primary"
      />
    </div>
  );
};
