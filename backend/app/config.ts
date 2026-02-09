/**
 * config.ts - Environment configuration
 */

function env(key: string, fallback?: string): string {
  const value = Deno.env.get(key) ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

export const config = {
  supabaseUrl: env("SUPABASE_URL", "https://acjpfhljskbkyugnslgj.supabase.co"),
  supabaseServiceKey: env("SUPABASE_SERVICE_ROLE_KEY"),
  port: parseInt(env("PORT", "8787")),
  swissTopoBaseUrl: "https://api3.geo.admin.ch/rest/services/api/SearchServer",
};
