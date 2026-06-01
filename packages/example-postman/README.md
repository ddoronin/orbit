# @orbitstack/example-postman

A full-stack OrbitStack demo that implements core Postman-like workflows:

- collections and folders
- request editor (method, URL, headers, query, body)
- auth presets (none, bearer, API key, basic)
- worker-side request execution proxy
- response examples stored per request
- response history persisted in D1
- workspace environment variables using `{{variable}}` interpolation
- import/export for workspace payloads

## Project layout

- `src/index.ts`: app composition root with `@OrbitApp`
- `src/workspace.actor.ts`: workspace metadata, collection index, environment vars
- `src/collection.actor.ts`: folder/request tree and response examples
- `src/execute.controller.ts`: outbound HTTP execution and D1 history writes
- `src/d1.controller.ts`: history queries
- `web/src/features/postman`: React + Zustand client

## Run locally

```sh
# from repository root
npm install
npm --workspace @orbitstack/example-postman run dev
```

Open `http://localhost:8787`, login with any display name, then:

1. Create a collection.
2. Add folders and requests.
3. Set environment variables such as `baseUrl`.
4. Use URLs like `{{baseUrl}}/get`.
5. Send request and save response examples.
6. Export/import workspace JSON from the sidebar.

## Build and test

```sh
npm --workspace @orbitstack/example-postman run test
npm --workspace @orbitstack/example-postman run build
```
