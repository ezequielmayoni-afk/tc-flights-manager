'use client'

import { ActiveAdsTable } from '@/components/marketing/ActiveAdsTable'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ActiveAdsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/packages/marketing">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Anuncios activos en Meta</h1>
          <p className="text-muted-foreground">
            Todos los anuncios con entrega en los últimos 7 días, cruzados con Hub
          </p>
        </div>
      </div>

      <ActiveAdsTable />
    </div>
  )
}
