import { CheckCircle2, X, XCircle } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ToastContext, type ToastTone } from "./toast-store";
type Toast = { id: number; message: string; tone: ToastTone };
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  const notify = useCallback((message: string, tone: ToastTone = "success") => { const id = Date.now() + Math.random(); setToasts((items) => [...items, { id, message, tone }]); window.setTimeout(() => dismiss(id), 4500); }, [dismiss]);
  const value = useMemo(() => ({ notify }), [notify]);
  return <ToastContext.Provider value={value}>{children}<div className="toast-viewport" aria-live="polite">{toasts.map((toast) => <div className={`toast ${toast.tone}`} key={toast.id}>{toast.tone === "success" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}<span>{toast.message}</span><button onClick={() => dismiss(toast.id)} aria-label="Dismiss"><X size={15} /></button></div>)}</div></ToastContext.Provider>;
}
