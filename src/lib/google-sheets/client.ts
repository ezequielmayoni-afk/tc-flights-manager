import { google } from 'googleapis'

const IMPERSONATE_EMAIL = process.env.GOOGLE_DRIVE_IMPERSONATE_EMAIL || 'emayoni@siviajo.com'

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS!)
  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
    subject: IMPERSONATE_EMAIL,
  })
}

function getSheets() {
  const auth = getAuth()
  return google.sheets({ version: 'v4', auth })
}

// Simple in-memory cache
let cachedData: { data: VendedoresData; timestamp: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export interface VendedorMonthData {
  month: string
  objetivo: number
  producido: number
  porcentaje: number
  cuenta?: boolean
  qVentas?: number
  qChicas?: number
}

export interface Vendedor {
  nombre: string
  equipo: 'Comercial' | 'Sports' | 'Plus'
  monthlyData: VendedorMonthData[]
  fechaAlta?: string | null   // YYYY-MM-DD
  fechaBaja?: string | null   // YYYY-MM-DD
}

export interface TeamSummary {
  equipo: string
  monthlyData: VendedorMonthData[]
}

export interface VendedoresData {
  vendedores: Vendedor[]
  teams: TeamSummary[]
  facturacionVenta: VendedorMonthData[]
  facturacionCreacion: VendedorMonthData[]
  availableMonths: string[]
  lastUpdated: string
}

function parseNumber(val: string | undefined): number {
  if (!val) return 0
  // Remove "USD $", "USD", "-USD $", dots as thousands sep, and handle commas as decimal
  const cleaned = val
    .replace(/USD\s*\$?\s*/g, '')
    .replace(/-\s*USD\s*\$?\s*/g, '-')
    .replace(/\./g, '')  // remove thousands separator dots
    .replace(',', '.')   // comma -> decimal point
    .trim()
  if (!cleaned || cleaned === '-') return 0
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function parsePercentage(val: string | undefined): number {
  if (!val) return 0
  const cleaned = val.replace('%', '').replace(',', '.').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function parseQty(val: string | undefined): number {
  if (!val) return 0
  const cleaned = val.replace(',', '.').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

// Month names mapping
const MONTH_NAMES: Record<string, string> = {
  'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
  'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
  'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12',
}

interface MonthColumn {
  month: string // YYYY-MM
  label: string // "enero/25"
  startCol: number
  hasExtendedCols: boolean // Jul 2025+ has Cuenta, Q Ventas, Q Chicas
}

function parseMonthColumns(headerRow: string[]): MonthColumn[] {
  const months: MonthColumn[] = []

  for (let i = 2; i < headerRow.length; i++) {
    const cell = (headerRow[i] || '').trim().toLowerCase()
    if (!cell) continue

    // Match "enero/25", "febrero/26", etc.
    const match = cell.match(/^(\w+)\/(\d{2})$/)
    if (match) {
      const monthNum = MONTH_NAMES[match[1]]
      if (monthNum) {
        const year = parseInt(match[2]) + 2000
        const monthStr = `${year}-${monthNum}`

        // Check if this month has extended columns by looking ahead
        // Extended months have: Cuenta, Q Ventas, Q Chicas, Objetivo, Producido, %
        // Simple months have: Objetivo, Producido, %
        // We detect by checking if the next header row has "Cuenta" at this position
        const hasExtended = year > 2025 || (year === 2025 && parseInt(monthNum) >= 7)

        months.push({
          month: monthStr,
          label: cell,
          startCol: i,
          hasExtendedCols: hasExtended,
        })
      }
    }
  }

  return months
}

function parseVendedorRow(
  row: string[],
  months: MonthColumn[],
  equipo: 'Comercial' | 'Sports' | 'Plus'
): Vendedor | null {
  const nombre = (row[1] || '').trim()
  if (!nombre) return null
  if (nombre.startsWith('TOTAL ')) return null
  if (nombre.includes('TOTAL COMISION') || nombre.includes('TOTAL FACTUR')) return null

  const monthlyData: VendedorMonthData[] = []

  for (const mc of months) {
    let col = mc.startCol

    if (mc.hasExtendedCols) {
      // Extended format: Cuenta, Q Ventas, Q Chicas, Objetivo, Producido, %
      const cuentaVal = (row[col] || '').trim()
      const cuenta = cuentaVal === 'TRUE'
      const qVentas = parseQty(row[col + 1])
      const qChicas = parseQty(row[col + 2])
      const objetivo = parseNumber(row[col + 3])
      const producido = parseNumber(row[col + 4])
      const porcentaje = parsePercentage(row[col + 5])

      monthlyData.push({
        month: mc.month,
        objetivo,
        producido,
        porcentaje,
        cuenta,
        qVentas,
        qChicas,
      })
    } else {
      // Simple format: Objetivo, Producido, %
      const objetivo = parseNumber(row[col])
      const producido = parseNumber(row[col + 1])
      const porcentaje = parsePercentage(row[col + 2])

      monthlyData.push({
        month: mc.month,
        objetivo,
        producido,
        porcentaje,
      })
    }
  }

  return { nombre, equipo, monthlyData }
}

function parseTeamTotalRow(row: string[], months: MonthColumn[]): VendedorMonthData[] {
  const monthlyData: VendedorMonthData[] = []

  for (const mc of months) {
    let col = mc.startCol

    if (mc.hasExtendedCols) {
      // Team total format varies, but generally: count, _, _, Objetivo, Producido, %
      const objetivo = parseNumber(row[col + 3])
      const producido = parseNumber(row[col + 4])
      const porcentaje = parsePercentage(row[col + 5])
      monthlyData.push({ month: mc.month, objetivo, producido, porcentaje })
    } else {
      // Simple: _, _, %
      const porcentaje = parsePercentage(row[col + 2])
      monthlyData.push({ month: mc.month, objetivo: 0, producido: 0, porcentaje })
    }
  }

  return monthlyData
}

export async function fetchVendedoresData(
  spreadsheetId: string,
  gid: number,
  forceRefresh = false
): Promise<VendedoresData> {
  // Check cache
  if (!forceRefresh && cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
    return cachedData.data
  }

  const sheets = getSheets()

  // Get spreadsheet metadata to find sheet name from GID
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title))',
  })

  const sheet = meta.data.sheets?.find(s => s.properties?.sheetId === gid)
  const sheetName = sheet?.properties?.title || 'Sheet1'

  // Fetch all data
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'`,
    valueRenderOption: 'FORMATTED_VALUE',
  })

  const rows = response.data.values || []
  if (rows.length < 3) {
    throw new Error('Spreadsheet has insufficient data')
  }

  // Row 0 = month headers, Row 1 = sub-headers (Objetivo/Producido/%)
  const headerRow = rows[0].map((v: unknown) => String(v || ''))
  const months = parseMonthColumns(headerRow)

  const vendedores: Vendedor[] = []
  const teams: TeamSummary[] = []
  let facturacionVenta: VendedorMonthData[] = []
  let facturacionCreacion: VendedorMonthData[] = []

  let currentEquipo: 'Comercial' | 'Sports' | 'Plus' = 'Comercial'

  // Parse data rows (start from row 2)
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i].map((v: unknown) => String(v || ''))
    const col1 = (row[1] || '').trim()

    if (!col1) continue

    // Detect team switches
    if (col1.includes('TOTAL EQUIPO COMERCIAL')) {
      teams.push({ equipo: 'Comercial', monthlyData: parseTeamTotalRow(row, months) })
      currentEquipo = 'Sports'
      continue
    }
    if (col1.includes('TOTAL EQUIPO SPORTS')) {
      teams.push({ equipo: 'Sports', monthlyData: parseTeamTotalRow(row, months) })
      currentEquipo = 'Plus'
      continue
    }
    if (col1.includes('TOTAL EQUIPO PLUS')) {
      teams.push({ equipo: 'Plus', monthlyData: parseTeamTotalRow(row, months) })
      continue
    }

    // Detect facturacion rows
    if (col1.includes('TOTAL FACTUR') && col1.includes('fecha de venta')) {
      facturacionVenta = parseTeamTotalRow(row, months)
      continue
    }
    if (col1.includes('TOTAL FACTUR') && col1.includes('fecha de creaci')) {
      facturacionCreacion = parseTeamTotalRow(row, months)
      continue
    }

    // Skip total/summary rows
    if (col1.startsWith('TOTAL ')) continue

    // Detect section headers for Sports (they have different column structure)
    // Sports section has its own header row with "Cuenta, _, Producido, Objetivo, Facturado, %"
    if (col1.includes('GONZALEZ,LEANDRO') || col1.includes('GONZALEZ AMIGO') || col1.includes('BADINO')) {
      // This is a Sports team member - parse differently
      const vendedor = parseVendedorRow(row, months, 'Sports')
      if (vendedor) vendedores.push(vendedor)
      continue
    }

    // Plus team members
    if (col1.startsWith('PLUS,')) {
      const vendedor = parseVendedorRow(row, months, 'Plus')
      if (vendedor) vendedores.push(vendedor)
      continue
    }

    // Regular Comercial vendedor
    const vendedor = parseVendedorRow(row, months, currentEquipo)
    if (vendedor) vendedores.push(vendedor)
  }

  // Fill in missing team totals for simple months (ene-jun) by summing individual vendedores
  for (const team of teams) {
    for (const monthData of team.monthlyData) {
      if (monthData.objetivo === 0 && monthData.producido === 0 && monthData.porcentaje !== 0) {
        // Sum from individual vendedores of this team
        const teamName = team.equipo as 'Comercial' | 'Sports' | 'Plus'
        const teamVendedores = vendedores.filter(v => v.equipo === teamName)
        let totalObj = 0
        let totalProd = 0
        for (const v of teamVendedores) {
          const vm = v.monthlyData.find(m => m.month === monthData.month)
          if (vm) {
            totalObj += vm.objetivo
            totalProd += vm.producido
          }
        }
        monthData.objetivo = totalObj
        monthData.producido = totalProd
      }
    }
  }

  // Merge Plus vendedores into their Comercial counterparts (same person, different product line)
  // PLUS,SOL → GHISI,SOL, PLUS,ALISON → FERRO,ALISON, etc. Match by first name (after comma)
  const plusVendedores = vendedores.filter(v => v.equipo === 'Plus')
  const nonPlusVendedores = vendedores.filter(v => v.equipo !== 'Plus')

  for (const plusV of plusVendedores) {
    const firstName = plusV.nombre.split(',')[1]?.trim().toUpperCase()
    if (!firstName) continue

    const match = nonPlusVendedores.find(v => {
      const vFirstName = v.nombre.split(',')[1]?.trim().toUpperCase()
      return vFirstName === firstName
    })

    if (match) {
      // Sum Plus producido into the matching vendedor for each month
      for (const plusMonth of plusV.monthlyData) {
        const targetMonth = match.monthlyData.find(m => m.month === plusMonth.month)
        if (targetMonth) {
          targetMonth.producido += plusMonth.producido
          // Recalculate percentage based on the original objetivo
          if (targetMonth.objetivo > 0) {
            targetMonth.porcentaje = (targetMonth.producido / targetMonth.objetivo) * 100
          }
          if (plusMonth.qVentas) {
            targetMonth.qVentas = (targetMonth.qVentas || 0) + plusMonth.qVentas
          }
          if (plusMonth.qChicas) {
            targetMonth.qChicas = (targetMonth.qChicas || 0) + plusMonth.qChicas
          }
        }
      }
    }
  }

  // Also sum Plus team totals into Comercial team totals
  const comercialTeam = teams.find(t => t.equipo === 'Comercial')
  const plusTeam = teams.find(t => t.equipo === 'Plus')
  if (comercialTeam && plusTeam) {
    for (const plusMonth of plusTeam.monthlyData) {
      const targetMonth = comercialTeam.monthlyData.find(m => m.month === plusMonth.month)
      if (targetMonth) {
        targetMonth.producido += plusMonth.producido
        targetMonth.objetivo += plusMonth.objetivo
        if (targetMonth.objetivo > 0) {
          targetMonth.porcentaje = (targetMonth.producido / targetMonth.objetivo) * 100
        }
      }
    }
  }

  // Remove Plus from teams and vendedores
  const mergedTeams = teams.filter(t => t.equipo !== 'Plus')

  const data: VendedoresData = {
    vendedores: nonPlusVendedores,
    teams: mergedTeams,
    facturacionVenta,
    facturacionCreacion,
    availableMonths: months.map(m => m.month),
    lastUpdated: new Date().toISOString(),
  }

  cachedData = { data, timestamp: Date.now() }
  return data
}

export function clearVendedoresCache() {
  cachedData = null
}
