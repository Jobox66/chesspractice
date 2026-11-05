# chesspractice backend

Go server backed by Postgres.

## Prerequisites

- Go (matching `go.mod`)
- Postgres 14+ running locally (or reachable via `POSTGRES_URL`)

## Setup

1. Create the database and a user with access to it:

   ```sh
   createdb chesspractice
   createuser chesspractice --pwprompt
   psql -d chesspractice -c "GRANT ALL ON SCHEMA public TO chesspractice;"
   ```

2. Apply the schema:

   ```sh
   psql "postgres://chesspractice:<password>@localhost:5432/chesspractice?sslmode=disable" \
     -f schema.sql
   ```

3. Create `.env` in the backend directory:

   ```
   POSTGRES_URL=postgres://chesspractice:<password>@localhost:5432/chesspractice?sslmode=disable
   FIREBASE_PROJECT_ID=<your-firebase-project-id>
   ALLOWED_ORIGINS=http://localhost:5173
   LISTEN_ADDR=:8080
   COOKIE_SECURE=false
   ```

   Only `FIREBASE_PROJECT_ID` is required — the rest have dev defaults.
   The project id is the `aud` claim every Firebase ID token must carry;
   find it in the Firebase console under Project settings. No service
   account is needed: tokens are verified against Google's public
   securetoken certs.
   Set `COOKIE_SECURE=true` in any environment behind TLS so the
   session cookie carries the `Secure` flag and the `__Host-` prefix.
   Set `HINT_COOKIE_DOMAIN=<apex>` (e.g. `chesspractice.com`) when the
   SPA and API live on sibling subdomains, so the non-secret hint
   cookie is visible to the SPA via `document.cookie`. Leave unset in
   local dev where both processes share `localhost`.

## Run

```sh
go run ./cmd/server
```

## Schema changes

Edit `schema.sql` and re-apply against a fresh database. There's no
migration tool wired up yet — drop and recreate the DB for now.
