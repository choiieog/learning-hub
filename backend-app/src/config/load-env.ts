/**
 * Loads `.env` with Node's built-in loader (no dotenv dependency).
 * Imported first in main.ts so every module sees the variables.
 * In production the platform injects them instead, hence the try/catch.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: variables come from the environment.
}
