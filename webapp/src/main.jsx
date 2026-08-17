import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { hideBootSplash } from './lib/bootSplash.js'
import { initVkBridge, isVkEnvironment } from './lib/vk.js'

if (isVkEnvironment()) {
  initVkBridge()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Не держим splash вечно (чёрный экран после снятия без UI)
setTimeout(() => hideBootSplash({ force: true }), 6000)

