// ============================================================
//  Email notification via Resend (https://resend.com)
//
//  Sending is best-effort: if the email fails, the passenger's
//  feedback is already safely in Supabase, so /api/feedback still
//  reports success. The failure is logged for the Vercel dashboard.
// ============================================================

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * @returns {Promise<{sent: boolean, reason?: string}>} never throws
 */
async function sendFeedbackEmail(entry) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL_TO;
  // onboarding@resend.dev works immediately without a verified domain,
  // but only delivers to the address that owns the Resend account.
  const from = process.env.NOTIFY_EMAIL_FROM || 'DG Travels <onboarding@resend.dev>';

  if (!apiKey || !to) {
    return { sent: false, reason: 'RESEND_API_KEY or NOTIFY_EMAIL_TO not configured' };
  }

  const stars = '★'.repeat(entry.rating) + '☆'.repeat(5 - entry.rating);
  const when = new Date(entry.created_at || Date.now()).toLocaleString('en-GB', {
    timeZone: 'Asia/Colombo',
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#13120f;color:#f7f4ec;border-radius:14px">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#d7a84e;font-weight:700">DG Travels</p>
      <h1 style="margin:0 0 18px;font-size:21px;color:#ffffff">New passenger feedback</h1>

      <div style="background:#191712;border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:18px">
        <p style="margin:0 0 10px;font-size:22px;color:#d7a84e;letter-spacing:2px">${stars}
          <span style="font-size:13px;color:#a49d8f;letter-spacing:0">(${entry.rating}/5)</span>
        </p>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#f7f4ec;white-space:pre-wrap">${escapeHtml(entry.message)}</p>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,.10);margin:14px 0">
        <p style="margin:0;font-size:13px;color:#a49d8f">
          <strong style="color:#f7f4ec">${escapeHtml(entry.name)}</strong><br>
          <a href="mailto:${escapeHtml(entry.email)}" style="color:#d7a84e">${escapeHtml(entry.email)}</a><br>
          <span style="color:#6c6659">${escapeHtml(when)} (Sri Lanka time)</span>
        </p>
      </div>

      <p style="margin:16px 0 0;font-size:12px;color:#6c6659">
        This review is now live on your website. To remove it, delete the row in your Supabase
        <strong>feedback</strong> table.
      </p>
    </div>
  `;

  const text =
    `New passenger feedback — DG Travels\n\n` +
    `Rating : ${entry.rating}/5\n` +
    `Name   : ${entry.name}\n` +
    `Email  : ${entry.email}\n` +
    `When   : ${when} (Sri Lanka time)\n\n` +
    `${entry.message}\n`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: to.split(',').map(s => s.trim()).filter(Boolean),
        reply_to: entry.email,
        subject: `${entry.rating}★ feedback from ${entry.name} — DG Travels`,
        html,
        text
      })
    });

    if (!res.ok) {
      return { sent: false, reason: `Resend responded ${res.status}: ${await res.text()}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendFeedbackEmail };
