import { COMMUNITY_TAGS, type CommunityTagId } from '../../constants/communityTags'

// Phase 4 / C2: horizontal scrollable chip strip rendered below the
// existing age/area filter on CommunityPage. Single-select — picking a
// tag narrows the list to moms whose community_tags contains it. "הכל"
// (value === null) clears the tag filter.
//
// We overflow-x-auto rather than wrap so the strip stays one line at
// 480px even with 9 chips. RTL is inherited from the page; chips read
// right-to-left in their natural Hebrew flow.

type Props = {
  value: CommunityTagId | null
  onChange: (next: CommunityTagId | null) => void
}

export default function CommunityTagFilter({ value, onChange }: Props) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
      <Chip
        active={value === null}
        onClick={() => onChange(null)}
        label="הכל"
      />
      {COMMUNITY_TAGS.map(tag => (
        <Chip
          key={tag.id}
          active={value === tag.id}
          onClick={() => onChange(tag.id)}
          label={tag.label}
          emoji={tag.emoji}
        />
      ))}
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
