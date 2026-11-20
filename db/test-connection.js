const { supabaseAdmin } = require('./client');

(async () => {
  const { error } = await supabaseAdmin.from('_ping').select('*').limit(1);
  // Table-not-found means the URL and key were accepted.
  if (!error || ['PGRST205', '42P01'].includes(error.code)) {
    console.log('Connected to Supabase');
  } else {
    console.log('FAILED:', error.code, error.message);
    process.exit(1);
  }
})().catch((e) => { console.log('FAILED:', e.message); process.exit(1); });
