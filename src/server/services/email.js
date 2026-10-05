// Sends emails (UC8 Email Notification) using the SMTP settings in .env.
// If SMTP_HOST is empty (normal during development) the email is printed to the
// terminal with the prefix "[email preview]" instead of being sent.

import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

let transporter = null;

// Creates the SMTP connection once and reuses it (returns null when SMTP is not configured)
function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465, // port 465 uses SSL from the start; 587 upgrades with STARTTLS
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
    });
  }
  return transporter;
}

// True when real emails are sent (false = they are only printed to the console)
export function isEmailConfigured() {
  return Boolean(config.smtp.host);
}

// Escapes text before putting it inside an HTML email
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sends one email. It NEVER throws, so a failed email never breaks the main action.
 * Returns { sent: true } when sent, { preview: true } when only printed,
 * or { sent: false, error } when sending failed (the error is logged).
 */
export async function sendEmail({ to, subject, text, html }) {
  try {
    const smtp = getTransporter();

    if (!smtp) {
      console.log(`[email preview] To: ${to}\n[email preview] Subject: ${subject}\n${text || ''}\n`);
      return { sent: false, preview: true };
    }

    const info = await smtp.sendMail({ from: config.smtp.from, to, subject, text, html });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[email] Could not send "${subject}" to ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
}
