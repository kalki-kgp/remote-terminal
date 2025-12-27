import { nanoid } from 'nanoid';

export class TokenAuth {
  constructor() {
    // Generate a secure one-time token on startup
    this.token = nanoid(32);
    this.authenticated = new Set();
  }

  getToken() {
    return this.token;
  }

  validateToken(providedToken) {
    return providedToken === this.token;
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

  // Regenerate token (useful for security)
  regenerateToken() {
    this.token = nanoid(32);
    this.authenticated.clear();
    return this.token;
  }
}
