import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Only public VITE_* variables may enter the client bundle.
  envPrefix: 'VITE_',
  plugins: [react()],
})
