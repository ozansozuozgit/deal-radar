import { readString, writeString } from './storage'

const KEY = 'deal-radar-device-v1'

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server'
  let id = readString(KEY)
  if (!id) {
    // randomUUID needs a secure context; fall back for plain-http LAN testing
    id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')
    writeString(KEY, id)
  }
  return id
}
