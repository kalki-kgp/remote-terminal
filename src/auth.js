import { nanoid } from 'nanoid';

export class TokenAuth {
  constructor(options = {}) {
    this.tokenLifetime = options.tokenLifetime || 24 * 60 * 60 * 1000; // 24 hours default
    this.autoRotate = options.autoRotate !== false;
    this.rotationInterval = options.rotationInterval || 12 * 60 * 60 * 1000; // 12 hours

    this.token = nanoid(32);
    this.tokenCreatedAt = Date.now();
    this.previousToken = null; // Grace period for old token
    this.previousTokenExpiry = null;
    this.authenticated = new Set();

    // Start auto-rotation if enabled
    if (this.autoRotate) {
      this.startAutoRotation();
    }
  }

  getToken() {
    return this.token;
  }

  getTokenInfo() {
    const now = Date.now();
    const expiresAt = this.tokenCreatedAt + this.tokenLifetime;
    return {
      token: this.token,
      createdAt: new Date(this.tokenCreatedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      expiresIn: Math.max(0, expiresAt - now),
      isExpired: now > expiresAt,
    };
  }

  validateToken(providedToken) {
    if (!providedToken) return false;

    const now = Date.now();

    // Check current token
    if (providedToken === this.token) {
      // Check if expired
      if (now > this.tokenCreatedAt + this.tokenLifetime) {
        console.log('[Auth] Token expired');
        return false;
      }
      return true;
    }

    // Check previous token (grace period after rotation)
    if (this.previousToken && providedToken === this.previousToken) {
      if (now < this.previousTokenExpiry) {
        console.log('[Auth] Using previous token (grace period)');
        return true;
      }
    }

    return false;
  }

  markAuthenticated(sessionId) {
    this.authenticated.add(sessionId);
  }

  isAuthenticated(sessionId) {
    return this.authenticated.has(sessionId);
  }

  revokeSession(sessionId) {
    this.authenticated.delete(sessionId);
  }

  revokeAllSessions() {
    this.authenticated.clear();
  }

  // Rotate token with grace period for old token
  rotateToken(gracePeriod = 5 * 60 * 1000) { // 5 min grace period
    this.previousToken = this.token;
    this.previousTokenExpiry = Date.now() + gracePeriod;
    this.token = nanoid(32);
    this.tokenCreatedAt = Date.now();

    console.log('[Auth] Token rotated. New token:', this.token);
    console.log('[Auth] Previous token valid for', gracePeriod / 1000, 'seconds');

    return this.token;
  }

  // Regenerate token immediately (no grace period)
  regenerateToken() {
    this.previousToken = null;
    this.previousTokenExpiry = null;
    this.token = nanoid(32);
    this.tokenCreatedAt = Date.now();
    this.authenticated.clear();

    console.log('[Auth] Token regenerated (all sessions revoked)');
    return this.token;
  }

  startAutoRotation() {
    this.rotationTimer = setInterval(() => {
      console.log('[Auth] Auto-rotating token...');
      this.rotateToken();
    }, this.rotationInterval);

    // Don't prevent process exit
    this.rotationTimer.unref();
  }

  stopAutoRotation() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }
}

// Rate limiter for brute-force protection
export class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
    this.maxAttempts = options.maxAttempts || 5; // 5 attempts per window
    this.blockDuration = options.blockDuration || 30 * 60 * 1000; // 30 min block

    this.attempts = new Map(); // ip -> { count, firstAttempt }
    this.blocked = new Map(); // ip -> unblockTime

    // Cleanup old entries periodically
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 1000);
    this.cleanupTimer.unref();
  }

  // Check if IP is allowed to attempt
  isAllowed(ip) {
    const now = Date.now();

    // Check if blocked
    const unblockTime = this.blocked.get(ip);
    if (unblockTime) {
      if (now < unblockTime) {
        return {
          allowed: false,
          blocked: true,
          retryAfter: Math.ceil((unblockTime - now) / 1000),
          reason: 'Too many failed attempts. Try again later.',
        };
      }
      // Unblock
      this.blocked.delete(ip);
    }

    return { allowed: true };
  }

  // Record a failed attempt
  recordFailure(ip) {
    const now = Date.now();
    const record = this.attempts.get(ip) || { count: 0, firstAttempt: now };

    // Reset if window expired
    if (now - record.firstAttempt > this.windowMs) {
      record.count = 0;
      record.firstAttempt = now;
    }

    record.count++;
    this.attempts.set(ip, record);

    // Block if exceeded
    if (record.count >= this.maxAttempts) {
      this.blocked.set(ip, now + this.blockDuration);
      this.attempts.delete(ip);
      console.log(`[RateLimit] Blocked IP ${ip} for ${this.blockDuration / 1000}s`);
      return { blocked: true, duration: this.blockDuration };
    }

    return {
      blocked: false,
      remaining: this.maxAttempts - record.count,
    };
  }

  // Record success (reset attempts)
  recordSuccess(ip) {
    this.attempts.delete(ip);
  }

  // Get status for an IP
  getStatus(ip) {
    const now = Date.now();
    const unblockTime = this.blocked.get(ip);

    if (unblockTime && now < unblockTime) {
      return {
        blocked: true,
        retryAfter: Math.ceil((unblockTime - now) / 1000),
      };
    }

    const record = this.attempts.get(ip);
    if (record && now - record.firstAttempt <= this.windowMs) {
      return {
        blocked: false,
        attempts: record.count,
        remaining: this.maxAttempts - record.count,
      };
    }

    return { blocked: false, attempts: 0, remaining: this.maxAttempts };
  }

  cleanup() {
    const now = Date.now();

    // Clean expired attempts
    for (const [ip, record] of this.attempts) {
      if (now - record.firstAttempt > this.windowMs) {
        this.attempts.delete(ip);
      }
    }

    // Clean expired blocks
    for (const [ip, unblockTime] of this.blocked) {
      if (now > unblockTime) {
        this.blocked.delete(ip);
      }
    }
  }

  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}
