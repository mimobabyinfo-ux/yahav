import { COMMUNITY_TAGS, type CommunityTagId } from '../../constants/communityTags'

// Horizontal chip strip below the age/area filter on CommunityPage.
//
// Yahav 11.8.26: "לחפש לפי קפה ופארק ואימון ולא או או או" — the strip
// was single-select, so looking for someone to have coffee AND walk in
// the park with meant picking one and scanning. It is now multi-select
// with AND semantics: every chip you add narrows the list further.
//
// AND rather than OR is the deliberate choice. Someone browsing the
// community is looking for a person she'd actually meet, and each tag
// she adds is another thing she wants in common — OR would widen the
// list exactly when she is trying to narrow it.
//
// We overflow-x-auto rather than wrap so the strip stays one line at
// 480px even with 9 chips.

type Props = {
  value: CommunityTagId[]
  onChange: (next: CommunityTagId[]) => void
}

export default function CommunityTagFilter({ value, onChange }: Props) {
  function toggle(id: CommunityTagId) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        <Chip
          active={value.length === 0}
          onClick={() => onChange([])}
          label="הכל"
        />
        {COMMUNITY_TAGS.map(tag => (
          <Chip
            key={tag.id}
            active={value.includes(tag.id)}
            onClick={() => toggle(tag.id)}
            label={tag.label}
            emoji={tag.emoji}
          />
        ))}
      </div>
      {value.length > 1 && (
        <p className="text-[11px] font-semibold px-1" style={{ color: '#A2937D' }}>
          מוצגות רק מי שמחפשות את כל {value.length} הדברים
        </p>
      )}
    </div>
  )
}

function Chip({ active, onClick, label, emoji }: { active: boolean; onClick: () => void; label: string; emoji?: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all whitespace-nowrap ${
        active
          ? 'border-mustard-500 bg-mustard-50 text-mustard-700'
          : 'border-sand-200 bg-white text-sand-600'
      }`}
    >
      {emoji && <span className="ml-1">{emoji}</span>}
      {label}
    </button>
  )
}
