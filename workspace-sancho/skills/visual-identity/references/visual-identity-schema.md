# Visual Identity — Schema Specification

> Complete field-by-field specification for visual identity data storage and child skill generation.

## Section 0: Mode Tracking

| Field | Type | Required | Source |
|-------|------|----------|--------|
| `mode_completed` | enum: `quick`, `full` | REQUIRED | Execution tracking |
| `quick_path` | enum: `url_analysis`, `materials_analysis`, `manual_questions` | REQUIRED | How Quick mode was executed |
| `full_approach` | enum: `extract`, `build`, `hybrid` | Lite | How Full mode was executed |
| `source_materials` | string[] | Lite | URLs + files analyzed |
| `child_skills_generated` | string[] | Deep | Names of generated child skills |
| `generation_timestamp` | ISO datetime | Deep | When child skills were generated |

---

## Section 1: Visual Snapshot (Quick Mode Output)

| Field | Type | Required |
|-------|------|----------|
| `three_visual_adjectives` | string[3] | REQUIRED |
| `color_palette_preliminary` | object {primary, secondary, accent with hex codes} | REQUIRED |
| `typography_style` | enum: `serif`, `sans-serif`, `display`, `mixed` | REQUIRED |
| `observed_fonts` | string[] | Lite |
| `imagery_style_type` | enum: `photography`, `illustration`, `abstract`, `mixed` | REQUIRED |
| `imagery_style_mood` | string | REQUIRED |
| `logo_notes` | string | Lite |
| `lite_visual_world` | string[] (3-5 objects) | REQUIRED |
| `overall_aesthetic` | string (1-2 sentences) | REQUIRED |
| `design_tokens_lite` | JSON object | REQUIRED |
| `confidence` | enum: `high`, `medium`, `low` | REQUIRED |
| `gaps_identified` | string[] | REQUIRED |
| `integrates_with_brand_voice` | boolean + link | Lite |

---

## Section 2: Visual Profile (Full Mode — Core)

| Field | Type | Required |
|-------|------|----------|
| `visual_summary` | string (2-3 sentences) | Deep |
| `core_aesthetic_traits` | string[] (3-4 traits) | Deep |
| `design_personality_mapping` | string (how visual expresses brand voice) | Deep |
| `visual_differentiation` | string (vs competitors) | Deep |

---

## Section 3: Layer 1 — Visual World

| Field | Type | Required |
|-------|------|----------|
| `visual_world_file` | path to `visual-world.md` | Deep |
| `core_objects` | string[] (5-10 objects) | Deep |
| `scenes_settings` | string[] (2-5 scenes) | Deep |
| `characters` | string[] or null | Deep |
| `exclusions` | string[] (what should NEVER appear) | Deep |
| `world_rationale` | string (why these elements) | Deep |

---

## Section 4: Layer 2 — Idea Mapping

| Field | Type | Required |
|-------|------|----------|
| `idea_mapping_file` | path to `idea-mapping.md` | Deep |
| `decision_tree` | object (content type → visual approach) | Deep |
| `example_mappings` | array of {topic, concept, objects, composition} | Deep |
| `content_type_patterns` | object (blog/landing/social/course/technical → approach) | Deep |

---

## Section 5: Layer 3 — Aesthetic Guidelines

| Field | Type | Required |
|-------|------|----------|
| `visual_style_file` | path to `visual-style.md` | Deep |
| `illustration_style` | string | Deep |
| `color_usage_spec` | object {palette_constraint, strategy, saturation, contrast} | Deep |
| `line_weight` | object {thickness, consistency, style} | Deep |
| `detail_level` | enum: `minimal`, `moderate`, `detailed` + notes | Deep |
| `shadows_lighting` | string | Deep |
| `texture` | string | Deep |
| `background_treatment` | string | Deep |
| `ai_base_prompt` | string (exact prompt for image generation) | Deep |
| `style_keywords` | string[] | Deep |
| `negative_prompts` | string | Deep |
| `variation_parameters` | object (how to adjust for iterations) | Deep |
| `iteration_count` | number (how many iterations to land on final) | Deep |

---

## Section 6: Logo System

| Field | Type | Required |
|-------|------|----------|
| `primary_logo` | object {usage, formats, minimum_size, clear_space} | Deep |
| `logo_variants` | array of {name, usage, file} | Deep |
| `logo_dos_donts` | array of {do, dont, reasoning} | Deep |

---

## Section 7: Color System

| Field | Type | Required |
|-------|------|----------|
| `primary_colors` | array of {hex, rgb, cmyk, pantone, semantic_usage} | Deep |
| `secondary_colors` | array | Deep |
| `accent_colors` | array | Deep |
| `neutral_palette` | array (grays, black, white with hex) | Deep |
| `semantic_colors` | object {success, warning, error, info with hex} | Deep |
| `color_usage_rules` | string | Deep |
| `wcag_compliance` | object {level: "2.2-AA", contrast_ratios: [...]} | Deep |
| `accessibility_notes` | string (color-blind safe, etc.) | Deep |

---

## Section 8: Typography System

| Field | Type | Required |
|-------|------|----------|
| `typeface_rationale` | string | Deep |
| `font_hierarchy` | object {h1-h6, body, captions with font/size/weight} | Deep |
| `font_pairing_rules` | string | Deep |
| `web_safe_fallbacks` | object {heading_stack, body_stack} | Deep |
| `typography_scale` | object {sizes, line_heights, letter_spacing} | Deep |
| `typography_dos_donts` | array | Deep |

---

## Section 9: Imagery & Graphics

| Field | Type | Required |
|-------|------|----------|
| `photography_direction` | object {subjects, mood, composition} | Deep |
| `illustration_style` | string | Deep |
| `iconography_style` | string | Deep |
| `image_treatment` | string | Deep |
| `ai_image_prompts` | object {base, keywords, negative, variations} | Deep |
| `imagery_dos_donts` | array | Deep |

---

## Section 10: Component Library

| Field | Type | Required |
|-------|------|----------|
| `buttons` | object {primary, secondary, disabled specs} | Deep |
| `cards` | object {background, border, shadow} | Deep |
| `forms` | object {input, focus, error states} | Deep |
| `navigation` | object {style specs} | Deep |
| `spacing_scale` | array (8pt grid: xs, sm, md, lg, xl) | Deep |

---

## Section 11: Accessibility Compliance

| Field | Type | Required |
|-------|------|----------|
| `wcag_level` | enum: `2.2-AA`, `2.2-AAA` | Deep |
| `wcag_version` | string: "WCAG 2.2" | Deep |
| `contrast_ratio_table` | array of {element, ratio, meets_AA, meets_AAA} | Deep |
| `focus_indicators` | string | Deep |
| `color_blind_safe_confirmed` | boolean | Deep |
| `apca_note` | string (future WCAG 3.0 transition) | Deep |

---

## Section 12: Per-ECP Visual Adaptations (Optional)

| Field | Type | Required |
|-------|------|----------|
| `ecp_visual_adaptations` | array of {ecp_name, color_shift, mood_shift, imagery_shift} | Optional |

---

## Section 13: Visual DNA Kit (Key Deliverable)

| Field | Type | Required |
|-------|------|----------|
| `visual_dna_kit_file` | path to generated kit markdown | Deep |
| `visual_personality_kit` | object (core traits, emotion, differentiation) | Deep |
| `visual_world_quick_ref` | object (objects, scenes, exclusions) | Deep |
| `idea_mapping_quick_ref` | object (content type → approach) | Deep |
| `aesthetic_summary` | object (style, colors, typography, ai_prompt) | Deep |
| `design_tokens_json` | JSON object (complete tokens) | Deep |
| `accessibility_summary` | object (WCAG, contrast, safe) | Deep |
| `visual_dos_donts` | array (5-10 pairs) | Deep |

---

## Section 14: Generated Child Skills (PRIMARY OUTPUT)

| Field | Type | Required |
|-------|------|----------|
| `ui_system_skill` | object {name, path, status, verified} | Deep |
| `visual_generator_skill` | object {name, path, status, verified} | Deep |
| `deck_creator_skill` | object {name, path, status, verified} | Optional |
| `generation_log` | array of {skill_name, template_used, customizations, timestamp} | Deep |
| `installation_verified` | boolean | Deep |
| `generation_tests_passed` | object {ui_system: bool, visual_generator: bool, deck_creator: bool} | Deep |

---

## Coverage Calculation

### Lite Threshold (Quick Mode)

```
REQUIRED: three_visual_adjectives + color_palette_preliminary +
          typography_style + imagery_style_type + imagery_style_mood +
          lite_visual_world (3-5 objects) + overall_aesthetic +
          design_tokens_lite + confidence + gaps_identified

Total minimum: 9 fields
```

### Deep Threshold (Full Mode)

```
All Lite fields +

Layer 1: visual_world_file + core_objects (5+) + scenes_settings + exclusions
Layer 2: idea_mapping_file + decision_tree + example_mappings + content_type_patterns
Layer 3: visual_style_file + all aesthetic specs (7 dimensions) + ai_base_prompt +
         style_keywords + negative_prompts + iteration_count (5+)

Full system: color_system (WCAG tested) + typography_hierarchy +
             component_library + accessibility_compliance +
             visual_dna_kit_file

GENERATED CHILD SKILLS: ui_system_skill + visual_generator_skill +
                        installation_verified + generation_tests_passed

Total minimum: 45+ fields + 2-3 generated skills installed
```

---

## Storage Tiers

**Tier 1** (always loaded when visual-identity status is checked):
- Visual Snapshot (Quick mode)
- Visual DNA Kit summary (if Full mode complete)
- Child skills generated (names + paths)

**Tier 2** (loaded when working with visual content):
- Full Visual DNA Kit
- Design Token Library complete
- Per-ECP adaptations (if any)

**Tier 3** (raw, loaded on demand):
- Source materials analyzed
- Iteration history (sample images generated during Layer 3)
- Generation logs (child skill creation process)
- visual-world.md, idea-mapping.md, visual-style.md (full files)

---

## Validation Rules

Before marking Deep complete:
- ✅ All 3 layer files exist (visual-world.md, idea-mapping.md, visual-style.md)
- ✅ Layer 3 iteration count >= 5 (aesthetic was properly explored)
- ✅ AI Base Prompt tested (generated 3 images, all consistent)
- ✅ WCAG 2.2 AA compliance confirmed (all color combinations tested)
- ✅ Visual aligns with brand voice (checked against AI Brand Kit)
- ✅ At least 2 child skills generated (ui-system + visual-generator minimum)
- ✅ Generated child skills verified loadable
- ✅ Generation test passed (child skill created sample output)

If any validation fails → Full mode incomplete, cannot generate child skills.
