// ============================================================
//  GET /api/config
//  Hands the browser its public runtime settings.
//
//  The Maps *browser* key is necessarily public — any Maps JS
//  integration exposes it. Protect it in Google Cloud Console with an
//  HTTP-referrer restriction (your Vercel domain) and by enabling only
//  the "Maps JavaScript API" + "Places API" on it. The separate server
//  key used by /api/distance never reaches the browser.
//
//  The Supabase ANON key is likewise designed to be public: it only
//  grants what Row Level Security allows, which is "read the published
//  site content" and nothing else until an admin signs in. The
//  service_role key stays server-side and is never returned here.
// ============================================================

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');

  return res.status(200).json({
    mapsKey: process.env.GOOGLE_MAPS_BROWSER_KEY || '',
    // Lets the page skip the distance call entirely when it cannot work
    distanceEnabled: Boolean(
      process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_BROWSER_KEY
    ),
    // Supabase Auth + published content. Absent these the site simply
    // renders its built-in copy and the Log In button stays hidden.
    supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
  });
};
