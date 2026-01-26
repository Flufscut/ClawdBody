/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Mark these as server-only external packages (for Next.js 14)
    serverComponentsExternalPackages: ['ssh2', 'cpu-features'],
  },
  // Externalize ssh2 and its native dependencies - they're server-only
  webpack: (config, { isServer }) => {
    if (isServer) {
      // These packages have native bindings and should only run on server
      config.externals = config.externals || []
      config.externals.push({
        'ssh2': 'commonjs ssh2',
        'cpu-features': 'commonjs cpu-features',
      })
    }
    return config
  },
}

module.exports = nextConfig


