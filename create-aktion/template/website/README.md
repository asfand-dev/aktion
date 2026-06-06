# Aktion app — website

A marketing site for a **pet-sitting services company**, built with
[Aktion](https://asfand-dev.github.io/aktion/) + Vite: a sticky navbar, a hero
landing page, a services grid, a pricing table with an FAQ, and a validated
contact form that emits a `contact-submitted` event.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run preview    # preview the production build
npm test           # run the unit tests (Vitest)
```

## Structure

```
src/
  app.aktion                  entry — $theme, $router, Navbar + Container + Footer
  data/site.aktion            all copy: services, testimonials, plans, FAQs
  components/
    site-nav.aktion           top Navbar with router links + CTA
    site-footer.aktion        footer
    service-card.aktion       one service offering (reused across pages)
  pages/
    home.aktion               hero + services preview + reviews + CTA
    services.aktion           every service + "how it works"
    pricing.aktion            PricingTable + FAQ accordion
    contact.aktion            validated booking form (state, validation, $emit)
tests/
  website.test.ts             navigation + form validation + successful submit
```

A marketing surface is a top `Navbar` plus stacked sections in a `Container` —
never an `AppShell` (that's for dashboards). The page is routed with `$router`,
so links update the URL hash without a reload.

## The contact form

`src/pages/contact.aktion` is the interesting bit: field values are reactive
`$` atoms two-way bound to the inputs, `submitContact()` validates them with
plain JS (no regex), and on success it swaps in a `SuccessState` and emits
`contact-submitted` — listen for it from the host with
`document.querySelector("aktion-app").addEventListener("contact-submitted", …)`
to wire up a real backend.

## Testing

`tests/website.test.ts` mounts the compiled program, navigates between pages,
submits the form empty (asserting validation errors), then fills it correctly
and asserts the success state plus the emitted event. Run `npm test`.
