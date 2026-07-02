import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/playfair-display';
import '@fontsource/manrope';
import '@fontsource/montserrat';
import '@fontsource/pinyon-script';
import 'material-symbols/outlined.css';
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
