// Supabase connection settings.
// Find these in Supabase: Project Settings > API (or "Connect" > App Frameworks).
// The anon key is meant to be public: the database only allows the safe
// functions in supabase/schema.sql, so it's fine for it to be in this file.
window.CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT-ID.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',
};
