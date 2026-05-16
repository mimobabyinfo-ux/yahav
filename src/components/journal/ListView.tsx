// List view placeholder — full implementation lands in C5 (chronological
// list across the selected week with filtering + sorting).

type Props = {
  onBackToDay: () => void
}

export default function ListView({ onBackToDay }: Props) {
  return (
    <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-8 text-center space-y-3">
      <div className="text-5xl">📜</div>
      <p className="text-sm font-bold text-sand-700">בקרוב — בפיתוח</p>
      <p className="text-xs text-sand-500 leading-relaxed max-w-xs mx-auto">
        תצוגת רשימה תאפשר לראות את כל הרשומות לפי סדר כרונולוגי
        עם מיון וסינון. בינתיים אפשר להשתמש בתצוגת היום.
      </p>
      <button
        onClick={onBackToDay}
        className="inline-flex items-center justify-center px-4 py-2 mt-2 rounded-2xl text-xs font-bold text-mustard-700 bg-mustard-50 hover:bg-mustard-100 transition-colors"
      >
        חוזרת לתצוגת יום
      </button>
    </div>
  )
}
