import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './shared/lib/i18n'
import './shared/styles/tokens.css'

const el = document.getElementById('root')
if (!el) {
  throw new Error('Root element #root not found')
}

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
