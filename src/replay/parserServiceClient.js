const fetch = require('node-fetch');

// Lifecycle belongs to replay-parser.service, never to either web application.
// Keep the endpoint local and fixed to match the upload transports.
const PARSER_URL = 'http://127.0.0.1:5600';

class ParserServiceClient {
  constructor({ url = PARSER_URL, intervalMs = 5000, timeoutMs = 2000 } = {}) {
    this.parserUrl = url;
    this.parserReady = false;
    this.parserHealth = null;
    this._healthIntervalMs = intervalMs;
    this._healthTimeoutMs = timeoutMs;
    this._shutdownRequested = false;
    this._healthTimer = null;
    this._healthCheck = null;
  }

  async startParserService() {
    if (this._shutdownRequested) return false;
    if (!this._healthTimer) {
      this._healthTimer = setInterval(() => this._checkParserHealth(), this._healthIntervalMs);
      this._healthTimer.unref();
    }
    return this._checkParserHealth();
  }

  async _checkParserHealth() {
    if (this._shutdownRequested) return false;
    if (this._healthCheck) return this._healthCheck;
    this._healthCheck = (async () => {
      let health = null;
      let failure;
      try {
        const response = await fetch(`${this.parserUrl}/healthz`, {
          timeout: this._healthTimeoutMs,
          size: 16384,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        health = await response.json();
        if (health.service !== 'oi-replay-parser' || health.protocolVersion !== 1 ||
            health.status !== 'ok' || !/^[a-f0-9]{64}$/.test(health.buildSha256) ||
            !Number.isSafeInteger(health.pid) || health.pid <= 0) {
          throw new Error('Unrecognized parser health/version response');
        }
      } catch (error) {
        failure = error.message;
        health = null;
      }
      // Do not let an outstanding request resurrect a stopped client.
      if (this._shutdownRequested) return false;
      const wasReady = this.parserReady;
      const previousBuild = this.parserHealth?.buildSha256;
      this.parserReady = !!health;
      this.parserHealth = health;
      if (health && (!wasReady || previousBuild !== health.buildSha256)) {
        console.log(`[Replay] External parser ready: build=${health.buildSha256} pid=${health.pid}`);
      } else if (!health && (wasReady || !this._healthReported)) {
        console.warn(`[Replay] External parser unavailable (${failure}); replay-parser.service owns recovery.`);
      }
      this._healthReported = true;
      return this.parserReady;
    })();
    try {
      return await this._healthCheck;
    } finally {
      this._healthCheck = null;
    }
  }

  shutdown() {
    this._shutdownRequested = true;
    clearInterval(this._healthTimer);
    this._healthTimer = null;
    this.parserReady = false;
    this.parserHealth = null;
    // Deliberately no process signals: other clients may still be parsing.
  }
}

module.exports = { ParserServiceClient, PARSER_URL };
