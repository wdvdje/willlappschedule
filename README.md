# willlappschedule
A scheduling app for stupids.

## Running locally

```
npm install
node server.js
```

Open http://localhost:8080.

## Couchbase Capella sync (optional)

The app can sync `events`, `tasks`, and `taskCategories` to a Couchbase Capella bucket. When sync is configured the server exposes:

- `GET  /api/sync/:collection` – returns all documents in the collection
- `POST /api/sync/:collection` – upserts an array of items into the collection

The frontend `sync.js` script:
1. Pulls remote items on page load and merges them into `localStorage` (remote wins on conflict).
2. Pushes the merged set back to Capella.
3. Hooks `localStorage.setItem` to push immediately after any local save.
4. Polls Capella every 5 minutes for background sync.

### Setup

1. Create a bucket in your Capella cluster (e.g. `timescape`).
2. Create a database user with read/write access to that bucket.
3. Copy `.env.example` to `.env` and fill in your values:

```
CB_CONNECTION_STRING=couchbases://cb.<your-endpoint>.cloud.couchbase.com
CB_USERNAME=your-db-username
CB_PASSWORD=your-db-password
CB_BUCKET=timescape
```

4. Start the server:

```
node server.js
```

On a hosting platform (Render, Railway, Heroku, etc.) set the same four variables as environment/config vars instead of using a `.env` file.

> **Never** commit your `.env` file or hardcode credentials in source code.

