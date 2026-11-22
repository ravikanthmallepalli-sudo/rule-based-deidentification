// Starts the HTTP server: `npm run dev` (watch mode) or `npm start` (after `npm run build`).
// The port comes from the PORT environment variable (default 3000).

import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3000);

// Log lines contain only methods, status codes, error codes and counts, never the text.
const app = createApp({ log: (line) => console.log(line) });

app.listen(port, () => {
  console.log(`De-identification service listening on http://localhost:${port}`);
  console.log("POST /deidentify  |  GET /health");
});
