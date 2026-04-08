#!/usr/bin/env python3
"""
Foundation Report Generator
Reads brand/{slug}/ pillar data and generates a full HTML presentation.
Usage: python3 generate-foundation-report.py <slug>
"""

import sys, os, re, json, urllib.request, base64
from pathlib import Path

BRAND_DIR = Path(os.path.expanduser("~/.openclaw/workspace-sancho/brand"))

def read_file(path):
    try:
        return Path(path).read_text(encoding='utf-8')
    except:
        return ""

def get_favicon_b64(domain):
    """Get favicon as base64 data URI"""
    try:
        url = f"https://www.google.com/s2/favicons?domain={domain}&sz=128"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        data = urllib.request.urlopen(req, timeout=5).read()
        return f"data:image/png;base64,{base64.b64encode(data).decode()}"
    except:
        return ""

# ============================================================
# PARSERS — Extract structured data from markdown
# ============================================================

def parse_company_context(md):
    """Extract company name, sector, description from company-brief/current.md"""
    info = {'name': '', 'sector': '', 'description': ''}
    
    # Try to find name in first heading or "Empresa" field
    m = re.search(r'^#\s+.*?—\s*(.+)', md, re.M)
    if m: info['name'] = m.group(1).strip()
    else:
        m = re.search(r'^#\s+(.+)', md, re.M)
        if m: info['name'] = m.group(1).strip().split('—')[0].strip()
    
    # Sector
    m = re.search(r'(?:sector|industria|vertical)[:\s]*(.+)', md, re.I)
    if m: info['sector'] = m.group(1).strip().rstrip('|').strip()
    
    return info

def parse_visual_identity(md):
    """Extract colors and fonts from visual-identity/current.md"""
    colors = {
        'primary': '#4361ee',
        'accent': '#ff5722',
        'dark': '#1a1f2e',
        'light': '#f5f3f0',
    }
    
    # Find hex colors
    for match in re.finditer(r'(?:primari|primary)[^`]*`(#[0-9a-fA-F]{6})`', md, re.I):
        colors['primary'] = match.group(1)
    for match in re.finditer(r'(?:Acento|Accent|naranja|orange)[^`\n]*`(#[0-9a-fA-F]{6})`', md, re.I):
        colors['accent'] = match.group(1)
    for match in re.finditer(r'(?:Contraste|[Cc]asi negro|dark\b)[^`\n]*`(#[0-9a-fA-F]{6})`', md, re.I):
        colors['dark'] = match.group(1)
    for match in re.finditer(r'(?:Base|Blanco|white|light\b)[^`\n]*`(#[0-9a-fA-F]{6})`', md, re.I):
        colors['light'] = match.group(1)
    
    return colors

def parse_competitors(md):
    """Extract competitor battle cards from competitor-intelligence/current.md"""
    competitors = []
    
    # Split by Battle Card sections
    cards = re.split(r'## Battle Card:\s*', md)
    
    for card in cards[1:]:  # Skip first chunk (executive summary)
        comp = {
            'name': '',
            'domain': '',
            'type': '',
            'strengths': [],
            'weaknesses': [],
            'strategy': '',
            'verdict': '',
            'ratings': {},
            'reviews_positive': [],
            'reviews_negative': [],
        }
        
        # Name from first line
        first_line = card.split('\n')[0].strip()
        comp['name'] = re.sub(r'\s*\(.*\)', '', first_line).strip()
        
        # Try to find domain — look for URLs in the card
        domain_match = re.search(r'(?:web|url|domain|sitio)[:\s]*(?:https?://)?(?:www\.)?([a-z0-9.-]+\.[a-z]+)', card, re.I)
        if domain_match:
            comp['domain'] = domain_match.group(1)
        else:
            # Look for any .com/.es/.io URL in the card
            any_url = re.search(r'(?:https?://)?(?:www\.)?([a-z0-9-]+\.[a-z.]+)(?:/|[\s\]])', card, re.I)
            if any_url and '.' in any_url.group(1):
                comp['domain'] = any_url.group(1)
            else:
                name_clean = comp['name'].lower().replace(' ', '').replace('&', '')
                comp['domain'] = f"{name_clean}.com"
        
        # Type/Tier
        type_match = re.search(r'\*\*Type\*\*:\s*(.+?)[\n|]', card)
        if type_match: comp['type'] = type_match.group(1).strip()
        
        # KPIs: Try standardized "Slide KPIs" table first, fallback to inline fields
        slide_kpis_section = re.search(r'### Slide KPIs\s*\n\|[^|]*\|[^|]*\|\n\|[-\s|]*\|\n((?:\|.*\|\n)*)', card)
        if slide_kpis_section:
            # Parse table rows: | KPI | Valor |
            for row in re.finditer(r'\|\s*(\w[\w\s/]*?)\s*\|\s*(.+?)\s*\|', slide_kpis_section.group(1)):
                key = row.group(1).strip().lower()
                val = row.group(2).strip()
                if val and val not in ('N/D', 'N/A', 'Sin perfil', '—'):
                    if 'slide title' in key: comp['slide_title'] = val
                    elif 'slide summary' in key: comp['slide_summary'] = val
                    elif 'revenue' in key: comp['revenue'] = val
                    elif 'team' in key: comp['team'] = val
                    elif 'founded' in key: comp['founded'] = val
                    elif 'user' in key or 'client' in key: comp['users'] = val
                    elif 'pricing' in key: comp['pricing'] = val
                    elif 'trustpilot' in key: comp['ratings']['Trustpilot'] = val.split('/')[0].strip()
                    elif 'google maps' in key: comp['ratings']['Google Maps'] = val.split('/')[0].strip()
                    elif 'app store' in key: comp['ratings']['App Store'] = val.split('/')[0].strip()
                    elif 'play store' in key: comp['ratings']['Play Store'] = val.split('/')[0].strip()
                    elif 'g2' in key or 'capterra' in key: comp['ratings']['G2'] = val.split('/')[0].strip()
        
        # Fallback: inline fields (legacy format)
        if not comp.get('revenue'):
            rev_match = re.search(r'\*\*Revenue:?\*\*:?\s*(.+?)(?:\[|$|\n)', card)
            if rev_match: comp['revenue'] = rev_match.group(1).strip()
            else:
                rev_match2 = re.search(r'factura\s+([+\d.,]+M?€[^.]*)', card, re.I)
                if rev_match2: comp['revenue'] = rev_match2.group(1).strip()
        
        if not comp.get('team'):
            team_match = re.search(r'\*\*(?:Equipo|Team):?\*\*:?\s*(.+?)(?:\n|$)', card)
            if team_match: comp['team'] = team_match.group(1).strip()
        
        founder_match = re.search(r'\*\*Fundador(?:/CEO)?:?\*\*:?\s*(.+?)(?:\n|$)', card)
        if founder_match: comp['founder'] = founder_match.group(1).strip()
        
        if not comp.get('funding'):
            funding_match = re.search(r'\*\*Funding:?\*\*:?\s*(.+?)(?:\[|$|\n)', card)
            if funding_match: comp['funding'] = funding_match.group(1).strip()
        
        if not comp.get('pricing'):
            pricing_match = re.search(r'\*\*Pricing:?\*\*:?\s*(.+?)(?:\n|$)', card)
            if pricing_match: comp['pricing'] = pricing_match.group(1).strip()
        
        # Strengths — Key features only (Love goes to reviews)
        features_match = re.search(r'\*\*Key features:?\*\*:?\s*\n((?:[-*].*\n)*)', card, re.I)
        if features_match:
            for line in features_match.group(1).strip().split('\n'):
                line = re.sub(r'^[-*]\s*', '', line).strip()
                if line and len(comp['strengths']) < 6:
                    comp['strengths'].append(line)
        
        # Love reviews → separate field for reviews column
        comp['love_reviews'] = []
        love_match = re.search(r'\*\*Love[^*]*\*\*:?\s*\n((?:[-*].*\n)*)', card, re.I)
        if love_match:
            for line in love_match.group(1).strip().split('\n'):
                line = re.sub(r'^[-*]\s*', '', line).strip()
                if line and '⚠️' not in line and len(comp['love_reviews']) < 4:
                    comp['love_reviews'].append(line)
            # Also add to strengths if features were empty
            if not comp['strengths']:
                comp['strengths'] = comp['love_reviews'][:5]
        
        # Hate reviews → separate field
        comp['hate_reviews'] = []
        hate_match = re.search(r'\*\*Hate:?\*\*:?\s*\n((?:[-*].*\n)*)', card, re.I)
        if hate_match:
            for line in hate_match.group(1).strip().split('\n'):
                line = re.sub(r'^[-*]\s*', '', line).strip()
                if line and '⚠️' not in line and len(comp['hate_reviews']) < 4:
                    comp['hate_reviews'].append(line)
        
        # Weaknesses — from Lens Conflicts + Vulnerabilidad (THEIR real weaknesses, not our talking points)
        
        # 1. Lens Conflicts — the gold: where their claims ≠ reality
        lens_section = re.search(r'(?:Lens Conflicts?|#### Lens Conflicts)\s*\n(.*?)(?=\n### |\n## |\Z)', card, re.S)
        if lens_section:
            for line in lens_section.group(1).strip().split('\n'):
                line = re.sub(r'^[-*]\s*', '', line).strip()
                # Extract just the conflict text, not the label
                line = re.sub(r'^\*\*[^*]+\*\*:?\s*', '', line).strip()
                if line and '⚠️' not in line and len(comp['weaknesses']) < 6:
                    comp['weaknesses'].append(line)
        
        # 2. Unmet needs (customer gaps)
        unmet = re.search(r'\*\*Unmet needs:?\*\*:?\s*(.+?)(?:\n|$)', card)
        if unmet:
            text = unmet.group(1).strip()
            if '⚠️' not in text and len(comp['weaknesses']) < 6:
                comp['weaknesses'].append(text)
        
        # 3. Hate section (real customer complaints)
        hate_section = re.search(r'\*\*Hate:?\*\*:?\s*\n((?:[-*].*\n)*)', card, re.I)
        if hate_section:
            for line in hate_section.group(1).strip().split('\n'):
                line = re.sub(r'^[-*]\s*', '', line).strip()
                if line and '⚠️' not in line and len(comp['weaknesses']) < 6:
                    comp['weaknesses'].append(line)
        
        # 4. Only if still empty, extract "Their weakness" from How to Beat (1 line, not sales points)
        if not comp['weaknesses']:
            beat_section = re.search(r'How to Beat Them?\s*\n\n(.*?)(?=\n### |\Z)', card, re.I | re.S)
            if beat_section:
                weakness_line = re.search(r'\*\*Their weakness[^*]*\*\*\s*(.+?)(?:\*Explotable|\n)', beat_section.group(1))
                if weakness_line:
                    comp['weaknesses'].append(weakness_line.group(1).strip())
        
        # Headline from "Contexto Narrativo" — first paragraph
        context = re.search(r'(?:Contexto Narrativo|Context)\s*\n\n(.+?)(?:\n\n)', card, re.I | re.S)
        if context:
            comp['headline'] = context.group(1).strip()[:300]
        else:
            # Fallback: use first paragraph after name
            first_para = re.search(r'\n\n([A-Z][^#\n|].{50,}?)(?:\n\n)', card, re.S)
            if first_para:
                comp['headline'] = first_para.group(1).strip()[:300]
        
        # Strategy from "Interpretación" or "So What" — full paragraph
        interp = re.search(r'(?:Interpretación|So What)[^"]*\n\n(.+?)(?:\n\n###|\n\n## |\Z)', card, re.I | re.S)
        if interp:
            comp['strategy'] = interp.group(1).strip()[:500]
        else:
            # Fallback from Positioning angle in How to Beat
            pos = re.search(r'\*\*Positioning angle:?\*\*\s*(.+?)(?:\n\n|\n\*\*)', card, re.I | re.S)
            if pos:
                comp['strategy'] = pos.group(1).strip()[:300]
        
        # Ratings — multiple formats: "4.5/5", "5★", "4.5 stars"
        for platform in ['Trustpilot', 'App Store', 'Google Play', 'Google Maps', 'G2', 'Emagister']:
            rating_match = re.search(rf'{platform}[^0-9\n]*?(\d+\.?\d*)\s*(?:/\s*5|★|stars?)', card, re.I)
            if rating_match:
                comp['ratings'][platform] = rating_match.group(1)
        
        # Also extract rating from **Rating:** line
        rating_line = re.search(r'\*\*Rating:\*\*\s*(.+?)(?:\n|$)', card)
        if rating_line and not comp['ratings']:
            line = rating_line.group(1)
            for platform in ['Google Maps', 'Trustpilot', 'Emagister', 'G2']:
                m = re.search(rf'{platform}\s*(\d+\.?\d*)\s*(?:★|/5|stars?)', line, re.I)
                if m:
                    comp['ratings'][platform] = m.group(1)
        
        if comp['name']:
            competitors.append(comp)
    
    return competitors

def parse_swot(md):
    """Extract SWOT quadrants and TOWS strategies"""
    swot = {'strengths': [], 'weaknesses': [], 'opportunities': [], 'threats': []}
    tows = {'SO': [], 'ST': [], 'WO': [], 'WT': []}
    
    # Parse table-based SWOT (Growth4U format)
    for section, key in [('Strength', 'strengths'), ('Weakness', 'weaknesses'), 
                          ('Opportunit', 'opportunities'), ('Threat', 'threats')]:
        pattern = rf'###?\s*[^\n]*{section}[^\n]*\n\n(.*?)(?=\n###|\n## |\Z)'
        match = re.search(pattern, md, re.I | re.S)
        if match:
            content = match.group(1)
            # Extract from table rows
            for row in re.finditer(r'\|\s*\*\*[A-Z]\d+\*\*\s*\|\s*(.+?)\s*\|', content):
                text = row.group(1).strip()
                if text and not text.startswith('---'):
                    swot[key].append(text)
            # Also try bullet points
            if not swot[key]:
                for bullet in re.finditer(r'^[-*]\s+\*\*(.+?)\*\*[:\s]*(.+)', content, re.M):
                    swot[key].append(f"<strong>{bullet.group(1)}:</strong> {bullet.group(2).strip()}")
    
    # Parse TOWS — Growth4U format: ### SO-1: Title\n\n**Idea:**...\n\n**Por qué funciona:**...
    for strategy in ['SO', 'ST', 'WO', 'WT']:
        # Find all ### SO-N: Title sections
        pattern = rf'###\s*{strategy}-(\d+):\s*(.+?)(?:\n|$)'
        for match in re.finditer(pattern, md):
            title = match.group(2).strip()
            # Get the **Idea:** paragraph after this heading
            start = match.end()
            idea_match = re.search(r'\*\*Idea:\*\*\s*(.+?)(?:\n\n|\*\*Por qué)', md[start:start+1000], re.S)
            if idea_match:
                idea = idea_match.group(1).strip()
                # Take first sentence or first 150 chars
                idea_short = idea.split('. ')[0] + '.' if '. ' in idea else idea[:150]
                tows[strategy].append(f"<strong>{title}:</strong> {idea_short}")
            else:
                tows[strategy].append(f"<strong>{title}</strong>")
        
        # Fallback: table rows | **1** | **Name** | desc |
        if not tows[strategy]:
            pattern2 = rf'###?\s*[^\n]*\b{strategy}\b[^\n]*\n\n?(.*?)(?=\n###|\n## |\Z)'
            match2 = re.search(pattern2, md, re.I | re.S)
            if match2:
                for item in re.finditer(r'\|\s*\*\*\d+\*\*\s*\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|', match2.group(1)):
                    tows[strategy].append(f"<strong>{item.group(1).strip()}:</strong> {item.group(2).strip()}")
    
    return swot, tows

def parse_ope(md):
    """Extract OPE Canvas sections"""
    ope = {}
    sections = [
        'Obvious Choice', 'Ideal Customer Profile', 'ICP', 'Core Problem', 
        'Core Product', 'Geography', 'Channels', 'Primary Market Channels',
        'Moat', 'Endgame', 'Core Values', 'Core Capabilities',
        'Strategy Choice', 'Year Picture', '1-Year', 'Quarterly', 'Monthly'
    ]
    
    for section in sections:
        pattern = rf'##\s*(?:[^\n]*?){section}[^\n]*\n\n(.*?)(?=\n## |\Z)'
        match = re.search(pattern, md, re.I | re.S)
        if match:
            content = match.group(1).strip()
            items = []
            
            # Special handling for Core Product: grab first paragraph + ### subsection title
            if 'core product' in section.lower():
                # First paragraph is the product description
                first_para = content.split('\n\n')[0].strip()
                if first_para.startswith('###'):
                    # It's a subsection title like "### Trust Engine — €7.000"
                    title = re.sub(r'^###\s*', '', first_para)
                    items.append(title)
                    # Get next paragraph as description
                    parts = content.split('\n\n')
                    if len(parts) > 1:
                        desc = parts[1].strip()
                        desc = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', desc)
                        items.append(desc)
                else:
                    first_para = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', first_para)
                    items.append(first_para)
                ope[section.lower().replace(' ', '_')] = items
                continue
            
            # Special handling for Core Problem: extract dolor from table
            if 'core problem' in section.lower():
                # Parse table: | ECP | Dolor funcional | Dolor emocional |
                for row in re.finditer(r'^\|\s*\d+\s*—\s*(\w+)\s*\|\s*(.+?)\s*\|', content, re.M):
                    ecp_name = row.group(1).strip()
                    dolor = row.group(2).strip()
                    dolor = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', dolor)
                    items.append(f"**{ecp_name}:** {dolor}")
                if items:
                    ope['core_problem'] = items
                    continue
            
            # Special handling for Monthly/Quarterly with tables: KPI | Actual | Target
            if any(x in section.lower() for x in ['monthly', 'quarterly', 'year picture', '1-year']):
                for row in re.finditer(r'^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|', content, re.M):
                    kpi = row.group(1).strip()
                    target = row.group(3).strip()
                    if kpi and 'KPI' not in kpi and '---' not in kpi:
                        kpi = re.sub(r'🔴|🟡|🟢', '', kpi).strip()
                        items.append(f"**{kpi}:** {target}")
                if items:
                    key = section.lower().replace(' ', '_').replace('-', '_')
                    if 'year' in key and '1' in section: key = 'year_picture'
                    if 'quarterly' in key: key = 'quarterly_picture'
                    if 'monthly' in key: key = 'monthly_picture'
                    ope[key] = items
                    continue
            
            # Special handling for Moats: ### Moat #N: Title\nDescription
            if 'moat' in section.lower():
                for moat_match in re.finditer(r'###\s*Moat\s*#?\d+:\s*(.+?)\s*(?:—|–)\s*(?:Tipo:\s*)?(.+?)\n(.+?)(?=\n###|\n---|\Z)', content, re.S):
                    moat_name = moat_match.group(1).strip()
                    moat_type = moat_match.group(2).strip()
                    moat_desc = moat_match.group(3).strip().split('\n')[0]  # First line only
                    moat_desc = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', moat_desc)
                    moat_desc = re.sub(r'→.*$', '', moat_desc).strip()
                    items.append(f"**{moat_name}** ({moat_type}): {moat_desc}")
            else:
                # Extract numbered items or bullets
                for item in re.finditer(r'(?:^\d+\.\s*|^[-*]\s+)(.+)', content, re.M):
                    text = item.group(1).strip()
                    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
                    if text and '---' not in text and not text.startswith('###'):
                        items.append(text)
                
                # Parse table rows if no bullets found
                if not items:
                    for row in re.finditer(r'^\|\s*(?!\s*[-|]+\s*$)(.+?)\|', content, re.M):
                        cells = [c.strip() for c in row.group(1).split('|') if c.strip()]
                        if cells and not all(c.startswith('---') or c.startswith('===') for c in cells):
                            # Skip header rows (usually first row after |---|)
                            text = ' — '.join(cells[:2]) if len(cells) >= 2 else cells[0]
                            text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
                            text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
                            if text and '---' not in text and 'KPI' not in text and 'ECP' not in text:
                                items.append(text)
                
                # Paragraphs as last resort
                if not items:
                    for para in content.split('\n\n'):
                        para = para.strip()
                        if para and not para.startswith('|') and not para.startswith('>') and not para.startswith('###') and not para.startswith('---'):
                            para = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', para)
                            if len(para) > 10:
                                items.append(para)
            
            key = section.lower().replace(' ', '_').replace('-', '_')
            # Normalize keys
            if 'icp' in key or 'ideal' in key: key = 'icp'
            if 'obvious' in key: key = 'obvious_choice'
            if 'channel' in key: key = 'channels'
            if 'moat' in key: key = 'moats'
            if 'year' in key and '1' in section: key = 'year_picture'
            if 'quarterly' in key: key = 'quarterly_picture'
            if 'monthly' in key: key = 'monthly_picture'
            
            ope[key] = items
    
    return ope

# ============================================================
# HTML GENERATORS
# ============================================================

def html_escape(text):
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

def make_bold_html(text):
    """Convert **text** to <strong>text</strong>"""
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    return text

def generate_cover(company_name, colors):
    domain = company_name.lower().replace(' ', '') + '.io'
    return f'''
    <div class="slide cover-slide visible" id="slide-cover">
        <img class="cover-logo reveal" src="https://www.google.com/s2/favicons?domain={domain}&sz=128" alt="{html_escape(company_name)}">
        <div class="cover-badge reveal reveal-d1">Foundation Report</div>
        <div class="cover-line reveal reveal-d1"></div>
        <h1 class="cover-title reveal reveal-d2">Competitive <span class="accent">Intelligence</span></h1>
        <p class="cover-subtitle reveal reveal-d3">{html_escape(company_name)} — Market Analysis & Strategic Positioning</p>
        <div class="cover-meta reveal reveal-d4">
            <span>📅 March 2026</span>
            <span>🏢 {html_escape(company_name)}</span>
            <span>🔒 Confidential</span>
        </div>
    </div>'''

def generate_toc(sections):
    items = ''
    for i, (label, subtitle, anchor) in enumerate(sections):
        delay = f'reveal-d{min(i // 2 + 1, 4)}'
        items += f'''
            <a class="toc-item reveal {delay}" href="#{anchor}">
                <span class="toc-number">{i+1:02d}</span>
                <span class="toc-label">{html_escape(label)}<small>{html_escape(subtitle)}</small></span>
            </a>'''
    
    return f'''
    <div class="slide toc-slide visible" id="slide-toc">
        <div class="toc-header reveal">
            <h1>Table of <span class="accent">Contents</span></h1>
        </div>
        <div class="toc-grid-wrapper">
            <div class="toc-grid">{items}
            </div>
        </div>
        <div class="toc-footer reveal reveal-d4">
            <span>Confidential</span>
            <span>Foundation Report 2026</span>
        </div>
    </div>'''

def generate_divider(number, title, subtitle):
    return f'''
    <div class="slide divider-slide visible" id="slide-divider-{number}">
        <div class="divider-section-number reveal">{number:02d}</div>
        <h1 class="divider-title reveal reveal-d1">{title}</h1>
        <p class="divider-subtitle reveal reveal-d2">{html_escape(subtitle)}</p>
        <div class="divider-line reveal reveal-d3"></div>
    </div>'''

def generate_competitor_deepdive(comp, section_label="Competitor Analysis"):
    favicon = f"https://www.google.com/s2/favicons?domain={comp['domain']}&sz=128"
    # Prefer explicit slide fields, fallback to auto-extracted
    headline = comp.get('slide_title') or comp.get('headline', '')
    strategy_text = comp.get('slide_summary') or comp.get('strategy', '')
    
    strengths_html = ''
    for s in comp['strengths'][:5]:
        strengths_html += f'<li>{make_bold_html(s)}</li>\n'
    
    weaknesses_html = ''
    for w in comp['weaknesses'][:5]:
        weaknesses_html += f'<li>{make_bold_html(w)}</li>\n'
    
    # KPI cards
    kpi_html = ''
    kpi_data = []
    if comp.get('revenue'): kpi_data.append(('💰 Revenue', comp['revenue']))
    if comp.get('users'): kpi_data.append(('👥 Users/Clients', comp['users']))
    if comp.get('team'): kpi_data.append(('🏢 Equipo', comp['team']))
    if comp.get('founded'): kpi_data.append(('📅 Founded', comp['founded']))
    if comp.get('founder'): kpi_data.append(('👤 Fundador', comp['founder']))
    if comp.get('funding'): kpi_data.append(('🏦 Funding', comp['funding']))
    if comp.get('pricing'): kpi_data.append(('💳 Pricing', comp['pricing']))
    
    def truncate_kpi(text, max_len=40):
        # Clean references and truncate aggressively for card display
        text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
        text = re.sub(r'\(⚠️[^)]*\)', '', text).strip()
        text = re.sub(r'\([^)]{30,}\)', '', text).strip()
        text = re.sub(r'\. Deep dive:.*', '', text).strip()
        text = re.sub(r'\. Explorando.*', '', text).strip()
        text = re.sub(r'\. Fee revisable.*', '', text).strip()
        text = re.sub(r'\. Modelo.*', '', text).strip()
        text = re.sub(r', no publican.*', '', text).strip()
        if len(text) > max_len:
            text = text[:max_len].rsplit(' ', 1)[0] + '…'
        return text
    
    kpi_colors = ['#2563EB', '#7C3AED', '#F97316', '#06B6D4']
    for i, (label, value) in enumerate(kpi_data[:4]):
        short_value = truncate_kpi(value)
        color = kpi_colors[i % len(kpi_colors)]
        kpi_html += f'''
                    <div class="kpi-card-clean" style="border-top: 3px solid {color}">
                        <div class="kpi-label-clean">{label}</div>
                        <div class="kpi-value-clean">{make_bold_html(html_escape(short_value))}</div>
                    </div>'''
    
    # Ratings — always show section, even if empty
    ratings_html = ''
    if comp['ratings']:
        for platform, score in list(comp['ratings'].items())[:3]:
            ratings_html += f'''
                    <div class="rating-card">
                        <div class="platform-header">
                            <span class="platform-name">{html_escape(platform)}</span>
                        </div>
                        <div class="rating-row">
                            <span class="rating-star">★</span>
                            <span class="rating-score">{score}/5</span>
                        </div>
                    </div>'''
    else:
        ratings_html = '''
                    <div class="no-data-card">
                        <span class="no-data-icon">🔍</span>
                        <span class="no-data-text">Sin reviews públicas encontradas (Trustpilot, Google Maps, App Store)</span>
                    </div>'''
    
    # Reviews positive/negative — extract from Love/Hate or show "no data"
    love_items = []
    hate_items = []
    # Already parsed in comp — check if there are Love items in strengths context
    love_section = re.search(r'\*\*Love[^*]*\*\*:?\s*\n((?:[-*].*\n)*)', 
                              competitors_md_context.get(comp['name'], ''), re.I) if hasattr(comp, '_card') else None
    
    reviews_html = ''
    if comp.get('love_reviews'):
        reviews_html += '<div class="reviews-col reviews-positive"><h4>👍 Positive</h4><ul>'
        for r in comp['love_reviews'][:3]:
            reviews_html += f'<li>{make_bold_html(html_escape(r))}</li>'
        reviews_html += '</ul></div>'
    else:
        reviews_html += '<div class="reviews-col reviews-positive"><h4>👍 Positive</h4><p class="no-data-inline">Sin reviews positivas públicas encontradas</p></div>'
    
    if comp.get('hate_reviews'):
        reviews_html += '<div class="reviews-col reviews-negative"><h4>👎 Negative</h4><ul>'
        for r in comp['hate_reviews'][:3]:
            reviews_html += f'<li>{make_bold_html(html_escape(r))}</li>'
        reviews_html += '</ul></div>'
    else:
        reviews_html += '<div class="reviews-col reviews-negative"><h4>👎 Negative</h4><p class="no-data-inline">Sin reviews negativas públicas encontradas</p></div>'
    
    if not strategy_text:
        strategy_text = 'Analysis pending.'
    
    # Clean markdown from texts
    headline_clean = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', headline) if headline else ''
    # Truncate headline to first sentence only (thesis, not full paragraph)
    if headline_clean and '. ' in headline_clean:
        headline_clean = headline_clean.split('. ')[0] + '.'
    if len(headline_clean) > 120:
        headline_clean = headline_clean[:120].rsplit(' ', 1)[0] + '…'
    
    strategy_clean = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', strategy_text)
    
    return f'''
    <div class="slide competitor-deep-dive visible" id="slide-{comp['name'].lower().replace(' ', '-')}">
        <div class="slide-header reveal">
            <div class="header-left">
                <img class="competitor-logo" src="{favicon}" alt="{html_escape(comp['name'])}">
                <h2>{html_escape(comp['name'])}</h2>
            </div>
            <div class="header-right">{html_escape(section_label)}</div>
        </div>

        <div class="headline-block reveal reveal-d1">
            <h2 class="competitor-headline">{make_bold_html(html_escape(headline_clean))}</h2>
            <p class="strategy-summary">{make_bold_html(html_escape(strategy_clean))}</p>
        </div>

        <div class="main-content reveal reveal-d2">
            <div class="left-column">
                <div class="sw-block strengths-block">
                    <h3>Strengths</h3>
                    <ul>{strengths_html}</ul>
                </div>
                <div class="sw-block weaknesses-block">
                    <h3>Weaknesses</h3>
                    <ul>{weaknesses_html}</ul>
                </div>
            </div>
            <div class="right-column">
                <div class="kpi-row">{kpi_html}</div>
                <div class="ratings-row">{ratings_html}</div>
                <div class="reviews-row">{reviews_html}</div>
            </div>
        </div>

        <div class="slide-footer reveal reveal-d4">
            <span>Confidential</span>
            <span>Foundation Report 2026</span>
        </div>
    </div>'''

def generate_swot_tows(swot, tows, company_name):
    def make_list(items, max_items=6):
        html = ''
        for item in items[:max_items]:
            html += f'<li>{make_bold_html(item)}</li>\n'
        return html
    
    def make_tows_list(items, max_items=3):
        html = ''
        for item in items[:max_items]:
            html += f'<li>{make_bold_html(item)}</li>\n'
        return html
    
    return f'''
    <div class="slide swot-slide visible" id="slide-swot">
        <div class="slide-header reveal">
            <div class="header-left">
                <h1>SWOT <span class="accent">+ TOWS</span></h1>
            </div>
            <div class="header-right">
                {html_escape(company_name)}<br>
                Foundation Report 2026
            </div>
        </div>

        <div class="swot-grid reveal reveal-d1">
            <div class="swot-q q-s">
                <h3><span class="icon">💪</span> Strengths</h3>
                <ul>{make_list(swot['strengths'])}</ul>
            </div>
            <div class="swot-q q-w">
                <h3><span class="icon">⚠️</span> Weaknesses</h3>
                <ul>{make_list(swot['weaknesses'])}</ul>
            </div>
            <div class="swot-q q-o">
                <h3><span class="icon">🚀</span> Opportunities</h3>
                <ul>{make_list(swot['opportunities'])}</ul>
            </div>
            <div class="swot-q q-t">
                <h3><span class="icon">🔥</span> Threats</h3>
                <ul>{make_list(swot['threats'])}</ul>
            </div>
        </div>

        <span class="section-label reveal reveal-d2">TOWS Cross-Strategies</span>

        <div class="tows-grid reveal reveal-d3">
            <div class="tows-q t-so">
                <h3><span class="tl">SO</span> Strengths × Opportunities</h3>
                <ol>{make_tows_list(tows['SO'])}</ol>
            </div>
            <div class="tows-q t-st">
                <h3><span class="tl">ST</span> Strengths × Threats</h3>
                <ol>{make_tows_list(tows['ST'])}</ol>
            </div>
            <div class="tows-q t-wo">
                <h3><span class="tl">WO</span> Weaknesses × Opportunities</h3>
                <ol>{make_tows_list(tows['WO'])}</ol>
            </div>
            <div class="tows-q t-wt">
                <h3><span class="tl">WT</span> Weaknesses × Threats</h3>
                <ol>{make_tows_list(tows['WT'])}</ol>
            </div>
        </div>

        <div class="slide-footer reveal reveal-d4">
            <span>Confidential — {html_escape(company_name)}</span>
            <span>Foundation Report 2026</span>
        </div>
    </div>'''

def generate_ope(ope, company_name):
    def truncate(text, max_len=120):
        """Truncate text to max_len, clean markdown links"""
        text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
        text = re.sub(r'→.*$', '', text).strip()
        if len(text) > max_len:
            text = text[:max_len].rsplit(' ', 1)[0] + '…'
        return text
    
    def make_bullets(items, max_items=4, max_len=120):
        html = ''
        for item in items[:max_items]:
            clean = truncate(item, max_len)
            html += f'<li>{make_bold_html(clean)}</li>\n'
        return html
    
    def cell(key, title, items, max_items=4, max_len=120, extra_class=''):
        cls = f'ope-c {extra_class}'.strip()
        return f'''<div class="{cls}">
                <h4>{title}</h4>
                <ul>{make_bullets(items, max_items, max_len)}</ul>
            </div>'''
    
    # Split moats into individual cells
    moats_raw = ope.get('moats', ['—'])
    moat_cells = []
    for i, moat in enumerate(moats_raw[:3]):
        # Each moat item is like "**Name** (Type): Description"
        m = re.match(r'\*\*(.+?)\*\*\s*\((.+?)\):\s*(.*)', moat)
        if m:
            moat_cells.append({
                'title': f'🏰 Moat {i+1}: {m.group(1).strip()}',
                'items': [f'{m.group(2).strip()} — {m.group(3).strip()}']
            })
        else:
            moat_cells.append({
                'title': f'🏰 Moat {i+1}',
                'items': [moat]
            })
    # Pad to 3 moats
    while len(moat_cells) < 3:
        moat_cells.append({'title': f'🏰 Moat {len(moat_cells)+1}', 'items': ['—']})
    
    moats_html = ''
    for mc in moat_cells:
        moats_html += cell('', mc['title'], mc['items'], 2, 150)
    
    return f'''
    <div class="slide ope-slide visible" id="slide-ope">
        <div class="slide-header reveal">
            <div class="header-left">
                <h1>OPE <span class="accent">{html_escape(company_name)}</span></h1>
            </div>
            <div class="header-right">
                Strategic Snapshot<br>
                Foundation Report 2026
            </div>
        </div>

        <div class="ope-layout reveal reveal-d1">
            <!-- Row 1: Obvious Choice | ICP | (Core Problem + Channels) / (Core Product + Geography) -->
            <div class="ope-row1">
                {cell('', '🎯 Obvious Choice', ope.get('obvious_choice', ['—']), 3, 100)}
                {cell('', '👤 Ideal Customer Profile', ope.get('icp', ['—']), 4, 80)}
                <div class="ope-row1-right">
                    {cell('', '🔥 Core Problem', ope.get('core_problem', ['—']), 3, 80)}
                    {cell('', '📢 Channels', ope.get('channels', ['—']), 4, 60)}
                    {cell('', '💎 Core Product', ope.get('core_product', ['—']), 3, 60)}
                    {cell('', '🌍 Geography', ope.get('geography', ['—']), 3, 80)}
                </div>
            </div>

            <!-- Row 2: Moat 1 | Moat 2 | Moat 3 (3 separate cells) -->
            <div class="ope-row2">
                {moats_html}
            </div>

            <!-- Row 3: Endgame (wide) | Core Values (narrow) -->
            <div class="ope-row3">
                {cell('', '🏁 Endgame', ope.get('endgame', ['—']), 3, 150)}
                {cell('', '❤️ Core Values', ope.get('core_values', ['—']), 5, 60)}
            </div>

            <!-- Row 4: Year | Quarter | Month | Core Capabilities -->
            <div class="ope-row4">
                {cell('', '📅 1-Year Picture', ope.get('year_picture', ['—']), 4, 80)}
                {cell('', '📅 Quarterly Picture', ope.get('quarterly_picture', ['—']), 4, 80)}
                {cell('', '📅 Monthly Picture', ope.get('monthly_picture', ['—']), 4, 80)}
                {cell('', '⚡ Core Capabilities', ope.get('core_capabilities', ['—']), 4, 60)}
            </div>

            <!-- Row 5: Strategy Choice (full width) -->
            <div class="ope-row5">
                {cell('', '♟️ Strategy Choice', ope.get('strategy_choice', ['—']), 2, 300)}
            </div>
        </div>

        <div class="slide-footer reveal reveal-d4">
            <span>Confidential — {html_escape(company_name)}</span>
            <span>Framework: ProductLed OPE Canvas (Wes Bush)</span>
        </div>
    </div>'''

def generate_market(md, company_name):
    """Extract key market stats and generate market overview slide with card layout"""
    
    # Extract TAM
    tam_match = re.search(r'TAM\s*(?:estimado)?:?\s*([\d.,]+-?[\d.,]*\s*M€)', md, re.I)
    tam = tam_match.group(1) if tam_match else None
    if not tam:
        tam_match2 = re.search(r'TAM\s*de\s*([\d.,]+-[\d.,]+\s*millones)', md, re.I)
        tam = tam_match2.group(1).replace('millones', 'M€') if tam_match2 else None
    
    # Extract key headline stats
    empresas = re.search(r'([\d.,]+)\s*empresas?\s*tech\s*activas', md, re.I)
    ecosistema = re.search(r'ecosistema.*?valorado.*?(?:más\s*de\s*)?([\d.,]+)\s*(?:mil\s*)?millones', md, re.I)
    if not ecosistema:
        ecosistema = re.search(r'valor\s*superior\s*a\s*([\d.,]+)\s*(?:mil\s*)?millones', md, re.I)
    inversion = re.search(r'(?:inversión|Inversión)\s*(?:VC|total)?:?\s*([\d.,]+)\s*M€', md, re.I)
    startups = re.search(r'([\d.,]+)\s*startups?\s*activas', md, re.I)
    
    # Extract verticals from table
    verticals = []
    for row in re.finditer(r'^\|\s*\*\*(\w[\w\s/]+?)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|', md, re.M):
        name = row.group(1).strip()
        size_raw = row.group(2).strip()
        companies_raw = row.group(4).strip()
        
        # Clean: remove markdown links, sources, long citations
        def clean_field(text):
            text = re.sub(r'\[Fuente:[^\]]*\]\([^)]*\)', '', text)
            text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
            text = re.sub(r'Fuente:\s*\S+', '', text)
            text = text.strip().rstrip(',').strip()
            return text
        
        # Extract just the key number from size: "$7.288M", "~$45.000M", "$6.530M (2024)"
        size_clean = clean_field(size_raw)
        size_num = re.search(r'~?[\$€][\d.,]+\s*[MB]?€?', size_clean)
        if size_num:
            size_display = size_num.group(0).strip()
        else:
            # Try "Enterprise software: $7.288M..." — skip prefix
            size_num2 = re.search(r'[\$€][\d.,]+\s*[MB]', size_clean)
            size_display = size_num2.group(0).strip() if size_num2 else size_clean[:25]
        
        # Add CAGR if available
        cagr = re.search(r'CAGR\s*([\d.,]+%)', size_raw)
        if cagr:
            size_display += f' (CAGR {cagr.group(1)})'
        
        # Extract just company count
        co_clean = clean_field(companies_raw)
        co_num = re.search(r'[\d.,]+\+?\s*(?:companies|startups|empresas|entidades|funded)', co_clean, re.I)
        co_display = co_num.group(0).strip() if co_num else co_clean[:30]
        
        # Only include actual tech verticals, not cities/competitors/threats
        valid_verticals = ['SaaS', 'Health', 'Fintech', 'Edtech', 'Proptech', 'Mobility', 'Deep Tech', 'Biotech', 'ecommerce', 'Crypto', 'Insur']
        if name and any(v.lower() in name.lower() for v in valid_verticals):
            verticals.append({'name': name, 'size': size_display, 'companies': co_display})
    
    # Extract trends from PARTE 4 table: | **Trend** | Direction | Horizon | Type | Impact |
    trends = []
    trend_table = re.findall(r'^\|\s*\*\*(.+?)\*\*\s*\|\s*(\w+)\s*\|\s*(\S+)\s*\|\s*([^|]+)\|\s*(\w+)\s*\|', md, re.M)
    for name, direction, horizon, tipo, impact in trend_table:
        if 'Tendencia' in name: continue  # skip header
        trends.append({
            'name': name.strip(),
            'direction': direction.strip(),
            'horizon': horizon.strip(),
            'type': tipo.strip(),
            'impact': impact.strip(),
        })
    
    # Extract key stats for top trends from subsections
    trend_details = {}
    # GEO stats
    geo_stats = []
    for m in re.finditer(r'CTR.*?(-\d+%)', md):
        geo_stats.append(m.group(1))
    if geo_stats:
        trend_details['GEO'] = f"CTR orgánico {geo_stats[0]} con AI Overviews. 77% usan ChatGPT como buscador."
    
    # Buyer behavior
    buyer = re.search(r'(\d+%)\s*B2B buyers prefieren experiencia rep-free', md)
    if buyer:
        trend_details['buyer'] = f"{buyer.group(1)} B2B buyers prefieren experiencia rep-free. 70% deciden antes de contactar."
    
    # AI commoditization
    ai_stat = re.search(r'(\d+%)\s*de marketers.*?usan IA', md)
    if ai_stat:
        trend_details['ai'] = f"{ai_stat.group(1)} de marketers usan IA, pero pocos diseñan el sistema que la orquesta."
    
    # Build top stats row
    top_stats = ''
    stat_items = []
    if empresas: stat_items.append(('🏢', f'{empresas.group(1)}', 'Empresas tech activas'))
    if startups: stat_items.append(('🚀', f'{startups.group(1)}', 'Startups activas'))
    if tam: stat_items.append(('🎯', tam, 'TAM anual'))
    if ecosistema:
        eco_val = ecosistema.group(1)
        # 110.000 millones = 110B€, not 110.000B€
        try:
            eco_num = float(eco_val.replace('.', '').replace(',', '.'))
            if eco_num > 1000: eco_val = f'{eco_num/1000:.0f}B€'
            else: eco_val = f'{eco_val}M€'
        except: eco_val = f'{eco_val}M€'
        stat_items.append(('💰', eco_val, 'Valor ecosistema'))
    if inversion: stat_items.append(('📈', f'{inversion.group(1)}M€', 'Inversión VC 2025'))
    
    stat_colors = ['#2563EB', '#F97316', '#7C3AED', '#06B6D4']
    for i, (icon, value, label) in enumerate(stat_items[:5]):
        color = stat_colors[i % len(stat_colors)]
        top_stats += f'''
                <div class="mkt-stat" style="border-left: 4px solid {color}">
                    <div class="mkt-stat-icon">{icon}</div>
                    <div class="mkt-stat-data">
                        <div class="mkt-stat-value">{html_escape(value)}</div>
                        <div class="mkt-stat-label">{html_escape(label)}</div>
                    </div>
                </div>'''
    
    # Build verticals grid (6 cards)
    vert_cards = ''
    vert_colors = ['#2563EB', '#7C3AED', '#F97316', '#22c55e', '#06B6D4', '#ec4899', '#d97706']
    for i, v in enumerate(verticals[:7]):
        color = vert_colors[i % len(vert_colors)]
        vert_cards += f'''
                    <div class="mkt-vert" style="border-top: 3px solid {color}">
                        <div class="mkt-vert-name">{html_escape(v['name'])}</div>
                        <div class="mkt-vert-size">{html_escape(v['size'][:40])}</div>
                        <div class="mkt-vert-co">{html_escape(v['companies'][:40])}</div>
                    </div>'''
    
    # Build trends — show up to 6 from the table
    trends_html = ''
    type_icons = {
        'Oportunidad': '🟢', 'Amenaza': '🔴', 'Amenaza/Oportunidad': '🟡',
        'Oportunidad (vertical)': '🟢',
    }
    detail_map = {
        'GEO reemplaza parte de SEO': trend_details.get('GEO', ''),
        'AI Overviews destruyen CTR orgánico': trend_details.get('GEO', ''),
        'IA commoditiza tareas marketing': trend_details.get('ai', ''),
        'B2B buyers: self-serve research': trend_details.get('buyer', ''),
    }
    for i, t in enumerate(trends[:6]):
        icon = type_icons.get(t['type'], '📈')
        impact_color = '#ef4444' if t['impact'] == 'Alto' else '#f59e0b'
        detail = detail_map.get(t['name'], '')
        detail_html = f'<div class="mkt-trend-detail">{html_escape(detail)}</div>' if detail else ''
        trends_html += f'''
                    <div class="mkt-trend" style="border-left: 3px solid {impact_color}">
                        <div class="mkt-trend-header">
                            <span class="mkt-trend-icon">{icon}</span>
                            <span class="mkt-trend-name">{html_escape(t['name'])}</span>
                            <span class="mkt-trend-badge">{html_escape(t['horizon'])}</span>
                        </div>
                        {detail_html}
                    </div>'''
    
    return f'''
    <div class="slide market-slide visible" id="slide-market">
        <div class="slide-header reveal">
            <div class="header-left">
                <h1>Market <span class="accent">Overview</span></h1>
            </div>
            <div class="header-right">{html_escape(company_name)}<br>Foundation Report 2026</div>
        </div>

        <!-- Top stats row -->
        <div class="mkt-stats-row reveal reveal-d1">{top_stats}</div>

        <!-- Two-column: Trends left (60-70%), Verticals right -->
        <div class="mkt-body reveal reveal-d2">
            <div class="mkt-body-left">
                <div class="mkt-section-label">Market Trends</div>
                <div class="mkt-trends">{trends_html}</div>
            </div>
            <div class="mkt-body-right">
                <div class="mkt-section-label">Key Verticals</div>
                <div class="mkt-verticals-list">{vert_cards}</div>
            </div>
        </div>

        <div class="slide-footer reveal reveal-d4">
            <span>Confidential — {html_escape(company_name)}</span>
            <span>Foundation Report 2026</span>
        </div>
    </div>'''

def generate_landscape(competitors, company_name):
    cards = ''
    for i, comp in enumerate(competitors):
        delay = f'reveal-d{min(i // 2 + 1, 4)}'
        favicon = f"https://www.google.com/s2/favicons?domain={comp['domain']}&sz=128"
        
        # Build stats from ratings
        stats_html = ''
        for platform, score in list(comp['ratings'].items())[:4]:
            stats_html += f'''
                    <div class="landscape-stat">
                        <div class="landscape-stat-value">{score}★</div>
                        <div class="landscape-stat-label">{html_escape(platform[:10])}</div>
                    </div>'''
        
        strategy = comp.get('strategy', '')[:120]
        comp_type = comp.get('type', 'Competitor')
        
        cards += f'''
            <div class="landscape-card reveal {delay}">
                <div class="landscape-card-header">
                    <img class="landscape-card-logo" src="{favicon}" alt="{html_escape(comp['name'])}">
                    <div>
                        <div class="landscape-card-name">{html_escape(comp['name'])}</div>
                        <div class="landscape-card-type">{html_escape(comp_type)}</div>
                    </div>
                </div>
                <div class="landscape-card-stats">{stats_html}</div>
                <div class="landscape-card-strategy">{make_bold_html(html_escape(strategy))}</div>
            </div>'''
    
    return f'''
    <div class="slide landscape-slide visible" id="slide-landscape">
        <div class="landscape-header reveal">
            <h1>Competitor <span class="accent">Landscape</span></h1>
        </div>
        <div class="landscape-grid">{cards}</div>
        <div class="landscape-footer reveal reveal-d4">
            <span>Confidential — {html_escape(company_name)}</span>
            <span>Foundation Report 2026</span>
        </div>
    </div>'''

# ============================================================
# MAIN — Assemble full HTML
# ============================================================

def load_css():
    """Load the combined CSS from all approved templates"""
    # Read from example files and combine
    css_path = Path(__file__).parent / 'templates' / 'combined-styles.css'
    if css_path.exists():
        return css_path.read_text()
    
    # Fallback — return inline
    return """/* Auto-generated — see templates/ for source */"""

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 generate-foundation-report.py <slug>")
        print(f"Available: {', '.join(d.name for d in BRAND_DIR.iterdir() if d.is_dir() and d.name != 'example')}")
        sys.exit(1)
    
    slug = sys.argv[1]
    brand_path = BRAND_DIR / slug
    
    if not brand_path.exists():
        print(f"Error: brand/{slug}/ not found")
        sys.exit(1)
    
    print(f"📊 Generating Foundation Report for: {slug}")
    
    # 1. Read all source files
    company_md = read_file(brand_path / 'company-brief' / 'current.md')
    competitors_md = read_file(brand_path / 'market-and-us' / 'competitors' / 'current.md')
    swot_md = read_file(brand_path / 'market-and-us' / 'swot' / 'current.md')
    ope_md = read_file(brand_path / 'market-and-us' / 'ope-canvas' / 'current.md')
    visual_md = read_file(brand_path / 'brand-identity' / 'visual-identity' / 'current.md')
    
    # 2. Parse
    company = parse_company_context(company_md)
    company_name = company['name'] or slug.replace('-', ' ').title()
    print(f"  Company: {company_name}")
    
    colors = parse_visual_identity(visual_md)
    print(f"  Colors: primary={colors['primary']}, accent={colors['accent']}")
    
    competitors = parse_competitors(competitors_md)
    print(f"  Competitors: {len(competitors)} found")
    for c in competitors:
        print(f"    - {c['name']} ({len(c['strengths'])}S/{len(c['weaknesses'])}W, {len(c['ratings'])} ratings)")
    
    swot, tows = parse_swot(swot_md)
    print(f"  SWOT: S={len(swot['strengths'])}, W={len(swot['weaknesses'])}, O={len(swot['opportunities'])}, T={len(swot['threats'])}")
    print(f"  TOWS: SO={len(tows['SO'])}, ST={len(tows['ST'])}, WO={len(tows['WO'])}, WT={len(tows['WT'])}")
    
    ope = parse_ope(ope_md)
    print(f"  OPE: {len(ope)} sections parsed")
    
    # 3. Read market data
    market_md = read_file(brand_path / 'market-and-us' / 'market' / 'current.md')
    has_market = len(market_md) > 100
    print(f"  Market: {'yes' if has_market else 'no'} ({len(market_md)} chars)")
    
    # 4. Build TOC — new order: Market → OPE → SWOT → Landscape → Deep-dives
    toc_sections = []
    if has_market:
        toc_sections.append(('Market Overview', 'TAM, trends & dynamics', 'slide-market'))
    if ope:
        toc_sections.append(('OPE Canvas', 'One-Page Endgame snapshot', 'slide-ope'))
    if any(swot.values()):
        toc_sections.append(('SWOT + TOWS', 'Strategic analysis & cross-strategies', 'slide-swot'))
    toc_sections.append(('Competitor Landscape', f'{len(competitors)} players analyzed', 'slide-landscape'))
    for comp in competitors:
        toc_sections.append((comp['name'], 'Deep-dive analysis', f"slide-{comp['name'].lower().replace(' ', '-')}"))
    
    # 5. Generate slides — order: Cover → TOC → Market → OPE → SWOT → Landscape → Deep-dives
    slides_html = ''
    slides_html += generate_cover(company_name, colors)
    slides_html += generate_toc(toc_sections)
    
    if has_market:
        slides_html += generate_divider(1, 'Market<br>Overview', 'TAM, trends & competitive dynamics')
        slides_html += generate_market(market_md, company_name)
    
    if ope:
        slides_html += generate_ope(ope, company_name)
    
    if any(swot.values()):
        slides_html += generate_swot_tows(swot, tows, company_name)
    
    slides_html += generate_divider(len(toc_sections) - len(competitors), 'Competitor<br>Analysis', f'{len(competitors)} players — deep-dive profiles')
    slides_html += generate_landscape(competitors, company_name)
    
    for comp in competitors:
        slides_html += generate_competitor_deepdive(comp, f"{company_name} — Competitor Analysis")
    
    # 5. Read CSS from reference templates (single source of truth)
    template_dir = Path(__file__).parent / 'templates'
    
    def extract_css(html):
        m = re.search(r'<style>(.*?)</style>', html, re.S)
        return m.group(1) if m else ''
    
    def apply_colors(css, colors):
        css = re.sub(r'--brand-primary:\s*#[0-9a-fA-F]+', f"--brand-primary: {colors['primary']}", css)
        css = re.sub(r'--brand-accent:\s*#[0-9a-fA-F]+', f"--brand-accent: {colors['accent']}", css)
        css = re.sub(r'--brand-dark:\s*#[0-9a-fA-F]+', f"--brand-dark: {colors['dark']}", css)
        css = re.sub(r'--brand-light:\s*#[0-9a-fA-F]+', f"--brand-light: {colors['light']}", css)
        return css
    
    # Read CSS directly from reference templates
    css_competitor = extract_css(read_file(template_dir / 'example-competitor.html'))
    css_swot_ope = extract_css(read_file(template_dir / 'example-swot-ope.html'))
    css_foundation = extract_css(read_file(template_dir / 'example-foundation-slides.html'))
    
    # Extra CSS for generated-specific elements (KPI cards, reviews, no-data states)
    extra_css = """
        /* No-data states */
        .no-data-card {
            background: #f9fafb;
            border: 1px dashed #d1d5db;
            border-radius: 8px;
            padding: clamp(0.4rem, 0.8vw, 0.6rem);
            text-align: center;
            color: #9ca3af;
            font-size: clamp(0.55rem, 0.9vw, 0.7rem);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.4em;
        }
        .no-data-icon { font-size: clamp(0.7rem, 1.2vw, 1rem); }
        .no-data-inline {
            color: #9ca3af;
            font-style: italic;
            font-size: clamp(0.5rem, 0.8vw, 0.65rem);
            margin: 0;
            padding: clamp(0.2rem, 0.4vw, 0.3rem);
        }
        /* Reviews columns */
        .reviews-row {
            display: flex;
            gap: clamp(0.3rem, 0.6vw, 0.5rem);
            flex: 1;
            min-height: 0;
        }
        .reviews-col {
            flex: 1;
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: clamp(0.3rem, 0.5vw, 0.4rem);
            overflow: hidden;
        }
        .reviews-col h4 {
            font-size: clamp(0.5rem, 0.8vw, 0.65rem);
            margin: 0 0 0.3em 0;
            font-weight: 600;
        }
        .reviews-positive { border-top: 3px solid #22c55e; }
        .reviews-negative { border-top: 3px solid #ef4444; }
        .reviews-col ul {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .reviews-col li {
            font-size: clamp(0.45rem, 0.7vw, 0.6rem);
            line-height: 1.3;
            padding: 0.15em 0;
            border-bottom: 1px solid #f3f4f6;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .reviews-col li:last-child { border-bottom: none; }
        /* Edit mode */
        .edit-hotzone {
            position: fixed; top: 0; left: 0;
            width: 80px; height: 80px;
            z-index: 10000; cursor: pointer;
        }
        .edit-toggle {
            position: fixed; top: 12px; left: 12px;
            width: 36px; height: 36px;
            border-radius: 50%; border: none;
            background: var(--brand-primary, #2563EB);
            color: white; font-size: 16px;
            cursor: pointer; z-index: 10001;
            opacity: 0; pointer-events: none;
            transition: opacity 0.3s ease;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .edit-toggle.show, .edit-toggle.active {
            opacity: 1; pointer-events: auto;
        }
        .edit-toggle.active { background: #22c55e; }
        .export-btn {
            position: fixed; top: 12px; left: 56px;
            padding: 4px 10px; border-radius: 6px; border: none;
            background: var(--brand-primary, #2563EB);
            color: white; font-size: 12px; font-weight: 700;
            cursor: pointer; z-index: 10001;
            opacity: 0; pointer-events: none;
            transition: opacity 0.3s ease;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .export-btn.show { opacity: 1; pointer-events: auto; }
        .save-status {
            position: fixed; top: 52px; left: 12px;
            font-size: 12px; font-weight: 700;
            color: #22c55e; z-index: 10001;
            opacity: 0; transition: opacity 0.3s ease;
        }
        .save-status.show { opacity: 1; }
        @media print {
            .edit-hotzone, .edit-toggle, .export-btn, .save-status { display: none !important; }
            body { overflow: visible !important; }
            .slide {
                break-after: page;
                break-inside: avoid;
                page-break-after: always;
                height: 100vh !important;
                min-height: 100vh !important;
                overflow: hidden !important;
                display: flex !important;
                flex-direction: column;
                position: relative !important;
            }
            .slide:last-child { break-after: auto; page-break-after: auto; }
            .slide .reveal, .slide .reveal-d1, .slide .reveal-d2, .slide .reveal-d3, .slide .reveal-d4 {
                opacity: 1 !important;
                transform: none !important;
            }
        }
        @page { size: landscape; margin: 0; }

        /* TOC centering */
        .toc-grid-wrapper {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 0;
        }
        .toc-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: clamp(0.5rem, 1vw, 0.8rem);
            width: 100%;
            max-width: 90%;
        }
        
        /* Market slide — card-based layout */
        .market-slide {
            padding: clamp(0.8rem, 1.5vw, 1.2rem);
            display: flex;
            flex-direction: column;
            gap: clamp(0.3rem, 0.5vh, 0.4rem);
        }
        .mkt-stats-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
            gap: clamp(0.4rem, 0.8vw, 0.6rem);
        }
        .mkt-stat {
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: clamp(0.5rem, 1vw, 0.8rem);
            display: flex;
            align-items: center;
            gap: clamp(0.4rem, 0.8vw, 0.6rem);
        }
        .mkt-stat-icon { font-size: clamp(1.8rem, 3vw, 2.4rem); }
        .mkt-stat-value {
            font-size: clamp(1.3rem, 2.4vw, 1.8rem);
            font-weight: 800;
            color: var(--brand-dark);
            line-height: 1.1;
        }
        .mkt-stat-label {
            font-size: clamp(0.65rem, 1vw, 0.85rem);
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .mkt-section-label {
            font-size: clamp(0.8rem, 1.3vw, 1rem);
            font-weight: 700;
            color: var(--brand-dark);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            padding-top: clamp(0.2rem, 0.3vh, 0.25rem);
        }
        /* Two-column body: trends left 65%, verticals right 35% */
        .mkt-body {
            display: grid;
            grid-template-columns: 65fr 35fr;
            gap: clamp(0.8rem, 1.5vw, 1.2rem);
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }
        .mkt-body-left, .mkt-body-right {
            display: flex;
            flex-direction: column;
            gap: clamp(0.3rem, 0.5vh, 0.4rem);
            min-height: 0;
            overflow: hidden;
        }
        /* Trends — vertical stack */
        .mkt-trends {
            display: flex;
            flex-direction: column;
            gap: clamp(0.3rem, 0.5vh, 0.4rem);
            flex: 1;
            min-height: 0;
        }
        .mkt-trend {
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: clamp(0.4rem, 0.8vw, 0.6rem) clamp(0.5rem, 1vw, 0.8rem);
        }
        .mkt-trend-header {
            display: flex;
            align-items: center;
            gap: 0.4em;
        }
        .mkt-trend-icon { font-size: clamp(1rem, 1.5vw, 1.2rem); flex-shrink: 0; }
        .mkt-trend-name {
            font-size: clamp(0.8rem, 1.3vw, 1.05rem);
            font-weight: 700;
            color: var(--brand-dark);
            flex: 1;
        }
        .mkt-trend-badge {
            font-size: clamp(0.55rem, 0.9vw, 0.7rem);
            background: #f3f4f6;
            color: #6b7280;
            padding: 0.15em 0.5em;
            border-radius: 4px;
            font-weight: 600;
            white-space: nowrap;
        }
        .mkt-trend-detail {
            font-size: clamp(0.65rem, 1.05vw, 0.85rem);
            color: #6b7280;
            margin-top: 0.2em;
            line-height: 1.3;
        }
        /* Verticals — vertical list on the right */
        .mkt-verticals-list {
            display: flex;
            flex-direction: column;
            gap: clamp(0.25rem, 0.4vh, 0.35rem);
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }
        .mkt-verticals-list .mkt-vert {
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: clamp(0.3rem, 0.5vw, 0.4rem) clamp(0.5rem, 0.8vw, 0.6rem);
        }
        .mkt-vert-name {
            font-size: clamp(0.7rem, 1.1vw, 0.9rem);
            font-weight: 700;
            color: var(--brand-dark);
        }
        .mkt-vert-size {
            font-size: clamp(0.8rem, 1.3vw, 1.05rem);
            font-weight: 800;
            color: var(--brand-primary);
        }
        .mkt-vert-co {
            font-size: clamp(0.55rem, 0.85vw, 0.7rem);
            color: #9ca3af;
        }

        /* Clean KPI cards — white bg, colored top bar */
        .kpi-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
            gap: clamp(0.3rem, 0.6vw, 0.5rem);
            margin-bottom: clamp(0.3rem, 0.5vh, 0.4rem);
        }
        .kpi-card-clean {
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: clamp(0.35rem, 0.7vw, 0.5rem) clamp(0.4rem, 0.8vw, 0.6rem);
            text-align: center;
        }
        .kpi-label-clean {
            font-size: clamp(0.45rem, 0.7vw, 0.6rem);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #6b7280;
            margin-bottom: 0.15em;
        }
        .kpi-value-clean {
            font-family: var(--brand-font-display);
            font-size: clamp(0.65rem, 1.1vw, 0.9rem);
            font-weight: 700;
            color: var(--brand-dark, #0F172A);
            line-height: 1.2;
        }
        /* Headline block for competitors */
        .headline-block {
            margin-bottom: clamp(0.3rem, 0.6vh, 0.5rem);
        }
        .competitor-headline {
            font-size: clamp(0.65rem, 1.1vw, 0.85rem);
            font-weight: 700;
            color: var(--brand-dark);
            line-height: 1.3;
            margin: 0 0 clamp(0.15rem, 0.3vh, 0.25rem) 0;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
    """
    
    # Combine: foundation base + competitor styles + swot+ope styles (from templates) + extra generated-only styles
    combined_css = apply_colors(css_foundation + '\n' + css_competitor + '\n' + css_swot_ope + '\n' + extra_css, colors)
    
    # Inline editing JS (raw string — no f-string interpolation)
    edit_js = '''
        var editActive = false;
        var editToggle = document.getElementById('editToggle');
        var exportBtn = document.getElementById('exportBtn');
        var hotzone = document.querySelector('.edit-hotzone');
        var hideTimeout = null;
        var saveStatus = document.getElementById('saveStatus');
        
        function toggleEdit() {
            editActive = !editActive;
            editToggle.classList.toggle('active', editActive);
            exportBtn.classList.toggle('show', editActive);
            document.querySelectorAll('h1,h2,h3,h4,p,li,span,.kpi-value-clean,.mkt-stat-value,.strategy-summary,.competitor-headline').forEach(function(el) {
                el.contentEditable = editActive;
                el.style.outline = editActive ? '1px dashed rgba(37,99,235,0.3)' : 'none';
            });
            if (editActive) {
                editToggle.textContent = '\\u{270F}\\u{FE0F}';
                editToggle.title = 'Editing... (E to exit)';
                editToggle.style.background = '#22c55e';
            } else {
                editToggle.textContent = '\\u{270F}\\u{FE0F}';
                editToggle.title = 'Edit mode (E)';
                editToggle.style.background = '';
                saveToServer();
            }
        }
        
        function saveToServer() {
            saveStatus.textContent = 'Guardando...';
            saveStatus.classList.add('show');
            var savePath = window.location.pathname.replace(/^\\/mc/, '');
            fetch(window.location.pathname, {
                method: 'PUT',
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
                body: '<!DOCTYPE html>' + document.documentElement.outerHTML
            }).then(function(r) { return r.json(); }).then(function(data) {
                if (data.ok) {
                    saveStatus.textContent = '\\u{2705} Guardado';
                    saveStatus.style.color = '#22c55e';
                } else {
                    saveStatus.textContent = '\\u{274C} Error';
                    saveStatus.style.color = '#ef4444';
                }
                setTimeout(function() { saveStatus.classList.remove('show'); }, 2000);
            }).catch(function(err) {
                saveStatus.textContent = '\\u{274C} ' + err.message;
                saveStatus.style.color = '#ef4444';
                setTimeout(function() { saveStatus.classList.remove('show'); }, 3000);
            });
        }
        
        function exportPDF() {
            document.querySelectorAll('.edit-hotzone,.edit-toggle,.export-btn,.save-status').forEach(function(el) { el.style.display = 'none'; });
            document.querySelectorAll('.slide').forEach(function(s) {
                s.classList.add('visible');
                s.style.opacity = '1';
            });
            document.querySelectorAll('.reveal,.reveal-d1,.reveal-d2,.reveal-d3,.reveal-d4').forEach(function(el) {
                el.style.opacity = '1';
                el.style.transform = 'none';
            });
            window.print();
            setTimeout(function() {
                document.querySelectorAll('.edit-hotzone,.edit-toggle,.export-btn,.save-status').forEach(function(el) { el.style.display = ''; });
            }, 500);
        }
        
        editToggle.addEventListener('click', toggleEdit);
        exportBtn.addEventListener('click', exportPDF);
        hotzone.addEventListener('mouseenter', function() { clearTimeout(hideTimeout); editToggle.classList.add('show'); exportBtn.classList.toggle('show', editActive); });
        hotzone.addEventListener('mouseleave', function() { hideTimeout = setTimeout(function() { if (!editActive) { editToggle.classList.remove('show'); exportBtn.classList.remove('show'); } }, 400); });
        editToggle.addEventListener('mouseenter', function() { clearTimeout(hideTimeout); });
        editToggle.addEventListener('mouseleave', function() { hideTimeout = setTimeout(function() { if (!editActive) { editToggle.classList.remove('show'); exportBtn.classList.remove('show'); } }, 400); });
        
        document.addEventListener('keydown', function(e) {
            if ((e.key === 'e' || e.key === 'E') && !e.target.getAttribute('contenteditable')) toggleEdit();
            if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveToServer();
            }
            if (e.key === 'p' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                exportPDF();
            }
        });
    '''
    
    # 6. Assemble final HTML
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Foundation Report — {html_escape(company_name)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&display=swap" rel="stylesheet">
    <style>
{combined_css}
    </style>
</head>
<body>
    <div class="edit-hotzone"></div>
    <button class="edit-toggle" id="editToggle" title="Edit mode (E)">✏️</button>
    <button class="export-btn" id="exportBtn" title="Export PDF (Ctrl+P)">📄 PDF</button>
    <div class="save-status" id="saveStatus"></div>
{slides_html}

    <script>
        const io = new IntersectionObserver(entries => {{
            entries.forEach(e => e.target.classList.toggle('visible', e.isIntersecting));
        }}, {{ threshold: 0.15 }});
        document.querySelectorAll('.slide').forEach(s => io.observe(s));

        {edit_js}

        const slides = [...document.querySelectorAll('.slide')];
        document.addEventListener('keydown', e => {{
            const idx = slides.findIndex(s => {{
                const r = s.getBoundingClientRect();
                return r.top >= -50 && r.top < window.innerHeight / 2;
            }});
            if (e.key === 'ArrowDown' || e.key === 'PageDown') {{
                e.preventDefault();
                if (idx < slides.length - 1) slides[idx + 1].scrollIntoView({{ behavior: 'smooth' }});
            }}
            if (e.key === 'ArrowUp' || e.key === 'PageUp') {{
                e.preventDefault();
                if (idx > 0) slides[idx - 1].scrollIntoView({{ behavior: 'smooth' }});
            }}
        }});
    </script>
</body>
</html>'''
    
    # 7. Write output
    output_dir = brand_path / 'presentations'
    output_dir.mkdir(exist_ok=True)
    output_path = output_dir / 'foundation-report.html'
    output_path.write_text(html, encoding='utf-8')
    
    print(f"\n✅ Generated: {output_path}")
    print(f"   Size: {len(html):,} bytes")
    slide_count = html.count('class="slide ')
    print(f"   Slides: {slide_count}")
    print(f"   URL: https://sancho-cmo.taild48df2.ts.net/mc/brand/{slug}/presentations/foundation-report.html")

if __name__ == '__main__':
    main()
