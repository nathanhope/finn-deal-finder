export default function SkeletonCard() {
  return (
    <div className="card p-4">
      <div className="flex gap-4">
        {/* Thumbnail */}
        <div className="skeleton w-16 h-16 sm:w-20 sm:h-20 rounded flex-shrink-0" />

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Title */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-4 w-3/4 rounded" />
              <div className="skeleton h-4 w-1/2 rounded" />
            </div>
            {/* Score ring placeholder */}
            <div className="skeleton w-16 h-16 rounded-full flex-shrink-0" />
          </div>
          {/* Price */}
          <div className="flex gap-3 items-baseline">
            <div className="skeleton h-6 w-28 rounded" />
            <div className="skeleton h-4 w-20 rounded" />
          </div>
          {/* Badges */}
          <div className="flex gap-2">
            <div className="skeleton h-5 w-16 rounded-full" />
            <div className="skeleton h-5 w-20 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
