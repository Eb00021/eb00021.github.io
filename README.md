# T4BF MPX Documentation Site

A collaborative documentation site with real-time editing powered by Firebase.

## Features

- **Collaborative Editing**: Multiple users can edit documentation simultaneously with real-time sync
- **User Presence**: See who else is currently editing
- **Rich Text Editor**: Full formatting toolbar (headings, lists, code blocks, tables, links)
- **Auto-save**: Changes sync automatically to Firebase
- **Access Control**: Admin manages team member whitelist

## How to Edit

1. Go to the editor page (`/editor.html`)
2. Sign in with your Google account
3. If authorized, you'll see the editor with a formatting toolbar
4. Make your changes - they save automatically
5. Click **Publish** to push changes to the public documentation page


## Pages

| Page | Purpose |
|------|---------|
| `index.html` | Landing page |
| `documentation.html` | Public documentation (read-only) |
| `editor.html` | Collaborative editor (requires auth) |
| `admin.html` | User management (admin only) |

## Tech Stack

- Tiptap editor with Yjs for real-time collaboration
- Firebase Realtime Database for persistence
- Firebase Authentication (Google sign-in)
- Vanilla JS, no build step required
