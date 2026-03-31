import { NextResponse } from 'next/server'
import { fetchVendedoresData, clearVendedoresCache } from '@/lib/google-sheets/client'

const SPREADSHEET_ID = '1fSjNwKpXVrq38RAd2NQJ-Oq2bSVomxGhEUfBa1sI5Ck'
const GID = 1408433781

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const refresh = searchParams.get('refresh') === 'true'

    if (refresh) {
      clearVendedoresCache()
    }

    const data = await fetchVendedoresData(SPREADSHEET_ID, GID, refresh)
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching vendedores data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vendedores data' },
      { status: 500 }
    )
  }
}
