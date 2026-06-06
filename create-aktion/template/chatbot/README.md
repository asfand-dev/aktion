# Aktion app — chatbot

A simple chat UI wired to the **OpenAI Chat Completions API**, built with
[Aktion](https://asfand-dev.github.io/aktion/) + Vite. Bring your own API key
(stored only in your browser); with no key it runs in an offline "echo" mode so
the app works the moment you open it.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run preview    # preview the production build
npm test           # run the unit tests (Vitest, network mocked)
```

Open the **gear → Connection** popover and paste an OpenAI API key to chat with
a real model. The key is saved in `localStorage` and never leaves the browser.

## Structure

```
src/
  app.aktion                  entry — header (+ settings), transcript, composer
  store.aktion                $messages / $input / $apiKey / send() action
  lib/openai.aktion           endpoint, models, request/response helpers, echo
  components/
    message-list.aktion       ChatBubbles + "thinking" + error states
    composer.aktion           input (Enter to send) + Send button
    settings.aktion           API-key + model popover
tests/
  chatbot.test.ts             echo path, empty-message no-op, real OpenAI call
```

## Security note

This template calls OpenAI **directly from the browser** for demo simplicity,
which exposes the key to anyone using that browser session. For anything beyond
a personal demo, proxy requests through your own backend and keep the key on the
server — then point `ENDPOINT` in `src/lib/openai.aktion` at your proxy.

## Testing

`tests/chatbot.test.ts` mocks `fetch` via `render({ fetch })`. It asserts the
offline echo path makes no network call, an empty message is ignored, and — with
a key seeded into `localStorage` — sending a message POSTs to the OpenAI
endpoint and renders the reply. Run `npm test`.
