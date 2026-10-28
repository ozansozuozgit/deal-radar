'use client' // Replaces the root layout when it fails, so it brings its own <html>/<body>

export default function GlobalError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0a0a', color: '#ededed', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 40 }}>📡</div>
          <h1 style={{ fontSize: 18 }}>Deal Radar hit a snag</h1>
          <button onClick={() => unstable_retry()}
            style={{ marginTop: 16, padding: '12px 20px', borderRadius: 12, border: 0, background: '#059669', color: '#fff', fontSize: 14 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
