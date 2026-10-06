import { NextResponse } from 'next/server'
import { loadResults, loadHistory } from '@/lib/scanner/storage'

export async function GET() {
  const results = loadResults()
  const history = loadHistory()

  return NextResponse.json({
    results,
    history,
    hasData: !!results,
  })
}
