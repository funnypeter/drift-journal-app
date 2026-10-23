const { initOpenNextCloudflareForDev } = require('@opennextjs/cloudflare')

const withSerwist = require('@serwist/next').default({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: true,
})

// Build commit, shown to Marker (Tix page annotations) so tickets record which build they were filed on.
let buildSha = 'dev'
try {
  buildSha = require('child_process').execSync('git rev-parse --short HEAD').toString().trim()
} catch {}

/** @type {import('next').NextConfig} */
const nextConfig = { env: { NEXT_PUBLIC_BUILD_SHA: buildSha } };

module.exports = withSerwist(nextConfig);

// Gives `next dev` access to the D1/R2/email bindings from wrangler.jsonc.
initOpenNextCloudflareForDev()
