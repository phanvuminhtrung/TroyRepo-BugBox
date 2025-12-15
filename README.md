## BugBox Digital Badge Demo (Airtable)

Minimal proof-of-concept that reads badge assignments from Airtable and shows them in a UI. Runs locally with `node` and is deployable to any Node-friendly host (Vercel/Netlify functions, Render, Fly, Heroku-style, etc.).

### 1) Setup Airtable
Create a base with three tables (you can rename them; the names map to env vars below).

- `Users`: fields `UserId` (text), `Name`, `Email`.
- `Badges`: fields `BadgeId` (text/slug), `Name`, `Description`, `Criteria`, `Image` (Attachment or `ImageUrl` text).
- `AssignedBadges`: fields `UserId` (text), `SessionId` (text), `Badge` (linked to `Badges`) or `BadgeId` (text), `IssuedAt` (date), `Status` (single select).

Populate a few rows and note your **Base ID** and **API key** (create from https://airtable.com/create/tokens).

### 2) Configure environment
```
cd digitalbadge/demo
cp .env.example .env
# fill in:
# AIRTABLE_API_KEY=personal access token (Developers → Personal access tokens)
# AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX (from your base URL)
# AIRTABLE_USER_TABLE=Users
# AIRTABLE_BADGE_TABLE=Badges
# AIRTABLE_ASSIGNMENT_TABLE=AssignedBadges
# If your column names differ, set:
# AIRTABLE_ASSIGN_USER_FIELD=User
# AIRTABLE_ASSIGN_SESSION_FIELD=SessionId
# AIRTABLE_ASSIGN_BADGE_LINK_FIELD=Badge
# AIRTABLE_ASSIGN_BADGE_ID_FIELD=BadgeId
# AIRTABLE_ASSIGN_ISSUED_AT_FIELD=Date Assigned
# AIRTABLE_ASSIGN_STATUS_FIELD=Status
# AIRTABLE_BADGE_IMAGE_FIELD=Badge Image
# AIRTABLE_BADGE_IMAGE_URL_FIELD=ImageUrl
# AIRTABLE_BADGE_NAME_FIELD=Badge Name
# AIRTABLE_BADGE_DESCRIPTION_FIELD=Description
# AIRTABLE_BADGE_CRITERIA_FIELD=Criteria
# AIRTABLE_BADGE_ID_FIELD=BadgeId
```

### 3) Run locally (POC)
```
# from digitalbadge/demo
cmd /c npm install   # avoids PowerShell execution policy issues
npm run dev          # http://localhost:3000
```
Use the UI to enter a User ID (e.g., `USR-001`) and optional Session ID. It calls `/api/badges/:userId?sessionId=...` → Airtable → renders badges.

### 4) Rebuild / deploy
- Build is just Node + static assets; no compile step. Deploy to any Node host with `npm install && npm start` and the same env vars.
- For serverless (Vercel/Netlify), move `GET /api/badges` logic from `server.js` into an API/function file; keep `public/` as static.

### Files of interest
- `digitalbadge/demo/server.js` — Express server + Airtable queries.
- `digitalbadge/demo/public/index.html` — UI that calls the API and renders badges.
- `digitalbadge/demo/public/style.css` — simple styling for the cards.
