import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { Sidebar } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { DealersPage } from './pages/DealersPage';
import { InventoryPage } from './pages/InventoryPage';
import { OrdersPage } from './pages/OrdersPage';
import { SupplierSyncPage } from './pages/SupplierSyncPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="app-shell">
          <Sidebar />
          <div className="app-main-wrapper">
            <TopNav />
            <main className="app-content-area">
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/dealers" element={<DealersPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/supplier-sync" element={<SupplierSyncPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </div>
      </ToastProvider>
    </BrowserRouter>
  );
};

export default App;
