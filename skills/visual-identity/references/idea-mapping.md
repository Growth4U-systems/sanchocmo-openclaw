# Idea-to-Visual Mapping (Layer 2 Template)

> System to decide WHAT to illustrate for any content type — automatic decision tree AI can execute.

## What is Idea Mapping?

Idea Mapping is the **decision system** that takes a content topic and outputs which visual concept to illustrate. It's what enables AI to automatically decide "show a blueprint" for spec-driven development content without manual instruction each time.

**Key principle**: This is NOT about HOW it looks (that's Layer 3 Aesthetic), but WHAT to show (which objects/concepts from Layer 1 Visual World).

## Why It Matters

Without Idea Mapping:
- ❌ User must specify exact visual for every piece of content
- ❌ No consistency in metaphor usage (sometimes literal, sometimes abstract)
- ❌ AI makes random choices with no pattern

With Idea Mapping:
- ✅ AI automatically decides appropriate visuals for content
- ✅ Consistent logic: same type of content → same type of visual
- ✅ User only needs to provide content topic, not visual specification
- ✅ Scales: works for 1 image or 1,000 images

---

## Decision Tree Structure

The mapping follows a 4-step decision tree:

### Step 1: Identify Core Concept

What is the content fundamentally ABOUT?

**Examples**:
- "Blog post about morning routines" → Core concept: rituals, habits, morning
- "Landing page for project management tool" → Core concept: organization, systems, planning
- "Social post about AI automation" → Core concept: technology, efficiency, future

### Step 2: Choose Visual Approach

**Literal** or **Metaphorical**?

**Literal**: Show the thing itself
- Blog about coffee → show coffee mug
- Tool for writing → show notebook/pen
- Course about coding → show laptop/code

**Metaphorical**: Show a concept/symbol
- Blog about productivity → show organized workspace (metaphor for productive mind)
- Tool for collaboration → show connected objects (metaphor for teamwork)
- Course about strategy → show chess pieces/map (metaphor for strategic thinking)

**Decision heuristic**:
- Literal when: product-focused, tutorial/how-to, concrete topic
- Metaphorical when: concept-focused, thought leadership, abstract topic

### Step 3: Select Objects from Visual World

Load Layer 1 Visual World inventory. Choose 1-3 objects that:
- Relate to core concept
- Are available in Visual World inventory
- NOT on exclusions list

**Example** (Builder Methods):
- Core concept: "spec-driven development"
- Visual approach: Metaphorical (planning before building)
- Objects from inventory: Notebook (planning), blueprint, architectural drawing
- Selected: Blueprint + notebook

### Step 4: Determine Composition

How should objects be arranged?

**Options**:
- **Single object**: Simple, focused (good for social media)
- **Scene**: Multiple objects in environment (good for blog hero images)
- **Sequence**: Progression of objects (good for process/journey content)

**Example compositions**:
- Single: "Coffee mug on desk, morning light"
- Scene: "Desk with notebook open, pen, coffee, plant in background"
- Sequence: "Three stages: empty notebook → notes being written → complete plan"

---

## Content Type → Visual Concept Mappings

### Blog Post

**Approach**: Single hero image (metaphorical or literal)
**Composition**: Simple, impactful
**Mood**: Evocative, supports article tone

**Example mappings**:
- Topic: "How to write better prompts" → Visual: Chat interface with well-structured text
- Topic: "Morning productivity rituals" → Visual: Desk with coffee, notebook, morning light
- Topic: "Building in public" → Visual: Workshop with open door, tools visible

### Landing Page

**Approach**: Multiple supporting visuals (progression narrative)
**Composition**: Varies by section (hero, features, benefits, CTA)
**Mood**: Journey or transformation

**Example mappings**:
- Hero section: Bold, aspirational visual (desired outcome)
- Features section: 3-5 icons or simple illustrations (one per feature)
- Social proof section: Testimonial cards or trust symbols
- CTA section: Action-oriented visual (next step)

### Social Media

**Approach**: Bold, immediate visual (high recognition)
**Composition**: Single object or simple scene
**Mood**: Scroll-stopping, instantly communicates idea

**Example mappings**:
- LinkedIn thought leadership → Desk with strategic planning tools
- Twitter quick tip → Single object representing tip (e.g., keyboard shortcut → keyboard)
- Instagram inspiration → Aesthetically pleasing workspace

### Course/Workshop

**Approach**: Journey or transformation imagery
**Composition**: Before/after or step-by-step sequence
**Mood**: Educational, progressive

**Example mappings**:
- Course about building skills → Progression: beginner tools → advanced workspace
- Workshop about design → Evolution: sketch → wireframe → polished design

### Technical Content

**Approach**: Simplified diagrams or blueprint aesthetic
**Composition**: Clean, organized, focused on clarity
**Mood**: Professional, instructive

**Example mappings**:
- API documentation → Flowchart or connection diagram (simplified)
- Architecture guide → Blueprint or system map
- Tutorial → Step-by-step visual sequence

---

## Example Mappings Library

### From Brian Castle (Builder Methods)

| Topic | Core Concept | Visual Approach | Objects Selected | Composition |
|-------|--------------|-----------------|------------------|-------------|
| "Prompt Engineering" | AI interaction | Literal | Chat interface, text bubbles | Single scene |
| "Spec-Driven Development" | Planning before building | Metaphorical | Blueprint, architectural drawing, wireframes | Scene with planning tools |
| "Morning Coffee Rituals" | Daily routines | Literal | Coffee mug on desk, notebook, morning light | Simple scene |
| "Systems Mindset" | Structured thinking | Metaphorical | Blueprint stack, building blocks in sequence | Sequence composition |

### SanchoCMO Examples

| Topic | Core Concept | Visual Approach | Objects from Visual World | Composition |
|-------|--------------|-----------------|---------------------------|-------------|
| "Marketing Psychology" | Understanding minds | Metaphorical | Sancho reading vintage psychology book, thought bubbles | Character + object scene |
| "Growth Strategies" | Upward momentum | Metaphorical | Action burst with upward arrow, Sancho pointing forward | Dynamic action scene |
| "Brand Voice" | How to communicate | Literal | Speech bubble with distinctive typography | Single iconic element |
| "Competitor Analysis" | Comparison | Metaphorical | Two shields (comparison), strategy map | Comparison scene |
| "Content Strategy" | Planning content | Literal | Scroll/ancient document with content calendar, quill pen | Planning scene |

---

## How AI Uses This

When user requests a visual:

1. **User input**: "I need a hero image for blog post about [TOPIC]"
2. **AI loads**: this Idea Mapping guide + Visual World inventory
3. **AI analyzes**: What's the core concept? Literal or metaphorical?
4. **AI selects**: 1-3 objects from Visual World that relate
5. **AI proposes**: 3 concept options to user
6. **User selects**: A, B, or C
7. **AI generates**: Image using selected concept + Aesthetic Guidelines (Layer 3)

**Automation enabled**: User doesn't specify objects/composition, AI decides based on this systematic mapping.

---

## Building Idea Mapping During Meta-Skill Run

### Process (Layer 2 of visual-identity meta-skill):

1. **Load Visual World** (Layer 1 output)
2. **Ask user**: "How should visuals adapt by content type?"
3. **Propose decision tree** based on brand context
4. **Show example mappings** (use Brian Castle examples + industry-specific)
5. **User validates/refines**: "Yes, but for technical content we should..."
6. **Add domain-specific mappings**: User's industry may have unique content types
7. **Build complete decision tree** with IF-THEN logic
8. **Validation test**: Give AI 3 random topics, verify it selects appropriate visuals
9. **Finalize** → this file gets written

### Validation Questions

- "For a blog post about [random topic], what would you illustrate and why?"
- "If I need 5 images for a landing page, what types of visuals for each section?"
- "How do social media visuals differ from blog hero images in your system?"

Answers should reference this decision tree consistently.

---

## Usage in Child Skills

The generated `[brand]-visual-generator` skill copies this file to `references/idea-mapping.md` and loads it when:
- User requests a visual without specifying exact content
- Skill needs to propose 3 concept options
- Determining composition type (single object vs scene vs sequence)

This enables the child skill to autonomously decide WHAT to show, maintaining brand consistency.

---

## Tips for Effective Idea Mapping

### 1. Be Specific, Not Generic

❌ "Show relevant objects"
✅ "For productivity content → show workspace objects (notebook, coffee, desk). For strategy content → show planning tools (map, compass, blueprint)."

### 2. Include Industry-Specific Patterns

Every industry has content types unique to them. Add these:
- FinTech: Regulatory updates → show shield/lock (security), Transaction explainer → show flow diagram
- EdTech: Course launch → show learning journey (progression), Student success → show graduation cap/trophy
- DevTools: Feature announcement → show code editor with new feature highlighted

### 3. Maintain Consistency

Same type of content should ALWAYS use same type of visual approach:
- All "thought leadership" posts → workspace scenes (not random)
- All "feature announcements" → product shots with feature highlighted (not abstract)
- All "case studies" → before/after or results metaphor (not generic)

### 4. Allow Flexibility Within Constraints

The mapping should be specific enough for consistency but flexible enough for creativity:
- ✅ "Productivity content → workspace scene with 2-3 planning objects from Visual World"
- ❌ "Productivity content → exactly notebook + coffee mug + desk lamp, always"

Let AI choose WHICH planning objects, but constrain to planning objects category.

---

## When Visual World Changes

If new objects are added to Layer 1 Visual World:
- Update this Idea Mapping to include them in appropriate mappings
- Regenerate `[brand]-visual-generator` child skill to load updated mapping
- Old generated images remain valid (Visual World is additive, not replacing)

If objects are removed from Visual World (rare):
- Update this mapping to remove references
- Regenerate child skill
- Flag existing images that used now-excluded objects for review
