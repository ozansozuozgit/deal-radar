import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'

// The endpoint is public (anyone with the app URL can press "Refresh now"), so keep
// it cheap to abuse: at most one scan per cooldown, and never a second while one runs.
const COOLDOWN_MIN = 15

export async function POST() {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  const repo = process.env.GITHUB_REPO // e.g. "ozansozuozgit/deal-radar"
  if (!token || !repo) return NextResponse.json({ error: 'refresh not configured' }, { status: 501 })

  const since = new Date(Date.now() - COOLDOWN_MIN * 60_000).toISOString()
  const { data: recent } = await getServiceClient().from('ingest_runs')
    .select('finished_at').gte('finished_at', since).limit(1)
  if (recent?.length) {
    return NextResponse.json({ error: `Deals were refreshed in the last ${COOLDOWN_MIN} minutes`, reason: 'cooldown' }, { status: 429 })
  }

  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
  const base = `https://api.github.com/repos/${repo}/actions/workflows/ingest.yml`
  for (const status of ['in_progress', 'queued']) {
    const res = await fetch(`${base}/runs?status=${status}&per_page=1`, { headers, signal: AbortSignal.timeout(10_000) })
      .catch(() => null)
    const runs = res?.ok ? await res.json().catch(() => null) : null
    if (runs?.total_count > 0) return NextResponse.json({ ok: true, alreadyRunning: true })
  }

  const res = await fetch(`${base}/dispatches`, {
    method: 'POST', headers,
    body: JSON.stringify({ ref: 'main' }),
    signal: AbortSignal.timeout(10_000),
  })
  return res.status === 204
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: `GitHub ${res.status}` }, { status: 502 })
}
