'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Briefcase, ExternalLink, Copy, Check, Mail, RefreshCw, Clock,
  TrendingUp, Bell, Search, Building2, Calendar, AlertCircle, CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface MatchedJob {
  id: string
  title: string
  company: string
  description: string
  url: string
  applyUrl?: string
  location: string
  source: string
  matchScore: number
  matchReason: string
  experienceFit: string
  redFlags?: string[]
  coverLetter?: string
  matchMethod: string
  postedAt: string
}

interface ScanData {
  results: {
    scanDate: string
    totalScraped: number
    totalNew: number
    totalMatched: number
    sourcesUsed: string[]
    sourcesSkipped: number
    jobs: MatchedJob[]
    notified: boolean
    aiProvider: string
  } | null
  history: any[]
  hasData: boolean
  applications: { jobId: string; status: string }[]
  applicationStats: { total: number; applied: number; ignored: number }
}

export default function Home() {
  const [data, setData] = useState<ScanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedJob, setSelectedJob] = useState<MatchedJob | null>(null)
  const [copied, setCopied] = useState(false)
  const [appliedJobs, setAppliedJobs] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'high' | 'mid'>('all')

  useEffect(() => {
    fetch('/api/jobs')
      .then((res) => res.json())
      .then((json) => {
        setData(json)
        setAppliedJobs(new Set(json.applications?.map((a: any) => a.jobId) || []))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleApply = async (job: MatchedJob) => {
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      })
      const result = await res.json()

      if (result.mailtoLink) {
        window.open(result.mailtoLink, '_self')
      }
      if (result.applyUrl) {
        window.open(result.applyUrl, '_blank')
      }
      if (result.coverLetter) {
        setSelectedJob({ ...job, coverLetter: result.coverLetter })
      }
      setAppliedJobs((prev) => new Set(prev).add(job.id))
    } catch (err) {
      console.error('Apply failed:', err)
    }
  }

  const handleMarkIgnored = async (jobId: string) => {
    await fetch('/api/applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, status: 'ignored' }),
    })
    setAppliedJobs((prev) => new Set(prev).add(jobId))
  }

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const filteredJobs = data?.results?.jobs.filter((job) => {
    if (filter === 'high') return job.matchScore >= 70
    if (filter === 'mid') return job.matchScore >= 40 && job.matchScore < 70
    return true
  }) || []

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'bg-emerald-100 text-emerald-700 border-emerald-300'
    if (score >= 50) return 'bg-blue-100 text-blue-700 border-blue-300'
    return 'bg-amber-100 text-amber-700 border-amber-300'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/50 via-background to-sky-50/50 dark:from-blue-950/20 dark:via-background dark:to-sky-950/20">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-sky-500 text-white">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Job Scanner v2</h1>
              <p className="text-xs text-muted-foreground leading-tight">Rotating sources · Deduped · AI-matched</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data?.applicationStats && (
              <Badge variant="outline" className="hidden sm:inline-flex">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                {data.applicationStats.applied} applied
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {data?.results && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="border-0 shadow-sm"><CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-muted-foreground uppercase tracking-wide">New Jobs</p>
                <p className="text-2xl font-bold mt-1">{data.results.totalNew}</p></div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50"><Briefcase className="h-5 w-5 text-blue-500" /></div>
              </div>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Matched</p>
                <p className="text-2xl font-bold mt-1 text-emerald-600">{data.results.totalMatched}</p></div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50"><TrendingUp className="h-5 w-5 text-emerald-500" /></div>
              </div>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Sources</p>
                <p className="text-2xl font-bold mt-1">{data.results.sourcesUsed.length}</p>
                <p className="text-xs text-muted-foreground">{data.results.sourcesSkipped} on cooldown</p></div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50"><Clock className="h-5 w-5 text-amber-500" /></div>
              </div>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-muted-foreground uppercase tracking-wide">AI Provider</p>
                <p className="text-sm font-bold mt-1 capitalize">{data.results.aiProvider}</p>
                <p className="text-xs text-muted-foreground">{data.results.notified ? 'Telegram sent' : 'No notif'}</p></div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50"><Bell className="h-5 w-5 text-teal-500" /></div>
              </div>
            </CardContent></Card>
          </motion.div>
        )}

        {(data?.results?.jobs?.length ?? 0) > 0 && (
          <div className="flex gap-2 mb-6">
            {[{ k: 'all', l: 'All' }, { k: 'high', l: 'High (70+)' }, { k: 'mid', l: 'Good (40-69)' }].map((f) => (
              <button key={f.k} onClick={() => setFilter(f.k as any)}
                className={cn('px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                  filter === f.k ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
                {f.l}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
        ) : !data?.hasData ? (
          <Card className="border-dashed"><CardContent className="p-12 text-center">
            <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No scans yet</h2>
            <p className="text-muted-foreground">The scanner runs hourly via GitHub Actions. Check back soon.</p>
          </CardContent></Card>
        ) : filteredJobs.length === 0 ? (
          <Card className="border-dashed"><CardContent className="p-12 text-center">
            <p className="text-muted-foreground">No new jobs in this filter. The scanner rotates sources every hour — new jobs will appear as different sources are scraped.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {filteredJobs.map((job, idx) => (
              <motion.div key={job.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge variant="outline" className={cn('border', getScoreColor(job.matchScore))}>
                            <TrendingUp className="mr-1 h-3 w-3" />{job.matchScore}/100
                          </Badge>
                          <Badge variant="outline" className="capitalize text-xs">{job.experienceFit}</Badge>
                          <Badge variant="outline" className="text-xs">{job.source}</Badge>
                          <Badge variant="outline" className="text-xs capitalize">{job.matchMethod}</Badge>
                          {job.redFlags && job.redFlags.length > 0 && job.redFlags.map((flag, i) => (
                            <Badge key={i} variant="outline" className="text-xs text-red-600 border-red-300"><AlertCircle className="mr-1 h-3 w-3" />{flag}</Badge>
                          ))}
                        </div>
                        <h3 className="font-semibold text-lg mb-1">{job.title}</h3>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                          <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{job.company}</span>
                          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{new Date(job.postedAt).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-blue-600 dark:text-blue-400 italic mb-2">💡 {job.matchReason}</p>
                      </div>
                      <div className="flex sm:flex-col gap-2 flex-shrink-0">
                        {appliedJobs.has(job.id) ? (
                          <Badge className="bg-emerald-500"><CheckCircle2 className="mr-1 h-3 w-3" />Applied</Badge>
                        ) : (
                          <Button onClick={() => handleApply(job)} className="bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600 text-white border-0">
                            <Mail className="mr-1.5 h-3.5 w-3.5" />Apply
                          </Button>
                        )}
                        {job.coverLetter && (
                          <Button variant="outline" onClick={() => setSelectedJob(job)}>Cover Letter</Button>
                        )}
                        {!appliedJobs.has(job.id) && (
                          <Button variant="ghost" size="sm" onClick={() => handleMarkIgnored(job.id)} className="text-muted-foreground">Ignore</Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cover Letter — {selectedJob?.title}</DialogTitle>
            <DialogDescription>For {selectedJob?.company} • Score: {selectedJob?.matchScore}/100</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{selectedJob?.coverLetter}</pre>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => handleCopy(selectedJob?.coverLetter || '')} className="flex-1 bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600 text-white border-0">
                {copied ? <><Check className="mr-2 h-4 w-4" />Copied!</> : <><Copy className="mr-2 h-4 w-4" />Copy</>}
              </Button>
              <Button variant="outline" onClick={() => selectedJob && handleApply(selectedJob)}>
                <Mail className="mr-2 h-4 w-4" />Email Apply
              </Button>
              <Button variant="outline" onClick={() => window.open(selectedJob?.applyUrl || selectedJob?.url, '_blank')}>
                <ExternalLink className="mr-2 h-4 w-4" />Open Job
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
