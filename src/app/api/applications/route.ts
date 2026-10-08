import { NextRequest, NextResponse } from 'next/server'
import { loadApplications, updateApplicationStatus } from '@/lib/scanner/applications'

export async function GET() {
  return NextResponse.json({
    applications: loadApplications(),
  })
}

export async function PATCH(req: NextRequest) {
  try {
    const { jobId, status } = await req.json()
    if (!jobId || !status) {
      return NextResponse.json({ error: 'jobId and status are required' }, { status: 400 })
    }
    updateApplicationStatus(jobId, status)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
