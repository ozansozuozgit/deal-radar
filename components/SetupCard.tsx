'use client'
import { useEffect, useRef, useState } from 'react'
import { loadPrefs, savePrefs, type Prefs } from '@/lib/client/prefs'

interface Suggestion { label: string; lat: number; lng: number; zip: string | null }

const FEATURES: Array<[string, string, string]> = [
  ['🛒', 'Every flyer, one feed', 'Whole Foods, Fairway, Aldi, Target and ~30 more stores near you — scanned automatically every morning.'],
  ['💸', 'Real discounts, ranked', 'Sorted by actual % off with photos and prices, not marketing fluff. No PDFs, no page flipping.'],
  ['🧾', 'Your list, priced out', 'Add your groceries and see which store — or two-store split — is cheapest this week.'],
]

export function SetupCard({ initial, onDone }: { initial: Prefs | null; onDone: (p: Prefs) => void }) {
  const [address, setAddress] = useState(initial?.address ?? '')
  const [radius, setRadius] = useState(initial?.radiusMiles ?? 1.5)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const picked = useRef<Suggestion | null>(initial ? { label: initial.address, lat: initial.lat, lng: initial.lng, zip: initial.zip } : null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current) }, [])

  function onType(value: string) {
    setAddress(value)
    picked.current = null
    setError(null)
    if (debounce.current) clearTimeout(debounce.current)
    if (value.trim().length < 3) { setSuggestions([]); setOpen(false); return }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(value)}`)
        const { suggestions } = await res.json()
        setSuggestions(suggestions ?? [])
        setOpen((suggestions ?? []).length > 0)
        setHighlight(0)
      } catch { /* suggestions are best-effort */ }
    }, 250)
  }

  function choose(s: Suggestion) {
    picked.current = s
    setAddress(s.label)
    setSuggestions([]); setOpen(false)
  }

  async function locateMe() {
    setError(null)
    if (!navigator.geolocation) { setError('Location not available in this browser'); return }
    setBusy(true)
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const { latitude: lat, longitude: lng } = pos.coords
        const res = await fetch(`/api/suggest?mode=reverse&lat=${lat}&lng=${lng}`)
        const { suggestions } = await res.json()
        const s: Suggestion = suggestions?.[0] ?? { label: 'My location', lat, lng, zip: null }
        choose({ ...s, lat, lng })
      } finally { setBusy(false) }
    }, () => { setBusy(false); setError('Could not get your location — type your address instead') },
    { enableHighAccuracy: false, timeout: 10_000 })
  }

  async function submit() {
    setBusy(true); setError(null)
    try {
      let s = picked.current
      if (!s) {
        const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`)
        if (!res.ok) throw new Error((await res.json()).error ?? 'Could not find that address')
        const { lat, lng, zip } = await res.json()
        s = { label: address, lat, lng, zip }
      }
      const saved = loadPrefs()
      const prefs: Prefs = {
        address: s.label, lat: s.lat, lng: s.lng,
        zip: s.zip ?? '10001', radiusMiles: radius,
        // keep store picks unless the location itself changed; read them fresh, since
        // the feed saves chip changes to storage without updating `initial`
        enabledStores: saved && saved.lat === s.lat && saved.lng === s.lng ? saved.enabledStores : null,
      }
      savePrefs(prefs); onDone(prefs)
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(false) }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden flex items-center">
      {/* backdrop glows */}
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 w-[36rem] h-[36rem] rounded-full bg-emerald-600/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -right-32 w-[32rem] h-[32rem] rounded-full bg-sky-600/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      <div className="relative w-full max-w-6xl mx-auto px-6 py-14 grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        {/* pitch */}
        <div>
          <div className="inline-flex items-center gap-3">
            <span className="text-4xl">📡</span>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Deal Radar</h1>
          </div>
          <p className="mt-4 text-lg sm:text-xl text-neutral-300 leading-relaxed max-w-lg">
            Every supermarket deal around you, in one beautiful feed —{' '}
            <span className="text-emerald-400 font-medium">updated every morning.</span>
          </p>
          <div className="mt-8 flex flex-col gap-5">
            {FEATURES.map(([emoji, title, body]) => (
              <div key={title} className="flex gap-4">
                <div className="w-11 h-11 shrink-0 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-xl">{emoji}</div>
                <div>
                  <div className="font-semibold">{title}</div>
                  <div className="text-sm text-neutral-400 leading-relaxed">{body}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 flex items-center gap-2 text-xs text-neutral-500">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            6,000+ deals from ~30 stores scanned daily
          </div>
        </div>

        {/* form */}
        <div className="rounded-3xl bg-neutral-900/80 backdrop-blur border border-neutral-800 p-7 sm:p-8 flex flex-col gap-5 shadow-2xl shadow-black/50">
          <div>
            <h2 className="text-lg font-semibold">Where do you shop?</h2>
            <p className="text-sm text-neutral-400 mt-0.5">We&apos;ll find every supermarket around this spot.</p>
          </div>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">📍</span>
            <input value={address} onChange={e => onType(e.target.value)}
              onKeyDown={e => {
                if (open && e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, suggestions.length - 1)) }
                else if (open && e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
                else if (open && e.key === 'Enter') { e.preventDefault(); choose(suggestions[highlight]) }
                else if (e.key === 'Enter' && address.trim()) submit()
              }}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="Start typing your address…"
              autoFocus
              className="w-full rounded-xl bg-neutral-800 pl-10 pr-4 py-3.5 text-[15px] outline-none focus:ring-2 ring-emerald-600 placeholder:text-neutral-500" />
            {open && (
              <div className="absolute z-20 mt-1.5 w-full rounded-xl bg-neutral-800 border border-neutral-700 overflow-hidden shadow-xl">
                {suggestions.map((s, i) => (
                  <button key={s.label + i}
                    onMouseDown={e => { e.preventDefault(); choose(s) }}
                    className={`block w-full text-left px-4 py-3 text-sm ${i === highlight ? 'bg-neutral-700' : ''}`}>
                    📍 {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-600">
            <div className="flex-1 h-px bg-neutral-800" />or<div className="flex-1 h-px bg-neutral-800" />
          </div>
          <button onClick={locateMe} disabled={busy}
            className="rounded-xl border border-neutral-700 py-3 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 transition-colors">
            📡 Use my current location
          </button>
          <label className="text-sm text-neutral-300">
            <div className="flex justify-between items-baseline">
              <span>Search radius</span>
              <b className="text-emerald-400">{radius} mi</b>
            </div>
            <input type="range" min={0.5} max={10} step={0.5} value={radius}
              onChange={e => setRadius(Number(e.target.value))} className="w-full accent-emerald-500 mt-1.5" />
            <div className="flex justify-between text-[11px] text-neutral-600 mt-0.5"><span>2 blocks</span><span>whole borough</span></div>
          </label>
          {error && <div className="text-sm text-red-400">{error}</div>}
          <button onClick={submit} disabled={busy || !address.trim()}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3.5 text-[15px] font-semibold disabled:opacity-50 transition-all hover:shadow-lg hover:shadow-emerald-900/40">
            {busy ? 'Locating…' : 'Show my deals →'}
          </button>
        </div>
      </div>
    </div>
  )
}
