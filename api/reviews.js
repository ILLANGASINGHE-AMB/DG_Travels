// ============================================================
//  GET /api/reviews
//  Public review feed for the website. Never returns email addresses.
// ============================================================

const { listFeedback } = require('./_supabase.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const reviews = await listFeedback(60);

    const total = reviews.length;
    const average = total
      ? Number((reviews.reduce((sum, r) => sum + Number(r.rating), 0) / total).toFixed(1))
      : null;

    // max-age=0 stops the BROWSER from reusing a stale copy (a passenger
    // who just submitted must see their review), while s-maxage lets the
    // Vercel edge absorb the traffic so the homepage never waits on Supabase.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ total, average, reviews });
  } catch (err) {
    console.error('[reviews] read failed:', err.message);
    return res.status(502).json({ error: 'Could not load reviews.', total: 0, average: null, reviews: [] });
  }
};
