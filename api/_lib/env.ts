// Validates required environment variables exist and are non-placeholder —
// never logs a value, only ever a variable name.
const PLACEHOLDER_PATTERN = /paste|your[-_ ]|example|changeme|xxx/i;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  if (PLACEHOLDER_PATTERN.test(value)) {
    throw new Error(`Environment variable ${name} still holds a placeholder value — replace it in .env.local`);
  }
  return value;
}

export function getDatabaseUrl(): string {
  return requireEnv('DATABASE_URL');
}

export function getGeminiApiKey(): string {
  return requireEnv('GEMINI_API_KEY');
}

// Called at process start (server, migrate, seed) so a missing/placeholder
// variable fails fast with a clear message instead of a confusing downstream
// connection or API error.
export function validateEnv(): void {
  getDatabaseUrl();
  getGeminiApiKey();
}
