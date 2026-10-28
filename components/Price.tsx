// A sale price on a yellow shelf tag: "$3⁸⁹", the way supermarkets print it.
const SIZES = {
  sm: 'text-lg px-1.5 pt-[3px] pb-[2px] rounded-[3px]',
  md: 'text-[22px] px-1.5 pt-1 pb-[3px] rounded-[4px]',
  lg: 'text-[40px] px-2.5 pt-1.5 pb-1 rounded-md',
} as const

export function Price({ value, unit, size = 'md', className = '' }: {
  value: number; unit?: string | null; size?: keyof typeof SIZES; className?: string
}) {
  const [dollars, cents] = value.toFixed(2).split('.')
  return (
    <span className={`inline-flex items-start bg-tag text-ink font-condensed font-extrabold leading-none tabular-nums ${SIZES[size]} ${className}`}
      aria-label={`$${value.toFixed(2)}${unit ? ` per ${unit}` : ''}`}>
      <span aria-hidden className="text-[0.5em] mt-[0.12em]">$</span>
      <span aria-hidden>{dollars}</span>
      <span aria-hidden className="text-[0.5em] mt-[0.12em]">{cents}</span>
      {unit && <span aria-hidden className="text-[0.42em] self-end ml-[1px] mb-[0.08em]">/{unit}</span>}
    </span>
  )
}
