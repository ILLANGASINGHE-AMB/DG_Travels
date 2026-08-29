// ============================================================
//  POST /api/distance   { origin, destination }
//  -> { km, text, durationText }
//
//  Runs the billable Google call server-side so the key stays private
//  and cannot be scraped off the page and spent by someone else.
//
//  Tries the Routes API first (Google's current product) and falls back
//  to the Distance Matrix API, because a given project may only have one
//  of the two enabled.
// ============================================================

const MAX_LEN = 300;

function clean(v) {
  return typeof v === 'string' ? v.trim().slice(0, MAX_LEN) : '';
}

function formatKm(meters) {
  const km = meters / 1000;
  // Under 10 km one decimal is useful; above that it is noise.
  return km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** Google Routes API — computeRoutes */
async function viaRoutesApi(key, origin, destination) {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration'
    },
    body: JSON.stringify({
      origin: { address: origin },
      destination: { address: destination },
      travelMode: 'DRIVE',
      units: 'METRIC'
    })
  });

  if (!res.ok) throw new Error(`Routes API ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const data = await res.json();
  const route = data.routes && data.routes[0];
  if (!route || typeof route.distanceMeters !== 'number') {
    throw new Error('Routes API returned no route');
  }

  // duration comes back like "12345s"
  const seconds = route.duration ? parseInt(String(route.duration).replace('s', ''), 10) : null;
  return { meters: route.distanceMeters, seconds };
}

/** Legacy Distance Matrix API */
async function viaDistanceMatrix(key, origin, destination) {
  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', origin);
  url.searchParams.set('destinations', destination);
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('units', 'metric');
  url.searchParams.set('region', 'lk');
  url.searchParams.set('key', key);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Distance Matrix ${res.status}`);

  const data = await res.json();
  if (data.status !== 'OK') throw new Error(`Distance Matrix status ${data.status}: ${data.error_message || ''}`);

  const el = data.rows && data.rows[0] && data.rows[0].elements && data.rows[0].elements[0];
  if (!el || el.status !== 'OK') throw new Error(`No route (${el ? el.status : 'no element'})`);

  return { meters: el.distance.value, seconds: el.duration ? el.duration.value : null };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  const origin = clean(body.origin);
  const destination = clean(body.destination);

  if (!origin || !destination) {
    return res.status(400).json({ error: 'Both origin and destination are required.' });
  }

  const key = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_BROWSER_KEY;
  if (!key) {
    return res.status(503).json({ error: 'Distance lookup is not configured.' });
  }

  let result;
  try {
    result = await viaRoutesApi(key, origin, destination);
  } catch (routesErr) {
    console.warn('[distance] Routes API failed, trying Distance Matrix:', routesErr.message);
    try {
      result = await viaDistanceMatrix(key, origin, destination);
    } catch (dmErr) {
      console.error('[distance] both lookups failed:', dmErr.message);
      return res.status(502).json({ error: 'Could not calculate the distance for this route.' });
    }
  }

  const km = formatKm(result.meters);

  // Routes are stable; let the edge hold identical lookups for a day.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800');

  return res.status(200).json({
    km,
    text: `${km} km`,
    durationText: formatDuration(result.seconds),
    meters: result.meters
  });
};
