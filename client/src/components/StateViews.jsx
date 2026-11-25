import { Link } from 'react-router-dom';

export function LoadingState({ title = 'Loading', message = 'Fetching data from ClubFlow...' }) {
  return (
    <div className="state-box state-loading" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p className="state-title">{title}</p>
      <p className="state-message">{message}</p>
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'Unable to load data right now.',
  onRetry,
  retryLabel = 'Retry',
  secondaryAction
}) {
  return (
    <div className="state-box state-error" role="alert">
      <p className="state-title">{title}</p>
      <p className="state-message">{message}</p>
      {(onRetry || secondaryAction) && (
        <div className="state-actions">
          {onRetry && (
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              {retryLabel}
            </button>
          )}
          {secondaryAction && (
            <Link to={secondaryAction.to} className="btn btn-outline">
              {secondaryAction.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  title = 'No items yet',
  message = 'There is nothing to display here yet.',
  action
}) {
  return (
    <div className="state-box state-empty">
      <p className="state-title">{title}</p>
      <p className="state-message">{message}</p>
      {action && (
        <div className="state-actions">
          <Link to={action.to} className="btn btn-primary">
            {action.label}
          </Link>
        </div>
      )}
    </div>
  );
}
