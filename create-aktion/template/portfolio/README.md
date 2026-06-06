# Aktion app — portfolio

A frontend developer's **portfolio site**, built with
[Aktion](https://asfand-dev.github.io/aktion/) + Vite: a hero, a skills
snapshot, a filterable projects grid, an about page with an experience timeline
and skills radar, and a validated contact form.

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
  data/portfolio.aktion       profile, skills, projects, experience, socials
  components/
    site-nav.aktion           top Navbar
    site-footer.aktion        footer with social links
    project-card.aktion       one project (reused on home + projects)
  pages/
    home.aktion               hero + skills + featured projects + CTA
    projects.aktion           all projects, filterable by tech
    about.aktion              bio + experience Timeline + skills RadarChart
    contact.aktion            validated contact form (emits contact-submitted)
tests/
  portfolio.test.ts           filter + navigation + form submission
```

Make it yours by editing `src/data/portfolio.aktion` — the pages render whatever
is in there.

## Testing

`tests/portfolio.test.ts` mounts the compiled app, filters the projects grid by
tech (asserting the grid updates), and submits the contact form (asserting the
success state and the emitted `contact-submitted` event). Run `npm test`.
