type Props = {
  side: 'left' | 'right' | 'both'
  onChange: (side: 'left' | 'right' | 'both') => void
}

export default function BreastfeedingQuickSwitch({ side, onChange }: Props) {
  const options: { value: 'right' | 'left' | 'both'; label: string }[] = [
    { value: 'right', label: 'ימין' },
    { value: 'both', label: 'שניהם' },
    { value: 'left', label: 'שמאל' },
  ]

  return (
    <div className="flex gap-1 bg-sand-100 rounded-2xl p-1">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold transition-all ${
            side === opt.value
              ? 'bg-white text-mustard-700 shadow-sm'
              : 'text-sand-500 hover:text-sand-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
