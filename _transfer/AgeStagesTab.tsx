// ─── Age Stages Tab ───────────────────────────────────────────────────────────
// Replaces the old טיפים screen. Yahav 24.8.26: "אני חושב שזה צריך להחליף
// את הטיפים כי זה כל המטרה של זה לשנות אותו", and separately: "חשוב מאוד -
// שיהיה לנו שליטה באדמין לכל פרק זמן והתוכן ששייך אליו."
//
// Two levels, mirroring the mother's view exactly:
//   age_stages        — one row per age range. Owns the home-card headline.
//   age_stage_topics  — the openable topics inside a stage, drag-ordered.
//
// A topic with kind='consult' is the red-flag topic. It renders differently
// on both sides (softer, never alarming) but is edited like any other, so
// Brenda can retune the wording herself without anyone touching code.
//
// Deletes are guarded by an inline confirm rather than window.confirm, same
// pattern as the rest of this file.

const EMPTY_STAGE_DRAFT = {
  title: '',
  age_start_days: '',
  age_end_days: '',
  headline: '',
  intro: '',
}

const EMPTY_TOPIC_DRAFT = {
  kind: 'topic' as 'topic' | 'consult',
  emoji: '',
  title: '',
  teaser: '',
  body: '',
}

function formatStageRange(start: number, end: number): string {
  const m = (d: number) => Math.round(d / 30.4)
  return `${m(start)} עד ${m(end)} חודשים`
}

function AgeStagesTab() {
  const [stages, setStages] = useState<AgeStage[]>([])
  const [topicsByStage, setTopicsByStage] = useState<Record<string, AgeStageTopic[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Stage editing
  const [stageForm, setStageForm] = useState<string | 'new' | null>(null)
  const [stageDraft, setStageDraft] = useState(EMPTY_STAGE_DRAFT)

  // Topic editing — key is the stage id, value the topic id or 'new'
  const [topicForm, setTopicForm] = useState<{ stageId: string; topicId: string | 'new' } | null>(null)
  const [topicDraft, setTopicDraft] = useState(EMPTY_TOPIC_DRAFT)

  const [saving, setSaving] = useState(false)
  const [pendingDeleteStage, setPendingDeleteStage] = useState<AgeStage | null>(null)
  const [pendingDeleteTopic, setPendingDeleteTopic] = useState<AgeStageTopic | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }))

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: s }, { data: t }] = await Promise.all([
      supabase.from('age_stages').select('*').order('display_order'),
      supabase.from('age_stage_topics').select('*').order('display_order'),
    ])
    const stageRows = (s ?? []) as AgeStage[]
    const topicRows = (t ?? []) as AgeStageTopic[]
    const grouped: Record<string, AgeStageTopic[]> = {}
    for (const row of topicRows) {
      ;(grouped[row.stage_id] ??= []).push(row)
    }
    setStages(stageRows)
    setTopicsByStage(grouped)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // ── stage CRUD ──
  function openStageEdit(s: AgeStage) {
    setStageForm(s.id)
    setStageDraft({
      title: s.title,
      age_start_days: String(s.age_start_days),
      age_end_days: String(s.age_end_days),
      headline: s.headline ?? '',
      intro: s.intro ?? '',
    })
  }

  function openStageAdd() {
    setStageForm('new')
    setStageDraft(EMPTY_STAGE_DRAFT)
  }

  async function saveStage() {
    if (!stageDraft.title.trim() || stageDraft.age_start_days === '' || stageDraft.age_end_days === '') return
    setSaving(true)
    const payload = {
      title: stageDraft.title.trim(),
      age_start_days: parseInt(stageDraft.age_start_days, 10),
      age_end_days: parseInt(stageDraft.age_end_days, 10),
      headline: stageDraft.headline.trim(),
      intro: stageDraft.intro.trim() || null,
    }
    if (stageForm === 'new') {
      const nextOrder = stages.length ? Math.max(...stages.map(s => s.display_order)) + 1 : 1
      await supabase.from('age_stages').insert({ ...payload, display_order: nextOrder, is_active: true })
    } else if (stageForm) {
      await supabase.from('age_stages').update(payload).eq('id', stageForm)
    }
    setSaving(false)
    setStageForm(null)
    load()
  }

  async function toggleStage(s: AgeStage) {
    await supabase.from('age_stages').update({ is_active: !s.is_active }).eq('id', s.id)
    setStages(prev => prev.map(x => (x.id === s.id ? { ...x, is_active: !x.is_active } : x)))
  }

  async function confirmDeleteStage() {
    if (!pendingDeleteStage) return
    await supabase.from('age_stages').delete().eq('id', pendingDeleteStage.id)
    setPendingDeleteStage(null)
    load()
  }

  // ── topic CRUD ──
  function openTopicEdit(t: AgeStageTopic) {
    setTopicForm({ stageId: t.stage_id, topicId: t.id })
    setTopicDraft({
      kind: (t.kind ?? 'topic') as 'topic' | 'consult',
      emoji: t.emoji ?? '',
      title: t.title,
      teaser: t.teaser ?? '',
      body: t.body,
    })
  }

  function openTopicAdd(stageId: string) {
    setTopicForm({ stageId, topicId: 'new' })
    setTopicDraft(EMPTY_TOPIC_DRAFT)
  }

  async function saveTopic() {
    if (!topicForm || !topicDraft.title.trim() || !topicDraft.body.trim()) return
    setSaving(true)
    const payload = {
      kind: topicDraft.kind,
      emoji: topicDraft.emoji.trim() || null,
      title: topicDraft.title.trim(),
      teaser: topicDraft.teaser.trim() || null,
      body: topicDraft.body.trim(),
    }
    if (topicForm.topicId === 'new') {
      const existing = topicsByStage[topicForm.stageId] ?? []
      const nextOrder = existing.length ? Math.max(...existing.map(t => t.display_order)) + 1 : 1
      await supabase.from('age_stage_topics').insert({
        ...payload, stage_id: topicForm.stageId, display_order: nextOrder, is_active: true,
      })
    } else {
      await supabase.from('age_stage_topics').update(payload).eq('id', topicForm.topicId)
    }
    setSaving(false)
    setTopicForm(null)
    load()
  }

  async function toggleTopic(t: AgeStageTopic) {
    await supabase.from('age_stage_topics').update({ is_active: !t.is_active }).eq('id', t.id)
    setTopicsByStage(prev => ({
      ...prev,
      [t.stage_id]: (prev[t.stage_id] ?? []).map(x => (x.id === t.id ? { ...x, is_active: !x.is_active } : x)),
    }))
  }

  async function confirmDeleteTopic() {
    if (!pendingDeleteTopic) return
    await supabase.from('age_stage_topics').delete().eq('id', pendingDeleteTopic.id)
    setPendingDeleteTopic(null)
    load()
  }

  async function onTopicDragEnd(stageId: string, e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const list = topicsByStage[stageId] ?? []
    const from = list.findIndex(t => t.id === active.id)
    const to = list.findIndex(t => t.id === over.id)
    if (from < 0 || to < 0) return
    const next = arrayMove(list, from, to)
    setTopicsByStage(prev => ({ ...prev, [stageId]: next }))
    await Promise.all(next.map((t, i) => supabase.from('age_stage_topics').update({ display_order: i + 1 }).eq('id', t.id)))
  }

  const inputCls = 'w-full px-4 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400'

  if (loading) return <p className="text-center text-sand-400 text-sm py-8">טוען...</p>

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-3xl p-5 shadow-sm">
        <h2 className="font-bold text-sand-800 text-base mb-1">מדריך גיל</h2>
        <p className="text-xs text-sand-500 leading-relaxed">
          מה שאמא רואה בדף הבית לפי הגיל של התינוק שלה. כל שלב הוא טווח גיל, ובתוכו נושאים שהיא יכולה לפתוח.
          המשפט של השלב הוא מה שמופיע על הכרטיס עצמו.
        </p>
        <button onClick={openStageAdd}
          className="mt-3 px-4 py-2.5 rounded-2xl text-white font-bold text-sm inline-flex items-center gap-1.5"
          style={{ background: '#E7C78A' }}>
          <Plus className="w-4 h-4" /> שלב חדש
        </button>
      </div>

      {stageForm && (
        <div className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
          <h3 className="font-bold text-sand-800 text-sm">{stageForm === 'new' ? 'שלב חדש' : 'עריכת שלב'}</h3>
          <div>
            <label className="text-xs text-sand-500 mb-1 block">שם השלב</label>
            <input value={stageDraft.title} onChange={e => setStageDraft(d => ({ ...d, title: e.target.value }))}
              placeholder="ארבעה עד שישה חודשים" className={inputCls} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-sand-500 mb-1 block">מגיל (ימים)</label>
              <input type="number" value={stageDraft.age_start_days}
                onChange={e => setStageDraft(d => ({ ...d, age_start_days: e.target.value }))}
                placeholder="122" className={inputCls} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-sand-500 mb-1 block">עד גיל (ימים)</label>
              <input type="number" value={stageDraft.age_end_days}
                onChange={e => setStageDraft(d => ({ ...d, age_end_days: e.target.value }))}
                placeholder="182" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs text-sand-500 mb-1 block">משפט הכרטיס (מה שרואים בדף הבית)</label>
            <textarea rows={2} value={stageDraft.headline}
              onChange={e => setStageDraft(d => ({ ...d, headline: e.target.value }))}
              placeholder="בין ארבעה לשישה חודשים הכל מתארגן. הנה מה שקורה בתנועה, בחושים ובשפה."
              className={inputCls + ' resize-none'} />
          </div>
          <div>
            <label className="text-xs text-sand-500 mb-1 block">פסקת פתיחה (בתוך המדריך, אופציונלי)</label>
            <textarea rows={3} value={stageDraft.intro}
              onChange={e => setStageDraft(d => ({ ...d, intro: e.target.value }))}
              className={inputCls + ' resize-none'} />
          </div>
          <div className="flex gap-2">
            <button onClick={saveStage} disabled={saving || !stageDraft.title.trim()}
              className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
              style={{ background: '#E7C78A' }}>{saving ? '...' : 'שמירה'}</button>
            <button onClick={() => setStageForm(null)}
              className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 font-semibold text-sm">ביטול</button>
          </div>
        </div>
      )}

      {stages.map(s => {
        const topics = topicsByStage[s.id] ?? []
        const isOpen = expanded === s.id
        const activeCount = topics.filter(t => t.is_active).length
        return (
          <div key={s.id} className="bg-white rounded-3xl shadow-sm overflow-hidden">
            <div className="p-4 flex items-start gap-2">
              <button onClick={() => setExpanded(isOpen ? null : s.id)} className="flex-1 text-right min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-sm ${s.is_active ? 'text-sand-800' : 'text-sand-400 line-through'}`}>{s.title}</span>
                  <span className="text-[11px] text-sand-400">{formatStageRange(s.age_start_days, s.age_end_days)}</span>
                </div>
                <p className="text-xs text-sand-500 mt-1 leading-relaxed line-clamp-2">{s.headline || 'אין עדיין משפט כרטיס'}</p>
                <p className="text-[11px] text-sand-400 mt-1">{activeCount} נושאים פעילים</p>
              </button>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => toggleStage(s)} title={s.is_active ? 'כיבוי' : 'הפעלה'}>
                  {s.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5 text-sand-300" />}
                </button>
                <button onClick={() => openStageEdit(s)} title="עריכה"><Pencil className="w-4 h-4 text-sand-400" /></button>
                <button onClick={() => setPendingDeleteStage(s)} title="מחיקה"><Trash2 className="w-4 h-4 text-red-300" /></button>
                <button onClick={() => setExpanded(isOpen ? null : s.id)}>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-sand-400" /> : <ChevronDown className="w-4 h-4 text-sand-400" />}
                </button>
              </div>
            </div>

            {isOpen && (
              <div className="px-4 pb-4 space-y-2 border-t border-sand-100 pt-3">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => onTopicDragEnd(s.id, e)}>
                  <SortableContext items={topics.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    {topics.map(t => (
                      <SortableRow key={t.id} id={t.id}>
                        {dragHandle => (
                          <div className={`flex items-start gap-2 rounded-2xl p-3 ${t.kind === 'consult' ? 'bg-sand-50 border border-sand-200' : 'bg-sand-50/60'}`}>
                            {dragHandle}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                {t.emoji && <span className="text-base leading-none">{t.emoji}</span>}
                                <span className={`font-bold text-sm ${t.is_active ? 'text-sand-800' : 'text-sand-400 line-through'}`}>{t.title}</span>
                                {t.kind === 'consult' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sand-200 text-sand-600 font-bold">מתי להתייעץ</span>}
                              </div>
                              {t.teaser && <p className="text-xs text-sand-500 mt-0.5">{t.teaser}</p>}
                              <p className="text-[11px] text-sand-400 mt-1">{t.body.length} תווים</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => toggleTopic(t)} title={t.is_active ? 'כיבוי' : 'הפעלה'}>
                                {t.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5 text-sand-300" />}
                              </button>
                              <button onClick={() => openTopicEdit(t)} title="עריכה"><Pencil className="w-4 h-4 text-sand-400" /></button>
                              <button onClick={() => setPendingDeleteTopic(t)} title="מחיקה"><Trash2 className="w-4 h-4 text-red-300" /></button>
                            </div>
                          </div>
                        )}
                      </SortableRow>
                    ))}
                  </SortableContext>
                </DndContext>

                {topicForm?.stageId === s.id ? (
                  <div className="bg-white rounded-2xl p-4 border-2 border-mustard-200 space-y-3">
                    <div className="flex gap-2">
                      <div className="w-20">
                        <label className="text-xs text-sand-500 mb-1 block">אמוג'י</label>
                        <input value={topicDraft.emoji} onChange={e => setTopicDraft(d => ({ ...d, emoji: e.target.value }))}
                          className="w-full px-3 py-2.5 border-2 border-sand-200 rounded-2xl text-xl text-center focus:outline-none focus:border-mustard-400" />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-sand-500 mb-1 block">כותרת</label>
                        <input value={topicDraft.title} onChange={e => setTopicDraft(d => ({ ...d, title: e.target.value }))}
                          placeholder="תנועה וגוף" className={inputCls} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-sand-500 mb-1 block">שורת הצצה (מופיעה מתחת לכותרת לפני שפותחים)</label>
                      <input value={topicDraft.teaser} onChange={e => setTopicDraft(d => ({ ...d, teaser: e.target.value }))}
                        placeholder="ההתהפכות הראשונה" className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs text-sand-500 mb-1 block">סוג</label>
                      <div className="flex gap-2">
                        {(['topic', 'consult'] as const).map(k => (
                          <button key={k} onClick={() => setTopicDraft(d => ({ ...d, kind: k }))}
                            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold ${topicDraft.kind === k ? 'bg-mustard-100 text-sand-800 border-2 border-mustard-400' : 'bg-sand-50 text-sand-500 border-2 border-transparent'}`}>
                            {k === 'topic' ? 'נושא רגיל' : 'מתי להתייעץ'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-sand-500 mb-1 block">התוכן</label>
                      <textarea rows={10} value={topicDraft.body} onChange={e => setTopicDraft(d => ({ ...d, body: e.target.value }))}
                        className={inputCls + ' resize-y leading-relaxed'} />
                      <p className="text-[11px] text-sand-400 mt-1">שורה ריקה בין פסקאות. לא להשתמש במקפים ארוכים.</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveTopic} disabled={saving || !topicDraft.title.trim() || !topicDraft.body.trim()}
                        className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
                        style={{ background: '#E7C78A' }}>{saving ? '...' : 'שמירה'}</button>
                      <button onClick={() => setTopicForm(null)}
                        className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 font-semibold text-sm">ביטול</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => openTopicAdd(s.id)}
                    className="w-full py-2.5 rounded-2xl bg-sand-50 text-sand-600 font-semibold text-sm inline-flex items-center justify-center gap-1.5">
                    <Plus className="w-4 h-4" /> נושא חדש
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {pendingDeleteStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setPendingDeleteStage(null)}>
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm text-right" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-sand-800 text-sm">למחוק את השלב "{pendingDeleteStage.title}"?</p>
            <p className="text-xs text-sand-500 mt-1">כל הנושאים שבתוכו יימחקו איתו. אפשר במקום זה פשוט לכבות אותו.</p>
            <div className="flex gap-2 mt-4">
              <button onClick={confirmDeleteStage} className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm">מחיקה</button>
              <button onClick={() => setPendingDeleteStage(null)} className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 font-semibold text-sm">ביטול</button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteTopic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setPendingDeleteTopic(null)}>
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm text-right" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-sand-800 text-sm">למחוק את "{pendingDeleteTopic.title}"?</p>
            <div className="flex gap-2 mt-4">
              <button onClick={confirmDeleteTopic} className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm">מחיקה</button>
              <button onClick={() => setPendingDeleteTopic(null)} className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 font-semibold text-sm">ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
