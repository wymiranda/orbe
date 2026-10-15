import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.DEV) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      return
    }
    void navigator.serviceWorker.register('/sw.js')
  })
}
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
