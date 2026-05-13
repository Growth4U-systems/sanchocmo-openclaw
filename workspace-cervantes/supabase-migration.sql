-- ============================================
-- SanchoCMO Multi-Tenant Schema v1
-- Single Supabase project, all clients
-- ============================================

-- Drop old empty tables
DROP TABLE IF EXISTS campaigns CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS competitor_moves CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS content_ideas CASCADE;
DROP TABLE IF EXISTS content_performance CASCADE;
DROP TABLE IF EXISTS editorial_calendar CASCADE;
DROP TABLE IF EXISTS insights CASCADE;
DROP TABLE IF EXISTS outreach_sequences CASCADE;

-- ============================================
-- 1. CLIENTS — master table
-- ============================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,              -- 'hospital-capilar'
  name TEXT NOT NULL,                      -- 'Hospital Capilar'
  discord_guild_id TEXT,                   -- '1475635138108063746'
  phase INTEGER DEFAULT 0,                 -- 0=onboarding, 1=foundation, 2=funnel, 3=execution
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'              -- flexible extra fields
);

-- ============================================
-- 2. PILLARS — Foundation state per client
-- ============================================
CREATE TABLE pillars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,                      -- 'company-context', 'market', etc.
  status TEXT NOT NULL DEFAULT 'not-started', -- not-started, pending-review, approved
  version INTEGER DEFAULT 0,
  file_path TEXT,                          -- 'brand/hospital-capilar/company-context/current.md'
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  qa_score NUMERIC(3,1),                   -- 8.5, 9.0, etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, slug)
);

-- ============================================
-- 3. MEETINGS — Intelligence from meetings
-- ============================================
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,                      -- '2026-01-29-kickoff-hospital-capilar'
  title TEXT NOT NULL,
  meeting_date DATE,
  participants TEXT[],                     -- array of names
  summary TEXT,
  summary_path TEXT,                       -- 'brand/.../summary.md'
  transcript_path TEXT,                    -- 'brand/.../transcript.md'
  decisions JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  insights JSONB DEFAULT '[]',
  source_doc_id TEXT,                      -- Google Drive doc ID
  processed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, slug)
);

-- ============================================
-- 4. INTELLIGENCE_LOG — All processed intelligence
-- ============================================
CREATE TABLE intelligence_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  entry_id TEXT NOT NULL,                  -- 'mtg-2026-01-29-kickoff', 'pulse-2026-02-28'
  type TEXT NOT NULL,                      -- 'meeting', 'daily-pulse', 'research', 'thief-marketer'
  title TEXT NOT NULL,
  summary TEXT,
  date DATE,
  source_file TEXT,
  transcript_file TEXT,
  discord_message_url TEXT,
  status TEXT DEFAULT 'processed',
  tags TEXT[] DEFAULT '{}',
  processed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, entry_id)
);

-- ============================================
-- 5. INTEGRATIONS — Services per client
-- ============================================
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service TEXT NOT NULL,                   -- 'google-ads', 'meta-ads', 'ga4'
  status TEXT DEFAULT 'pending',           -- pending, active, error
  account_id TEXT,                         -- external account identifier
  setup_notes TEXT,
  config JSONB DEFAULT '{}',              -- non-secret config
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, service)
);

-- ============================================
-- 6. COSTS — Token usage tracking
-- ============================================
CREATE TABLE costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE, -- NULL = system/global
  date DATE NOT NULL,
  model TEXT NOT NULL,                     -- 'claude-opus-4-6'
  agent TEXT,                              -- 'sancho', 'cervantes', 'escudero'
  tokens_input BIGINT DEFAULT 0,
  tokens_output BIGINT DEFAULT 0,
  tokens_cache_read BIGINT DEFAULT 0,
  cost_usd NUMERIC(10,6) DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, date, model, agent)
);

-- ============================================
-- 7. CONTENT — Content pieces tracking
-- ============================================
CREATE TABLE content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,                      -- 'blog', 'social', 'ad', 'email', 'landing'
  channel TEXT,                            -- 'instagram', 'blog', 'google-ads'
  status TEXT DEFAULT 'draft',             -- draft, review, approved, published
  file_path TEXT,
  published_url TEXT,
  published_at TIMESTAMPTZ,
  performance JSONB DEFAULT '{}',          -- clicks, impressions, conversions
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 8. CAMPAIGNS — Campaign tracking
-- ============================================
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,                               -- 'paid', 'organic', 'email', 'event'
  status TEXT DEFAULT 'planning',          -- planning, active, paused, completed
  budget_usd NUMERIC(10,2),
  start_date DATE,
  end_date DATE,
  channels TEXT[],
  kpis JSONB DEFAULT '{}',
  results JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_pillars_client ON pillars(client_id);
CREATE INDEX idx_meetings_client ON meetings(client_id);
CREATE INDEX idx_intelligence_client ON intelligence_log(client_id);
CREATE INDEX idx_intelligence_type ON intelligence_log(type);
CREATE INDEX idx_integrations_client ON integrations(client_id);
CREATE INDEX idx_costs_client_date ON costs(client_id, date);
CREATE INDEX idx_content_client ON content(client_id);
CREATE INDEX idx_campaigns_client ON campaigns(client_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE content ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Service role (Cervantes/system) can do everything
CREATE POLICY "service_full_access" ON clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON pillars FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON intelligence_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON integrations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON costs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON content FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON campaigns FOR ALL USING (true) WITH CHECK (true);

-- Anon key can read (for MC dashboard)
CREATE POLICY "anon_read" ON clients FOR SELECT USING (true);
CREATE POLICY "anon_read" ON pillars FOR SELECT USING (true);
CREATE POLICY "anon_read" ON meetings FOR SELECT USING (true);
CREATE POLICY "anon_read" ON intelligence_log FOR SELECT USING (true);
CREATE POLICY "anon_read" ON integrations FOR SELECT USING (true);
CREATE POLICY "anon_read" ON costs FOR SELECT USING (true);
CREATE POLICY "anon_read" ON content FOR SELECT USING (true);
CREATE POLICY "anon_read" ON campaigns FOR SELECT USING (true);

-- ============================================
-- SEED: Hospital Capilar
-- ============================================
INSERT INTO clients (slug, name, discord_guild_id, phase) VALUES
  ('hospital-capilar', 'Hospital Capilar', '1475635138108063746', 1);
