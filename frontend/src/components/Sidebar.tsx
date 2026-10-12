import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Users,
  Boxes,
  ShoppingCart,
  RefreshCw,
  Wrench,
  ShieldCheck
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/products', label: 'Products', icon: Package },
    { to: '/dealers', label: 'Dealers', icon: Users },
    { to: '/inventory', label: 'Inventory', icon: Boxes },
    { to: '/orders', label: 'Orders', icon: ShoppingCart },
    { to: '/supplier-sync', label: 'Supplier Sync', icon: RefreshCw },
  ];

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="brand-logo-badge">
          <Wrench size={22} className="brand-icon" />
        </div>
        <div className="brand-details">
          <span className="brand-title">VIKMO</span>
          <span className="brand-subtitle">DealerDesk</span>
        </div>
      </div>

      <div className="sidebar-section-title">MANAGEMENT</div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? 'sidebar-nav-item-active' : ''}`
              }
            >
              <Icon size={19} className="nav-icon" />
              <span className="nav-label">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="system-pill">
          <ShieldCheck size={16} className="text-emerald-400" />
          <div className="system-pill-text">
            <span className="system-pill-title">Django DRF Engine</span>
            <span className="system-pill-sub">PostgreSQL • Port 8000</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
