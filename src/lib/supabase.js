import { createClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from './auth.js';

let configuration;
let configurationError = '';
try { configuration = readSupabaseConfig(import.meta.env || {}); }
catch (error) { configurationError = error.message; }

export const supabase = configuration?.configured ? createClient(configuration.url, configuration.key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;
export const supabaseConfigurationError = configurationError;
