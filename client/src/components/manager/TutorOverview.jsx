import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Pencil, Users } from 'lucide-react'
import Navbar from '../shared/Navbar'
import LoadingSpinner from '../shared/LoadingSpinner'
import api from '../../lib/api'
import { fmtDay, fmtDayTime, fmtTime } from '../../lib/datetime'
import { fmtSlot, sortSlots, subjectLabel } from '../../lib/dates'

// Score colours: >=70 forest, 40-69 amber, <40 red (rounded first)
function scoreClass(score) {
  const s = Math.round(score)
  return s >= 70 ? 'text-forest-700' : s >= 40 ? 'text-amber-700' : 'text-red-700'
}

// A manager's high-level view of one tutor's lessons: per student, how the
// last lesson went and whether the coming lessons are planned.
export default function TutorOverview() {
  const { tutorId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'unplanned'

  useEffect(() => {
    setData(null)
    setError('')
    api.get(`/users/${tutorId}/tutor-overview`)
      .then(res => setData(res.data))
      .catch(e => setError(e.response?.data?.error || 'Could not load this tutor'))
  }, [tutorId])

  if (error) return (
    <>
      <Navbar />
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="card text-center">
          <p className="text-gray-900 font-medium mb-4">{error}</p>
          <button onClick={() => navigate('/manager')} className="btn-secondary"><ArrowLeft className="icon" aria-hidden /> Back to dashboard</button>
        </div>
      </div>
    </>
  )
  if (!data) return <><Navbar /><LoadingSpinner /></>

  const nextUnplanned = s => s.upcoming[0] && s.upcoming[0].planned === 0
  const unplannedCount = data.students.filter(nextUnplanned).length
  const rows = filter === 'unplanned' ? data.students.filter(nextUnplanned) : data.students
  const lessonsThisFortnight = data.students.reduce((n, s) => n + s.upcoming.length, 0)

  return (
    <>
      <Navbar title={data.tutor.name} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <button onClick={() => navigate('/manager')} className="btn-ghost btn-sm -ml-2.5 mb-3">
          <ArrowLeft className="icon-sm" aria-hidden /> Back
        </button>

        <div className="card mb-6">
          <p className="eyebrow">Tutor overview</p>
          <h1 className="page-title">{data.tutor.name}</h1>
          <p className="text-sm text-gray-500">{data.tutor.email}</p>
          <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-100">
            <div>
              <p className="font-serif text-2xl font-semibold text-gray-900 tabular-nums">{data.students.length}</p>
              <p className="eyebrow mt-0.5">Students</p>
            </div>
            <div>
              <p className="font-serif text-2xl font-semibold text-gray-900 tabular-nums">{lessonsThisFortnight}</p>
              <p className="eyebrow mt-0.5">Lessons, next 2 weeks</p>
            </div>
            <div>
              <p className={`font-serif text-2xl font-semibold tabular-nums ${unplannedCount ? 'text-amber-700' : 'text-gray-900'}`}>{unplannedCount}</p>
              <p className="eyebrow mt-0.5">Next lesson not planned</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="section-title">Students</h2>
          <div className="tabs" role="tablist">
            {[{ key: 'all', label: 'All' }, { key: 'unplanned', label: `Not planned (${unplannedCount})` }].map(t => (
              <button key={t.key} role="tab" aria-selected={filter === t.key} onClick={() => setFilter(t.key)} className={`tab ${filter === t.key ? 'tab-active' : ''}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="card text-center py-10">
            <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
              <Users className="icon-lg" aria-hidden />
            </div>
            <p className="font-medium text-gray-900">{filter === 'unplanned' ? 'Every next lesson is planned' : 'No students with this tutor yet'}</p>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2.5 eyebrow">Student</th>
                    <th className="text-left px-3 py-2.5 eyebrow">Last lesson</th>
                    <th className="text-left px-3 py-2.5 eyebrow">Coming up</th>
                    <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(r => {
                    const last = r.lastLesson
                    return (
                      <tr key={r.student.id} className="align-top hover:bg-gray-50">
                        <td className="px-3 py-3 min-w-[11rem]">
                          <button type="button" onClick={() => navigate(`/manager/students/${r.student.id}`)} className="font-medium text-gray-900 hover:text-redwood-700 hover:underline text-left">
                            {r.student.name}
                          </button>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {[r.student.schoolYear, sortSlots(r.student.lessonDays).map(fmtSlot).join(', ')].filter(Boolean).join(' · ') || 'No weekly lessons set'}
                          </p>
                          {r.plan.status === 'draft' && <span className="badge mt-1">Draft plan</span>}
                        </td>
                        <td className="px-3 py-3 min-w-[11rem]">
                          {last ? (
                            <>
                              <p className="text-gray-900">{fmtDayTime(last.scheduledAt)}{last.subject ? ` · ${subjectLabel(last.subject)}` : ''}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {last.done}/{last.planned} done
                                {last.avgScore != null && <> · <span className={`font-semibold ${scoreClass(last.avgScore)}`}>{last.avgScore}%</span></>}
                                {last.attendedAt && ' · attended'}
                              </p>
                            </>
                          ) : <span className="text-gray-400">None in the last 4 weeks</span>}
                        </td>
                        <td className="px-3 py-3 min-w-[14rem]">
                          {r.upcoming.length === 0 ? (
                            <span className="text-gray-400">No lessons in the next 2 weeks</span>
                          ) : (
                            <ul className="space-y-1">
                              {r.upcoming.map(s => (
                                <li key={s.id} className="flex items-center gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/manager/lesson-plans/${r.plan.id}/builder?session=${s.id}`)}
                                    className="inline-flex items-center gap-1.5 text-gray-800 hover:text-redwood-700 hover:underline tabular-nums"
                                    title="Open this lesson in the planner"
                                  >
                                    <CalendarDays className="icon-sm text-gray-400" aria-hidden />
                                    {fmtDay(s.scheduledAt)}, {fmtTime(s.scheduledAt)}{s.subject ? ` · ${subjectLabel(s.subject)}` : ''}
                                  </button>
                                  {s.planned > 0
                                    ? <span className="badge">{s.planned} item{s.planned === 1 ? '' : 's'}</span>
                                    : <span className="badge-warning">Not planned</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button type="button" onClick={() => navigate(`/manager/lesson-plans/${r.plan.id}/builder${r.upcoming[0] ? `?session=${r.upcoming[0].id}` : ''}`)} className="btn-ghost btn-sm whitespace-nowrap">
                            <Pencil className="icon-sm" aria-hidden /> Planner
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
