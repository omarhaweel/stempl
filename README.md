# Stempl

Norwegian time-clock app: employees punch in/out within approved work places, admins send a daily plan (dagsplan) and follow up.

- `stempl-backend/` Express API (deployed on Render)
- `stempl-frontend/sempl-app/` Expo / React Native app
- `db/supabase/migrations/` SQL for the Supabase database

## 1. Database (Supabase)
Create a project and run the SQL in `db/supabase/migrations` (SQL editor). Note the project URL and the **secret** key (Settings > API).

## 2. Backend on Render
1. Render > New > Blueprint > pick this repo (it reads `render.yaml`).
2. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. `JWT_SECRET` is generated automatically.
3. Check `https://<service>.onrender.com/health`.
4. Create the first super admin once (locally, with `.env` filled in):
   `SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_PASSWORD=... node create-super-admin.js` (run inside `stempl-backend`).

Local run: copy `stempl-backend/.env.example` to `.env`, then `npm install && npm start`.

## 3. App
Copy `stempl-frontend/sempl-app/.env.example` to `.env`, set `EXPO_PUBLIC_API_URL` to the Render URL and add a public Mapbox token.

- Try it: `npx expo start`
- Android APK to share: `npx eas-cli@latest build -p android --profile preview` (log in to Expo first), then send the download link.
- iOS requires an Apple Developer account (`--profile production`, then TestFlight).

Never commit `.env` files or the Supabase secret key.
