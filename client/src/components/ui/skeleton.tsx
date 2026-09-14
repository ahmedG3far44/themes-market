export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="table-skeleton" aria-label="Loading data">
      {Array.from({ length: rows }).map((_, row) => (
        <div className="table-skeleton-row" key={row}>
          {Array.from({ length: columns }).map((__, column) => <Skeleton className="skeleton-line" key={column} />)}
        </div>
      ))}
    </div>
  );
}
