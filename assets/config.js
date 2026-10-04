// The only file you edit per client deployment.
// Supabase: Project Settings -> API -> copy "Project URL" and the public "anon" / "publishable" key.
// The key is meant to be public; the database rules (schema.sql) are what protect the data.
window.LK = {
  supabaseUrl: 'https://qgechlsujyzgivwnvdwf.supabase.co',
  supabaseKey: 'sb_publishable_oEWnni9aBtWuwqF_aS6duQ_gF0B55r3',
  slug: 'cheesora-bliss',                    // must match the business slug in the database
  emailDomain: 'members.example.com'    // internal login address for phone sign-ins; never receives mail
};
