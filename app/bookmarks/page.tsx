import type { Metadata } from 'next'
import { BookmarkSetup } from '@/components/BookmarkSetup'
import { amazonBookmarklet } from '@/lib/sources/amazon-bookmark'
import { AMAZON } from '@/lib/sources/amazon-parse'
import { NETCOST, netcostBookmarklet } from '@/lib/sources/netcost'

export const metadata: Metadata = { title: 'Bookmarks · Deal Radar', robots: { index: false } }

// The bookmarks are built here with stand-ins for the site and the key; the page fills both
// in, in the browser, so the key is never sent to the server or saved in the code.
const SITE = 'https://__DEAL_RADAR_SITE__'
const KEY = '__DEAL_RADAR_KEY__'

export default function BookmarksPage() {
  const site = encodeURIComponent(JSON.stringify(SITE).slice(1, -1))
  const key = encodeURIComponent(JSON.stringify(KEY))
  return (
    <BookmarkSetup site={site} keyToken={key} stores={[
      { name: 'NetCost', href: netcostBookmarklet(`${SITE}/api/import/netcost`, KEY), page: NETCOST.specialsUrl, pageLabel: 'NetCost specials page', note: 'Sends the specials, then every regular price. Takes a minute or two.' },
      { name: 'Amazon', href: amazonBookmarklet(`${SITE}/api/import/amazon`, KEY), page: AMAZON.storefrontUrl, pageLabel: 'Amazon grocery', note: 'Set your delivery address on Amazon first.' },
    ]} />
  )
}
