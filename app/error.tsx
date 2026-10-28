'use client' // Error boundaries must be Client Components
import { useEffect } from 'react'
import { PREFS_KEY } from '@/lib/client/prefs'
import { writeString } from '@/lib/client/storage'

export default function Error({ error, unstable_retry }: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="text-4xl mb-3">📡</div>
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-neutral-400 mt-1">Your list and watches are safe on this device.</p>
        <div className="mt-5 flex flex-col gap-2">
          <button onClick={() => unstable_retry()}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3 text-sm font-semibold">Try again</button>
          <button onClick={() => { window.location.reload() }}
            className="rounded-xl border border-neutral-700 py-3 text-sm text-neutral-200 hover:bg-neutral-800">Reload the app</button>
          {/* last resort if saved settings are what's breaking it; keeps list and watches */}
          <button onClick={() => { writeString(PREFS_KEY, null); window.location.assign('/') }}
            className="text-xs text-neutral-500 hover:text-neutral-300 mt-2">Reset location settings</button>
        </div>
      </div>
    </div>
  )
}
