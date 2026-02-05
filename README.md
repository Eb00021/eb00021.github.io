# T4BF MPX Documentation Site

Collaborative docs with real-time editing (Firebase + Tiptap/Yjs).

## Features

- **Editor** – Rich text, tables, links; real-time sync; presence. Publish to update live docs.
- **Contributions** – Data-driven task list (`data/contributions.json` or Firebase). Assign tasks to team members; section appears on docs when assigned.
- **Contribution entries** – Add/edit modules (e.g. R2) and rows (task, description, files). Seed from JSON.
- **Export static** – Download one HTML file with doc + contributions baked in (no Firebase/fetch).
- **Admin** – Whitelist team members (Google). Admin-only: GitHub token, user list.

## Pages

| Page | Purpose |
|------|---------|
| `index.html` | Landing |
| `documentation.html` | Public docs |
| `editor.html` | Edit docs |
| `contribution-editor.html` | Assign contributions |
| `contribution-entries.html` | Add/edit contribution modules & rows |
| `export-static.html` | Download static HTML |
| `admin.html` | Team management (admin) |

## Stack

- Tiptap, Yjs, Firebase Realtime DB, Firebase Auth (Google). Vanilla JS.
