declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AUTH_SECRET?: string;
    AUTH_URL?: string;
    AUTH_BOOTSTRAP_HASH?: string;
    AUTH_ADMIN_EMAIL?: string;
    AUTH_BOOTSTRAP_EXPIRES?: string;
  }
}
