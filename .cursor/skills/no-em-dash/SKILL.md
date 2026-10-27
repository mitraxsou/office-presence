---
name: no-em-dash
description: >-
  Never use Unicode em dash (U+2014) or en dash (U+2013) in this repo.
  Prefer ASCII hyphen-minus (-), commas, colons, or parentheses.
---

# No em dash / en dash

Forbidden everywhere: UI strings, comments, commit messages, docs, skills, and tests.

## Allowed replacements

| Instead of | Use |
|---|---|
| sentence break with U+2014 | ` - `, `: `, or `, ` |
| numeric range with U+2013 | `1-30` |

## Before shipping

```powershell
npm test -- tests/bugs/BUG-001-no-em-dash-in-repo.test.ts
```
