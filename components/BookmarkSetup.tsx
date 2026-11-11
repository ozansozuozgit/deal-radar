'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

const KEY_STORE = 'deal-radar-import-key'

interface Store { name: string; href: string; page: string; pageLabel: string; note: string }

function remembered(): string {
  try { return localStorage.getItem(KEY_STORE) ?? '' } catch { return '' }
}
function remember(key: string) {
  try { if (key) localStorage.setItem(KEY_STORE, key); else localStorage.removeItem(KEY_STORE) } catch { /* private mode: lasts this visit */ }
}

/**
 * The "Send to Deal Radar" bookmarks, ready to drag, with the import key filled in. The key
 * is typed once per device and kept in this browser only. Phones can't drag, so each
 * bookmark can also be copied and pasted as a saved bookmark's address.
 */
export function BookmarkSetup({ site, keyToken, stores }: { site: string; keyToken: string; stores: Store[] }) {
  const [key, setKey] = useState('')
  const [origin, setOrigin] = useState('')
  const [check, setCheck] = useState<'idle' | 'checking' | 'ok' | 'wrong' | 'error'>('idle')
  const [copied, setCopied] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // an empty import is refused after the key is checked: 401 means the key is wrong
  function verify(k: string) {
    if (timer.current) clearTimeout(timer.current)
    if (!k) { setCheck('idle'); return }
    setCheck('checking')
    timer.current = setTimeout(() => fetch('/api/import/netcost', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` }, body: '{}',
    }).then(r => {
      setCheck(r.status === 401 ? 'wrong' : r.status === 400 ? 'ok' : 'error')
      if (r.status === 400) remember(k)
    }).catch(() => setCheck('error')), 400)
  }

  // localStorage and the site's address only exist in the browser
  useEffect(() => {
    const k = remembered()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(location.origin); setKey(k); verify(k)
  }, [])

  const ready = check === 'ok' && !!origin
  const filled = (href: string) => href
    .split(keyToken).join(encodeURIComponent(JSON.stringify(key.trim())))
    .split(site).join(encodeURIComponent(JSON.stringify(origin).slice(1, -1)))

  // React won't render a javascript: address, so the bookmarks are set on the links directly
  const links = useRef<Record<string, HTMLAnchorElement | null>>({})
  useEffect(() => {
    for (const st of stores) {
      const el = links.current[st.name]
      if (!el) continue
      if (ready) el.setAttribute('href', filled(st.href))
      else el.removeAttribute('href')
    }
  })

  async function copy(name: string, href: string) {
    try { await navigator.clipboard.writeText(filled(href)); setCopied(name) } catch { setCopied(null) }
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-sky-400 hover:underline">← Deal Radar</Link>
      <h1 className="mt-3 font-condensed font-extrabold text-2xl">Store bookmarks</h1>
      <p className="mt-2 text-sm text-neutral-400">
        NetCost and Amazon only answer real browsers, so their deals come in through a bookmark you press on their site.
      </p>

      <label className="mt-6 block text-sm font-bold" htmlFor="key">Import key</label>
      <input id="key" type="password" autoComplete="off" value={key} onChange={e => { setKey(e.target.value); verify(e.target.value.trim()) }}
        placeholder="IMPORT_KEY from Vercel"
        className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm" />
      <p className="mt-1 text-xs text-neutral-500 min-h-4">
        {check === 'idle' && 'Typed once on this device, then remembered here only.'}
        {check === 'checking' && 'Checking…'}
        {check === 'ok' && 'Key works. Remembered on this device.'}
        {check === 'wrong' && 'That key is wrong.'}
        {check === 'error' && 'Could not check the key. Try again.'}
      </p>

      <ul className="mt-6 flex flex-col gap-4">
        {stores.map(s => (
          <li key={s.name} className="rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <a ref={el => { links.current[s.name] = el }} onClick={e => e.preventDefault()} draggable={ready}
                aria-disabled={!ready}
                className={`rounded-lg px-4 py-2 font-bold ${ready ? 'bg-badge text-on-badge cursor-grab' : 'bg-badge text-on-badge opacity-40 cursor-not-allowed'}`}>
                {s.name}: Send to Deal Radar
              </a>
              <button disabled={!ready} onClick={() => copy(s.name, s.href)}
                className="text-sm text-sky-400 hover:underline disabled:opacity-50 disabled:no-underline">
                {copied === s.name ? 'Copied' : 'Copy instead'}
              </button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Press it on the <a href={s.page} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">{s.pageLabel}</a>. {s.note}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-6 text-xs text-neutral-500 flex flex-col gap-1.5">
        <p><b>On a computer:</b> drag a button to your bookmarks bar, and delete any older copy of it.</p>
        <p><b>On a phone or where dragging doesn&apos;t work:</b> press Copy instead, bookmark any page, then edit that bookmark and paste over its address.</p>
      </div>
    </main>
  )
}
