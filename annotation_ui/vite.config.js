import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load env without prefix restriction so we can read API_URL
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: 3721,
    },
    build: {
      outDir: 'dist',
    },
    // Expose API_URL at build time without requiring VITE_ prefix
    define: {
      'import.meta.env.API_URL': JSON.stringify(env.API_URL ?? 'http://localhost:8000'),
    },
    // Allow JSX syntax in .js files (project uses .js throughout)
    esbuild: {
      loader: 'jsx',
      include: /src\/.*\.js$/,
      exclude: [],
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
        },
      },
    },
  }
})
