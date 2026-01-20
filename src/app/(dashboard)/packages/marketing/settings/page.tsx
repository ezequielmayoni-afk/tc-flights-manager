'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Send, Check, X } from 'lucide-react'
import Link from 'next/link'

interface NotificationSettings {
  slack_enabled: boolean
  slack_webhook_url: string
  slack_channel_design: string
  slack_channel_marketing: string
  notify_price_change: boolean
  notify_creative_request: boolean
  notify_creative_completed: boolean
  notify_ad_underperforming: boolean
  notify_needs_manual_quote: boolean
  price_change_threshold_pct: number
  ctr_threshold_pct: number
  cpl_threshold: number
}

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/notifications/settings')
      const data = await res.json()
      setSettings(data)
    } catch (error) {
      toast.error('Error cargando configuración')
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    if (!settings) return

    setSaving(true)
    try {
      const res = await fetch('/api/notifications/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }

      toast.success('Configuración guardada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  const testWebhook = async () => {
    if (!settings?.slack_webhook_url) {
      toast.error('Ingresa una URL de webhook primero')
      return
    }

    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/notifications/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook_url: settings.slack_webhook_url,
          channel: settings.slack_channel_design,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error de conexión')
      }

      setTestResult('success')
      toast.success('Mensaje de prueba enviado a Slack')
    } catch (error) {
      setTestResult('error')
      toast.error(error instanceof Error ? error.message : 'Error enviando mensaje')
    } finally {
      setTesting(false)
    }
  }

  const updateSetting = <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K]
  ) => {
    setSettings((prev) => prev ? { ...prev, [key]: value } : null)
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="p-6">
        <p className="text-red-500">Error cargando configuración</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/packages/marketing">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Configuración de Notificaciones</h1>
          <p className="text-muted-foreground">
            Configura las notificaciones de Slack para el equipo
          </p>
        </div>
      </div>

      {/* Slack Configuration */}
      <div className="bg-white rounded-lg border p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Slack</h2>
            <p className="text-sm text-muted-foreground">
              Recibe notificaciones en canales de Slack
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={settings.slack_enabled}
              onChange={(e) => updateSetting('slack_enabled', e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {settings.slack_enabled && (
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="https://hooks.slack.com/services/..."
                  value={settings.slack_webhook_url ?? ''}
                  onChange={(e) => updateSetting('slack_webhook_url', e.target.value)}
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  onClick={testWebhook}
                  disabled={testing || !settings.slack_webhook_url}
                >
                  {testing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : testResult === 'success' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : testResult === 'error' ? (
                    <X className="h-4 w-4 text-red-500" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Crea un webhook en Slack: Apps {'>'} Incoming Webhooks {'>'} Add New Webhook
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Canal de Diseño</Label>
                <Input
                  placeholder="#design"
                  value={settings.slack_channel_design ?? ''}
                  onChange={(e) => updateSetting('slack_channel_design', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Canal de Marketing</Label>
                <Input
                  placeholder="#marketing"
                  value={settings.slack_channel_marketing ?? ''}
                  onChange={(e) => updateSetting('slack_channel_marketing', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notification Types */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Tipos de Notificación</h2>

        <div className="space-y-4">
          <label className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
            <div>
              <p className="font-medium">Cambio de Precio</p>
              <p className="text-sm text-muted-foreground">
                Notificar cuando el precio de un paquete cambie
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.notify_price_change}
              onChange={(e) => updateSetting('notify_price_change', e.target.checked)}
              className="h-5 w-5 rounded border-gray-300"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
            <div>
              <p className="font-medium">Solicitud de Creativo</p>
              <p className="text-sm text-muted-foreground">
                Notificar a Diseño cuando Marketing solicite nuevos creativos
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.notify_creative_request}
              onChange={(e) => updateSetting('notify_creative_request', e.target.checked)}
              className="h-5 w-5 rounded border-gray-300"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
            <div>
              <p className="font-medium">Creativo Completado</p>
              <p className="text-sm text-muted-foreground">
                Notificar a Marketing cuando Diseño complete un creativo
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.notify_creative_completed}
              onChange={(e) => updateSetting('notify_creative_completed', e.target.checked)}
              className="h-5 w-5 rounded border-gray-300"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
            <div>
              <p className="font-medium">Anuncio con Bajo Rendimiento</p>
              <p className="text-sm text-muted-foreground">
                Notificar cuando un anuncio tenga métricas por debajo del umbral
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.notify_ad_underperforming}
              onChange={(e) => updateSetting('notify_ad_underperforming', e.target.checked)}
              className="h-5 w-5 rounded border-gray-300"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
            <div>
              <p className="font-medium">Cotización Manual Requerida</p>
              <p className="text-sm text-muted-foreground">
                Notificar cuando un paquete requiera cotización manual (cambio de precio mayor al 10%)
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.notify_needs_manual_quote}
              onChange={(e) => updateSetting('notify_needs_manual_quote', e.target.checked)}
              className="h-5 w-5 rounded border-gray-300"
            />
          </label>
        </div>
      </div>

      {/* Thresholds */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Umbrales</h2>
        <p className="text-sm text-muted-foreground">
          Configura los umbrales que disparan las notificaciones
        </p>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Cambio de Precio Mínimo (%)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={settings.price_change_threshold_pct ?? 0}
              onChange={(e) => updateSetting('price_change_threshold_pct', parseFloat(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Solo notificar si el precio cambia más de este %
            </p>
          </div>

          <div className="space-y-2">
            <Label>CTR Mínimo (%)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={settings.ctr_threshold_pct ?? 0}
              onChange={(e) => updateSetting('ctr_threshold_pct', parseFloat(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Alertar si CTR está por debajo
            </p>
          </div>

          <div className="space-y-2">
            <Label>CPL Máximo ($)</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              value={settings.cpl_threshold ?? 0}
              onChange={(e) => updateSetting('cpl_threshold', parseFloat(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Alertar si CPL está por encima
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={saving} size="lg">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Guardar Configuración
        </Button>
      </div>
    </div>
  )
}
