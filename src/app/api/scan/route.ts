import { NextRequest, NextResponse } from 'next/server'
import { runScan } from '@/lib/scanner/index'

// Manual scan trigger (for testing or on-demand scans)
export async function POST(req: NextRequest) {
  // Simple auth check (optional — can be disabled for local dev)
  const authHeader = req.headers.get('authorization')
  const expectedToken = process.env.SCAN_API_TOKEN

  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Run the scan in the background (don't block the response)
    runScan()
      .then((result) => {
        console.log('Manual scan complete:', result.totalMatched, 'jobs matched')
      })
      .catch((err) => {
        console.error('Manual scan failed:', err)
      })

    return NextResponse.json({
      message: 'Scan started in background. Check back in a few minutes.',
      startedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
