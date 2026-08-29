// ============================================================
//  POST /api/feedback
//  Validates a passenger review, stores it in Supabase, then emails
//  the owner. Called by feedback.html.
// ============================================================

const { insertFeedback } = require('./_supabase.js');
const { sendFeedbackEmail } = require('./_notify.js');

const LIMITS = { name: 80, email: 160, message: 500 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validate(body) {
  const name = clean(body.name);
  const email = clean(body.email);
  const message = clean(body.message);
  const rating = Number(body.rating);
  const errors = {};

  if (!name) errors.name = 'Please enter your name.';
  else if (name.length > LIMITS.name) errors.name = `Name must be ${LIMITS.name} characters or fewer.`;

  if (!email) errors.email = 'Please enter your email.';
  else if (!EMAIL_RE.test(email) || email.length > LIMITS.email) errors.email = 'Please enter a valid email address.';

  if (!message) errors.message = 'Please write your feedback.';
  else if (message.length > LIMITS.message) errors.message = `Feedback must be ${LIMITS.message} characters or fewer.`;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = 'Please select a star rating.';

  return { errors, row: { name, email, message, rating } };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // Vercel parses JSON bodies automatically, but guard against a
  // string body (e.g. a sendBeacon or a text/plain content type).
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  // Honeypot: real passengers never see or fill this field.
  if (clean(body.website)) {
    return res.status(200).json({ ok: true });
  }

  const { errors, row } = validate(body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Please check the highlighted fields.', fields: errors });
  }

  let created;
  try {
    created = await insertFeedback(row);
  } catch (err) {
    console.error('[feedback] save failed:', err.message);
    const isConfig = err.code === 'CONFIG';
    return res.status(isConfig ? 500 : 502).json({
      error: isConfig
        ? 'The feedback service is not configured yet. Please contact DG Travels directly.'
        : 'Could not save your feedback right now. Please try again in a moment.'
    });
  }

  // Saved successfully — the email is a bonus, never a reason to fail.
  const notify = await sendFeedbackEmail(created);
  if (!notify.sent) {
    console.warn('[feedback] saved but email not sent:', notify.reason);
  }

  return res.status(201).json({
    ok: true,
    review: {
      id: created.id,
      name: created.name,
      message: created.message,
      rating: created.rating,
      created_at: created.created_at
    }
  });
};
