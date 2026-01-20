'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { PromptConfigModal } from './PromptConfigModal'

export function PromptIAButton() {
  const [showPromptConfig, setShowPromptConfig] = useState(false)

  return (
    <>
      <button
        onClick={() => setShowPromptConfig(true)}
        className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted transition-colors"
        title="Configurar prompt de IA"
      >
        <Sparkles className="h-4 w-4" />
        Prompt IA
      </button>

      <PromptConfigModal
        open={showPromptConfig}
        onClose={() => setShowPromptConfig(false)}
      />
    </>
  )
}
