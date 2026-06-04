import { RefreshCw, X } from "lucide-react";

interface ErrorBannerProps {
  message: string;
  canRetry: boolean;
  onRetry?: () => void;
  onDismiss: () => void;
}

export function ErrorBanner({
  message,
  canRetry,
  onRetry,
  onDismiss,
}: ErrorBannerProps) {
  return (
    <div className="error-banner" role="alert">
      <div>
        <strong>Reserve failed</strong>
        <p>{message}</p>
      </div>
      <div className="error-banner__actions">
        {canRetry && onRetry ? (
          <button className="button button--secondary" type="button" onClick={onRetry}>
            <RefreshCw size={16} aria-hidden="true" />
            Retry
          </button>
        ) : null}
        <button
          className="icon-button"
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          title="Dismiss error"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

