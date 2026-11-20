require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SECRET_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

const secretKey = SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL in db/.env');
if (!secretKey && !SUPABASE_ANON_KEY) {
  throw new Error('Set SUPABASE_SECRET_KEY (or SUPABASE_ANON_KEY) in db/.env');
}

// Respects Row Level Security (only if an anon/publishable key is set)
const supabase = SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Bypasses RLS: backend use only
const supabaseAdmin = secretKey
  ? createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } })
  : null;

module.exports = { supabase, supabaseAdmin };
