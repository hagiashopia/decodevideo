# Video Decode
Video animasi -> deteksi adegan -> storyboard ZIP (frame, style bible, prompt gambar, narasi, voice over teks).
- `public/` : UI (statis, tanpa build)
- `functions/api/analyze.js` : proxy ke Claude API
- Secret yang dibutuhkan: `ANTHROPIC_API_KEY`, `APP_PASSWORD` (opsional: `MODEL`)
- Lokal: buat `.dev.vars` berisi dua secret itu, lalu `npx wrangler pages dev public`
