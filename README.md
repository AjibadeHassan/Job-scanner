# Job Scanner — AI-Powered Remote Job Hunter

Scans 6 free remote job boards every hour, uses AI to match jobs to your profile, generates humanized cover letters, and sends Telegram notifications.

## Features

- **6 Free Job Board APIs**: RemoteOK, Remotive, WeWorkRemotely, Hacker News, Working Nomads, Europe Remote
- **AI Job Matching**: LLM scores each job 0-100 against your GitHub repos + resume
- **AI Cover Letters**: Professional, heavily humanized cover letters for each matched job
- **Telegram Notifications**: Free, unlimited alerts via Telegram Bot API
- **Dashboard**: View matched jobs, read cover letters, apply directly
- **Hourly Scanning**: GitHub Actions cron runs every hour automatically
- **100% Free**: No paid APIs or services

## Setup

### 1. Clone and install
```bash
git clone https://github.com/AjibadeHassan/Job-scanner.git
cd Job-scanner
bun install
```

### 2. Environment variables
```bash
cp .env.example .env
```
Edit `.env` with your details:
- `GITHUB_TOKEN` — GitHub PAT (scope: `repo`) from https://github.com/settings/tokens/new
- `GITHUB_USERNAME` — Your GitHub username
- `TELEGRAM_BOT_TOKEN` — From @BotFather (see below)
- `TELEGRAM_CHAT_ID` — Your Telegram chat ID (see below)

### 3. Set up Telegram notifications (free, 2 minutes)
1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts to create a bot
3. BotFather gives you a **bot token** — save it
4. Search for your new bot and send `/start` to it (this initializes the chat)
5. Get your **chat ID**: search for **@userinfobot** on Telegram and send any message — it replies with your chat ID
6. Add both to your `.env` file

### 4. Run locally
```bash
bun run dev          # Start dashboard on port 3000
bun run scan         # Run a manual scan
```

### 5. Set up GitHub Actions (hourly scanning)
In your GitHub repo settings → Secrets and variables → Actions, add:
- `GITHUB_USERNAME` — Your GitHub username
- `TELEGRAM_BOT_TOKEN` — Your Telegram bot token
- `TELEGRAM_CHAT_ID` — Your Telegram chat ID

The `.github/workflows/scan.yml` workflow runs every hour automatically.

## How It Works

1. **Profile Loader** — Fetches your GitHub repos + resume highlights
2. **Job Scrapers** — Fetches jobs from 6 free APIs in parallel
3. **AI Matcher** — LLM scores each job (0-100) for skill/experience match
4. **Cover Letter Generator** — LLM writes a humanized, job-specific cover letter
5. **Storage** — Results saved as JSON in `data/results.json`
6. **Telegram Notifier** — Top 8 jobs sent via Telegram Bot API
7. **Dashboard** — Next.js UI to view jobs, cover letters, and apply

## Apply Flow

1. View matched jobs on the dashboard
2. Click "Apply" on a job you like
3. The job's application page opens in a new tab
4. Click "Cover Letter" to view, copy, or email the AI-generated letter
5. Paste the cover letter into the application form

## Tech Stack

- Next.js 16 + TypeScript
- z-ai-web-dev-sdk (LLM for matching + cover letters)
- GitHub Actions (hourly cron)
- Telegram Bot API (notifications)
- Tailwind CSS + shadcn/ui (dashboard)

## License

MIT
