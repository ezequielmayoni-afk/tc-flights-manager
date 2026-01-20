'use client'

import { cn } from '@/lib/utils'
import { Users } from 'lucide-react'

interface CuposBadgeProps {
  remaining: number
  total?: number
  showTotal?: boolean
}

export function CuposBadge({ remaining, total, showTotal = false }: CuposBadgeProps) {
  // Don't show badge if there's no cupo data (total is 0 or undefined)
  if (!total || total === 0) {
    return null
  }

  const getConfig = () => {
    if (remaining === 0) {
      return { color: 'bg-red-500 text-white', text: 'AGOTADO' }
    }
    if (remaining <= 5) {
      return { color: 'bg-orange-500 text-white', text: `${remaining} ULTIMOS` }
    }
    if (remaining <= 9) {
      return { color: 'bg-yellow-500 text-white', text: `${remaining} DISP` }
    }
    return { color: 'bg-green-500 text-white', text: `${remaining} DISP` }
  }

  const config = getConfig()

  return (
    <div
      className={cn(
        'px-2 py-1 rounded-full text-xs font-bold shadow-sm flex items-center gap-1',
        config.color
      )}
    >
      <Users className="h-3 w-3" />
      <span>{config.text}</span>
      {showTotal && total !== undefined && (
        <span className="opacity-75">/ {total}</span>
      )}
    </div>
  )
}
