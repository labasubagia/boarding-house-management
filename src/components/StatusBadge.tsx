import type { RoomStatus } from '../lib/types'
import { STATUS_CLASSES, STATUS_LABEL } from '../lib/dueDate'

export default function StatusBadge({ status }: { status: RoomStatus }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}
