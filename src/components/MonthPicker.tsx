import { formatMonthID, monthKeyToDate, toMonthKey } from '../lib/dueDate'

export default function MonthPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (monthKey: string) => void
}) {
  function shift(delta: number) {
    const d = monthKeyToDate(value)
    onChange(toMonthKey(new Date(d.getFullYear(), d.getMonth() + delta, 1)))
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="Bulan sebelumnya"
        className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      >
        ‹
      </button>
      <div className="min-w-40 text-center text-sm font-semibold">{formatMonthID(value)}</div>
      <button
        type="button"
        onClick={() => shift(1)}
        aria-label="Bulan berikutnya"
        className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      >
        ›
      </button>
    </div>
  )
}
