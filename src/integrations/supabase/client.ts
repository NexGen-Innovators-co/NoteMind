// This file is automatically generated. Do not edit it directly.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://kegsrvnywshxyucgjxml.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlZ3Nydm55d3NoeHl1Y2dqeG1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEzMzAxNTgsImV4cCI6MjA2NjkwNjE1OH0.uzLKKEp7mRk8cqg2ezVDpcYMVpOlgZjxkNMrpFigDf8";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});