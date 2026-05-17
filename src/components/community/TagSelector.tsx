import { COMMUNITY_TAGS, type CommunityTagId } from '../../constants/communityTags'

// Phase 4 / C2: pill grid used in the CommunityPage profile form. Mom
// taps to toggle each tag; selected ones get the mustard style that
// matches the rest of the app (milestone chips, role chips, journal
// tabs). Multi-select on the profile side; the filter strip on the
// listing side is single-select (different component).

type Props = {
  value: string[]
  onChange: (next: string[]) => void
}

export default function TagSelector({ value, onChange }: Props) {
  function toggle(id: CommunityTagId) {
    onChange(
      value.includes(id) ? value.filter(t => t !== id) : [...value, id],
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {COMMUNITY_TAGS.map(tag => {
        const active = value.includes(tag.id)
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggle(tag.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${
              active
                ? 'border-mustard-500 bg-mustard-50 text-mustard-700'
                : 'border-sand-200 bg-white text-sand-600 hover:border-sand-300'
            }`}
          >
            <span className="ml-1">{tag.emoji}</span>{tag.label}
          </button>
        )
      })}
    </div>
  )
}
