export type SourceId = 'flipp' | 'wholefoods' | 'fairway' | 'netcost' | 'amazon'

export interface LocationConfig {
  address: string
  postalCode: string
  lat: number
  lng: number
  radiusMiles: number
  wholeFoodsStoreId: number | null
}

export interface FlyerInput {
  source: SourceId
  externalId: string
  merchantSlug: string
  merchantName: string
  title: string
  validFrom: string | null   // ISO
  validTo: string | null     // ISO
  logoUrl?: string | null    // merchant logo when the source provides one
  raw?: unknown              // source-specific payload fetchDeals may need
}

import type { Size } from '@/lib/parse/size'

export interface CropRect { image: string; x: number; y: number; w: number; h: number } // percents

export interface DealInput {
  source: SourceId
  externalId: string
  merchantSlug: string
  name: string
  description?: string | null
  price?: number | null          // numeric sale price when known
  originalPrice?: number | null
  primePrice?: number | null     // Whole Foods only
  unit?: 'ea' | 'lb' | null
  size?: Size | null             // when the store says, instead of reading the name
  priceText?: string | null      // raw text when numeric parse failed
  saleStory?: string | null      // "20% off", "$2.00 off", "B1G1 50% off"
  category: string
  imageUrl?: string | null
  crop?: CropRect | null         // Fairway flyer snippet
  validFrom: string | null
  validTo: string | null
}

export interface DealSource {
  id: SourceId
  fetchFlyers(loc: LocationConfig): Promise<FlyerInput[]>
  fetchDeals(flyer: FlyerInput): Promise<DealInput[]>
}
