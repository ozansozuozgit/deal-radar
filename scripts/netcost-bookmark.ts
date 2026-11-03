// Writes a one-time page with the "Send to Deal Radar" bookmark to drag to the bookmarks bar.
// The key stays out of the repo and off the site: it comes from .env.local into a temp file.
// Usage: DOTENV_CONFIG_PATH=.env.local npx tsx scripts/netcost-bookmark.ts [site url]
import 'dotenv/config'
import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { NETCOST, netcostBookmarklet } from '@/lib/sources/netcost'

const key = process.env.IMPORT_KEY
if (!key) throw new Error('IMPORT_KEY is not set')
const site = process.argv[2] ?? 'https://deal-radar-beta.vercel.app'
const href = netcostBookmarklet(`${site}/api/import/netcost`, key)
const file = join(tmpdir(), 'deal-radar-netcost-bookmark.html')
writeFileSync(file, `<!doctype html><meta charset="utf-8"><title>NetCost bookmark</title>
<body style="font:16px system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.4rem">Add the NetCost bookmark</h1>
<ol>
<li>Drag this button to your bookmarks bar:<br><br>
<a href="${href}" style="display:inline-block;padding:.5rem 1rem;border-radius:8px;background:#111;color:#fff;font-weight:700;text-decoration:none">Send to Deal Radar</a><br><br></li>
<li>Open <a href="${NETCOST.specialsUrl}">NetCost's specials page</a>.</li>
<li>Press the bookmark. It tells you how many deals it sent.</li>
</ol>
<p>Then close this page.</p>
</body>`, { mode: 0o600 })
console.log(file)
