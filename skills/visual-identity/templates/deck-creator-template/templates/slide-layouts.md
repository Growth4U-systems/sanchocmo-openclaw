# {{brand_name}} Slide Layouts

> Template specifications for presentation slides

## Title Slide

```
┌─────────────────────────────────────┐
│ {{logo}}                  [Top-right]│
│                                      │
│         {{presentation_title}}       │
│                                      │
│            {{subtitle}}              │
│                                      │
│                              [Bottom]│
│ {{presenter_name}}  {{date}}        │
└─────────────────────────────────────┘

Background: {{primary_color}}
Title: {{font_heading}}, {{title_size}}, white, bold
Subtitle: {{font_body}}, {{subtitle_size}}, white/80%
Presenter: {{font_body}}, 14pt, white/60%
```

## Content Slide (Standard)

```
┌─────────────────────────────────────┐
│ ▌{{slide_title}}                    │
│ ▌                                   │
│   • Bullet point 1                  │
│   • Bullet point 2                  │
│   • Bullet point 3                  │
│                                      │
│                                      │
│                           [Logo]    │
└─────────────────────────────────────┘

Background: White
Accent bar: {{accent_color}}, 8px wide, left edge
Title: {{font_heading}}, {{heading_size}}, {{primary_color}}
Body: {{font_body}}, {{body_size}}, gray-800
Bullets: {{accent_color}} bullet points
Logo: Bottom-right, small
```

## Content Slide (Image + Text)

```
┌─────────────────────────────────────┐
│ {{slide_title}}                     │
│                                      │
│ ┌──────────┐  • Point 1             │
│ │          │  • Point 2             │
│ │  Image   │  • Point 3             │
│ │          │                         │
│ └──────────┘                        │
│                           [Logo]    │
└─────────────────────────────────────┘

Left 50%: Image (from {{brand_slug}}-visual-generator)
Right 50%: Bullet points
Styling: Same as standard content slide
```

## Closing / CTA Slide

```
┌─────────────────────────────────────┐
│                                      │
│                                      │
│         {{call_to_action}}          │
│                                      │
│         {{contact_info}}            │
│                                      │
│            {{logo_centered}}         │
│                                      │
└─────────────────────────────────────┘

Background: {{secondary_color}}
CTA: {{font_heading}}, {{cta_size}}, white, bold
Contact: {{font_body}}, 18pt, white
Logo: Centered, medium size
```

## Brand Colors

- Primary: {{primary_color}}
- Secondary: {{secondary_color}}
- Accent: {{accent_color}}
- Text: {{text_color}}

## Typography Sizes

- Title (cover): {{title_size}}
- Heading: {{heading_size}}
- Body: {{body_size}}
- Caption: {{caption_size}}
