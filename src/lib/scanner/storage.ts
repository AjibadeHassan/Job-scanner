// Storage — saves and loads scan results as JSON
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { type MatchedJob } from './matcher'

const DATA_DIR = join(process.cwd(), 'data')
const RESULTS_FILE = join(DATA_DIR, 'results.json')
const HISTORY_FILE = join(DATA_DIR, 'history.json')

export interface ScanResult {
  scanDate: string
  totalScraped: number
  totalMatched: number
  jobs: MatchedJob[]
  notified: boolean
}

export interface ScanHistoryEntry {
  scanDate: string
  totalScraped: number
  totalMatched: number
  notified: boolean
}

export function saveResults(result: ScanResult): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  // Save latest results (overwrites)
  writeFileSync(RESULTS_FILE, JSON.stringify(result, null, 2))

  // Append to history (keeps last 100 scans)
  const history = loadHistory()
  history.push({
    scanDate: result.scanDate,
    totalScraped: result.totalScraped,
    totalMatched: result.totalMatched,
    notified: result.notified,
  })
  const trimmedHistory = history.slice(-100)
  writeFileSync(HISTORY_FILE, JSON.stringify(trimmedHistory, null, 2))
}

export function loadResults(): ScanResult | null {
  if (!existsSync(RESULTS_FILE)) return null
  try {
    return JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'))
  } catch {
    return null
  }
}

export function loadHistory(): ScanHistoryEntry[] {
  if (!existsSync(HISTORY_FILE)) return []
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
  } catch {
    return []
  }
}
