// Limits how often one computer (IP address) can try to log in or request a
// password reset, to slow down password-guessing attacks (NFR-8).

import { rateLimit } from 'express-rate-limit';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// 20 failed attempts per 15 minutes per IP. Successful requests are not counted,
// so normal users (e.g. switching demo accounts) are never blocked.
export const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: { message: 'Too many attempts. Please wait 15 minutes and try again.' },
    });
  },
});

// UC2: every reset request counts (successful ones too), so nobody can flood a user's mailbox
// with reset emails. 10 requests per 15 minutes per IP (the smoke test uses 2 per run).
export const resetRequestLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: { message: 'Too many reset requests. Please wait 15 minutes and try again.' },
    });
  },
});
