# Find My Stuff

A simple Lost & Found demo web app (frontend: HTML/CSS/JS, backend: Node.js + Express + Socket.IO).

## 🚀 Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment example and edit as needed:

   ```bash
   cp .env.example .env
   # Edit .env to set MONGO_URI, JWT_SECRET, and provider keys if you want real verification
   ```

3. Run the app:

   ```bash
   npm start
   # or for auto-reload during development:
   npm run dev
   ```

4. Open in a browser: http://localhost:3000

---

## ⚙️ Environment variables

- `PORT` — default `3000`
- `MONGO_URI` — optional: enable MongoDB mode when set
- `JWT_SECRET` — set a secure random secret (recommended)
- `SEND_REAL_VERIFICATION` — set to `true` to enable real outgoing verification (requires provider keys)
- `SENDGRID_API_KEY` and `SENDGRID_FROM` — SendGrid for email verification
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` — Twilio for SMS

If `SEND_REAL_VERIFICATION` is not `true` or provider keys are missing, registration returns a demo verification code in the response (convenient for local testing).

---

## 🧩 Features

- Register / verify / login (JWT)
- Create and manage postings (lost & found)
- View & delete *your* postings (owner-only)
- Private conversations between posting owner and requester (Socket.IO rooms)
- Optional MongoDB persistence (Mongoose) or JSON fallback (`db.json`)
- File attachments (uploads/)

---

## 🔌 API (important endpoints)

- `POST /api/register` — register (returns verification code in demo mode)
- `POST /api/verify` — verify registration
- `POST /api/login` — login (returns JWT)
- `GET /api/postings` — list postings
- `POST /api/postings` — create posting (supports `multipart/form-data` for attachments)
- `GET /api/postings/mine` — list authenticated user's postings
- `DELETE /api/postings/:id` — delete a posting (owner only)
- `POST /api/conversations` — create/open private conversation for a posting (requires auth)
- `GET /api/conversations/mine` — list user's conversations
- `GET /api/conversations/byId/:convId` — get conversation by id (participants only)

Socket events:
- `join` (conversationId) — join room `conv_<id>`
- `message` — send message inside a conversation (server enforces participants)

---

## 🔬 Manual smoke test (quick)

1. Register (returns `verificationCode` in demo mode):

   ```bash
   curl -s -X POST http://localhost:3000/api/register \ 
     -H 'Content-Type: application/json' \
     -d '{"name":"Test","email":"you@example.com","password":"Passw0rd!"}'
   ```

2. Verify (if code returned):

   ```bash
   curl -s -X POST http://localhost:3000/api/verify \ 
     -H 'Content-Type: application/json' \
     -d '{"email":"you@example.com","code":"123456"}'
   ```

3. Login and use token for protected endpoints (`Authorization: Bearer <token>`).

4. Create a posting and then `GET /api/postings/mine` to verify it appears.

---

## 🛠 Troubleshooting

- If port `3000` is already in use:
  - Find the process: `netstat -ano | findstr :3000` (Windows)
  - Stop it: `Stop-Process -Id <PID> -Force` (PowerShell)
  - Or start server on another port: `$env:PORT=4000; npm start`

- If `npm install` fails due to package version issues, update `package.json` to use a published version (example: `@sendgrid/mail`).

---

## 📂 Project layout (high level)

- `server.js` — Express + Socket.IO server & API
- `models.js` — Mongoose models (used when `MONGO_URI` is set)
- `index.html`, `login.html`, `register.html`, `auth.html` — frontend pages
- `app.js`, `auth.js`, `login.js`, `register.js` — client logic
- `styles.css` — app styles
- `uploads/` — uploaded attachments
- `db.json` — JSON fallback persistence

---

## 🧪 Next improvements (ideas)

- Add `express-validator` validations for endpoints (some skeleton exists)
- Add a migration script to convert `db.json` into MongoDB documents
- Add automated tests for API and critical flows

---

If you'd like, I can add unit tests or a migration tool next. ✨
