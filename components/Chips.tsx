import { Img } from './Img'

export interface ChipOption { value: string; label: string; imgSrc?: string | null }

export function Chips({ options, selected, onToggle }: {
  options: ChipOption[]
  selected: string[] | null
  onToggle: (value: string) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
      {options.map(o => {
        const on = selected?.includes(o.value) ?? false
        return (
          <button key={o.value} onClick={() => onToggle(o.value)} aria-pressed={on}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs border transition-colors ${on ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}>
            <Img src={o.imgSrc} alt="" className="w-4 h-4 rounded-full object-contain bg-white" />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
