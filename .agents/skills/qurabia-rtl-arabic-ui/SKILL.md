---
name: qurabia-rtl-arabic-ui
description: "Use for Qurabia or Tahaddi tasks specifically involving rtl & arabic ui. Apply the existing implementation and project conventions within the requested scope."
---

# RTL & Arabic UI

## Goal
Make Qurabia fully Arabic-first and robust in RTL.

## Requirements
- Use dir=rtl at the correct app boundary.
- Use logical CSS properties where possible.
- Test icons that imply direction.
- Validate number/date formatting.
- Keep mixed Arabic/English content stable.
- Avoid text clipping in buttons/cards.
- Ensure tables, menus, dialogs, tooltips, and forms work in RTL.
- Ensure mobile layouts remain usable at 360/390/430 widths.

## Accessibility
- semantic HTML
- keyboard navigation
- visible focus
- ARIA where necessary
- correct reading order

## Integration scope

Follow the root `AGENTS.md` and `docs/qurabia-codex-guide.md`. Apply this guidance only to the requested work. Listed components, flows, and features are conditional guidance, not an instruction to create missing systems. Reuse existing tokens, contracts, and dependencies first.
