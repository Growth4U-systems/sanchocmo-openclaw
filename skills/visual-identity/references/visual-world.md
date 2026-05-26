# Visual World Definition (Layer 1 Template)

> Defines WHAT objects, scenes, and characters exist in the brand's visual universe — NOT how they look.

## What is a Visual World?

A Visual World is the **inventory of visual elements** that can appear in the brand's content. It's the foundation for all visual decisions because it defines the boundaries of what belongs and what doesn't.

**Key principle**: Visual World defines WHAT (objects, scenes, characters), not HOW they look. The aesthetic (HOW) is defined in Layer 3.

## Why It Matters

Without a defined Visual World:
- ❌ Every visual is ad-hoc, no consistency
- ❌ AI generates random objects that feel off-brand
- ❌ No system to ensure visuals feel "pulled from the same world"

With a defined Visual World:
- ✅ All visuals feel cohesive (same universe)
- ✅ AI selects objects FROM the inventory automatically
- ✅ Prevents out-of-brand elements from appearing
- ✅ Enables systematic visual storytelling

## Visual World Inventory Structure

### Core Objects

Everyday items that appear frequently in visuals. These are the "props" of your visual world.

**Questions to define**:
- What objects would a character in your brand's world interact with daily?
- What tools, devices, or items represent your brand's domain?
- What objects carry symbolic meaning for your audience?

### Scenes/Settings

Locations or environments where brand stories happen. The "stages" for your visuals.

**Questions to define**:
- Where does your brand's story take place?
- What environments feel authentic to your brand?
- Indoor/outdoor? Urban/natural? Modern/vintage?

### Characters (if applicable)

People, mascots, or avatars that can appear. Not all brands need characters.

**Questions to define**:
- Does your brand have a mascot or character?
- Do visuals show people? If yes, what type? (professionals, everyday people, specific personas)
- Diversity requirements?

### Exclusions

What should NEVER appear. As important as what CAN appear.

**Questions to define**:
- What objects or imagery feel off-brand?
- Competitor visual clichés to avoid?
- Industry stereotypes to reject?

---

## Example 1: SanchoCMO (1970s Comic Book World)

### Core Objects
- **Communication**: Speech bubbles, thought bubbles, action word bursts (POW, BOOM)
- **Vintage Tech**: Rotary phone, typewriter, vintage camera, cassette recorder
- **Tools of Trade**: Quill pen, ink bottle, ancient scrolls, strategy maps
- **Symbolic**: Shield (protection), sword (cutting through problems), compass (direction)
- **Everyday**: Coffee mug, desk, vintage chair, old books

### Scenes/Settings
- **Urban**: 1970s-style city streets, brick buildings, dramatic skies
- **Indoor**: Hero headquarters (Sancho's office), library with ancient books
- **Dramatic**: Mountain peaks (metaphor for challenges), valleys (decisions)
- **Workspace**: Desk with strategic tools, planning board with papers pinned

### Characters
- **Main**: Sancho Panza (wise strategist in medieval clothing)
- **Supporting**: Don Quijote (idealistic partner), clients as medieval knights/merchants
- **Style**: Bold outlines, expressive faces, dynamic poses (Bronze Age comic aesthetic)

### Exclusions
- ❌ Modern tech (smartphones, laptops, LED screens)
- ❌ Realistic photography
- ❌ Corporate stock imagery (people in suits shaking hands)
- ❌ Minimalist flat design
- ❌ Soft gradients or watercolor effects

**Rationale**: SanchoCMO is a 1970s comic book world — modern elements break immersion.

---

## Example 2: Builder Methods (Brian Castle)

### Core Objects
- **Workspace**: Home studio desk, comfortable chair, desk lamp
- **Tools**: Laptop (MacBook aesthetic), notebook, pen, headphones
- **Comfort**: Coffee mug, water bottle, plant (desk plant, bookshelf plant)
- **Reference**: Books, sticky notes, whiteboard, planning materials
- **Personal**: Personal touches that make workspace feel lived-in

### Scenes/Settings
- **Primary**: Professional builder's home workspace (clean, organized, inspiring)
- **Mood**: Morning focus session, afternoon deep work, late-night building
- **Lighting**: Natural light from window, desk lamp for focused work

### Characters
- None (focuses on workspace and objects, not people)

### Exclusions
- ❌ Busy corporate offices
- ❌ Group meetings or conference rooms
- ❌ Chaotic or messy environments
- ❌ Stock photography of people in suits
- ❌ Sterile, clinical spaces

**Rationale**: Builder Methods is about the solo professional builder's life — intimate, focused, personal workspace.

---

## How AI Uses Visual World

When generating an image:

1. **Load Visual World inventory**
2. **Analyze content topic** (from user request)
3. **Select objects** from Core Objects that relate to topic
4. **Choose scene** from Scenes/Settings appropriate for content type
5. **Check exclusions** — verify selected elements aren't on exclusion list
6. **Pass to image generation** with objects + scene

**Example**:
- User request: "Hero image for blog post about productivity systems"
- Topic analysis: Productivity, systems, organization
- Objects selected: Notebook (planning), desk (workspace), coffee mug (morning routine)
- Scene selected: Morning focus session at home workspace
- Check: Not excluded ✓
- Generate: "Morning focus session, desk with notebook and coffee mug, [aesthetic from Layer 3]"

---

## Usage in Child Skills

The generated `[brand]-visual-generator` skill copies this file to its `references/visual-world.md` and loads it every time an image is requested.

The `[brand]-ui-system` skill may reference this for illustration components (e.g., icon library should use objects from Visual World).

---

## Iteration During Meta-Skill Run

Visual World is built iteratively:

1. **Propose initial inventory** (5-7 objects) based on brand context
2. **Show examples** from similar brands
3. **User feedback**: "Add X, remove Y, never show Z"
4. **Refine inventory**
5. **Validation test**: "For topic [X], what objects would you use?" → verify AI selects appropriately
6. **Finalize** → write this file with complete inventory

Typical: 2-3 iterations to land on final Visual World.
