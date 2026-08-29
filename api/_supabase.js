// ============================================================
//  Thin Supabase REST helper.
//
//  Uses plain fetch against the PostgREST endpoint rather than
//  @supabase/supabase-js, so the project needs no npm install and
//  Vercel can build it as a zero-dependency static site + functions.
// ============================================================

function getConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    const missing = [
      !url && 'SUPABASE_URL',
      !key && 'SUPABASE_SERVICE_ROLE_KEY'
    ].filter(Boolean).join(', ');
    const err = new Error(`Missing environment variable(s): ${missing}`);
    err.code = 'CONFIG';
    throw err;
  }

  return { url: url.replace(/\/+$/, ''), key };
}

/**
 * Insert one row and return it.
 */
async function insertFeedback(row) {
  const { url, key } = getConfig();

  const res = await fetch(`${url}/rest/v1/feedback`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(row)
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Supabase insert failed (${res.status}): ${detail}`);
  }

  const [created] = await res.json();
  return created;
}

/**
 * Read the most recent reviews.
 *
 * The select list deliberately omits `email` — this data is rendered
 * publicly on the website and passenger addresses must never leave
 * the server.
 */
async function listFeedback(limit = 60) {
  const { url, key } = getConfig();

  const query = new URLSearchParams({
    select: 'id,name,message,rating,created_at',
    order: 'created_at.desc',
    limit: String(limit)
  });

  const res = await fetch(`${url}/rest/v1/feedback?${query}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Supabase read failed (${res.status}): ${detail}`);
  }

  return res.json();
}

module.exports = { insertFeedback, listFeedback };
