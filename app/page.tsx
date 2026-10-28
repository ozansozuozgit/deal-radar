'use client'
import { useEffect, useState } from 'react'
import { SetupCard } from '@/components/SetupCard'
import { Feed } from '@/components/Feed'
import { loadPrefs, savePrefs, type Prefs } from '@/lib/client/prefs'

export default function Home() {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [ready, setReady] = useState(false)
  const [editing, setEditing] = useState<'edit' | 'add' | null>(null)
  // prefs live in localStorage, which only exists after hydration
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPrefs(loadPrefs()); setReady(true) }, [])
  if (!ready) return null
  if (!prefs || editing) {
    return <SetupCard initial={prefs} adding={editing === 'add'}
      onDone={p => { setPrefs(p); setEditing(null) }}
      onCancel={prefs ? () => setEditing(null) : undefined} />
  }
  return <Feed prefs={prefs} onOpenSetup={mode => setEditing(mode)}
    onChangePrefs={p => { savePrefs(p); setPrefs(p) }} />
}
