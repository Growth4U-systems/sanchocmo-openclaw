#!/usr/bin/env python3
"""
Generate Visual - Testing Script for visual-identity Meta-Skill

Purpose: Test image generation during Layer 3 aesthetic iteration.
This script is used BY THE META-SKILL to generate sample images while
defining aesthetic guidelines. It is NOT the final production script
(that will be in the generated child skill).

Usage:
    python generate_visual.py --prompt "your prompt" --output output.png
    python generate_visual.py --test  # Test with SanchoCMO example
"""

import os
import sys
import json
import argparse
import glob
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables (API keys)
load_dotenv()

def get_next_sequence_number(output_dir='.'):
    """
    Get next sequence number for image naming.
    Looks for existing images with pattern: YYYYMMDD_NNN_*.png
    Returns next available number.
    """
    date_prefix = datetime.now().strftime('%Y%m%d')
    pattern = f"{output_dir}/{date_prefix}_*_*.png"
    existing = glob.glob(pattern)

    if not existing:
        return 1

    # Extract sequence numbers
    numbers = []
    for filepath in existing:
        parts = Path(filepath).stem.split('_')
        if len(parts) >= 2 and parts[1].isdigit():
            numbers.append(int(parts[1]))

    return max(numbers) + 1 if numbers else 1

def load_aesthetic_guidelines(skill_path):
    """
    Load visual-style.md if it exists (Layer 3).
    Used during iteration to test current aesthetic specs.
    """
    visual_style_path = skill_path / 'references' / 'visual-style.md'

    if not visual_style_path.exists():
        return None

    # Read the file and extract AI Base Prompt if present
    # (Simplified - real implementation would parse markdown)
    with open(visual_style_path, 'r') as f:
        content = f.read()

    # TODO: Parse AI Base Prompt from markdown
    # For now, return placeholder
    return {
        'base_prompt': 'extracted from visual-style.md',
        'negative_prompts': 'extracted negatives'
    }

def assemble_prompt(subject, aesthetic=None, user_preferences=None):
    """
    Assemble complete prompt for Nanobanana.

    Args:
        subject: What to illustrate (from user or Idea Mapping)
        aesthetic: Guidelines from Layer 3 (if available)
        user_preferences: Color scheme, dimensions, etc.

    Returns:
        (prompt, negative_prompt) tuple
    """
    # If aesthetic guidelines exist, use them as base
    if aesthetic and 'base_prompt' in aesthetic:
        base = aesthetic['base_prompt']
        negative = aesthetic.get('negative_prompts', '')
    else:
        # Fallback: generic prompt
        base = "high quality illustration, professional, clean"
        negative = "low quality, blurry, distorted"

    # Add subject
    full_prompt = f"{base}, {subject}"

    # Add user preferences if provided
    if user_preferences:
        if 'color_scheme' in user_preferences:
            full_prompt += f", {user_preferences['color_scheme']} color scheme"

    return full_prompt, negative

def generate_image_nanobanana(prompt, negative_prompt, width=1024, height=1024, output_path='output.png'):
    """
    Call Nanobanana API to generate image.

    Args:
        prompt: Full prompt string
        negative_prompt: Negative prompt string
        width: Image width in pixels
        height: Image height in pixels
        output_path: Where to save generated image

    Returns:
        Path to generated image
    """
    # TODO: Implement actual Nanobanana API call
    # This is a placeholder for the meta-skill testing

    print(f"[TEST MODE] Would generate image with Nanobanana:")
    print(f"  Prompt: {prompt}")
    print(f"  Negative: {negative_prompt}")
    print(f"  Dimensions: {width}x{height}")
    print(f"  Output: {output_path}")

    # In real implementation:
    # 1. Import Nanobanana SDK
    # 2. Load API key from environment: os.getenv('NANOBANANA_API_KEY')
    # 3. Call API with prompt, negative_prompt, dimensions
    # 4. Save returned image to output_path
    # 5. Return output_path

    # For testing during meta-skill development:
    print("\n⚠️  Nanobanana API integration not yet implemented.")
    print("This script is a template for testing the workflow.")
    print("The ACTUAL generation script will be in the generated child skill.")

    return None

def save_metadata(output_path, prompt, negative_prompt, aesthetic_used, iteration_number, sequence_number):
    """
    Save metadata JSON alongside generated image.
    Useful for tracking which prompt produced which image during iteration.
    """
    metadata_path = output_path.replace('.png', '_metadata.json')

    metadata = {
        'sequence_number': sequence_number,
        'prompt': prompt,
        'negative_prompt': negative_prompt,
        'aesthetic_guidelines': aesthetic_used if aesthetic_used else 'none',
        'iteration': iteration_number,
        'timestamp': datetime.now().isoformat(),
        'model': 'nanobanana'
    }

    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    return metadata_path

def main():
    parser = argparse.ArgumentParser(description='Generate visual for testing aesthetic (meta-skill Layer 3)')
    parser.add_argument('--prompt', help='What to illustrate')
    parser.add_argument('--output-dir', default='.', help='Output directory (auto-names with sequence)')
    parser.add_argument('--width', type=int, default=1024, help='Image width')
    parser.add_argument('--height', type=int, default=1024, help='Image height')
    parser.add_argument('--color', help='Color scheme preference')
    parser.add_argument('--iteration', type=int, default=1, help='Iteration number for this concept')
    parser.add_argument('--test', action='store_true', help='Run test with SanchoCMO example')

    args = parser.parse_args()

    # Test mode
    if args.test:
        print("🧪 Running test generation with SanchoCMO aesthetic...")
        prompt = "Sancho Panza reading an ancient strategy scroll, thought bubbles with marketing symbols"
        aesthetic = {
            'base_prompt': '1970s Bronze Age comic book style, bold 4px black outlines, limited 4-color palette, halftone dot shading, dynamic composition, high contrast',
            'negative_prompts': 'realistic photography, modern CGI, soft gradients, detailed textures, photorealism'
        }
        subject = "Sancho Panza with strategy scroll"
    else:
        if not args.prompt:
            print("Error: --prompt required (or use --test for SanchoCMO example)")
            sys.exit(1)

        prompt = args.prompt

        # Try to load aesthetic from Layer 3 if available
        skill_path = Path(__file__).parent.parent
        aesthetic = load_aesthetic_guidelines(skill_path)
        subject = prompt

    # Get next sequence number
    sequence_num = get_next_sequence_number(args.output_dir)

    # Generate filename with sequence: YYYYMMDD_NNN_description_vN.png
    date_str = datetime.now().strftime('%Y%m%d')
    concept_slug = prompt.lower().replace(' ', '_')[:40]
    concept_slug = ''.join(c if c.isalnum() or c == '_' else '' for c in concept_slug)
    filename = f"{date_str}_{sequence_num:03d}_{concept_slug}_v{args.iteration}.png"
    output_path = str(Path(args.output_dir) / filename)

    # Assemble full prompt
    user_prefs = {'color_scheme': args.color} if args.color else None
    full_prompt, negative = assemble_prompt(subject, aesthetic, user_prefs)

    # Generate image
    output = generate_image_nanobanana(
        prompt=full_prompt,
        negative_prompt=negative,
        width=args.width,
        height=args.height,
        output_path=output_path
    )

    # Save metadata
    if output:
        metadata_path = save_metadata(
            output_path=output_path,
            prompt=full_prompt,
            negative_prompt=negative,
            aesthetic_used=aesthetic,
            iteration_number=args.iteration,
            sequence_number=sequence_num
        )
        print(f"\n✅ Image generated: {output}")
        print(f"   Sequence: #{sequence_num:03d}")
        print(f"✅ Metadata saved: {metadata_path}")
    else:
        print(f"\n⚠️  Would save to: {output_path}")
        print(f"   Sequence: #{sequence_num:03d}")
        print("   (Nanobanana API not implemented in test mode)")

if __name__ == "__main__":
    main()
