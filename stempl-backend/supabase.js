// Supabase client used by the whole backend (bypasses RLS: server-side only).
// Config comes from environment variables (Render dashboard / stempl-backend/.env).
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set (see stempl-backend/.env.example)");
}

const supabaseAdmin = createClient(url, key, { auth: { persistSession: false } });

module.exports = { supabaseAdmin };
