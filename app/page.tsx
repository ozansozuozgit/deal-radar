'use client'
import { useEffect, useState } from 'react'
import { SetupCard } from '@/components/SetupCard'
import { Feed } from '@/components/Feed'
import { loadPrefs, type Prefs } from '@/lib/client/prefs'

export default function Home() {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [ready, setReady] = useState(false)
  const [editing, setEditing] = useState(false)
  // prefs live in localStorage, which only exists after hydration
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPrefs(loadPrefs()); setReady(true) }, [])
  if (!ready) return null
  if (!prefs || editing) return <SetupCard initial={prefs} onDone={p => { setPrefs(p); setEditing(false) }} />
  return <Feed prefs={prefs} onOpenSetup={() => setEditing(true)} />
}
