# Plan: Contribution Selection Editor & Data-Driven Contributions

## Goal

Make it easier to assign contributions to team members by:

1. Moving the contributions table into a **data file** you can expand later.
2. Adding a **Contribution Selection Editor** page where team members assign contributions to people.
3. **Removing** the master R0/R1 contributions table from the main documentation HTML for now.
4. **Re-adding** the Contributions section automatically when at least one contribution has been assigned (built from the data file + assignments).

---

## Current State

- **documentation.html** (and Firebase `documentation/htmlCache`) holds one big HTML blob that includes:
  - Module Status, User's Manual, Programmer's Manual
  - **Contributions**: R0 Contributions table, R1 Contributions table, then Team Members (Ethan Boyd, Benjamin Eft, Shannon Seiler, Matt Welch) each with "Functions Implemented" table with placeholder `[Select from R0/R1 table above]` and "Other Contributions"
- **Team members** are stored in Firebase under `users` (email, name, addedAt, addedBy).
- **Editor** (editor.html) loads/saves the full doc HTML via Yjs + Firebase; publishing updates `documentation/htmlCache`.

---

## 1. Contributions data file

Create a single source of truth for contribution rows (easy to expand with R2, R3, more rows).

**Option A – JSON (good for tooling / non-devs):**  
`data/contributions.json`

```json
{
  "releases": [
    {
      "id": "R0",
      "title": "R0 Contributions",
      "rows": [
        { "task": "Serial port initialization", "description": "Configure COM1 UART at 9600 baud", "files": "kernel/serial.c" },
        { "task": "Kernel main setup", "description": "Initialize all subsystems in correct order", "files": "kernel/kmain.c" },
        { "task": "GDT/IDT/IRQ/PIC/VM setup", "description": "(Provided code)", "files": "kernel/core-c.c" }
      ]
    },
    {
      "id": "R1",
      "title": "R1 Contributions",
      "rows": [
        { "task": "serial_poll() implementation", "description": "Polling input with line editing support", "files": "kernel/serial.c" },
        ...
      ]
    }
  ]
}
```

**Option B – JS (simplest for repo, no fetch/CORS):**  
`data/contributions.js` that defines a global or exports an object, same structure. Documentation and the new editor page both load it via `<script src="data/contributions.js">` or fetch.

**Recommendation:** Use **JSON** in `data/contributions.json` so you can add R2/R3 and new rows by editing one file. The Contribution Selection Editor and the documentation page will load it via `fetch('data/contributions.json')`.

**Stable IDs for assignments:** Each row gets an id for saving assignments, e.g. `releaseId + "-" + rowIndex` (e.g. `R0-0`, `R1-0`, `R1-1`, …). The data file can either include an optional `id` per row or IDs can be computed when loading.

---

## 2. Where to store assignments

Store **contribution → team member** in Firebase so the Contribution Selection Editor and the documentation page both see the same data.

- **Path:** `contributions/assignments`
- **Shape:** a map of contribution row id → assigned member identifier.  
  Use **email** (or encoded email) so it matches Firebase `users` and is stable:
  - e.g. `{ "R0-0": "ethan@example.com", "R1-2": "ben@example.com" }`

**Firebase rules:** Add a rule so that only authenticated users who are either admin or in `users` can read/write `contributions/assignments` (same as documentation editors). Example:

```json
"contributions": {
  "assignments": {
    ".read": "auth != null && (auth.token.email == 'ehboyd131@gmail.com' || root.child('users').child(auth.token.email.replace('.', ',')).exists())",
    ".write": "auth != null && (auth.token.email == 'ehboyd131@gmail.com' || root.child('users').child(auth.token.email.replace('.', ',')).exists())"
  }
}
```

---

## 3. Contribution Selection Editor (new page)

- **URL:** e.g. `contribution-editor.html` (or `contributions.html`).
- **Auth:** Same as main editor: Google sign-in; only admin or users in Firebase `users` can access.
- **UI:**
  - Load `data/contributions.json` and Firebase `users` + `contributions/assignments`.
  - For each release (R0, R1, …), show a table: columns **Task**, **Description**, **Files**, **Assigned to**.
  - **Assigned to:** dropdown per row with options: “Unassigned” and one option per team member (display name or email). Optionally include admin in the list if not already in `users`.
  - On change, write that row’s id → selected user email to Firebase `contributions/assignments` (or remove key if “Unassigned”).
  - Optional: “Save” button or auto-save on each dropdown change; optional status text “Saved” / “Saving…”.
- **Navigation:** Link from the main editor (e.g. “Contribution Selection” or “Assign Contributions”) and/or from index/admin so team members can find it easily.

No need for a full WYSIWYG editor here—just tables + dropdowns backed by the data file and Firebase.

---

## 4. Remove master table from main documentation HTML

- **In the static fallback** in `documentation.html`: remove the entire **Contributions** block (the two tables “R0 Contributions” and “R1 Contributions” and the “Team Members” subsections with their placeholder tables).
- **In the editor:** The current doc content in Yjs/Firebase still contains that block. So either:
  - Manually edit the doc in the editor once to delete the Contributions section and Publish (so `htmlCache` no longer has it), or
  - Add a one-time migration or instruction: “Publish after removing the Contributions section so the cache no longer includes it.”

After this, the “main” documentation HTML (static and cache) no longer contains the master contributions table or the per-member contribution tables.

---

## 5. Add Contributions section back automatically when assignments exist

- **Where:** In `documentation.html`, in the script that runs after the main content is loaded (from Firebase or static).
- **Steps:**
  1. Load `data/contributions.json` (fetch).
  2. Load `contributions/assignments` from Firebase (read once; no auth required if you make this path publicly readable for viewing docs, or keep auth and have the doc page use a public read path for assignments—see below).
  3. If `assignments` is empty or has no keys, do nothing (no Contributions section).
  4. If there is at least one assignment:
     - Build the Contributions section HTML:
       - Overview paragraph (fixed text).
       - For each release in the data file: **Master table** (Task, Description, Files) from the data file.
       - **Team Members:** For each member who has at least one assigned contribution (from `users` + assignments), render their name, “Functions Implemented” table (rows where assignment === that member’s email), and “Other Contributions” (can stay as placeholder list or empty).
     - Inject this block into the main content (e.g. before the closing `</main>` or after a known heading), or into a dedicated container (e.g. `<div id="contributionsSection">`) that you append to `#mainContent`.

**Public read for assignments:** So that the documentation page can show the section without requiring login, add a rule that allows read for `contributions/assignments` to everyone (`.read": true`), while keeping `.write` restricted to authenticated editors. Then the doc page can fetch assignments with no auth.

---

## 6. Team member list for display

- **In the Contribution Selection Editor:** Team list comes from Firebase `users` (already used in admin). Optionally add the admin (ADMIN_EMAIL) to the dropdown if they’re not in `users`.
- **In the documentation page:** When building “Team Members” subsections, you need display names. Either:
  - Store a **display name** in the assignments (e.g. when saving, also write to a small `contributions/memberNames` map email → display name), or
  - Use Firebase `users` for display names. That requires the doc page to be able to read `users`—currently only admin can read. So either:
    - Allow public read for `users` (only email + name, no sensitive data), or
    - Store in assignments both email and display name so the doc page only needs to read `contributions/assignments` (and optionally a public `contributions/memberNames` or embed name in assignment value as `{ email, name }`).

Simplest: keep assignments as `contributionId → email`. For the doc page, either make `users` readable by everyone (just for listing names) or add a separate public node like `contributions/memberNames` (email → name) that the Contribution Selection Editor updates when assignments change. Recommendation: **public read for `users`** (or a subset) so one source of truth for names.

---

## 7. File / code changes summary

| Item | Action |
|------|--------|
| `data/contributions.json` | **Create** – R0/R1 (and later R2, …) rows in the structure above. |
| `firebase-rules.json` | **Edit** – Add `contributions/assignments` read/write for editors; optionally public read for assignments (and users) for doc display. |
| `contribution-editor.html` | **Create** – New page: auth, load contributions + users + assignments, table with “Assigned to” dropdowns, save to Firebase. |
| `contribution-editor.js` (or inline) | **Create** – Logic for the above. |
| `documentation.html` | **Edit** – (1) Remove Contributions section from the static `#mainContent` HTML. (2) After loading main content (Firebase or static), add script that fetches `data/contributions.json` and `contributions/assignments`; if any assignment exists, build and inject the Contributions section. |
| `editor.html` | **Edit** – Add link to “Contribution Selection” / “Assign Contributions” (e.g. next to “View Docs” / “Admin”). |
| `index.html` | **Optional** – Add link to Contribution Selection Editor if you want it from the home page. |

---

## 8. Order of implementation

1. Add **Firebase rules** for `contributions/assignments` (and optional public read).
2. Create **data/contributions.json** and populate from current R0/R1 tables.
3. Implement **Contribution Selection Editor** (HTML + JS): load data, load users, load/save assignments.
4. **Remove** the Contributions block from the static content in **documentation.html** and add the **injection script** that builds the section from data + assignments when any assignment exists.
5. Manually **remove the Contributions section** from the live doc in the main editor and **Publish** once, so the cache matches (or document that step).
6. Add **navigation** to the new page from editor (and optionally index).

---

## 9. Expanding later

- **New release (e.g. R2):** Add another object to `data/contributions.json` under `releases` with `id`, `title`, and `rows`. No code change needed; the editor and doc page both iterate over `releases`.
- **New rows in R0/R1:** Add entries to the corresponding `rows` array. Assignments use `releaseId-index`, so existing assignments stay valid.
- **New team members:** Still added via Admin; they appear in the Contribution Selection Editor dropdown once in Firebase `users`.

This keeps the workflow simple and the master table and per-member tables driven by one data file and one assignments store.
