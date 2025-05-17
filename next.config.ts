import type { NextConfig } from 'next'

const isProd = process.env.NODE_ENV === 'production'

// Replace with your actual GitHub repo name
const repoName = 'your-repository-name'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  assetPrefix: isProd ? `/${repoName}/` : '',
  basePath: isProd ? `/${repoName}` : '',
  output: 'export',
}

export default nextConfig
