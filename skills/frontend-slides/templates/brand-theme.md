# Brand Theme Resolution

## How to resolve brand colors for any client

### Step 1: Check for Visual Identity
Read `brand/{slug}/visual-identity/current.md` and extract:
- Primary color (hero/accent)
- Secondary color
- Dark color (backgrounds)
- Light color (cards/surfaces)
- Display font family
- Body font family
- Logo (path or base64)

### Step 2: Map to CSS Variables
```css
:root {
    /* Brand Colors — resolved from visual-identity */
    --brand-primary: /* primary color */;
    --brand-accent: /* accent/secondary */;
    --brand-dark: /* dark bg, default #1a1a2e */;
    --brand-light: /* light surface, default #f8f6f1 */;
    --brand-text-on-dark: #ffffff;
    --brand-text-on-light: #1a1a1a;
    
    /* Typography */
    --brand-font-display: /* display font, default 'Manrope' */;
    --brand-font-body: /* body font, default 'DM Sans' */;
    
    /* Derived */
    --brand-primary-10: /* primary at 10% opacity */;
    --brand-primary-20: /* primary at 20% opacity */;
    --brand-accent-light: /* accent lightened for badges */;
    
    /* Structural (don't change per brand) */
    --rating-green: #22c55e;
    --rating-yellow: #eab308;
    --rating-red: #ef4444;
    --rating-gray: #6b7280;
}
```

### Step 3: Fallback Defaults (No Visual Identity)
```css
:root {
    --brand-primary: #4361ee;
    --brand-accent: #ff5722;
    --brand-dark: #1a1a2e;
    --brand-light: #f8f6f1;
    --brand-font-display: 'Manrope', sans-serif;
    --brand-font-body: 'DM Sans', sans-serif;
}
```

### Font Loading
Always use Google Fonts or Fontshare. Generate the appropriate `<link>` tag:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family={DisplayFont}:wght@400;700;800&family={BodyFont}:wght@300;400;500&display=swap" rel="stylesheet">
```
