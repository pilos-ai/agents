import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// xterm base styles MUST be loaded for the terminal's DOM renderer (cursor,
// helper textarea, row/viewport layout). Imported before our overrides so the
// app's tweaks (transparent bg, scrollbar) still win.
import '@xterm/xterm/css/xterm.css'
import './index.css'
import './styles/pilos-prototype.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
