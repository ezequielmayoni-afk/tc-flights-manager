'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Palette, Sparkles } from 'lucide-react'
import { PromptEditorModal } from './PromptEditorModal'

interface DesignPageHeaderProps {
  stats: {
    total: number
    pending: number
    completed: number
  }
}

export function DesignPageHeader({ stats }: DesignPageHeaderProps) {
  const [promptModalOpen, setPromptModalOpen] = useState(false)

  return (
    <>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-muted-foreground" />
            <span className="text-muted-foreground">
              {stats.total} paquetes en diseño
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-amber-600 font-medium">
              {stats.pending} pendientes
            </span>
            <span className="text-green-600 font-medium">
              {stats.completed} completados
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => setPromptModalOpen(true)}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          Prompt IA
        </Button>
      </div>

      <PromptEditorModal
        open={promptModalOpen}
        onOpenChange={setPromptModalOpen}
      />
    </>
  )
}
