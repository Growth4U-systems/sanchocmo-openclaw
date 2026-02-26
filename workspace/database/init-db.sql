-- =============================================================================
-- SanchoCMO OpenClaw - Database Initialization Script
-- =============================================================================
-- Target: Supabase (PostgreSQL 15+)
-- Purpose: Complete schema for the SanchoCMO multi-agent marketing system
-- Tables: 9 core tables supporting CRM, content, campaigns, and intelligence
-- Security: Row-Level Security (RLS) with per-agent role permissions
-- =============================================================================
-- IMPORTANT: Run this script as the Supabase service_role or postgres superuser.
-- Table creation order respects foreign key dependencies.
-- =============================================================================


-- =============================================================================
-- 0. EXTENSIONS
-- =============================================================================

-- Enable pgvector for future semantic search (embeddings on insights, content, etc.)
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable pg_trgm for fuzzy text search on company names, content titles, etc.
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- =============================================================================
-- 1. TABLES (ordered by foreign key dependencies)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.1 companies - CRM: tracked companies and their ICP match signals
-- -----------------------------------------------------------------------------
CREATE TABLE companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT,                          -- Company website domain
  industry TEXT,                        -- Industry vertical
  size TEXT,                            -- Company size bucket (e.g., '1-10', '11-50')
  signals JSONB,                        -- Raw signals data from detection skills
  icp_match_score REAL,                 -- 0.0-1.0 score from ICP matching
  source TEXT,                          -- Where we found this company
  status TEXT DEFAULT 'new',            -- new | qualified | contacted | client | churned
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE companies IS 'CRM table: companies discovered and tracked by SanchoCMO agents';
COMMENT ON COLUMN companies.signals IS 'JSONB blob with raw signals from company-finder and signal-monitor skills';
COMMENT ON COLUMN companies.icp_match_score IS 'ICP match score (0.0-1.0) computed by the explorador agent';

-- -----------------------------------------------------------------------------
-- 1.2 contacts - Decision makers and key contacts at tracked companies
-- -----------------------------------------------------------------------------
CREATE TABLE contacts (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  title TEXT,                           -- Job title
  email TEXT,
  linkedin_url TEXT,
  phone TEXT,
  role TEXT,                            -- Role in buying process: champion | blocker | decision_maker
  source TEXT,                          -- How we found this contact
  status TEXT DEFAULT 'new',            -- new | enriched | contacted | replied | converted
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE contacts IS 'Decision makers and key contacts at tracked companies';
COMMENT ON COLUMN contacts.role IS 'Role in buying process: champion, blocker, decision_maker, influencer';

-- -----------------------------------------------------------------------------
-- 1.3 campaigns - Marketing campaigns orchestrated by Sancho
-- Must be created BEFORE outreach_sequences, content_ideas, editorial_calendar,
-- content_performance, and insights (all reference campaigns)
-- -----------------------------------------------------------------------------
CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  goal TEXT,                            -- Campaign objective
  why_now TEXT,                         -- Strategic reasoning for timing
  channels_activated JSONB,             -- Array of channels: ["linkedin", "email", "blog"]
  budget REAL,                          -- Budget in EUR
  timeline TEXT,                        -- Duration description
  kpi TEXT,                             -- Primary KPI to track
  status TEXT DEFAULT 'proposed',       -- proposed | approved | active | paused | completed
  results JSONB,                        -- Final results summary
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE campaigns IS 'Marketing campaigns orchestrated by the Sancho agent (CMO)';
COMMENT ON COLUMN campaigns.why_now IS 'Strategic reasoning: why this campaign, why now';
COMMENT ON COLUMN campaigns.channels_activated IS 'JSONB array of active channels for this campaign';

-- -----------------------------------------------------------------------------
-- 1.4 outreach_sequences - Multi-step outreach sequences to contacts
-- References: contacts(id), campaigns(id)
-- -----------------------------------------------------------------------------
CREATE TABLE outreach_sequences (
  id SERIAL PRIMARY KEY,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  sequence_name TEXT,                   -- Name of the sequence template
  current_step INTEGER DEFAULT 0,       -- Current step in the sequence (0-indexed)
  total_steps INTEGER,                  -- Total steps in the sequence
  status TEXT DEFAULT 'pending',        -- pending | active | paused | completed | bounced
  started_at TIMESTAMPTZ,
  next_touchpoint_at TIMESTAMPTZ        -- When the next message should be sent
);

COMMENT ON TABLE outreach_sequences IS 'Multi-step outreach sequences managed by the explorador agent';
COMMENT ON COLUMN outreach_sequences.next_touchpoint_at IS 'Scheduled time for the next outreach touchpoint';

-- -----------------------------------------------------------------------------
-- 1.5 content_ideas - Content idea backlog from various sources
-- References: campaigns(id)
-- -----------------------------------------------------------------------------
CREATE TABLE content_ideas (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  source_skill TEXT,                    -- Which SanchoCMO skill generated this idea
  source_url TEXT,                      -- External URL source (if applicable)
  content_pillar TEXT,                  -- Content pillar alignment
  formats JSONB,                        -- Suggested formats: ["linkedin_post", "blog", "video"]
  target_icp TEXT,                      -- Target ICP segment
  priority INTEGER,                     -- 1 (highest) to 5 (lowest)
  status TEXT DEFAULT 'backlog',        -- backlog | approved | in_progress | published | archived
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE content_ideas IS 'Content idea backlog populated by redactor, investigador, and other agents';
COMMENT ON COLUMN content_ideas.source_skill IS 'The SanchoCMO skill that generated this idea (e.g., content-miner, thief-marketers)';

-- -----------------------------------------------------------------------------
-- 1.6 editorial_calendar - Planned and published content schedule
-- References: campaigns(id), content_ideas(id)
-- -----------------------------------------------------------------------------
CREATE TABLE editorial_calendar (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content_type TEXT,                    -- blog | linkedin_post | newsletter | video | carousel | tweet
  platform TEXT,                        -- linkedin | blog | youtube | twitter | instagram
  planned_date DATE,                    -- Scheduled publication date
  published_date DATE,                  -- Actual publication date
  status TEXT DEFAULT 'planned',        -- planned | draft | review | scheduled | published | cancelled
  assigned_agent TEXT,                  -- Which agent is responsible
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  idea_id INTEGER REFERENCES content_ideas(id) ON DELETE SET NULL,
  content_url TEXT,                     -- URL after publication
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE editorial_calendar IS 'Editorial calendar: planned and published content across all channels';
COMMENT ON COLUMN editorial_calendar.assigned_agent IS 'SanchoCMO agent responsible: redactor, comunicador, amplificador, etc.';

-- -----------------------------------------------------------------------------
-- 1.7 competitor_moves - Intelligence on competitor activity
-- No foreign keys (standalone intelligence table)
-- -----------------------------------------------------------------------------
CREATE TABLE competitor_moves (
  id SERIAL PRIMARY KEY,
  competitor_name TEXT NOT NULL,
  move_type TEXT,                       -- product_launch | pricing_change | campaign | hire | partnership | content
  title TEXT,                           -- Brief title of the move
  description TEXT,                     -- Detailed description
  source_url TEXT,                      -- Where we detected this
  platform TEXT,                        -- Platform where detected
  detected_by TEXT,                     -- Which agent or skill detected this
  impact TEXT,                          -- Assessed impact: low | medium | high | critical
  our_response TEXT,                    -- Planned or executed response
  detected_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE competitor_moves IS 'Competitor intelligence tracked by the investigador agent';
COMMENT ON COLUMN competitor_moves.detected_by IS 'Agent or skill that detected this move (e.g., thief-marketers, signal-monitor)';

-- -----------------------------------------------------------------------------
-- 1.8 content_performance - Metrics for published content
-- References: editorial_calendar(id), campaigns(id)
-- -----------------------------------------------------------------------------
CREATE TABLE content_performance (
  id SERIAL PRIMARY KEY,
  calendar_id INTEGER REFERENCES editorial_calendar(id) ON DELETE SET NULL,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  title TEXT,                           -- Content title (denormalized for quick queries)
  platform TEXT,                        -- Platform where published
  url TEXT,                             -- Direct URL to the content
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,                  -- Spend on promotion (EUR)
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE content_performance IS 'Performance metrics for published content, tracked by channel agents';
COMMENT ON COLUMN content_performance.cost IS 'Promotion spend in EUR for this piece of content';

-- -----------------------------------------------------------------------------
-- 1.9 insights - Cross-agent learning system (append-only by all agents)
-- References: campaigns(id)
-- -----------------------------------------------------------------------------
CREATE TABLE insights (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,                   -- The insight itself
  source_channel TEXT,                  -- Channel where insight originated
  source_agent TEXT,                    -- Agent that created this insight
  category TEXT,                        -- Category: audience | content | channel | competitor | process
  occurrences INTEGER DEFAULT 1,        -- How many times this pattern was observed
  promoted_to TEXT,                     -- Where it was promoted: brand-memory | learnings.md | NULL
  promoted_at TIMESTAMPTZ,             -- When it was promoted
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE insights IS 'Append-only learning system: all agents write insights, Sancho promotes weekly';
COMMENT ON COLUMN insights.promoted_to IS 'Promotion target: brand-memory (system-wide) or learnings.md (local)';


-- =============================================================================
-- 2. INDEXES (for common query patterns)
-- =============================================================================

-- companies: filter by status (pipeline views), industry (ICP analysis)
CREATE INDEX idx_companies_status ON companies(status);
CREATE INDEX idx_companies_industry ON companies(industry);

-- contacts: join to companies, filter by status (outreach pipeline)
CREATE INDEX idx_contacts_company_id ON contacts(company_id);
CREATE INDEX idx_contacts_status ON contacts(status);

-- campaigns: filter by status (active campaigns dashboard)
CREATE INDEX idx_campaigns_status ON campaigns(status);

-- editorial_calendar: filter by date (weekly/monthly views), status (workflow)
CREATE INDEX idx_editorial_calendar_planned_date ON editorial_calendar(planned_date);
CREATE INDEX idx_editorial_calendar_status ON editorial_calendar(status);

-- content_ideas: filter by status (backlog management), priority (triage)
CREATE INDEX idx_content_ideas_status ON content_ideas(status);
CREATE INDEX idx_content_ideas_priority ON content_ideas(priority);

-- insights: filter by category (analysis), promoted_to (promotion candidates)
CREATE INDEX idx_insights_category ON insights(category);
CREATE INDEX idx_insights_promoted_to ON insights(promoted_to);

-- competitor_moves: filter by competitor (competitive analysis)
CREATE INDEX idx_competitor_moves_competitor_name ON competitor_moves(competitor_name);

-- outreach_sequences: filter by status (active sequences), next touchpoint (scheduler)
CREATE INDEX idx_outreach_sequences_status ON outreach_sequences(status);
CREATE INDEX idx_outreach_sequences_next_touchpoint ON outreach_sequences(next_touchpoint_at);


-- =============================================================================
-- 3. ROLES (one per SanchoCMO agent + shared agent_role)
-- =============================================================================
-- In Supabase, roles are created at the database level.
-- Each agent authenticates via its own role for RLS enforcement.
-- The shared agent_role provides baseline permissions all agents inherit.
-- =============================================================================

-- Shared base role (all agents inherit from this)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'agent_role') THEN
    CREATE ROLE agent_role NOLOGIN;
  END IF;
END $$;

COMMENT ON ROLE agent_role IS 'Shared base role for all SanchoCMO agents. Provides INSERT on insights (append-only).';

-- Individual agent roles (all inherit from agent_role)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sancho_role') THEN
    CREATE ROLE sancho_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'oraculo_role') THEN
    CREATE ROLE oraculo_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'explorador_role') THEN
    CREATE ROLE explorador_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'redactor_role') THEN
    CREATE ROLE redactor_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'comunicador_role') THEN
    CREATE ROLE comunicador_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'creativo_role') THEN
    CREATE ROLE creativo_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'amplificador_role') THEN
    CREATE ROLE amplificador_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'conector_role') THEN
    CREATE ROLE conector_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'comercial_role') THEN
    CREATE ROLE comercial_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'arquitecto_role') THEN
    CREATE ROLE arquitecto_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'investigador_role') THEN
    CREATE ROLE investigador_role NOLOGIN;
  END IF;
END $$;

-- Grant inheritance from agent_role to all individual roles
GRANT agent_role TO sancho_role;
GRANT agent_role TO oraculo_role;
GRANT agent_role TO explorador_role;
GRANT agent_role TO redactor_role;
GRANT agent_role TO comunicador_role;
GRANT agent_role TO creativo_role;
GRANT agent_role TO amplificador_role;
GRANT agent_role TO conector_role;
GRANT agent_role TO comercial_role;
GRANT agent_role TO arquitecto_role;
GRANT agent_role TO investigador_role;

-- Add comments for each agent role
COMMENT ON ROLE sancho_role IS 'CMO agent: orchestrates campaigns, approves content, promotes insights';
COMMENT ON ROLE oraculo_role IS 'Oracle agent: reads promoted insights for strategic recommendations';
COMMENT ON ROLE explorador_role IS 'Explorer agent: discovers companies, contacts, manages outreach';
COMMENT ON ROLE redactor_role IS 'Writer agent: creates content, manages editorial calendar';
COMMENT ON ROLE comunicador_role IS 'Communicator agent: distributes content across channels';
COMMENT ON ROLE creativo_role IS 'Creative agent: designs visual assets for campaigns';
COMMENT ON ROLE amplificador_role IS 'Amplifier agent: boosts content reach, tracks performance';
COMMENT ON ROLE conector_role IS 'Connector agent: manages relationships, partnerships';
COMMENT ON ROLE comercial_role IS 'Sales agent: commercial intelligence, pipeline visibility';
COMMENT ON ROLE arquitecto_role IS 'Architect agent: technical content, system integrations';
COMMENT ON ROLE investigador_role IS 'Researcher agent: competitive intel, market research';


-- =============================================================================
-- 4. ROW-LEVEL SECURITY (RLS) - Enable on all tables
-- =============================================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 5. RLS POLICIES (per-agent permission matrix)
-- =============================================================================
-- Permission Matrix:
-- | Agent         | READ                                         | WRITE                                              |
-- |---------------|----------------------------------------------|-----------------------------------------------------|
-- | sancho        | ALL tables                                   | campaigns, editorial_calendar, content_ideas, insights |
-- | oraculo       | insights (promoted only)                     | --                                                  |
-- | explorador    | companies, contacts, campaigns               | companies, contacts, outreach_sequences             |
-- | redactor      | editorial_calendar, content_ideas            | content_performance                                 |
-- | comunicador   | editorial_calendar, content_ideas            | content_performance                                 |
-- | creativo      | campaigns, editorial_calendar                | --                                                  |
-- | amplificador  | editorial_calendar, campaigns                | content_performance                                 |
-- | conector      | companies, contacts, campaigns               | companies, contacts                                 |
-- | comercial     | companies, contacts, campaigns               | --                                                  |
-- | arquitecto    | editorial_calendar, campaigns                | content_performance                                 |
-- | investigador  | ALL tables                                   | competitor_moves, content_ideas                     |
-- | ALL (agent_role) | --                                        | insights (INSERT only, append-only)                 |
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 5.1 SHARED: agent_role - INSERT on insights (append-only for all agents)
-- -----------------------------------------------------------------------------
CREATE POLICY agent_role_insert_insights
  ON insights
  FOR INSERT
  TO agent_role
  WITH CHECK (true);

COMMENT ON POLICY agent_role_insert_insights ON insights IS 'All agents can INSERT insights (append-only learning system)';


-- -----------------------------------------------------------------------------
-- 5.2 SANCHO - READ: ALL tables | WRITE: campaigns, editorial_calendar, content_ideas, insights
-- Sancho is the CMO orchestrator with the broadest access
-- -----------------------------------------------------------------------------

-- Sancho READ: all tables
CREATE POLICY sancho_read_companies ON companies FOR SELECT TO sancho_role USING (true);
CREATE POLICY sancho_read_contacts ON contacts FOR SELECT TO sancho_role USING (true);
CREATE POLICY sancho_read_campaigns ON campaigns FOR SELECT TO sancho_role USING (true);
CREATE POLICY sancho_read_outreach_sequences ON outreach_sequences FOR SELECT TO sancho_role USING (true);
CREATE POLICY sancho_read_content_ideas ON content_ideas FOR SELECT TO sancho_role USING (true);
CREATE POLICY sancho_read_editorial_calendar ON editorial_calendar FOR SELECT TO sancho_role USING (true);
CREATE POLICY sancho_read_competitor_moves ON competitor_moves FOR SELECT TO sancho_role USING (true);
CREATE POLICY sancho_read_content_performance ON content_performance FOR SELECT TO sancho_role USING (true);
CREATE POLICY sancho_read_insights ON insights FOR SELECT TO sancho_role USING (true);

-- Sancho WRITE: campaigns (INSERT + UPDATE)
CREATE POLICY sancho_write_campaigns_insert ON campaigns FOR INSERT TO sancho_role WITH CHECK (true);
CREATE POLICY sancho_write_campaigns_update ON campaigns FOR UPDATE TO sancho_role USING (true) WITH CHECK (true);

-- Sancho WRITE: editorial_calendar (INSERT + UPDATE)
CREATE POLICY sancho_write_editorial_calendar_insert ON editorial_calendar FOR INSERT TO sancho_role WITH CHECK (true);
CREATE POLICY sancho_write_editorial_calendar_update ON editorial_calendar FOR UPDATE TO sancho_role USING (true) WITH CHECK (true);

-- Sancho WRITE: content_ideas (INSERT + UPDATE)
CREATE POLICY sancho_write_content_ideas_insert ON content_ideas FOR INSERT TO sancho_role WITH CHECK (true);
CREATE POLICY sancho_write_content_ideas_update ON content_ideas FOR UPDATE TO sancho_role USING (true) WITH CHECK (true);

-- Sancho WRITE: insights (INSERT + UPDATE, for promotion workflow)
CREATE POLICY sancho_write_insights_update ON insights FOR UPDATE TO sancho_role USING (true) WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 5.3 ORACULO - READ: insights (promoted only) | WRITE: none
-- The oracle only sees insights that have been promoted to system knowledge
-- -----------------------------------------------------------------------------
CREATE POLICY oraculo_read_insights_promoted
  ON insights
  FOR SELECT
  TO oraculo_role
  USING (promoted_to IS NOT NULL);

COMMENT ON POLICY oraculo_read_insights_promoted ON insights IS 'Oraculo only sees promoted insights (filtered by promoted_to IS NOT NULL)';


-- -----------------------------------------------------------------------------
-- 5.4 EXPLORADOR - READ: companies, contacts, campaigns | WRITE: companies, contacts, outreach_sequences
-- The explorer discovers companies and manages outreach pipelines
-- -----------------------------------------------------------------------------

-- Explorador READ
CREATE POLICY explorador_read_companies ON companies FOR SELECT TO explorador_role USING (true);
CREATE POLICY explorador_read_contacts ON contacts FOR SELECT TO explorador_role USING (true);
CREATE POLICY explorador_read_campaigns ON campaigns FOR SELECT TO explorador_role USING (true);

-- Explorador WRITE: companies (INSERT + UPDATE)
CREATE POLICY explorador_write_companies_insert ON companies FOR INSERT TO explorador_role WITH CHECK (true);
CREATE POLICY explorador_write_companies_update ON companies FOR UPDATE TO explorador_role USING (true) WITH CHECK (true);

-- Explorador WRITE: contacts (INSERT + UPDATE)
CREATE POLICY explorador_write_contacts_insert ON contacts FOR INSERT TO explorador_role WITH CHECK (true);
CREATE POLICY explorador_write_contacts_update ON contacts FOR UPDATE TO explorador_role USING (true) WITH CHECK (true);

-- Explorador WRITE: outreach_sequences (INSERT + UPDATE)
CREATE POLICY explorador_write_outreach_insert ON outreach_sequences FOR INSERT TO explorador_role WITH CHECK (true);
CREATE POLICY explorador_write_outreach_update ON outreach_sequences FOR UPDATE TO explorador_role USING (true) WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 5.5 REDACTOR - READ: editorial_calendar, content_ideas | WRITE: content_performance
-- The writer reads the calendar and ideas, reports on content performance
-- -----------------------------------------------------------------------------

-- Redactor READ
CREATE POLICY redactor_read_editorial_calendar ON editorial_calendar FOR SELECT TO redactor_role USING (true);
CREATE POLICY redactor_read_content_ideas ON content_ideas FOR SELECT TO redactor_role USING (true);

-- Redactor WRITE: content_performance (INSERT + UPDATE)
CREATE POLICY redactor_write_content_performance_insert ON content_performance FOR INSERT TO redactor_role WITH CHECK (true);
CREATE POLICY redactor_write_content_performance_update ON content_performance FOR UPDATE TO redactor_role USING (true) WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 5.6 COMUNICADOR - READ: editorial_calendar, content_ideas | WRITE: content_performance
-- The communicator distributes content and tracks its performance
-- -----------------------------------------------------------------------------

-- Comunicador READ
CREATE POLICY comunicador_read_editorial_calendar ON editorial_calendar FOR SELECT TO comunicador_role USING (true);
CREATE POLICY comunicador_read_content_ideas ON content_ideas FOR SELECT TO comunicador_role USING (true);

-- Comunicador WRITE: content_performance (INSERT + UPDATE)
CREATE POLICY comunicador_write_content_performance_insert ON content_performance FOR INSERT TO comunicador_role WITH CHECK (true);
CREATE POLICY comunicador_write_content_performance_update ON content_performance FOR UPDATE TO comunicador_role USING (true) WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 5.7 CREATIVO - READ: campaigns, editorial_calendar | WRITE: none
-- The creative reads campaign briefs and calendar for asset creation
-- -----------------------------------------------------------------------------

-- Creativo READ
CREATE POLICY creativo_read_campaigns ON campaigns FOR SELECT TO creativo_role USING (true);
CREATE POLICY creativo_read_editorial_calendar ON editorial_calendar FOR SELECT TO creativo_role USING (true);


-- -----------------------------------------------------------------------------
-- 5.8 AMPLIFICADOR - READ: editorial_calendar, campaigns | WRITE: content_performance
-- The amplifier boosts content and tracks reach metrics
-- -----------------------------------------------------------------------------

-- Amplificador READ
CREATE POLICY amplificador_read_editorial_calendar ON editorial_calendar FOR SELECT TO amplificador_role USING (true);
CREATE POLICY amplificador_read_campaigns ON campaigns FOR SELECT TO amplificador_role USING (true);

-- Amplificador WRITE: content_performance (INSERT + UPDATE)
CREATE POLICY amplificador_write_content_performance_insert ON content_performance FOR INSERT TO amplificador_role WITH CHECK (true);
CREATE POLICY amplificador_write_content_performance_update ON content_performance FOR UPDATE TO amplificador_role USING (true) WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 5.9 CONECTOR - READ: companies, contacts, campaigns | WRITE: companies, contacts
-- The connector manages relationships and partnership data
-- -----------------------------------------------------------------------------

-- Conector READ
CREATE POLICY conector_read_companies ON companies FOR SELECT TO conector_role USING (true);
CREATE POLICY conector_read_contacts ON contacts FOR SELECT TO conector_role USING (true);
CREATE POLICY conector_read_campaigns ON campaigns FOR SELECT TO conector_role USING (true);

-- Conector WRITE: companies (INSERT + UPDATE)
CREATE POLICY conector_write_companies_insert ON companies FOR INSERT TO conector_role WITH CHECK (true);
CREATE POLICY conector_write_companies_update ON companies FOR UPDATE TO conector_role USING (true) WITH CHECK (true);

-- Conector WRITE: contacts (INSERT + UPDATE)
CREATE POLICY conector_write_contacts_insert ON contacts FOR INSERT TO conector_role WITH CHECK (true);
CREATE POLICY conector_write_contacts_update ON contacts FOR UPDATE TO conector_role USING (true) WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 5.10 COMERCIAL - READ: companies, contacts, campaigns | WRITE: none
-- Sales agent with read-only commercial intelligence access
-- -----------------------------------------------------------------------------

-- Comercial READ
CREATE POLICY comercial_read_companies ON companies FOR SELECT TO comercial_role USING (true);
CREATE POLICY comercial_read_contacts ON contacts FOR SELECT TO comercial_role USING (true);
CREATE POLICY comercial_read_campaigns ON campaigns FOR SELECT TO comercial_role USING (true);


-- -----------------------------------------------------------------------------
-- 5.11 ARQUITECTO - READ: editorial_calendar, campaigns | WRITE: content_performance
-- The architect handles technical content and tracks its performance
-- -----------------------------------------------------------------------------

-- Arquitecto READ
CREATE POLICY arquitecto_read_editorial_calendar ON editorial_calendar FOR SELECT TO arquitecto_role USING (true);
CREATE POLICY arquitecto_read_campaigns ON campaigns FOR SELECT TO arquitecto_role USING (true);

-- Arquitecto WRITE: content_performance (INSERT + UPDATE)
CREATE POLICY arquitecto_write_content_performance_insert ON content_performance FOR INSERT TO arquitecto_role WITH CHECK (true);
CREATE POLICY arquitecto_write_content_performance_update ON content_performance FOR UPDATE TO arquitecto_role USING (true) WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 5.12 INVESTIGADOR - READ: ALL tables | WRITE: competitor_moves, content_ideas
-- The researcher has broad read access for market intelligence
-- -----------------------------------------------------------------------------

-- Investigador READ: all tables
CREATE POLICY investigador_read_companies ON companies FOR SELECT TO investigador_role USING (true);
CREATE POLICY investigador_read_contacts ON contacts FOR SELECT TO investigador_role USING (true);
CREATE POLICY investigador_read_campaigns ON campaigns FOR SELECT TO investigador_role USING (true);
CREATE POLICY investigador_read_outreach_sequences ON outreach_sequences FOR SELECT TO investigador_role USING (true);
CREATE POLICY investigador_read_content_ideas ON content_ideas FOR SELECT TO investigador_role USING (true);
CREATE POLICY investigador_read_editorial_calendar ON editorial_calendar FOR SELECT TO investigador_role USING (true);
CREATE POLICY investigador_read_competitor_moves ON competitor_moves FOR SELECT TO investigador_role USING (true);
CREATE POLICY investigador_read_content_performance ON content_performance FOR SELECT TO investigador_role USING (true);
CREATE POLICY investigador_read_insights ON insights FOR SELECT TO investigador_role USING (true);

-- Investigador WRITE: competitor_moves (INSERT + UPDATE)
CREATE POLICY investigador_write_competitor_moves_insert ON competitor_moves FOR INSERT TO investigador_role WITH CHECK (true);
CREATE POLICY investigador_write_competitor_moves_update ON competitor_moves FOR UPDATE TO investigador_role USING (true) WITH CHECK (true);

-- Investigador WRITE: content_ideas (INSERT + UPDATE)
CREATE POLICY investigador_write_content_ideas_insert ON content_ideas FOR INSERT TO investigador_role WITH CHECK (true);
CREATE POLICY investigador_write_content_ideas_update ON content_ideas FOR UPDATE TO investigador_role USING (true) WITH CHECK (true);


-- =============================================================================
-- 6. TABLE-LEVEL GRANTS (required for RLS policies to work)
-- =============================================================================
-- RLS policies filter rows, but the role still needs base table privileges.
-- We grant SELECT/INSERT/UPDATE as appropriate per the permission matrix.
-- =============================================================================

-- agent_role: INSERT on insights (for the shared append-only policy)
GRANT INSERT ON insights TO agent_role;

-- sancho_role: SELECT on all, INSERT+UPDATE on campaigns, editorial_calendar, content_ideas, insights
GRANT SELECT ON companies, contacts, campaigns, outreach_sequences, content_ideas,
  editorial_calendar, competitor_moves, content_performance, insights TO sancho_role;
GRANT INSERT, UPDATE ON campaigns, editorial_calendar, content_ideas, insights TO sancho_role;

-- oraculo_role: SELECT on insights only
GRANT SELECT ON insights TO oraculo_role;

-- explorador_role: SELECT on companies, contacts, campaigns; INSERT+UPDATE on companies, contacts, outreach_sequences
GRANT SELECT ON companies, contacts, campaigns TO explorador_role;
GRANT INSERT, UPDATE ON companies, contacts, outreach_sequences TO explorador_role;

-- redactor_role: SELECT on editorial_calendar, content_ideas; INSERT+UPDATE on content_performance
GRANT SELECT ON editorial_calendar, content_ideas TO redactor_role;
GRANT INSERT, UPDATE ON content_performance TO redactor_role;

-- comunicador_role: SELECT on editorial_calendar, content_ideas; INSERT+UPDATE on content_performance
GRANT SELECT ON editorial_calendar, content_ideas TO comunicador_role;
GRANT INSERT, UPDATE ON content_performance TO comunicador_role;

-- creativo_role: SELECT on campaigns, editorial_calendar
GRANT SELECT ON campaigns, editorial_calendar TO creativo_role;

-- amplificador_role: SELECT on editorial_calendar, campaigns; INSERT+UPDATE on content_performance
GRANT SELECT ON editorial_calendar, campaigns TO amplificador_role;
GRANT INSERT, UPDATE ON content_performance TO amplificador_role;

-- conector_role: SELECT on companies, contacts, campaigns; INSERT+UPDATE on companies, contacts
GRANT SELECT ON companies, contacts, campaigns TO conector_role;
GRANT INSERT, UPDATE ON companies, contacts TO conector_role;

-- comercial_role: SELECT on companies, contacts, campaigns
GRANT SELECT ON companies, contacts, campaigns TO comercial_role;

-- arquitecto_role: SELECT on editorial_calendar, campaigns; INSERT+UPDATE on content_performance
GRANT SELECT ON editorial_calendar, campaigns TO arquitecto_role;
GRANT INSERT, UPDATE ON content_performance TO arquitecto_role;

-- investigador_role: SELECT on all; INSERT+UPDATE on competitor_moves, content_ideas
GRANT SELECT ON companies, contacts, campaigns, outreach_sequences, content_ideas,
  editorial_calendar, competitor_moves, content_performance, insights TO investigador_role;
GRANT INSERT, UPDATE ON competitor_moves, content_ideas TO investigador_role;

-- Grant USAGE on sequences for roles that INSERT into SERIAL tables
GRANT USAGE ON SEQUENCE companies_id_seq TO sancho_role, explorador_role, conector_role;
GRANT USAGE ON SEQUENCE contacts_id_seq TO sancho_role, explorador_role, conector_role;
GRANT USAGE ON SEQUENCE campaigns_id_seq TO sancho_role;
GRANT USAGE ON SEQUENCE outreach_sequences_id_seq TO explorador_role;
GRANT USAGE ON SEQUENCE content_ideas_id_seq TO sancho_role, investigador_role;
GRANT USAGE ON SEQUENCE editorial_calendar_id_seq TO sancho_role;
GRANT USAGE ON SEQUENCE competitor_moves_id_seq TO investigador_role;
GRANT USAGE ON SEQUENCE content_performance_id_seq TO redactor_role, comunicador_role, amplificador_role, arquitecto_role;
GRANT USAGE ON SEQUENCE insights_id_seq TO agent_role;


-- =============================================================================
-- 7. UTILITY QUERIES (for Sancho's weekly promotion workflow)
-- =============================================================================

-- Weekly promotion query: find insights that appeared 3+ times and haven't been promoted yet.
-- Sancho runs this every Monday in the #learning channel to decide what gets promoted
-- to brand-memory.md (system-wide knowledge) or learnings.md (client-specific).
--
-- Usage: Run as sancho_role
-- Action: For each result, Sancho decides:
--   UPDATE insights SET promoted_to = 'brand-memory', promoted_at = NOW() WHERE text = '...' AND category = '...';
--
-- SELECT text, category, COUNT(*) AS occurrences
-- FROM insights
-- WHERE promoted_to IS NULL
-- GROUP BY category, text
-- HAVING COUNT(*) >= 3
-- ORDER BY COUNT(*) DESC;


-- =============================================================================
-- 8. SCHEMA SUMMARY
-- =============================================================================
-- Tables: 9
--   - companies, contacts, campaigns, outreach_sequences, content_ideas,
--     editorial_calendar, competitor_moves, content_performance, insights
--
-- Indexes: 14
--   - Covering status filters, foreign keys, date ranges, and common lookups
--
-- Roles: 12
--   - 1 shared (agent_role) + 11 individual agent roles
--
-- RLS Policies: 53
--   - Enforcing the SanchoCMO permission matrix per agent
--
-- Extensions: 2
--   - pgvector (semantic search), pg_trgm (fuzzy text search)
--
-- Key Design Decisions:
--   1. insights table is append-only for all agents (shared INSERT via agent_role)
--   2. Only Sancho can UPDATE insights (for promotion workflow)
--   3. Oraculo only sees promoted insights (filtered RLS)
--   4. No DELETE policies - data is never deleted, only status-changed
--   5. SERIAL PKs for simplicity; can migrate to UUID if needed for distributed access
--   6. JSONB columns for flexible schema evolution (signals, formats, channels, results)
-- =============================================================================
