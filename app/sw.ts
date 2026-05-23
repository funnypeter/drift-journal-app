import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { NetworkOnly, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// Force /api/* through the network — never serve cached mutations or auth-sensitive data.
const apiOnly = {
  matcher: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
  handler: new NetworkOnly(),
  method: 'GET' as const,
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [apiOnly, ...defaultCache],
})

serwist.addEventListeners()
