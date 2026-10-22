const { initOpenNextCloudflareForDev } = require('@opennextjs/cloudflare')

const withSerwist = require('@serwist/next').default({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: true,
})

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withSerwist(nextConfig);

// Gives `next dev` access to the D1/R2/email bindings from wrangler.jsonc.
initOpenNextCloudflareForDev()
