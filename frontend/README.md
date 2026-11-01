# Ticket booking frontend

Simple React UI for the existing REST API.

## Run

Start the backend (`npm run dev` in the repo root), then:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. In development, requests to `/api/*` are proxied to `http://localhost:3000/*` (the `/api` prefix is stripped), so the browser does not hit CORS.

`VITE_API_URL` is only needed if the backend is hosted elsewhere (defaults to `/api`).

Register with the backend admin email to get the Admin page.
