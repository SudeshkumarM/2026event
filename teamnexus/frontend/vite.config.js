import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(() => {
  const isHttps = process.env.VITE_HTTPS === 'true' || process.env.HTTPS === 'true';
  return {
    base: './',
    plugins: [
      react(),
      ...(isHttps ? [basicSsl()] : [])
    ],
    server: {
      port: 5173,
      host: '0.0.0.0',
      https: isHttps ? true : undefined,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
          secure: false
        }
      }
    }
  };
})
