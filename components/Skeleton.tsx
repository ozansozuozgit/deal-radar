export function SkeletonCards({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3 mt-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl bg-neutral-900 p-3 flex flex-col gap-2 animate-pulse">
          <div className="w-full aspect-[4/3] rounded-lg bg-neutral-800" />
          <div className="h-3.5 w-4/5 rounded bg-neutral-800" />
          <div className="h-3 w-3/5 rounded bg-neutral-800" />
          <div className="h-5 w-2/5 rounded bg-neutral-800 mt-1" />
        </div>
      ))}
    </div>
  )
}
