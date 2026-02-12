import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { HelmetProvider } from "react-helmet-async"
import "./index.css"

// ✅ GA4: carrega somente quando VITE_GA_ID existir
if (import.meta.env.VITE_GA_ID) {
  import("./ga.ts")
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>
)
