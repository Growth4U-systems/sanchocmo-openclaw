# Facebook Ads Library Analysis Patterns

## What to Extract from Each Ad

### 1. Hook Patterns
- **First 3 words** - The attention grabber
- **Question hooks** - "Are you...?", "What if...?", "Why do..."
- **Number hooks** - "3 ways to...", "10x your..."
- **Pain hooks** - "Tired of...?", "Struggling with...?"
- **Benefit hooks** - "Get X without Y"

### 2. Creative Themes
- **Visual style** - Minimal, bold, lifestyle, product-focused
- **Color palette** - Dominant colors used
- **Image type** - Photo, illustration, screenshot, video thumbnail
- **Text overlay** - How much text, positioning

### 3. Copy Structure
- **Length** - Short (< 100 chars), Medium (100-300), Long (300+)
- **Tone** - Professional, casual, urgent, educational
- **CTA placement** - Beginning, middle, end
- **Social proof** - Testimonials, numbers, logos

### 4. Call-to-Action
- **CTA type** - Learn More, Sign Up, Download, Book Demo
- **Urgency** - Limited time, scarcity, FOMO
- **Friction** - High (credit card), Medium (email), Low (browse)

### 5. Targeting Signals
- **Run dates** - When did they start/stop
- **Duration** - How long they've been running
- **Platforms** - FB, IG, Messenger, Audience Network
- **Variations** - A/B test variants

## Analysis Workflow

1. **Search Facebook Ads Library** for competitor name
2. **Filter active ads** (currently running = working)
3. **For each ad**, extract all patterns above
4. **Group by theme** - What messaging clusters exist?
5. **Identify winners** - Long-running ads = likely winning
6. **Synthesize ideas** - What can we adapt for our brand?

## Output Format

```json
{
  "competitor": "Competitor Name",
  "ads_analyzed": 12,
  "date_analyzed": "2026-02-20",
  "insights": [
    {
      "theme": "Pain-to-solution narrative",
      "hook_pattern": "Struggling with X? Y makes it easy",
      "creative_style": "Screenshot + text overlay",
      "cta": "Start Free Trial",
      "run_duration_days": 45,
      "idea_for_us": "Adapt pain hook but focus on our unique angle"
    }
  ]
}
```

## Red Flags (Do NOT Copy)

- ❌ Direct copy of competitor hook - Adapt, don't plagiarize
- ❌ Competitor's unique differentiator - Find our own
- ❌ Brand-specific language - Genericize first
- ⚠️ Regulatory claims - Verify we can legally make similar claims
