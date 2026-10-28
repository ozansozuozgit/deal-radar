'use client'
import { useState } from 'react'
import type { CropRect } from '@/lib/types'

/**
 * A rectangle of a flyer page, scaled to fit inside a box of aspect `boxRatio`
 * (width / height) without stretching. The crop is stored in percent of the page,
 * so its real shape depends on the page's pixel size, known once the image loads.
 */
export function FlyerCrop({ crop, alt, boxRatio = 1 }: { crop: CropRect; alt: string; boxRatio?: number }) {
  const [page, setPage] = useState<{ w: number; h: number } | null>(null)
  const ratio = page ? (crop.w * page.w) / (crop.h * page.h) : boxRatio
  const widthPct = Math.min(1, ratio / boxRatio) * 100
  return (
    <div className="w-full h-full flex items-center justify-center" role="img" aria-label={alt}>
      <div className="relative overflow-hidden rounded-md bg-white" style={{ width: `${widthPct}%`, aspectRatio: String(ratio), maxHeight: '100%' }}>
        <img src={crop.image} alt="" loading="lazy" draggable={false}
          onLoad={e => setPage({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className="absolute max-w-none"
          style={{ width: `${10000 / crop.w}%`, left: `${(-crop.x * 100) / crop.w}%`, top: `${(-crop.y * 100) / crop.h}%`, visibility: page ? 'visible' : 'hidden' }} />
      </div>
    </div>
  )
}
