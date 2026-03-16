# New Look and Feel — Design Context

## Overview

A comprehensive UI/UX design was created for the code review web app using Pencil MCP (`pencil-new.pen`).
Three screens were designed covering the full feature set from `docs/requirements.md`.

---

## Design System

- **Style guide:** `webapp-02-industrialtechnical_light` — Industrial Technical Dashboard aesthetic
- **Font system:** JetBrains Mono (body / code / UI), Oswald (headings)
- **Icon library:** Lucide
- **Corner radius:** 16px universal
- **Accent colors:**
  - Orange `#FF6B35` — primary actions, alerts, deleted lines
  - Teal `#00D4AA` — success, added lines, active toggles
- **Code-inspired conventions:** snake_case labels, `//` comments, `[BRACKET]` status messages

### Dark Mode Palette
| Role        | Color     |
|-------------|-----------|
| Page bg     | `#1A1A1A` |
| Cards       | `#212121` |
| Elevated    | `#2D2D2D` |
| Placeholder | `#3D3D3D` |

### Light Mode Palette
| Role         | Color     |
|--------------|-----------|
| Page bg      | `#F5F5F5` |
| Cards        | `#FFFFFF` |
| Elevated     | `#F0F0F0` |
| Addition bg  | `#F0FFF8` |
| Outdated bg  | `#FFFBF0` |

---

## Screens

### Screen 1 — Dark Mode, Side-by-Side Diff (node: `bi8Au`, x=0, y=0)

**1440×900, dark mode**

Features:
- File tree sidebar with folder hierarchy, comment count badges, and binary file label
- Toolbar: view toggle (side-by-side / unified), context lines selector (none/3/20/100/full), hide_removed toggle, theme switcher, manual refresh
- Split OLD / NEW diff panels with red (deleted) and teal (added) gutter strips and line numbers
- Inline comment thread — reviewer_01 on line 6 with reply / edit / delete actions
- Export comments button

**Diff line patterns:**
- Unchanged line: gray line number (`#555555`), gray code text (`#C9C9C9`)
- Deleted line: orange-red bg (`#2A1505`), 3px orange gutter strip, orange text (`#FF6B35`)
- Added line: teal bg, 3px teal gutter strip, teal text (`#00D4AA`)

**Comment thread structure:** inserted into right panel (`oKxYg`) after line 6, moved into position with `M("3l3WI", "oKxYg", 7)`.

---

### Screen 2 — Light Mode, Unified Diff (node: `TKA7Y`, x=1540, y=0)

**1440×900, light mode**

Features:
- Same sidebar in light palette
- Unified view toggle active (orange)
- hide_removed ON (teal toggle)
- Sun icon theme switcher (indicating light mode)
- `@@ -1,7 +1,7 @@` context row
- Single-column diff showing only added lines
- `[OUTDATED]` amber-badged comment from reviewer_02 with dismiss / delete actions

**Outdated comment badge:**
- Background: `#FFF0C2`, text: `#B87A00`, label: `[OUTDATED]`

---

### Screen 3 — Dark Mode, Comments Export (node: `gGsN0`, x=3080, y=0)

**1440×900, dark mode**

Features:
- Simplified sidebar showing only files with comment counts
- Export header: `review_comments.txt` title + copy / save .txt buttons
- AI tip banner: `// paste directly into your AI assistant`
- Dark code-editor text area with structured export format

**AI-ready export format:**
```
FILE: src/components/Button.tsx

[COMMENT · Line 6]  author: reviewer_01  status: active  ·  3h ago
Consider making onClick optional too: onClick?: () => void — aligns with the pattern used here.

[COMMENT · Line 6]  author: reviewer_02  status: OUTDATED  ·  2d ago
This prop should probably be required, not optional.
```

---

## Key Node IDs

| Element                  | Node ID  |
|--------------------------|----------|
| Screen 1 root            | `bi8Au`  |
| Screen 1 sidebar tree    | `DPn57`  |
| Screen 1 main area       | `hMJiv`  |
| Screen 1 left diff panel | `h5RcI`  |
| Screen 1 right diff panel| `oKxYg`  |
| Screen 1 comment thread  | `NY9yC`  |
| Screen 2 root            | `TKA7Y`  |
| Screen 2 file tree       | `HK7hk`  |
| Screen 2 main area       | `6MDBR`  |
| Screen 2 unified diff    | `uN6vs`  |
| Screen 3 root            | `gGsN0`  |
| Screen 3 file list       | `buAaL`  |
| Screen 3 export panel    | `sdw2T`  |
| Screen 3 text area       | `U2iZD`  |

---

## Notes

- Design file: `pencil-new.pen` (open in Pencil MCP editor)
- Requirements source: `docs/requirements.md` (v1.1)
- All three screens verified via Pencil screenshots
