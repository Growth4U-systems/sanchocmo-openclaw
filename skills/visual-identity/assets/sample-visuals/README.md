# Sample Visuals — Testing Layer 3 Aesthetic Iteration

## Purpose

This folder stores sample images generated during Layer 3 (Aesthetic Guidelines) iteration process. These samples help validate the aesthetic before finalizing visual-style.md.

**NOT for child skill training** — those samples go in the generated child skill's assets folder.

## Usage During Meta-Skill Run

### Layer 3 Iteration Process:

1. **Iteration 1-3**: Exploring style directions
   - Generate 3-5 samples per direction
   - User selects preferred direction
   - Save selected samples here

2. **Iteration 4-7**: Refining chosen direction
   - Generate variations with adjustments
   - User provides feedback: "more color", "thicker lines", etc.
   - Save progression here

3. **Iteration 8-10**: Fine-tuning
   - Generate final candidates
   - User confirms: "This is it"
   - Save final validated samples here

4. **Consistency Test**: Generate 3 images with different subjects
   - All should look cohesive
   - Save final test samples here

### File Naming Convention

```
iteration_[N]_[direction]_[subject].png
```

**Examples**:
- `iteration_01_clean_line_art_desk.png`
- `iteration_01_comic_bold_hero.png`
- `iteration_05_comic_bold_refined_desk.png` (after adjustments)
- `iteration_10_final_hero.png` (validated final)
- `consistency_test_object1.png`
- `consistency_test_scene.png`

## Sample Set Examples

### SanchoCMO Iteration Samples (Example)

**Iteration 1** (exploring):
- `iteration_01_minimal_flat_sancho.png` (Option A: minimal)
- `iteration_01_comic_bold_sancho.png` (Option B: comic book)
- `iteration_01_painterly_sancho.png` (Option C: painterly)

**Iteration 5** (refining comic book direction):
- `iteration_05_comic_thicker_lines_sancho.png` (trying 5px vs 4px)
- `iteration_05_comic_more_halftone_sancho.png` (more texture)
- `iteration_05_comic_vibrant_colors_sancho.png` (color test)

**Iteration 10** (final):
- `iteration_10_final_sancho_hero.png` ← VALIDATED
- `iteration_10_final_speech_bubble.png` ← VALIDATED
- `iteration_10_final_vintage_object.png` ← VALIDATED

**Consistency test**:
- `consistency_character.png` (Sancho)
- `consistency_object.png` (rotary phone)
- `consistency_scene.png` (urban street)

All 3 should feel like same visual world → aesthetic is LOCKED.

## After Layer 3 Complete

Once aesthetic is validated:
1. Final samples are documented in visual-style.md (references)
2. Best 3-5 samples can be copied to generated child skill's assets/sample-visuals/ folder
3. This folder can be archived or deleted (served its purpose)

## Disk Space

Expect 20-50 images (~500KB-1MB each) during full iteration process.
Total: ~10-50 MB

After validation, can delete non-final samples to save space.

## Integration with Child Skills

When generating `[brand]-visual-generator` child skill:
- Option to copy best samples to child skill's assets folder
- Child skill can reference these as "style examples" for model training (if API supports)
- Not required but helpful for consistency
