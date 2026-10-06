'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Briefcase,
  ExternalLink,
  Copy,
  Check,
  Mail,
  RefreshCw,
  Clock,
  TrendingUp,
  Bell,
  Search,
  Building2,
  Calendar,
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
  category: string
  tags: string[]
  salary?: string
  postedAt: string
  source: string
  matchScore: number
  matchReason: string
  experienceFit: string
  coverLetter?: string
}

interface ScanData {
  results: {
    scanDate: string
    totalScraped: number
    totalMatched: number
    jobs: MatchedJob[]
    notified: boolean
  } | null
  history: { scanDate: string; totalScraped: number; totalMatched: number; notified: boolean }[]
  hasData: boolean
}

export default function Home() {
  const [data, setData] = useState<ScanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [selectedJob, setSelectedJob] = useState<MatchedJob | null>(null)
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState<'all' | 'high' | 'mid'>('all')

  const fetchJobs = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/jobs')
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Fetch jobs on mount
    fetch('/api/jobs')
      .then((res) => res.json())
      .then((json) => {
        setData(json)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to fetch jobs:', err)
        setLoading(false)
      })
  }, [])

  const handleScan = async () => {
    try {
      setScanning(true)
      await fetch('/api/scan', { method: 'POST' })
      // Poll for results after a delay
      setTimeout(() => {
        fetchJobs()
        setScanning(false)
      }, 10000)
    } catch (err) {
      console.error('Scan failed:', err)
      setScanning(false)
    }
  }

  const handleApply = async (job: MatchedJob) => {
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      })
      const data = await res.json()

      if (data.applyUrl) {
        // Open the apply URL in a new tab
        window.open(data.applyUrl, '_blank')
      }

      // If there's a cover letter, show it in a modal for easy copying
      if (data.coverLetter) {
        setSelectedJob({ ...job, coverLetter: data.coverLetter })
      }
    } catch (err) {
      console.error('Apply failed:', err)
    }
  }

  const handleCopyCoverLetter = async (coverLetter: string) => {
    try {
      await navigator.clipboard.writeText(coverLetter)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  const handleEmailApply = (job: MatchedJob) => {
    if (!job.coverLetter) return
    const subject = `Application for ${job.title} — Ajibade Hassan`
    const body = job.coverLetter
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  const filteredJobs = data?.results?.jobs.filter((job) => {
    if (filter === 'high') return job.matchScore >= 80
    if (filter === 'mid') return job.matchScore >= 60 && job.matchScore < 80
    return true
  }) || []

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'bg-emerald-100 text-emerald-700 border-emerald-300'
    if (score >= 70) return 'bg-blue-100 text-blue-700 border-blue-300'
    return 'bg-amber-100 text-amber-700 border-amber-300'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/50 via-background to-sky-50/50 dark:from-blue-950/20 dark:via-background dark:to-sky-950/20">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-sky-500 text-white">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Job Scanner</h1>
              <p className="text-xs text-muted-foreground leading-tight">AI-powered remote job hunter</p>
            </div>
          </div>
          <Button
            onClick={handleScan}
            disabled={scanning}
            className="bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600 text-white border-0"
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', scanning && 'animate-spin')} />
            {scanning ? 'Scanning...' : 'Scan Now'}
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Stats */}
        {data?.results && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
          >
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Jobs Scraped</p>
                    <p className="text-2xl font-bold mt-1">{data.results.totalScraped}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                    <Briefcase className="h-5 w-5 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Matched</p>
                    <p className="text-2xl font-bold mt-1 text-emerald-600">{data.results.totalMatched}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Last Scan</p>
                    <p className="text-sm font-bold mt-1">
                      {new Date(data.results.scanDate).toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
                    <Clock className="h-5 w-5 text-amber-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">WhatsApp</p>
                    <p className="text-sm font-bold mt-1">
                      {data.results.notified ? '✓ Sent' : 'Pending'}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
                    <Bell className="h-5 w-5 text-teal-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Filters */}
        {(data?.results?.jobs?.length ?? 0) > 0 && (
          <div className="flex gap-2 mb-6">
            {[
              { key: 'all', label: 'All Matches' },
              { key: 'high', label: 'High Match (80+)' },
              { key: 'mid', label: 'Good Match (60-79)' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key as any)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                  filter === f.key
                    ? 'bg-blue-500 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Jobs list */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : !data?.hasData ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No scans yet</h2>
              <p className="text-muted-foreground mb-6">
                Click "Scan Now" to search 6 job boards for remote positions matching your profile.
              </p>
              <Button
                onClick={handleScan}
                disabled={scanning}
                className="bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600 text-white border-0"
              >
                <RefreshCw className={cn('mr-2 h-4 w-4', scanning && 'animate-spin')} />
                {scanning ? 'Scanning...' : 'Start First Scan'}
              </Button>
            </CardContent>
          </Card>
        ) : filteredJobs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">No jobs match this filter. Try another filter or scan again.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredJobs.map((job, idx) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge variant="outline" className={cn('border', getScoreColor(job.matchScore))}>
                            <TrendingUp className="mr-1 h-3 w-3" />
                            {job.matchScore}/100
                          </Badge>
                          <Badge variant="outline" className="capitalize text-xs">
                            {job.experienceFit}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {job.source}
                          </Badge>
                          {job.salary && (
                            <Badge variant="outline" className="text-xs text-emerald-600">
                              {job.salary}
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-semibold text-lg mb-1">{job.title}</h3>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            {job.company}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(job.postedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                          {job.description.slice(0, 200)}...
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-400 italic">
                          💡 {job.matchReason}
                        </p>
                        {job.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {job.tags.slice(0, 6).map((tag) => (
                              <span key={tag} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex sm:flex-col gap-2 flex-shrink-0">
                        <Button
                          onClick={() => handleApply(job)}
                          className="bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600 text-white border-0"
                        >
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          Apply
                        </Button>
                        {job.coverLetter && (
                          <Button
                            variant="outline"
                            onClick={() => setSelectedJob(job)}
                          >
                            <Mail className="mr-1.5 h-3.5 w-3.5" />
                            Cover Letter
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Scan history */}
        {data?.history && data.history.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-semibold mb-4">Scan History</h2>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {data.history.slice(-10).reverse().map((entry, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                      <span className="text-muted-foreground">
                        {new Date(entry.scanDate).toLocaleString(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                      <div className="flex gap-4">
                        <span>{entry.totalScraped} scraped</span>
                        <span className="text-emerald-600">{entry.totalMatched} matched</span>
                        <span>{entry.notified ? '🔔' : '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Cover Letter Modal */}
      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cover Letter — {selectedJob?.title}</DialogTitle>
            <DialogDescription>
              For {selectedJob?.company} • Match score: {selectedJob?.matchScore}/100
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                {selectedJob?.coverLetter}
              </pre>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => handleCopyCoverLetter(selectedJob?.coverLetter || '')}
                className="flex-1 bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600 text-white border-0"
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy to Clipboard
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => selectedJob && handleEmailApply(selectedJob)}
              >
                <Mail className="mr-2 h-4 w-4" />
                Email Apply
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open(selectedJob?.applyUrl || selectedJob?.url, '_blank')}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Job
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
