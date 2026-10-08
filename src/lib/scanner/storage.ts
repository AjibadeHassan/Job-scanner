// Storage — saves and loads scan results + history
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { type MatchedJob } from './matcher'

const DATA_DIR = join(process.cwd(), 'data')
const RESULTS_FILE = join(DATA_DIR, 'results.json')
const HISTORY_FILE = join(DATA_DIR, 'history.json')

export interface ScanResult {
  scanDate: string
  totalScraped: number
  totalNew: number // after dedup
  totalMatched: number
  sourcesUsed: string[]
  sourcesSkipped: number
  jobs: MatchedJob[]
  notified: boolean
  aiProvider: string
}

export interface ScanHistoryEntry {
  scanDate: string
  totalScraped: number
  totalNew: number
  totalMatched: number
  sourcesUsed: string[]
  notified: boolean
}

export function saveResults(result: ScanResult): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(RESULTS_FILE, JSON.stringify(result, null, 2))

  const history = loadHistory()
  history.push({
    scanDate: result.scanDate,
    totalScraped: result.totalScraped,
    totalNew: result.totalNew,
    totalMatched: result.totalMatched,
    sourcesUsed: result.sourcesUsed,
    notified: result.notified,
  })
  writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-100), null, 2))
}

export function loadResults(): ScanResult | null {
  if (!existsSync(RESULTS_FILE)) return null
  try { return JSON.parse(readFileSync(RESULTS_FILE, 'utf-8')) } catch { return null }
}

export function loadHistory(): ScanHistoryEntry[] {
  if (!existsSync(HISTORY_FILE)) return []
  try { return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) } catch { return [] }
}
