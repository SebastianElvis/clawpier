import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getThemePreference, applyTheme } from './lib/theme'

// Apply saved theme preference before first render to avoid flash
applyTheme(getThemePreference());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
