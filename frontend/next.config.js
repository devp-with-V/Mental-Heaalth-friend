/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // On Vercel: set BACKEND_URL in project settings (e.g. https://your-app.onrender.com)
    // In local dev: falls back to http://localhost:8000
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
}

module.exports = nextConfig
