import { NextResponse } from 'next/server'
import { google } from 'googleapis'

const IMPERSONATE_EMAIL = process.env.GOOGLE_DRIVE_IMPERSONATE_EMAIL || 'emayoni@siviajo.com'

export async function GET() {
  const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS!)
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
    subject: IMPERSONATE_EMAIL,
  })
  const sheets = google.sheets({ version: 'v4', auth })

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: '1fSjNwKpXVrq38RAd2NQJ-Oq2bSVomxGhEUfBa1sI5Ck',
    fields: 'sheets(properties(sheetId,title))',
  })

  const sheet = meta.data.sheets?.find(s => s.properties?.sheetId === 1408433781)
  const sheetName = sheet?.properties?.title || 'Sheet1'

  // Get first 3 rows to see headers
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: '1fSjNwKpXVrq38RAd2NQJ-Oq2bSVomxGhEUfBa1sI5Ck',
    range: `'${sheetName}'!A1:BW3`,
  })

  return NextResponse.json({
    sheetName,
    sheetsFound: meta.data.sheets?.map(s => ({ id: s.properties?.sheetId, title: s.properties?.title })),
    row0: response.data.values?.[0],
    row1: response.data.values?.[1],
    row2: response.data.values?.[2],
  })
}
