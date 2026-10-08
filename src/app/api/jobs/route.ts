import { NextRequest, NextResponse } from 'next/server'
import { loadResults, loadHistory } from '@/lib/scanner/storage'
import { loadApplications, getApplicationStats } from '@/lib/scanner/applications'

export async function GET() {
  const results = loadResults()
  const history = loadHistory()
  const applications = loadApplications()
  const stats = getApplicationStats()

  return NextResponse.json({
    results,
    history,
    hasData: !!results,
    applications,
    applicationStats: stats,
  })
}
