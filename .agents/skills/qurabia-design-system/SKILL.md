---
name: qurabia-design-system
description: "Use for Qurabia or Tahaddi tasks specifically involving qurabia design system. Apply the existing implementation and project conventions within the requested scope."
---

# Qurabia Design System

## Goal
Create a consistent Arabic-first visual system across the full website.

## Define tokens
- spacing
- radii
- typography
- semantic colors
- surfaces
- borders
- shadows
- motion duration/easing
- z-index
- container widths

## Components
Prefer shared primitives for:
- buttons
- inputs
- dialogs
- cards
- badges
- tabs
- tooltips
- toasts
- progress
- avatars
- tables
- empty states
- skeletons

## Rules
- RTL-safe layouts.
- Avoid hardcoded directional CSS when logical properties can be used.
- Functional text must prioritize readability.
- Rank and subscription styles must not be confused.
- Responsive behavior must be defined, not accidental.

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.
