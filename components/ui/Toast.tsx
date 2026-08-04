import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export type ToastType = 'error' | 'success' | 'info';

export interface ToastMessage {
  id: number;
  type: ToastType;
  text: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (!toast) return;
    const duration = toast.type === 'info' ? 8000 : 5000;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const styles = {
    error: 'border-rose-300 bg-white text-stone-800 dark:border-rose-500/40 dark:bg-slate-800 dark:text-rose-100',
    success: 'border-emerald-300 bg-white text-stone-800 dark:border-emerald-500/40 dark:bg-slate-800 dark:text-emerald-100',
    info: 'border-[#b3c78f] bg-white text-stone-800 dark:border-cyan-500/40 dark:bg-slate-800 dark:text-cyan-100',
  };

  const Icon = toast.type === 'success' ? CheckCircle2 : AlertCircle;

  return (
    <div className="fixed right-3 top-3 z-[200] w-[calc(100%-1.5rem)] max-w-sm animate-in fade-in slide-in-from-top-2 duration-300 sm:right-4 sm:top-4">
      <div role={toast.type === 'error' ? 'alert' : 'status'} aria-live={toast.type === 'error' ? 'assertive' : 'polite'} className={`flex items-start gap-3 px-4 py-3 rounded-md border shadow-xl ${styles[toast.type]}`}>
        <Icon className="w-5 h-5 shrink-0 mt-0.5" />
        <p className="text-sm flex-1">{toast.text}</p>
        <button onClick={onDismiss} aria-label="Dismiss notification" className="opacity-60 hover:opacity-100 transition-opacity">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
