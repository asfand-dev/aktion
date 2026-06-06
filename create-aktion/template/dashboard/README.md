# Aktion app — dashboard

A modern **home-automation control panel** built with
[Aktion](https://asfand-dev.github.io/aktion/) + Vite: device cards with
on/off switches, brightness sliders and thermostat setpoints, one-tap scenes,
an energy view with charts, and automation toggles — all driven by a single
`$store`.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run preview    # preview the production build
npm test           # run the unit tests (Vitest)
```

## Structure

`.aktion` files `import`/`export` like JS/TS modules — the project is split the
way you'd split a React app:

```
src/
  app.aktion                  entry — $theme, $router, AppShell (assigns `aktion`)
  store.aktion                the $store: devices, scenes, automations + methods
  data/home.aktion            seed data (devices, scenes, automations, energy)
  lib/scene.aktion            pure helper: apply a scene's presets to a device
  components/
    app-sidebar.aktion        AppShell left nav (route-aware SidebarItems)
    stat-strip.aktion         live KPI strip
    scene-bar.aktion          one-tap scene tiles
    device-card.aktion        per-device control (switch / slider / setpoint)
  pages/
    home.aktion               overview: KPIs + scenes + devices by room
    devices.aktion            all devices, filterable + searchable
    energy.aktion             gauge + usage charts
    automations.aktion        enable/disable rules
tests/
  dashboard.test.ts           mounts the compiled app and drives it
```

## State

All home state lives in one `$store` (`src/store.aktion`). Any component reads
`home.devices` / `home.activeScene` and calls methods like `home.toggle(id)` or
`home.activateScene("Away")` — no prop-drilling. Reads are fine-grained, so a
single toggle only re-renders what changed.

## Testing

`tests/dashboard.test.ts` imports the compiled `.aktion` program (the Vite
plugin links the module graph) and mounts it with `mountCompiled`, then clicks
switches, runs scenes, searches, and navigates — asserting on the rendered DOM.
Run `npm test`, or `npm run test:watch` while iterating.
