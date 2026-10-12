import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { ShoppingCart, Server, RefreshCw } from 'lucide-react';

export const TopNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const checkHealth = async () => {
    setChecking(true);
    try {
      const res = await api.getHealth();
      setApiOnline(res.status === 'ok');
    } catch {
      setApiOnline(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const getPageInfo = () => {
    switch (location.pathname) {
      case '/':
        return { title: 'Dashboard Overview', desc: 'Real-time parts inventory, orders, and operational metrics' };
      case '/products':
        return { title: 'Parts Catalogue', desc: 'Browse two-wheeler replacement products, specifications, and prices' };
      case '/dealers':
        return { title: 'Authorized Dealers', desc: 'Manage distribution partners, credit lines, and customer records' };
      case '/inventory':
        return { title: 'Inventory Control', desc: 'Real-time stock monitoring and warehouse quantity adjustments' };
      case '/orders':
        return { title: 'Orders & Fulfillment', desc: 'Create draft orders and manage dispatch & delivery lifecycle' };
      case '/supplier-sync':
        return { title: 'Supplier Synchronization', desc: 'Synchronize external manufacturer catalogue feeds atomically' };
      default:
        return { title: 'DealerDesk', desc: 'Automotive Distribution Platform' };
    }
  };

  const pageInfo = getPageInfo();

  return (
    <header className="app-topnav">
      <div className="topnav-left">
        <h1 className="topnav-title">{pageInfo.title}</h1>
        <p className="topnav-desc">{pageInfo.desc}</p>
      </div>

      <div className="topnav-right">
        {/* Backend health status badge */}
        <div
          className={`health-badge ${
            apiOnline === null
              ? 'health-badge-checking'
              : apiOnline
              ? 'health-badge-online'
              : 'health-badge-offline'
          }`}
          title="Click to re-check API status"
          onClick={checkHealth}
        >
          <Server size={14} className="health-badge-icon" />
          <span className="health-indicator-dot"></span>
          <span className="health-badge-text">
            {checking
              ? 'Connecting...'
              : apiOnline === null
              ? 'Checking API...'
              : apiOnline
              ? 'API Online (Port 8000)'
              : 'API Offline'}
          </span>
          <RefreshCw size={12} className={`health-refresh-icon ${checking ? 'spin' : ''}`} />
        </div>

        {location.pathname !== '/orders' && (
          <button
            type="button"
            className="btn btn-primary btn-sm topnav-create-btn"
            onClick={() => navigate('/orders', { state: { openCreate: true } })}
          >
            <ShoppingCart size={15} />
            <span>Create Order</span>
          </button>
        )}
      </div>
    </header>
  );
};
