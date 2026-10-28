'use client'
import { useState, type ImgHTMLAttributes, type ReactNode } from 'react'

/** <img> that swaps to `fallback` when the source 404s or the CDN is down. */
export function Img({ fallback = null, src, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src?: string | null; fallback?: ReactNode }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!src || failedSrc === src) return <>{fallback}</>
  // eslint-disable-next-line jsx-a11y/alt-text -- alt is passed through by callers
  return <img src={src} {...props} onError={() => setFailedSrc(src)} />
}

export function NoImage({ size = 'text-3xl' }: { size?: string }) {
  return <div className={`w-full aspect-square rounded-lg bg-neutral-800 flex items-center justify-center ${size}`}>🛒</div>
}
