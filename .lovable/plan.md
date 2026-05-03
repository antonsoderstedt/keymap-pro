
# Uppgraderad startsida för Slay Station

Målet: göra `/` till en visuellt levande produktsida som *visar* verktyget, inte bara beskriver det. Behåller dark theme + lime accent (`#b8f542` på `#0d0d0f`), JetBrains Mono / Playfair från memory.

## Vad som byggs

### 1. Hero med rörlig bakgrund + live-mockup
- Animerad gradient-mesh bakgrund (CSS `@keyframes` — långsamt drivande lime/grön glöd, blur-blobs)
- Animerade "data particles" / grid-overlay (pure CSS, ingen tung lib)
- Roterande headline-ord ("rankar.", "konverterar.", "växer.") med fade/slide
- Höger sida: **mockup av Executive Dashboard** — en riktig komponent med:
  - Animerad linjegraf (Recharts, redan i projektet) som ritar sig vid load
  - 3 KPI-kort med count-up siffror (sessions, CR, ROI)
  - Subtil tilt/hover och floating shadow

### 2. "Se verktyget" — Product Showcase-sektion (ny)
Tre stora cards som visar moduler med inbäddade mini-mockups (riktiga Recharts/CSS-grafer, inte screenshots):
- **Pre-launch Blueprint** — sajtkarta som node-graf (SVG)
- **Sökordsuniversum** — bubble chart med kluster
- **Performance Tracker** — area chart med GSC-style trend
Varje med scroll-triggered fade-in (IntersectionObserver-hook).

### 3. Animerad workflow (steg 1–4)
Ersätt nuvarande statiska siffror med en horisontell tidslinje där en lime "puls" rör sig mellan stegen, och ikoner pop:ar in vid scroll.

### 4. Live metrics-strip
Bandets över "For who" — animerade siffror ("12k+ sökord analyserade", "48h från idé till blueprint", etc.) med count-up vid synlighet.

### 5. Logos / "byggt på"-rad
Liten rad med tech-stack badges (Lovable AI · Firecrawl · DataForSEO · GSC · GA4) — diskret, lime hover-glow.

### 6. Polerad CTA-sektion
Behåller men lägger till animerad lime gradient-border och floating lime "spark"-partiklar.

## Tekniska detaljer

**Filer som ändras/skapas:**
- `src/pages/Landing.tsx` — full omskrivning
- `src/components/landing/HeroMockup.tsx` (ny) — Recharts dashboard-mockup
- `src/components/landing/AnimatedBackground.tsx` (ny) — gradient mesh + grid
- `src/components/landing/ProductShowcase.tsx` (ny) — 3 modul-mockups med Recharts/SVG
- `src/components/landing/CountUp.tsx` (ny) — IntersectionObserver + count-up hook
- `src/components/landing/SitemapGraph.tsx` (ny) — SVG node-graf för pre-launch
- `src/components/landing/KeywordBubbles.tsx` (ny) — SVG bubble cluster
- `src/index.css` — lägger till keyframes: `gradient-drift`, `pulse-glow`, `draw-line`, `float`

**Bibliotek:** Använder befintliga (recharts, lucide-react, tailwind-animate). Inga nya deps.

**Performance:** Allt CSS/SVG-baserat eller lätta Recharts-mockups. Inga tunga videos eller Lottie. Animationer pausas vid `prefers-reduced-motion`.

**Brand:** Säkerställer dark bg `#0d0d0f`, lime accent `#b8f542`, Playfair för rubriker, JetBrains Mono för siffror — enligt memory.

## Inte med
- Inga riktiga screenshots/bildfiler (allt genereras inline för crisp visuell kvalitet och dark mode-konsistens)
- Ingen video-fil (tung; gradient + SVG-animation ger samma "rörlig" känsla)
- Inga ändringar i `/docs` eller andra sidor
