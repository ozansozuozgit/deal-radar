import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const ITEM_COLUMNS = 'text, qty, unit, pinned_deal_id, rejected_deal_ids, checked, created_at'
const UNITS = new Set(['lb', 'oz', 'kg', 'g', 'gal', 'l', 'ml'])

function newCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

function cleanQty(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n < 1000 ? Math.round(n * 100) / 100 : undefined
}
function cleanUnit(v: unknown): string | null | undefined {
  if (v === null) return null
  return typeof v === 'string' && UNITS.has(v) ? v : undefined
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.toUpperCase()
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })
  const db = getServiceClient()
  const { data, error } = await db.from('list_items').select(ITEM_COLUMNS)
    .eq('code', code).order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

/** Create a list (no code) and/or add items: { code?, text?, qty?, unit?, pinnedDealId?, items?: [...] } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const raw: unknown[] = Array.isArray(body.items) ? body.items
    : Array.isArray(body.texts) ? body.texts
    : body.text ? [body] : []
  const rows = raw
    .map(r => (typeof r === 'string' ? { text: r } : (r ?? {}) as Record<string, unknown>))
    .filter(r => typeof r.text === 'string' && !!r.text.trim())
    .slice(0, 200)
    .map(r => {
      const row: Record<string, unknown> = { text: String(r.text).trim().slice(0, 120) }
      const qty = cleanQty(r.qty); if (qty !== undefined) row.qty = qty
      const unit = cleanUnit(r.unit); if (unit !== undefined) row.unit = unit
      const pin = Number(r.pinnedDealId); if (Number.isInteger(pin) && pin > 0) row.pinned_deal_id = pin
      return row
    })
  let code: string | null = typeof body.code === 'string' ? body.code.toUpperCase() : null
  const db = getServiceClient()
  if (!code) {
    code = newCode()
    const { error } = await db.from('lists').insert({ code })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (rows.length) {
    const { error } = await db.from('list_items')
      .upsert(rows.map(r => ({ code, ...r })), { onConflict: 'code,text', defaultToNull: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ code })
}

/** Change one item: { code, text, qty?, unit?, pinnedDealId?, rejectedDealIds?, checked? } */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { code, text } = body
  if (!code || !text) return NextResponse.json({ error: 'code and text required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  const qty = cleanQty(body.qty); if (qty !== undefined) patch.qty = qty
  const unit = cleanUnit(body.unit); if (unit !== undefined) patch.unit = unit
  if (body.pinnedDealId === null) patch.pinned_deal_id = null
  else if (Number.isInteger(body.pinnedDealId)) patch.pinned_deal_id = body.pinnedDealId
  if (Array.isArray(body.rejectedDealIds)) {
    patch.rejected_deal_ids = body.rejectedDealIds.filter((n: unknown) => Number.isInteger(n)).slice(-200)
  }
  if (typeof body.checked === 'boolean') patch.checked = body.checked
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to change' }, { status: 400 })
  const db = getServiceClient()
  const { error } = await db.from('list_items').update(patch)
    .eq('code', String(code).toUpperCase()).eq('text', text)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** Remove one item ({ code, text }), several ({ code, texts }), or every checked one ({ code, checked: true }). */
export async function DELETE(req: NextRequest) {
  const { code, text, texts, checked } = await req.json().catch(() => ({}))
  if (!code || (!text && !Array.isArray(texts) && checked !== true)) {
    return NextResponse.json({ error: 'code and text, texts or checked required' }, { status: 400 })
  }
  const db = getServiceClient()
  let q = db.from('list_items').delete().eq('code', String(code).toUpperCase())
  if (checked === true) q = q.eq('checked', true)
  else if (Array.isArray(texts)) q = q.in('text', texts.map(String))
  else q = q.eq('text', text)
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
