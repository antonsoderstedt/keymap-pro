
# Day 5 — Command Bar (NAVIGATE-only)

Mål: snabb global navigation inom aktiv kunds workspace. Inga AI-lägen, inga åtgärder, ingen automation. Bara `⌘K` → välj → navigera.

## Filer

**Nya**
- `src/components/workspace/CommandBar.tsx` — själva dialogen (bygger på shadcn `command` + `dialog`).
- `src/hooks/useCommandBar.tsx` — liten store (open-state + recent history i `localStorage`).

**Ändrade**
- `src/components/workspace/WorkspaceLayout.tsx` — montera `<CommandBar />` en gång + global `⌘K`/`Ctrl+K` listener; lägg subtil trigger-knapp i headern (`⌘K`-chip).

**Inte rörda**: sidebar, routes, Today, Actions, Performance, alla hooks/edge functions, DB.

## Beteende

- `⌘K` (mac) / `Ctrl+K` (övrigt) togglar dialogen, oavsett route i workspace.
- `Esc` stänger. `Enter` navigerar. `↑/↓` flyttar fokus. Standard shadcn Command-beteende.
- Fuzzy-sök på `label` + `keywords` (svenska + engelska alias, t.ex. "performance, kpi, seo, ads").
- Val → `navigate(path)` → stäng → push i recent (max 5, dedupe på path).
- Tom query → visar **Recent** (om finns) + alla routes grupperade.
- Med query → en platt filtrerad lista, ingen grupp-header.
- Ingen toast, ingen laddningsindikator (allt är synkront i minnet).

## Tangentbord

- Lyssnare i `WorkspaceLayout` via `useEffect`: `(e.metaKey || e.ctrlKey) && e.key === "k"` → `preventDefault` + toggle.
- Ignorerar shortcut om event-target är `<input>`, `<textarea>` eller `contentEditable` **och** dialogen inte redan är öppen? Nej — `⌘K` är reserverat globalt; vi tar det även i inputs (standardmönster, samma som Linear/Vercel).
- Inga andra shortcuts i denna sprint (`g t`, `g a` etc. = out of scope).

## Route-lista (NAVIGATE-only)

Alla relativa `/clients/:id/...` där `:id` = aktiv workspace.

| Label (sv)       | Path              | Keywords                                  | Icon          |
|------------------|-------------------|-------------------------------------------|---------------|
| Idag             | `""` (index)      | today, start, hem, dashboard              | Sun           |
| Åtgärder         | `actions`         | actions, pipeline, queue, todo, förslag   | ListChecks    |
| Performance      | `performance`     | performance, kpi, seo, ads, ga4, trafik   | LineChart     |
| Sökord           | `keywords`        | keywords, sökord, universe, segment       | Search        |
| Pre-launch       | `prelaunch`       | prelaunch, blueprint, brief, lansering    | Rocket        |
| Inställningar    | `settings`        | settings, källor, data sources, brand     | Settings      |
| — Legacy —       |                   |                                           |               |
| Översikt (legacy)| `overview-legacy` | overview, executive, legacy               | LayoutDashboard|
| Google Ads (legacy)| `google-ads-legacy` | ads, auction, audit, chat, legacy     | Megaphone     |
| Actions (legacy) | `actions-legacy`  | actions, hub, legacy                      | Archive       |

Legacy-gruppen visas alltid sist, en aning muted (`text-muted-foreground`).

## Recent history

- Nyckel: `lovable:cmdbar:recent:<workspaceId>` i `localStorage`.
- Lagrar array av `{ path, label, ts }`, max 5, dedupe på `path`, senaste först.
- Push sker när användaren navigerar **via** command bar (inte via sidebar/direktklick) — håller listan ren och relevant.
- Render endast när query är tom och listan ≥ 1.

## Mobilbeteende

- Trigger-chippet i headern göms `< md`. Dialogen själv funkar fortfarande om man triggar via tangentbord (sällsynt på mobil).
- Ingen separat mobil-FAB i denna sprint (out of scope).
- Dialogen renderas full-width på små skärmar (shadcn `CommandDialog` default).

## Tillgänglighet

- `CommandDialog` ger `role="dialog"` + focus trap + `aria-label="Sök och navigera"`.
- Inputfält får `aria-label`. Listitems använder shadcn `CommandItem` med inbyggd `aria-selected`.
- Tangentbordsnavigation fullt stödd (built-in).
- Trigger-knappen i headern: `aria-label="Öppna kommandopalett (⌘K)"`.
- Fokus återgår till trigger / föregående element vid stängning (Radix default).

## Out of scope (uttryckligen)

- Ingen ASK-mode, ingen ACT-mode, ingen AI.
- Inga åtgärder (godkänn / pusha / etc.) — endast navigation.
- Inga server-calls, edge functions, telemetri.
- Ingen "go to action #123"-deep-link, inga entity-resultat (sökord, mutations, projekt).
- Inga ytterligare shortcuts utöver `⌘K`.
- Inga tema-/språkväljare i paletten.
- Ingen ändring av sidebar eller routes.

## Verifieringschecklista

1. `⌘K` öppnar dialogen från Today, Actions, Performance, Keywords, Settings.
2. `Ctrl+K` fungerar på Windows/Linux (testa via browser-emulering).
3. `Esc` stänger; fokus återgår till trigger.
4. Tom query → visar alla 6 huvudroutes + legacy-gruppen; Recent visas tom första gången.
5. Skriv "perf" → endast Performance matchar; Enter navigerar till `/clients/:id/performance`.
6. Skriv "ads" → Performance + Google Ads (legacy) matchar.
7. Efter 3 navigeringar: Recent visar de 3 senaste, senaste först, dedupe fungerar.
8. Byter man kund → recent-listan är tom (per-workspace nyckel).
9. `⌘K` triggas inte dubbelt om man håller nere; ingen scroll-lock-läcka.
10. Mobil 375px: dialogen är användbar, header-chippet dolt.
11. Inga TS-fel, build grön, inga console-warnings.
12. Axe / tab-flow: fokus trap fungerar, ingen orphan focus.

## Follow-ups (noteras, ej Day 5)

- Period-pills på Performance: ensa eller mjuka när alla sektioner stödjer dem.
- Utvärdera SEO click-chart värde i nästa review.
- Day 6+: överväg `g`-prefix shortcuts och ASK-mode först när NAVIGATE känns inarbetat.
