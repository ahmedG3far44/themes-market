import { AlertCircle, X } from "lucide-react";

export function ErrorMessage({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="error-message" role="alert">
      <AlertCircle aria-hidden="true" size={18} />
      <span>{message}</span>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss error"><X size={16} /></button>}
    </div>
  );
}
