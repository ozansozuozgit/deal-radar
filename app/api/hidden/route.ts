import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

// "Not interested" terms for a list code; hidden from the feed and For you everywhere.

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.toUpperCase()
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })
  const db = getServiceClient()
  const { data, error } = await db.from('hidden_terms').select('term').eq('list_code', code).order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ terms: (data ?? []).map(r => r.term) })
}

async function write(req: NextRequest, method: 'POST' | 'DELETE') {
  const { code, term } = await req.json().catch(() => ({}))
  const t = typeof term === 'string' ? term.trim().toLowerCase().slice(0, 80) : ''
  if (typeof code !== 'string' || !code || !t) return NextResponse.json({ error: 'code and term required' }, { status: 400 })
  const db = getServiceClient()
  const { error } = method === 'POST'
    ? await db.from('hidden_terms').upsert({ list_code: code.toUpperCase(), term: t }, { onConflict: 'list_code,term' })
    : await db.from('hidden_terms').delete().eq('list_code', code.toUpperCase()).eq('term', t)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const POST = (req: NextRequest) => write(req, 'POST')
export const DELETE = (req: NextRequest) => write(req, 'DELETE')
