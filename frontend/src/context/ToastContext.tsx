import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  details?: string[];
  duration?: number;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string, details?: string[]) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, details, duration = 4500 }: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast: ToastItem = { id, type, title, message, details, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (message: string, title = 'Success') => {
      showToast({ type: 'success', title, message });
    },
    [showToast]
  );

  const error = useCallback(
    (message: string, title = 'Error', details?: string[]) => {
      showToast({ type: 'error', title, message, details, duration: 6000 });
    },
    [showToast]
  );

  const info = useCallback(
    (message: string, title = 'Information') => {
      showToast({ type: 'info', title, message });
    },
    [showToast]
  );

  const warning = useCallback(
    (message: string, title = 'Warning') => {
      showToast({ type: 'warning', title, message, duration: 5000 });
    },
    [showToast]
  );

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="toast-icon toast-icon-success" size={20} />;
      case 'error':
        return <AlertCircle className="toast-icon toast-icon-error" size={20} />;
      case 'warning':
        return <AlertTriangle className="toast-icon toast-icon-warning" size={20} />;
      case 'info':
      default:
        return <Info className="toast-icon toast-icon-info" size={20} />;
    }
  };

  return (
    <ToastContext.Provider value={{ showToast, success, error, info, warning }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role="alert">
            <div className="toast-header-row">
              <div className="toast-leading">
                {getIcon(t.type)}
                <div>
                  {t.title && <div className="toast-title">{t.title}</div>}
                  <div className="toast-message">{t.message}</div>
                </div>
              </div>
              <button
                type="button"
                className="toast-close-btn"
                onClick={() => removeToast(t.id)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            {t.details && t.details.length > 0 && (
              <ul className="toast-details-list">
                {t.details.map((d, idx) => (
                  <li key={idx}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
