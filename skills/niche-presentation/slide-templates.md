# Slide Templates — HTML Reference

> Cada template usa CSS variables de brand (`--brand-*`). NUNCA hardcodear colores de un cliente específico.
> El logo se resuelve en Phase 1: si hay logo en visual-identity → base64 inline. Si no → texto del nombre del cliente.

## CSS Variables Required

Todas las slides esperan estas variables definidas en `:root`:

```css
:root {
    /* Brand — resueltos desde visual-identity/visual-identity.current.md */
    --brand-primary: #6BA89E;       /* Color principal */
    --brand-primary-light: #E8F4F1; /* Primary al 10-15% */
    --brand-primary-dark: #4CA994;  /* Primary oscuro */
    --brand-secondary: #2C3E50;     /* Segundo color (navy, dark) */
    --brand-secondary-light: #34495E;
    --brand-accent: #a886cd;        /* Acento (purple, orange, etc) */
    --brand-accent-light: #F3EDF9;
    --brand-bg: #FAFBFC;
    --brand-text: #2C3E50;
    --brand-text-light: #5D6D7E;
    --brand-text-lighter: #95A5A6;
    --brand-border: #E8ECEF;
    --brand-shadow: 0 4px 24px rgba(44,62,80,0.08);
    --brand-shadow-lg: 0 12px 48px rgba(44,62,80,0.12);
    --brand-radius: 16px;
    --brand-radius-sm: 12px;
    --brand-font-display: 'Raleway', -apple-system, sans-serif;
    --brand-font-body: 'Raleway', -apple-system, sans-serif;

    /* Gradients — derivados de brand colors */
    --gradient-primary: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    --gradient-secondary: linear-gradient(135deg, var(--brand-secondary), #1a252f);
    --gradient-accent: linear-gradient(135deg, var(--brand-accent), #9370B8);
}
```

## Base Components CSS

```css
/* === SECTION LABEL === */
.section-label {
    font-size: clamp(0.55rem, 0.9vw, 0.7rem);
    font-weight: 700;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    background: var(--brand-primary-light);
    color: var(--brand-primary);
    padding: clamp(3px, 0.4vh, 6px) clamp(8px, 1.2vw, 14px);
    border-radius: 20px;
    display: inline-block;
}
.section-label.accent-label {
    background: var(--brand-accent-light);
    color: var(--brand-accent);
}
.section-label.secondary-label {
    background: rgba(44,62,80,0.08);
    color: var(--brand-secondary);
}
.section-label.warning-label {
    background: #FADBD8;
    color: #C0392B;
}

/* === CARDS === */
.card {
    background: white;
    border-radius: var(--brand-radius-sm);
    padding: clamp(12px, 2vw, 20px);
    box-shadow: var(--brand-shadow);
    border: 1px solid var(--brand-border);
}
.card-accent { border-left: 4px solid var(--brand-primary); }
.card-accent-secondary { border-left: 4px solid var(--brand-secondary); }
.card-accent-accent { border-left: 4px solid var(--brand-accent); }

/* === STATS === */
.stat-number {
    font-size: clamp(1.6rem, 3.5vw, 2.8rem);
    font-weight: 900;
    font-family: var(--brand-font-display);
}
.stat-label {
    font-size: clamp(0.65rem, 1vw, 0.85rem);
    color: var(--brand-text-light);
    margin-top: 4px;
}

/* === TAGS === */
.tag {
    display: inline-block;
    padding: clamp(3px, 0.4vh, 6px) clamp(10px, 1.5vw, 16px);
    border-radius: 20px;
    font-size: clamp(0.6rem, 0.9vw, 0.78rem);
    font-weight: 600;
}
.tag-primary { background: var(--brand-primary-light); color: var(--brand-primary-dark); }
.tag-secondary { background: rgba(44,62,80,0.08); color: var(--brand-secondary); }
.tag-accent { background: var(--brand-accent-light); color: var(--brand-accent); }

/* === KPI ROW === */
.kpi-row {
    display: flex;
    gap: clamp(12px, 2vw, 24px);
    margin: clamp(8px, 1.5vh, 16px) 0;
}
.kpi-item {}
.kpi-value {
    font-size: clamp(0.85rem, 1.5vw, 1.1rem);
    font-weight: 800;
    color: var(--brand-primary);
}
.kpi-label {
    font-size: clamp(0.6rem, 0.9vw, 0.78rem);
    color: var(--brand-text-lighter);
}

/* === GRIDS === */
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(12px, 2vw, 20px); }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(12px, 2vw, 20px); }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: clamp(12px, 2vw, 16px); }
@media (max-width: 900px) {
    .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
}

/* === NICHE HERO LAYOUT === */
.niche-hero {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: clamp(16px, 3vw, 32px);
    flex: 1;
}
@media (max-width: 900px) {
    .niche-hero { grid-template-columns: 1fr; }
}
.niche-icon {
    width: clamp(40px, 5vw, 56px);
    height: clamp(40px, 5vw, 56px);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: clamp(1.2rem, 2.5vw, 1.8rem);
    margin-bottom: clamp(6px, 1vh, 12px);
}
.niche-name {
    font-size: clamp(1.2rem, 2.5vw, 1.8rem);
    font-weight: 800;
    color: var(--brand-text);
    margin-bottom: clamp(4px, 0.8vh, 8px);
}
.niche-desc {
    font-size: clamp(0.75rem, 1.2vw, 0.92rem);
    color: var(--brand-text-light);
    line-height: 1.55;
}

/* === COMPETITOR PILLS === */
.competitor-pill {
    display: inline-block;
    padding: clamp(2px, 0.3vh, 4px) clamp(8px, 1vw, 12px);
    background: var(--brand-bg);
    border: 1px solid var(--brand-border);
    border-radius: 20px;
    font-size: clamp(0.6rem, 0.9vw, 0.72rem);
    font-weight: 600;
    color: var(--brand-secondary);
}

/* === QUOTE BLOCK === */
.quote-block {
    font-size: clamp(0.85rem, 1.4vw, 1.05rem);
    color: var(--brand-text);
    font-style: italic;
    line-height: 1.6;
    padding: clamp(12px, 2vw, 20px);
    border-left: 4px solid var(--brand-primary);
    background: var(--brand-primary-light);
    border-radius: 0 var(--brand-radius-sm) var(--brand-radius-sm) 0;
}

/* === TIMELINE === */
.timeline-item {
    position: relative;
    padding-left: clamp(20px, 3vw, 32px);
    padding-bottom: clamp(12px, 2vh, 20px);
    border-left: 2px solid var(--brand-border);
}
.timeline-item::before {
    content: '';
    position: absolute;
    left: -5px;
    top: 4px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--brand-primary);
}

/* === FUNNEL STEPS === */
.funnel-step {
    color: white;
    padding: clamp(8px, 1.2vh, 14px) clamp(12px, 2vw, 20px);
    border-radius: var(--brand-radius-sm);
    font-size: clamp(0.75rem, 1.2vw, 0.9rem);
    font-weight: 700;
    text-align: center;
}
.funnel-step small {
    display: block;
    font-weight: 400;
    font-size: clamp(0.6rem, 0.9vw, 0.75rem);
    opacity: 0.85;
    margin-top: 2px;
}

/* === BULLET LIST === */
.bullet-list {
    list-style: none;
    padding: 0;
}
.bullet-list li {
    font-size: clamp(0.75rem, 1.2vw, 0.88rem);
    color: var(--brand-text-light);
    line-height: 1.5;
    padding: clamp(3px, 0.5vh, 6px) 0;
    padding-left: 1.2em;
    position: relative;
}
.bullet-list li::before {
    content: '→';
    position: absolute;
    left: 0;
    color: var(--brand-primary);
    font-weight: 700;
}

/* === ANIMATIONS === */
.animate-in {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
                transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide.active .animate-in { opacity: 1; transform: translateY(0); }
.delay-1 { transition-delay: 0.1s; }
.delay-2 { transition-delay: 0.2s; }
.delay-3 { transition-delay: 0.35s; }
.delay-4 { transition-delay: 0.5s; }
.delay-5 { transition-delay: 0.65s; }

/* === SLIDE LAYOUT === */
.slide {
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    padding: clamp(24px, 4vw, 48px);
    display: none;
    flex-direction: column;
    position: relative;
    background: var(--brand-bg);
    font-family: var(--brand-font-body);
}
.slide.active { display: flex; }
.slide.cover-bg {
    background: linear-gradient(135deg, #fafbfc 0%, var(--brand-primary-light) 100%);
}
/* CRITICAL: inner wrapper needs flex:1 so justify-content:center works */
.slide.cover-bg > div,
.slide:last-of-type > div {
    flex: 1;
}

/* === RESPONSIVE === */
@media (max-width: 900px) {
    .niche-hero, .grid-2, .campaign-grid {
        grid-template-columns: 1fr !important;
        display: flex !important;
        flex-direction: column !important;
    }
    .grid-3 { grid-template-columns: 1fr 1fr !important; }
    .story-mock { width: clamp(80px, 20vw, 120px) !important; height: clamp(140px, 35vh, 200px) !important; }
    .nav-btn { display: none !important; }
    .meta-ad, .google-serp, .ig-post, .li-post, .email-mockup { max-width: 100% !important; }
}
@media (max-width: 600px) {
    .grid-3, .grid-4 { grid-template-columns: 1fr !important; }
    .slide { padding: clamp(0.8rem, 3vw, 1.5rem) !important; }
    .slide-title { font-size: clamp(1.1rem, 5vw, 1.6rem) !important; }
    .niche-desc { font-size: clamp(0.7rem, 3vw, 0.85rem) !important; }
    .stories-row { justify-content: center; }
    .campaign-col-label { font-size: clamp(0.6rem, 2.5vw, 0.75rem) !important; }
    .kpi-row { flex-wrap: wrap; }
    .competitor-pill { font-size: clamp(0.55rem, 2.5vw, 0.7rem) !important; }
}

.slide-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: clamp(12px, 2vh, 20px);
}
.slide-title {
    font-family: var(--brand-font-display);
    font-size: clamp(1.4rem, 3vw, 2.4rem);
    font-weight: 800;
    color: var(--brand-secondary);
    margin-bottom: clamp(4px, 0.6vh, 8px);
}
.slide-subtitle {
    font-size: clamp(0.8rem, 1.3vw, 1.15rem);
    color: var(--brand-text-light);
    font-weight: 400;
    margin-bottom: clamp(12px, 2vh, 20px);
}

/* === BRAND LOGO === */
.brand-logo {
    height: clamp(24px, 3.5vw, 36px);
}

/* === FOOTER & NAV === */
.slide-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    padding: clamp(8px, 1vh, 12px) clamp(16px, 3vw, 32px);
    font-size: clamp(0.6rem, 0.9vw, 0.78rem);
    color: var(--brand-text-lighter);
    background: rgba(250,251,252,0.95);
    backdrop-filter: blur(8px);
    z-index: 100;
}
.progress-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    height: 3px;
    background: var(--gradient-primary);
    transition: width 0.3s ease;
    z-index: 101;
}
.nav-btn {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    background: white;
    border: 1px solid var(--brand-border);
    border-radius: 50%;
    width: clamp(32px, 4vw, 44px);
    height: clamp(32px, 4vw, 44px);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: clamp(0.9rem, 1.5vw, 1.2rem);
    color: var(--brand-secondary);
    box-shadow: var(--brand-shadow);
    z-index: 100;
    transition: opacity 0.3s, transform 0.2s;
}
.nav-btn:hover { transform: translateY(-50%) scale(1.1); }
.nav-prev { left: clamp(8px, 1.5vw, 16px); }
.nav-next { right: clamp(8px, 1.5vw, 16px); }
.fs-btn {
    position: fixed;
    top: clamp(8px, 1.5vh, 16px);
    right: clamp(8px, 1.5vw, 16px);
    background: white;
    border: 1px solid var(--brand-border);
    border-radius: 8px;
    padding: clamp(4px, 0.6vh, 8px) clamp(8px, 1.2vw, 12px);
    cursor: pointer;
    font-size: clamp(0.8rem, 1.2vw, 1rem);
    color: var(--brand-secondary);
    z-index: 100;
}
```

---

## Slide Type 1: COVER / TITLE

Full-screen centered. Gradient background. Logo + partner + título + fecha.

```html
<div class="slide cover-bg" data-slide="0">
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center;">
        <div class="animate-in">
            <!-- LOGO: resolver desde visual-identity. Si no hay → texto -->
            <img src="{{LOGO_BASE64_OR_URL}}" class="brand-logo" alt="{{CLIENT_NAME}}" style="height:72px; margin-bottom:32px;">
        </div>
        <div class="animate-in delay-1" style="display:flex; align-items:center; gap:14px; justify-content:center; margin-bottom:28px;">
            <span style="font-size:1rem; color:var(--brand-text-lighter);">×</span>
            <span style="font-family:var(--brand-font-display); font-size:clamp(1.2rem, 2.5vw, 1.8rem); font-weight:900; color:#1a1a1a; letter-spacing:-0.5px;">Growth4U</span>
        </div>
        <div class="animate-in delay-2">
            <h1 style="font-size:clamp(1.8rem, 5vw, 3rem); font-weight:900; color:var(--brand-secondary); margin-bottom:12px; line-height:1.15;">
                {{TITLE}}<br><span style="color:var(--brand-primary);">{{SUBTITLE}}</span>
            </h1>
        </div>
        <div class="animate-in delay-2">
            <p style="font-size:clamp(0.85rem, 1.5vw, 1.15rem); color:var(--brand-text-light); max-width:600px; margin:0 auto 28px; line-height:1.6;">
                {{DESCRIPTION}}
            </p>
        </div>
        <div class="animate-in delay-3" style="display:flex; gap:16px; align-items:center; justify-content:center;">
            <span class="tag tag-primary">Growth4U × {{CLIENT_NAME}}</span>
            <span class="tag tag-secondary">{{DATE}}</span>
        </div>
        <div class="animate-in delay-4" style="margin-top:48px; color:var(--brand-text-lighter); font-size:clamp(0.65rem, 1vw, 0.85rem);">
            Usa ← → o desliza para navegar · Pulsa <kbd style="padding:2px 8px; background:var(--brand-bg); border:1px solid var(--brand-border); border-radius:4px; font-size:0.75rem;">F</kbd> para pantalla completa
        </div>
    </div>
</div>
```

## Slide Type 2: CONTEXT / STATS

Section label + title + grid de stat cards + quote.

```html
<div class="slide" data-slide="N">
    <div class="slide-header">
        <span class="section-label">{{SECTION_NAME}}</span>
        <img src="{{LOGO}}" class="brand-logo" alt="{{CLIENT_SHORT}}">
    </div>
    <h2 class="slide-title animate-in">{{TITLE}}</h2>
    <p class="slide-subtitle animate-in delay-1">{{SUBTITLE}}</p>

    <div class="grid-3 animate-in delay-2" style="margin-bottom:clamp(16px, 3vh, 28px);">
        <div class="card card-accent">
            <div class="stat-number" style="color:var(--brand-primary);">{{STAT_1}}</div>
            <div class="stat-label">{{LABEL_1}}</div>
            <p style="font-size:clamp(0.6rem, 0.9vw, 0.8rem); color:var(--brand-text-lighter); margin-top:8px;">{{SOURCE_1}}</p>
        </div>
        <div class="card card-accent-accent">
            <div class="stat-number" style="color:var(--brand-accent);">{{STAT_2}}</div>
            <div class="stat-label">{{LABEL_2}}</div>
            <p style="font-size:clamp(0.6rem, 0.9vw, 0.8rem); color:var(--brand-text-lighter); margin-top:8px;">{{SOURCE_2}}</p>
        </div>
        <div class="card card-accent-secondary">
            <div class="stat-number" style="color:var(--brand-secondary);">{{STAT_3}}</div>
            <div class="stat-label">{{LABEL_3}}</div>
            <p style="font-size:clamp(0.6rem, 0.9vw, 0.8rem); color:var(--brand-text-lighter); margin-top:8px;">{{SOURCE_3}}</p>
        </div>
    </div>

    <div class="quote-block animate-in delay-3">
        "{{QUOTE}}"
    </div>
</div>
```

## Slide Type 3: NICHE DETAIL

Hero layout (60/40). Izquierda: info del nicho. Derecha: Meta Ad mockup.

```html
<div class="slide" data-slide="N">
    <div class="slide-header">
        <span class="section-label">Nicho {{N}} de {{TOTAL}}</span>
        <img src="{{LOGO}}" class="brand-logo" alt="{{CLIENT_SHORT}}">
    </div>

    <div class="niche-hero">
        <div class="niche-left">
            <div class="niche-icon animate-in" style="background:var(--brand-accent-light);">{{EMOJI}}</div>
            <h2 class="niche-name animate-in delay-1">{{NICHE_NAME}}</h2>
            <p class="niche-desc animate-in delay-2">
                {{NICHE_DESCRIPTION}}
            </p>
            <!-- Pain point callout -->
            <div class="animate-in delay-2" style="background:#FFF5F5; border-left:4px solid #E74C3C; padding:clamp(8px, 1.2vh, 12px) clamp(10px, 1.5vw, 16px); border-radius:0 8px 8px 0; margin:clamp(8px, 1vh, 12px) 0;">
                <div style="font-size:clamp(0.55rem, 0.8vw, 0.7rem); font-weight:700; color:#E74C3C; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">{{PAIN_LABEL}}</div>
                <p style="font-size:clamp(0.7rem, 1.1vw, 0.82rem); color:var(--brand-secondary); line-height:1.5; font-style:italic;">"{{PAIN_QUOTE}}"</p>
            </div>
            <!-- KPIs -->
            <div class="kpi-row animate-in delay-3">
                <div class="kpi-item">
                    <div class="kpi-value">{{KPI_1_VALUE}}</div>
                    <div class="kpi-label">{{KPI_1_LABEL}}</div>
                </div>
                <div class="kpi-item">
                    <div class="kpi-value">{{KPI_2_VALUE}}</div>
                    <div class="kpi-label">{{KPI_2_LABEL}}</div>
                </div>
                <div class="kpi-item">
                    <div class="kpi-value">{{KPI_3_VALUE}}</div>
                    <div class="kpi-label">{{KPI_3_LABEL}}</div>
                </div>
            </div>
            <!-- Competitor pills -->
            <div class="animate-in delay-3" style="display:flex; gap:8px; flex-wrap:wrap;">
                {{COMPETITOR_PILLS}}
            </div>
        </div>

        <div class="niche-right animate-in delay-4">
            <!-- Meta Ad Mockup -->
            <div class="meta-ad">
                <div class="meta-ad-header">
                    <div class="meta-ad-avatar">{{CLIENT_INITIALS}}</div>
                    <div>
                        <div class="meta-ad-name">{{CLIENT_NAME}}</div>
                        <div class="meta-ad-sponsor">Publicidad · 🌍</div>
                    </div>
                </div>
                <div class="meta-ad-img" style="background: var(--gradient-secondary);">
                    <div style="font-size:clamp(1.2rem, 2.5vw, 1.8rem); margin-bottom:8px;">{{EMOJI}}</div>
                    <div style="font-size:clamp(0.85rem, 1.5vw, 1rem); font-weight:800; margin-bottom:6px;">{{AD_HEADLINE}}</div>
                    <div style="font-size:clamp(0.6rem, 1vw, 0.75rem); opacity:0.9; line-height:1.4;">{{AD_SUBTEXT}}</div>
                </div>
                <div class="meta-ad-body">
                    <p style="font-size:clamp(0.6rem, 1vw, 0.75rem); color:#1c1e21; margin-bottom:4px;"><strong>{{CLIENT_NAME}}</strong> — {{AD_DESCRIPTION}}</p>
                    <p style="font-size:clamp(0.55rem, 0.8vw, 0.68rem); color:#65676B;">{{AD_URL}}</p>
                </div>
                <a class="meta-ad-cta" href="#" style="background:var(--brand-secondary);">{{AD_CTA}} →</a>
            </div>
        </div>
    </div>

    <!-- Channel callout -->
    <div class="animate-in delay-3" style="margin-top:clamp(6px, 1vh, 10px); padding:clamp(6px, 1vh, 10px) clamp(10px, 1.5vw, 14px); border-left:4px solid var(--brand-accent); background:var(--brand-accent-light); border-radius:0 8px 8px 0;">
        <div style="font-size:clamp(0.5rem, 0.8vw, 0.65rem); font-weight:700; color:var(--brand-accent); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">📍 Canales</div>
        <div style="font-size:clamp(0.65rem, 1vw, 0.78rem); color:var(--brand-secondary); line-height:1.6;">
            {{CHANNELS_LIST}}
        </div>
    </div>
</div>
```

## Slide Type 4: CAMPAIGN / CHANNEL EXAMPLES

Google SERP + Instagram/Stories + Keywords. Mockups realistas CSS puro.

```html
<div class="slide" data-slide="N">
    <div class="slide-header">
        <span class="section-label accent-label">{{NICHE_NAME}} — Ejecución</span>
        <img src="{{LOGO}}" class="brand-logo" alt="{{CLIENT_SHORT}}">
    </div>
    <h2 class="slide-title animate-in">{{CAMPAIGN_TITLE}}</h2>
    <p class="slide-subtitle animate-in delay-1">{{CAMPAIGN_OBJECTIVE}}</p>

    <div class="campaign-grid animate-in delay-2">
        <!-- Google Search -->
        <div>
            <div style="font-size:clamp(0.55rem, 0.8vw, 0.7rem); font-weight:700; color:var(--brand-text-lighter); text-transform:uppercase; letter-spacing:1.5px; margin-bottom:8px;">Google Search</div>
            <div class="google-serp">
                <div class="google-serp-bar">
                    <div class="g-logo"><span style="color:#4285F4">G</span><span style="color:#EA4335">o</span><span style="color:#FBBC05">o</span><span style="color:#4285F4">g</span><span style="color:#34A853">l</span><span style="color:#EA4335">e</span></div>
                    <div class="google-serp-searchbox">{{SEARCH_QUERY}}</div>
                </div>
                <div class="google-serp-content">
                    <div class="google-ad-sponsored">Patrocinado</div>
                    <div class="google-ad-url">{{AD_DISPLAY_URL}}</div>
                    <div class="google-ad-title">{{GOOGLE_HEADLINE}}</div>
                    <div class="google-ad-desc">{{GOOGLE_DESC}}</div>
                </div>
            </div>
        </div>

        <!-- Instagram Post / Stories -->
        <div>
            <div style="font-size:clamp(0.55rem, 0.8vw, 0.7rem); font-weight:700; color:var(--brand-text-lighter); text-transform:uppercase; letter-spacing:1.5px; margin-bottom:8px;">Instagram</div>
            <div style="display:flex; gap:clamp(6px, 1vw, 8px);">
                <!-- Story 1 -->
                <div class="story-mock" style="background: var(--gradient-secondary);">
                    <div class="story-progress"></div>
                    <div style="position:relative;z-index:2;text-align:center;margin-bottom:auto;padding-top:clamp(24px, 4vh, 40px);">
                        <div style="font-size:clamp(1.5rem, 3vw, 3rem);">{{STORY_EMOJI}}</div>
                        <div style="font-size:clamp(0.7rem, 1.2vw, 1.2rem);font-weight:900;margin-top:4px;">{{STORY_HEADLINE}}</div>
                    </div>
                    <div class="story-title">{{STORY_BODY}}</div>
                    <div class="story-cta">{{STORY_CTA}}</div>
                </div>
                <!-- Story 2 -->
                <div class="story-mock" style="background: var(--gradient-primary);">
                    <div class="story-progress"></div>
                    <div style="position:relative;z-index:2;text-align:center;margin-bottom:auto;padding-top:clamp(24px, 4vh, 40px);">
                        <div style="font-size:clamp(1.5rem, 3vw, 3rem);">{{STORY2_EMOJI}}</div>
                        <div style="font-size:clamp(0.5rem, 0.8vw, 0.56rem);text-transform:uppercase;letter-spacing:1.5px;opacity:0.8;">{{STORY2_LABEL}}</div>
                    </div>
                    <div class="story-title">{{STORY2_BODY}}</div>
                    <div class="story-cta">{{STORY2_CTA}}</div>
                </div>
            </div>
        </div>

        <!-- Keywords -->
        <div style="flex:1; min-width:clamp(160px, 20vw, 220px);">
            <div style="font-size:clamp(0.55rem, 0.8vw, 0.7rem); font-weight:700; color:var(--brand-text-lighter); text-transform:uppercase; letter-spacing:1.5px; margin-bottom:8px;">Keywords Target</div>
            <div class="card" style="padding:clamp(10px, 1.5vw, 16px);">
                <div style="display:flex; flex-direction:column; gap:clamp(4px, 0.6vh, 6px); font-size:clamp(0.65rem, 1vw, 0.82rem);">
                    {{KEYWORD_ROWS}}
                </div>
            </div>
        </div>
    </div>
</div>
```

**CSS adicional para Campaign slide:**

```css
/* === CAMPAIGN GRID === */
.campaign-grid {
    display: flex;
    gap: clamp(12px, 2vw, 20px);
    flex: 1;
    align-items: flex-start;
}
@media (max-width: 900px) {
    .campaign-grid { flex-direction: column; }
}

/* === GOOGLE SERP === */
.google-serp {
    background: white;
    border-radius: 12px;
    padding: clamp(10px, 1.5vw, 16px);
    box-shadow: var(--brand-shadow);
}
.google-serp-bar {
    display: flex;
    align-items: center;
    gap: clamp(8px, 1.5vw, 14px);
    margin-bottom: clamp(8px, 1.2vh, 14px);
}
.g-logo {
    font-family: 'Product Sans', Arial, sans-serif;
    font-size: clamp(0.8rem, 1.3vw, 1.1rem);
    font-weight: 500;
}
.google-serp-searchbox {
    flex: 1;
    padding: clamp(6px, 1vh, 10px) clamp(10px, 1.5vw, 14px);
    background: var(--brand-bg);
    border-radius: 999px;
    font-size: clamp(0.65rem, 1vw, 0.82rem);
    color: var(--brand-text);
    border: 1px solid var(--brand-border);
}
.google-ad-sponsored {
    font-size: clamp(0.5rem, 0.75vw, 0.65rem);
    font-weight: 700;
    color: var(--brand-text);
}
.google-ad-url {
    font-size: clamp(0.55rem, 0.85vw, 0.72rem);
    color: var(--brand-text);
    margin-bottom: 2px;
}
.google-ad-title {
    font-size: clamp(0.8rem, 1.3vw, 1.05rem);
    color: #1a0dab;
    line-height: 1.3;
    margin-bottom: 4px;
}
.google-ad-desc {
    font-size: clamp(0.6rem, 0.95vw, 0.78rem);
    color: #4d5156;
    line-height: 1.4;
}

/* === INSTAGRAM STORY MOCK === */
.story-mock {
    width: clamp(100px, 14vw, 160px);
    height: clamp(180px, 28vh, 280px);
    border-radius: 14px;
    color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: clamp(8px, 1.2vw, 12px);
    position: relative;
    overflow: hidden;
}
.story-progress {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    height: 2px;
    background: rgba(255,255,255,0.3);
    border-radius: 2px;
}
.story-progress::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 60%;
    height: 100%;
    background: white;
    border-radius: 2px;
}
.story-title {
    font-size: clamp(0.55rem, 0.85vw, 0.7rem);
    text-align: center;
    line-height: 1.3;
    margin-top: auto;
    z-index: 2;
}
.story-cta {
    background: white;
    color: var(--brand-secondary);
    font-size: clamp(0.5rem, 0.75vw, 0.6rem);
    font-weight: 700;
    padding: clamp(4px, 0.5vh, 6px) clamp(8px, 1.2vw, 14px);
    border-radius: 6px;
    margin-top: clamp(4px, 0.6vh, 8px);
    z-index: 2;
}

/* === META AD === */
.meta-ad {
    background: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: var(--brand-shadow);
}
.meta-ad-header {
    display: flex;
    align-items: center;
    gap: clamp(6px, 1vw, 10px);
    padding: clamp(8px, 1.2vh, 12px) clamp(10px, 1.5vw, 14px);
}
.meta-ad-avatar {
    width: clamp(28px, 3.5vw, 40px);
    height: clamp(28px, 3.5vw, 40px);
    border-radius: 50%;
    background: var(--brand-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 800;
    font-size: clamp(0.6rem, 1vw, 0.85rem);
}
.meta-ad-name {
    font-size: clamp(0.65rem, 1vw, 0.82rem);
    font-weight: 600;
    color: #1c1e21;
}
.meta-ad-sponsor {
    font-size: clamp(0.5rem, 0.75vw, 0.65rem);
    color: #65676B;
}
.meta-ad-img {
    aspect-ratio: 1.2 / 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: white;
    padding: clamp(12px, 2vw, 20px);
    text-align: center;
}
.meta-ad-body {
    padding: clamp(8px, 1.2vh, 12px) clamp(10px, 1.5vw, 14px);
}
.meta-ad-cta {
    display: block;
    text-align: center;
    padding: clamp(6px, 1vh, 10px);
    color: white;
    font-weight: 700;
    font-size: clamp(0.65rem, 1vw, 0.82rem);
    text-decoration: none;
    border-radius: 0 0 12px 12px;
}
```

## Slide Type 5: COMPARISON / FUNNEL

Lado a lado: estado actual vs propuesta con funnel visual.

```html
<div class="slide" data-slide="N">
    <div class="slide-header">
        <span class="section-label">{{SECTION}}</span>
        <img src="{{LOGO}}" class="brand-logo" alt="{{CLIENT_SHORT}}">
    </div>
    <h2 class="slide-title animate-in">{{TITLE}}</h2>
    <p class="slide-subtitle animate-in delay-1">{{SUBTITLE}}</p>

    <div class="grid-2 animate-in delay-2" style="margin-bottom:clamp(12px, 2vh, 24px);">
        <div>
            <h3 style="font-size:clamp(0.85rem, 1.4vw, 1.1rem); font-weight:700; color:var(--brand-secondary); margin-bottom:clamp(10px, 1.5vh, 16px);">🔴 {{CURRENT_LABEL}}</h3>
            <div style="display:flex; flex-direction:column; gap:clamp(4px, 0.8vh, 8px);">
                <div class="funnel-step" style="background:var(--brand-secondary); width:100%;">{{STEP_1}} <small>{{DETAIL_1}}</small></div>
                <div class="funnel-step" style="background:var(--brand-secondary-light); width:85%; margin:0 auto;">{{STEP_2}} <small>{{DETAIL_2}}</small></div>
                <div class="funnel-step" style="background:#5D6D7E; width:70%; margin:0 auto;">{{STEP_3}} <small>{{DETAIL_3}}</small></div>
                <div class="funnel-step" style="background:#95A5A6; width:50%; margin:0 auto;">{{RESULT}} <small>{{DETAIL_R}}</small></div>
            </div>
            <p style="font-size:clamp(0.65rem, 1vw, 0.82rem); color:#C0392B; margin-top:clamp(8px, 1vh, 12px); font-weight:600;">❌ {{NEGATIVE_CONSEQUENCE}}</p>
        </div>
        <div>
            <h3 style="font-size:clamp(0.85rem, 1.4vw, 1.1rem); font-weight:700; color:var(--brand-primary); margin-bottom:clamp(10px, 1.5vh, 16px);">🟢 {{PROPOSED_LABEL}}</h3>
            <div style="display:flex; flex-direction:column; gap:clamp(4px, 0.8vh, 8px);">
                <div class="funnel-step" style="background:var(--brand-primary); width:100%;">{{P_STEP_1}} <small>{{P_DETAIL_1}}</small></div>
                <div class="funnel-step" style="background:var(--brand-primary-dark); width:90%; margin:0 auto;">{{P_STEP_2}} <small>{{P_DETAIL_2}}</small></div>
                <div class="funnel-step" style="background:var(--brand-primary); width:80%; margin:0 auto; opacity:0.8;">{{P_STEP_3}} <small>{{P_DETAIL_3}}</small></div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; width:85%; margin:0 auto;">
                    <div class="funnel-step" style="background:var(--brand-accent); font-size:clamp(0.6rem, 0.9vw, 0.75rem);">{{P_RESULT_A}} <small>{{P_DETAIL_A}}</small></div>
                    <div class="funnel-step" style="background:var(--brand-secondary); font-size:clamp(0.6rem, 0.9vw, 0.75rem);">{{P_RESULT_B}} <small>{{P_DETAIL_B}}</small></div>
                </div>
            </div>
            <p style="font-size:clamp(0.65rem, 1vw, 0.82rem); color:var(--brand-primary); margin-top:clamp(8px, 1vh, 12px); font-weight:600;">✅ {{POSITIVE_BENEFIT}}</p>
        </div>
    </div>
</div>
```

## Slide Type 6: OVERVIEW / CARD GRID

Grid de cards con iconos para segmentos, productos o categorías. Max 8 cards.

```html
<div class="slide" data-slide="N">
    <div class="slide-header">
        <span class="section-label">{{SECTION}}</span>
        <img src="{{LOGO}}" class="brand-logo" alt="{{CLIENT_SHORT}}">
    </div>
    <h2 class="slide-title animate-in">{{TITLE}}</h2>
    <p class="slide-subtitle animate-in delay-1">{{SUBTITLE}}</p>

    <div class="grid-4 animate-in delay-2">
        <!-- Repetir por cada item (max 8, split si más) -->
        <div class="card" style="border-top:4px solid var(--brand-primary); text-align:center; padding:clamp(10px, 1.5vw, 16px);">
            <div style="font-size:clamp(1.2rem, 2.5vw, 1.8rem); margin-bottom:6px;">{{EMOJI}}</div>
            <h4 style="font-weight:700; margin-bottom:4px; color:var(--brand-secondary); font-size:clamp(0.7rem, 1.1vw, 0.9rem);">{{NAME}}</h4>
            <p style="font-size:clamp(0.6rem, 0.9vw, 0.78rem); color:var(--brand-text-light); margin-bottom:8px;">{{DESC}}</p>
            <div class="competitor-pill">{{EXTRA}}</div>
        </div>
        <!-- ... más cards ... -->
    </div>
</div>
```

## Slide Type 7: TIMELINE / ROADMAP

Timeline vertical con fases conectadas.

```html
<div class="slide" data-slide="N">
    <div class="slide-header">
        <span class="section-label">Roadmap</span>
        <img src="{{LOGO}}" class="brand-logo" alt="{{CLIENT_SHORT}}">
    </div>
    <h2 class="slide-title animate-in">{{TITLE}}</h2>
    <p class="slide-subtitle animate-in delay-1">{{SUBTITLE}}</p>

    <div class="animate-in delay-2">
        <div class="timeline-item">
            <div style="display:flex; gap:clamp(8px, 1.5vw, 12px); align-items:center; margin-bottom:4px;">
                <span class="tag tag-primary">{{PHASE_1_DATES}}</span>
                <strong style="font-size:clamp(0.75rem, 1.2vw, 0.95rem);">{{PHASE_1_NAME}}</strong>
            </div>
            <p style="font-size:clamp(0.7rem, 1.1vw, 0.85rem); color:var(--brand-text-light); line-height:1.5;">{{PHASE_1_DESC}}</p>
        </div>
        <!-- Repetir por fase -->
    </div>
</div>
```

## Slide Type 8: NEXT STEPS / ACTION ITEMS

Grid de cards con acciones priorizadas + card de "ya listo".

```html
<div class="slide" data-slide="N">
    <div class="slide-header">
        <span class="section-label warning-label">Próximos Pasos</span>
        <img src="{{LOGO}}" class="brand-logo" alt="{{CLIENT_SHORT}}">
    </div>
    <h2 class="slide-title animate-in">{{TITLE}}</h2>
    <p class="slide-subtitle animate-in delay-1">{{SUBTITLE}}</p>

    <div class="grid-2 animate-in delay-2" style="margin-bottom:clamp(10px, 1.5vh, 16px);">
        <div class="card card-accent">
            <h4 style="font-weight:700; color:var(--brand-secondary); margin-bottom:clamp(8px, 1vh, 12px); font-size:clamp(0.75rem, 1.2vw, 0.95rem);">{{CAT_A_ICON}} {{CAT_A_NAME}}</h4>
            <ul class="bullet-list">
                {{CAT_A_ITEMS}}
            </ul>
        </div>
        <div class="card card-accent-accent">
            <h4 style="font-weight:700; color:var(--brand-secondary); margin-bottom:clamp(8px, 1vh, 12px); font-size:clamp(0.75rem, 1.2vw, 0.95rem);">{{CAT_B_ICON}} {{CAT_B_NAME}}</h4>
            <ul class="bullet-list">
                {{CAT_B_ITEMS}}
            </ul>
        </div>
    </div>

    <div class="grid-2 animate-in delay-3">
        <div class="card card-accent-secondary">
            <h4 style="font-weight:700; color:var(--brand-secondary); margin-bottom:clamp(8px, 1vh, 12px); font-size:clamp(0.75rem, 1.2vw, 0.95rem);">{{CAT_C_ICON}} {{CAT_C_NAME}}</h4>
            <ul class="bullet-list">
                {{CAT_C_ITEMS}}
            </ul>
        </div>
        <div class="card" style="border: 2px solid var(--brand-primary); background:var(--brand-primary-light);">
            <h4 style="font-weight:700; color:var(--brand-primary-dark); margin-bottom:clamp(8px, 1vh, 12px); font-size:clamp(0.75rem, 1.2vw, 0.95rem);">✅ Lo que ya está listo</h4>
            <ul class="bullet-list">
                {{DONE_ITEMS}}
            </ul>
        </div>
    </div>
</div>
```

## Slide Type 9: CLOSING / CTA

Centrado, logo, stats resumidos, CTA grande.

```html
<div class="slide" data-slide="N">
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center;">
        <div class="animate-in">
            <img src="{{LOGO}}" class="brand-logo" alt="{{CLIENT_NAME}}" style="height:clamp(40px, 6vw, 60px); margin-bottom:clamp(16px, 3vh, 28px);">
        </div>

        <h2 class="slide-title animate-in delay-1" style="font-size:clamp(1.4rem, 4vw, 2.6rem); margin-bottom:clamp(8px, 1.5vh, 16px);">
            {{CLOSING_MESSAGE}} <span style="color:var(--brand-primary);">{{CLOSING_EMPHASIS}}</span>
        </h2>
        <p class="slide-subtitle animate-in delay-2" style="max-width:600px; margin:0 auto clamp(16px, 3vh, 28px);">
            {{CLOSING_SUBTITLE}}
        </p>

        <div class="animate-in delay-3" style="display:flex; gap:clamp(12px, 2.5vw, 24px); margin-bottom:clamp(20px, 4vh, 40px);">
            <div class="card" style="padding:clamp(12px, 2vw, 20px) clamp(16px, 3vw, 28px); text-align:center;">
                <div class="stat-number" style="color:var(--brand-primary); font-size:clamp(1.2rem, 3vw, 2.2rem);">{{STAT_1}}</div>
                <div class="stat-label">{{STAT_1_LABEL}}</div>
            </div>
            <div class="card" style="padding:clamp(12px, 2vw, 20px) clamp(16px, 3vw, 28px); text-align:center;">
                <div class="stat-number" style="color:var(--brand-accent); font-size:clamp(1.2rem, 3vw, 2.2rem);">{{STAT_2}}</div>
                <div class="stat-label">{{STAT_2_LABEL}}</div>
            </div>
            <div class="card" style="padding:clamp(12px, 2vw, 20px) clamp(16px, 3vw, 28px); text-align:center;">
                <div class="stat-number" style="color:var(--brand-secondary); font-size:clamp(1.2rem, 3vw, 2.2rem);">{{STAT_3}}</div>
                <div class="stat-label">{{STAT_3_LABEL}}</div>
            </div>
        </div>

        <div class="animate-in delay-4">
            <div style="display:inline-block; padding:clamp(10px, 2vh, 16px) clamp(28px, 5vw, 48px); background:var(--gradient-primary); color:white; border-radius:40px; font-weight:700; font-size:clamp(0.85rem, 1.5vw, 1.15rem); box-shadow:var(--brand-shadow-lg);">
                {{CTA_TEXT}}
            </div>
        </div>

        <div class="animate-in delay-5" style="margin-top:clamp(16px, 3vh, 32px);">
            <span class="tag tag-primary">Growth4U × {{CLIENT_NAME}}</span>
            <span class="tag tag-secondary" style="margin-left:8px;">{{DATE}}</span>
        </div>
    </div>
</div>
```

---

## Navigation Boilerplate

**OBLIGATORIO al final de toda presentación**, después del último `</div>` de slide:

```html
<!-- Footer -->
<div class="slide-footer">
    <span>{{CLIENT_NAME}} × Growth4U — {{PRESENTATION_TITLE}}</span>
    <span class="page-num" id="pageNum">1 / N</span>
</div>

<!-- Progress bar -->
<div class="progress-bar" id="progressBar" style="width:0%"></div>

<!-- Navigation -->
<button class="nav-btn nav-prev" id="prevBtn" onclick="navigate(-1)">←</button>
<button class="nav-btn nav-next" id="nextBtn" onclick="navigate(1)">→</button>
<button class="fs-btn" onclick="toggleFullscreen()" title="Pantalla completa (F)">⛶</button>

<script>
    let current = 0;
    const slides = document.querySelectorAll('.slide');
    const total = slides.length;

    function showSlide(n) {
        current = Math.max(0, Math.min(n, total - 1));
        slides.forEach(s => s.classList.remove('active'));
        slides[current].classList.add('active');
        document.getElementById('pageNum').textContent = `${current + 1} / ${total}`;
        document.getElementById('progressBar').style.width = `${((current + 1) / total) * 100}%`;
        document.getElementById('prevBtn').style.opacity = current === 0 ? '0.3' : '1';
        document.getElementById('nextBtn').style.opacity = current === total - 1 ? '0.3' : '1';
    }

    function navigate(dir) { showSlide(current + dir); }

    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); navigate(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); navigate(-1); }
        if (e.key === 'f' || e.key === 'F') toggleFullscreen();
        if (e.key === 'Home') showSlide(0);
        if (e.key === 'End') showSlide(total - 1);
    });

    let touchStartX = 0;
    document.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; });
    document.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 60) navigate(dx < 0 ? 1 : -1);
    });

    function toggleFullscreen() {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
    }

    showSlide(0);
</script>
```

---

## Slide Type 10: COMPETITOR LANDSCAPE — Cards + Score Badges + Quote Bar

3 cards lado a lado (2 competidores + cliente) con Trustpilot scores, bullets, vulnerabilidades, y quote bar.

```html
<div class="slide" data-slide="N">
    <div class="slide-header">
        <span class="section-label">Competencia</span>
        <img src="{{LOGO}}" class="brand-logo" alt="{{CLIENT_SHORT}}">
    </div>
    <h2 class="slide-title animate-in">{{TITLE}}</h2>
    <p class="slide-subtitle animate-in delay-1">{{SUBTITLE}}</p>

    <div class="grid-3 animate-in delay-2" style="margin-bottom:clamp(10px, 1.5vh, 16px);">
        <!-- Competitor 1 card (yellow = 3-4★) -->
        <div class="card" style="border-top:4px solid #fbbf24;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h4 style="font-weight:800; color:var(--brand-secondary); font-size:clamp(0.8rem,1.2vw,1rem);">{{COMP1_NAME}}</h4>
                <span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:12px; font-size:var(--small-size); font-weight:700;">{{COMP1_SCORE}} ⭐</span>
            </div>
            <ul class="bullet-list" style="font-size:var(--small-size);">
                <li>{{COMP1_BULLET_1}}</li>
                <li>{{COMP1_BULLET_2}}</li>
                <li>{{COMP1_BULLET_3}}</li>
                <li><strong>PERO:</strong> {{COMP1_VULNERABILITY}}</li>
            </ul>
            <div style="background:var(--brand-primary-light); padding:6px 10px; border-radius:8px; margin-top:10px; font-size:clamp(0.55rem,0.85vw,0.7rem); color:var(--brand-primary-dark);">
                → {{COMP1_INSIGHT}}
            </div>
        </div>

        <!-- Competitor 2 card (red = <3★) -->
        <div class="card" style="border-top:4px solid #ef4444;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h4 style="font-weight:800; color:var(--brand-secondary); font-size:clamp(0.8rem,1.2vw,1rem);">{{COMP2_NAME}}</h4>
                <span style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:12px; font-size:var(--small-size); font-weight:700;">{{COMP2_SCORE}} ⭐</span>
            </div>
            <ul class="bullet-list" style="font-size:var(--small-size);">
                <li>{{COMP2_BULLET_1}}</li>
                <li>{{COMP2_BULLET_2}}</li>
                <li>{{COMP2_BULLET_3}}</li>
                <li><strong>PERO:</strong> {{COMP2_VULNERABILITY}}</li>
            </ul>
            <div style="background:#fef3c7; padding:6px 10px; border-radius:8px; margin-top:10px; font-size:clamp(0.55rem,0.85vw,0.7rem); color:#92400e;">
                → {{COMP2_INSIGHT}}
            </div>
        </div>

        <!-- Client card (green = >4★) -->
        <div class="card" style="border-top:4px solid var(--brand-primary);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h4 style="font-weight:800; color:var(--brand-secondary); font-size:clamp(0.8rem,1.2vw,1rem);">{{CLIENT_NAME}}</h4>
                <span style="background:var(--brand-primary-light); color:var(--brand-primary-dark); padding:2px 8px; border-radius:12px; font-size:var(--small-size); font-weight:700;">{{CLIENT_SCORE}} ⭐</span>
            </div>
            <ul class="bullet-list" style="font-size:var(--small-size);">
                <li>{{CLIENT_BULLET_1}}</li>
                <li>{{CLIENT_BULLET_2}}</li>
                <li>{{CLIENT_BULLET_3}}</li>
                <li><strong>PERO:</strong> {{CLIENT_VULNERABILITY}}</li>
            </ul>
            <div style="background:#fee2e2; padding:6px 10px; border-radius:8px; margin-top:10px; font-size:clamp(0.55rem,0.85vw,0.7rem); color:#991b1b;">
                → {{CLIENT_INSIGHT}}
            </div>
        </div>
    </div>

    <!-- Quote bar -->
    <div class="animate-in delay-3" style="background:var(--brand-secondary); padding:clamp(10px, 1.5vh, 16px) clamp(14px, 2.5vw, 20px); border-radius:var(--brand-radius-sm); color:white;">
        <p style="font-style:italic; font-size:clamp(0.75rem, 1.2vw, 0.95rem); line-height:1.5; margin:0;">
            "{{QUOTE}}" — {{QUOTE_CONTEXT}}
        </p>
    </div>
</div>
```

**Score badge color mapping:**
- Green (>4★): `background:var(--brand-primary-light); color:var(--brand-primary-dark); border-top:var(--brand-primary)`
- Yellow (3-4★): `background:#fef3c7; color:#92400e; border-top:#fbbf24`
- Red (<3★): `background:#fee2e2; color:#991b1b; border-top:#ef4444`

**Campaign slide CSS** (add to `<style>` block):

```css
/* === CAMPAIGN SLIDES === */
.campaign-grid {
    display: flex;
    gap: clamp(12px, 2vw, 20px);
    align-items: flex-start;
    margin-top: clamp(8px, 1.5vh, 16px);
}
@media (max-width: 900px) { .campaign-grid { flex-direction: column; } }
.campaign-col { flex: 1; min-width: 0; }
.campaign-col-label {
    font-size: clamp(0.55rem, 0.8vw, 0.7rem);
    font-weight: 700; color: var(--brand-text-lighter);
    text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;
}

/* Google SERP */
.google-serp { background: white; border-radius: 12px; padding: clamp(10px, 1.5vw, 16px); box-shadow: var(--brand-shadow); }
.google-serp-bar { display: flex; align-items: center; gap: clamp(8px, 1.5vw, 14px); margin-bottom: clamp(8px, 1.2vh, 14px); }
.g-logo { font-size: clamp(0.8rem, 1.3vw, 1.1rem); font-weight: 500; }
.g-logo span:nth-child(1) { color: #4285F4; } .g-logo span:nth-child(2) { color: #EA4335; }
.g-logo span:nth-child(3) { color: #FBBC05; } .g-logo span:nth-child(4) { color: #4285F4; }
.g-logo span:nth-child(5) { color: #34A853; } .g-logo span:nth-child(6) { color: #EA4335; }
.google-serp-searchbox { flex: 1; padding: clamp(6px, 1vh, 10px) clamp(10px, 1.5vw, 14px); background: var(--brand-bg); border-radius: 999px; font-size: clamp(0.65rem, 1vw, 0.82rem); border: 1px solid var(--brand-border); }
.google-ad-sponsored { font-size: clamp(0.5rem, 0.75vw, 0.65rem); font-weight: 700; }
.google-ad-url { font-size: clamp(0.55rem, 0.85vw, 0.72rem); margin-bottom: 2px; }
.google-ad-title { font-size: clamp(0.8rem, 1.3vw, 1.05rem); color: #1a0dab; margin-bottom: 4px; }
.google-ad-desc { font-size: clamp(0.6rem, 0.95vw, 0.78rem); color: #4d5156; line-height: 1.4; }

/* IG Stories */
.stories-row { display: flex; gap: clamp(6px, 1vw, 8px); }
.story-mock { width: clamp(90px, 12vw, 130px); height: clamp(160px, 25vh, 230px); border-radius: 14px; color: white; display: flex; flex-direction: column; align-items: center; padding: clamp(8px, 1.2vw, 12px); position: relative; overflow: hidden; }
.story-progress { position: absolute; top: 8px; left: 8px; right: 8px; height: 2px; background: rgba(255,255,255,0.3); border-radius: 2px; }
.story-progress::after { content: ''; position: absolute; left: 0; top: 0; width: 60%; height: 100%; background: white; border-radius: 2px; }
.story-emoji { font-size: clamp(1.5rem, 3vw, 2.5rem); margin-top: auto; z-index: 2; }
.story-headline { font-size: clamp(0.6rem, 1vw, 0.8rem); font-weight: 900; text-align: center; z-index: 2; margin-top: 4px; }
.story-sub { font-size: clamp(0.45rem, 0.7vw, 0.55rem); text-align: center; opacity: 0.8; z-index: 2; }
.story-cta { background: white; color: var(--brand-secondary); font-size: clamp(0.45rem, 0.7vw, 0.55rem); font-weight: 700; padding: clamp(3px, 0.4vh, 5px) clamp(6px, 1vw, 12px); border-radius: 6px; margin-top: auto; z-index: 2; }

/* Keywords */
.kw-table { display: flex; flex-direction: column; gap: clamp(4px, 0.6vh, 6px); font-size: clamp(0.65rem, 1vw, 0.82rem); }
.kw-row { display: flex; justify-content: space-between; padding: 2px 0; }
.kw-demand { font-weight: 700; }
.kw-high { color: var(--brand-primary); }
.kw-medium { color: var(--brand-accent); }
```
