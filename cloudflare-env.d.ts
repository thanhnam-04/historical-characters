declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    APP_SECRET?: string;
    OWNER_EMAIL?: string;
    AUTH_MODE?: string;
    OPENROUTER_API_KEY?: string;
  }
}
