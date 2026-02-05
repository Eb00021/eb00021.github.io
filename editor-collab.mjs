// Collaborative Editor with Tiptap + Yjs + Firebase
// ES Module version for proper imports

import { Editor } from 'https://esm.sh/@tiptap/core@2.1.13';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.1.13';
// Bare imports so browser resolves via import map (single Yjs instance)
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Table from 'https://esm.sh/@tiptap/extension-table@2.1.13';
import TableRow from 'https://esm.sh/@tiptap/extension-table-row@2.1.13';
import TableCell from 'https://esm.sh/@tiptap/extension-table-cell@2.1.13';
import TableHeader from 'https://esm.sh/@tiptap/extension-table-header@2.1.13';
import Link from 'https://esm.sh/@tiptap/extension-link@2.1.13';
import Underline from 'https://esm.sh/@tiptap/extension-underline@2.1.13';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';

// GitHub configuration
const GITHUB_OWNER = 'eb00021';
const GITHUB_REPO = 'eb00021.github.io';
const GITHUB_FILE = 'documentation.html';
const GITHUB_API = 'https://api.github.com';

// Editor state
let editor = null;
let ydoc = null;
let currentUser = null;
let isAuthorized = false;
let awareness = null;
let firebaseUnsubscribe = null;
let sessionId = null;
let sessionListener = null;
let sessionRef = null;
let provider = null;
let currentFileSha = null;
let originalHtmlHead = '';
let originalHtmlTail = '';
let lastKnownCacheTimestamp = 0;

// DOM Elements
const getElement = (id) => document.getElementById(id);

// Initialize Firebase
function initFirebase() {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
}

// Show status message
function showStatus(message, type) {
    const statusBar = getElement('statusBar');
    if (statusBar) {
        statusBar.textContent = message;
        statusBar.className = 'status-bar status-' + type;
    }
}

function hideStatus() {
    const statusBar = getElement('statusBar');
    if (statusBar) {
        statusBar.className = 'status-bar';
    }
}

// GitHub token management (stored in Firebase for global access)
let cachedGitHubToken = null;

async function getGitHubToken() {
    if (cachedGitHubToken !== null) {
        return cachedGitHubToken;
    }
    try {
        const db = firebase.database();
        const snapshot = await db.ref('settings/githubToken').once('value');
        const raw = snapshot.exists() ? snapshot.val() : null;
        cachedGitHubToken = raw ? raw.trim() : null;
        return cachedGitHubToken;
    } catch (error) {
        console.error('Error fetching GitHub token:', error);
        return null;
    }
}

async function setGitHubToken(token) {
    try {
        const db = firebase.database();
        await db.ref('settings/githubToken').set(token);
        cachedGitHubToken = token;
    } catch (error) {
        console.error('Error saving GitHub token:', error);
        throw error;
    }
}

async function clearGitHubToken() {
    try {
        const db = firebase.database();
        await db.ref('settings/githubToken').remove();
        cachedGitHubToken = null;
    } catch (error) {
        console.error('Error clearing GitHub token:', error);
        throw error;
    }
}

// GitHub API helper: try Bearer first, fall back to token on 401
let workingAuthPrefix = null; // 'Bearer' or 'token', cached after first success

async function githubFetch(url, options = {}) {
    const token = await getGitHubToken();
    if (!token) throw new Error('No GitHub token configured');

    const prefixes = workingAuthPrefix ? [workingAuthPrefix] : ['Bearer', 'token'];

    for (const prefix of prefixes) {
        const headers = {
            ...options.headers,
            'Authorization': `${prefix} ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        };
        const response = await fetch(url, { ...options, headers });
        if (response.status === 401 && !workingAuthPrefix) continue;
        if (response.ok) workingAuthPrefix = prefix;
        return response;
    }
    throw new Error('Invalid or expired GitHub token');
}

// GitHub API: Fetch file SHA (required for updates)
async function fetchFileSha() {
    const token = await getGitHubToken();
    if (!token) return null;

    try {
        const response = await githubFetch(
            `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`
        );

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.statusText}`);
        }

        const data = await response.json();
        currentFileSha = data.sha;

        // Extract original HTML structure for rebuilding
        const content = decodeURIComponent(escape(atob(data.content)));
        extractHtmlStructure(content);

        return data.sha;
    } catch (error) {
        console.error('Failed to fetch file SHA:', error);
        throw error;
    }
}

// Extract HTML head/tail from full document
function extractHtmlStructure(html) {
    const mainMatch = html.match(/<main[^>]*id="mainContent"[^>]*>([\s\S]*?)<\/main>/i) ||
                     html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
        const mainIndex = html.indexOf(mainMatch[0]);
        const mainTagMatch = html.match(/<main[^>]*>/i);
        originalHtmlHead = html.substring(0, mainIndex) + mainTagMatch[0];
        originalHtmlTail = '</main>' + html.substring(mainIndex + mainMatch[0].length);
    }
}

// Build full HTML document from main content
function buildFullDocumentHtml(mainContent) {
    if (originalHtmlHead && originalHtmlTail) {
        return originalHtmlHead + mainContent + originalHtmlTail;
    }
    // Fallback: minimal document structure
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Documentation - T4BF MPX</title>
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <main id="mainContent">
${mainContent}
    </main>
</body>
</html>`;
}

// GitHub API: Update file
async function updateGitHubFile(htmlContent, commitMessage) {
    const token = await getGitHubToken();
    if (!token) {
        throw new Error('No GitHub token configured');
    }

    // Fetch current SHA if we don't have it
    if (!currentFileSha) {
        await fetchFileSha();
    }

    const fullHtml = buildFullDocumentHtml(htmlContent);
    const encodedContent = btoa(unescape(encodeURIComponent(fullHtml)));

    const response = await githubFetch(
        `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
        {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: commitMessage,
                content: encodedContent,
                sha: currentFileSha
            })
        }
    );

    if (!response.ok) {
        if (response.status === 409) {
            throw new Error('Conflict: File was modified. Please try again.');
        }
        throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const result = await response.json();
    currentFileSha = result.content.sha;
    return result;
}

// GitHub config modal functions
async function showGitHubConfig() {
    const modal = getElement('githubModal');
    const input = getElement('githubTokenInput');
    if (modal) {
        modal.classList.remove('modal-hidden');
        if (input) {
            input.value = (await getGitHubToken()) || '';
        }
    }
}

function hideGitHubModal() {
    const modal = getElement('githubModal');
    if (modal) {
        modal.classList.add('modal-hidden');
    }
}

async function saveGitHubConfig() {
    const input = getElement('githubTokenInput');
    if (input) {
        const token = input.value.trim();
        if (token) {
            try {
                await setGitHubToken(token);
                // Reset SHA so it gets fetched fresh on next publish
                currentFileSha = null;
                originalHtmlHead = '';
                originalHtmlTail = '';
                showStatus('GitHub token saved (global)', 'success');
                setTimeout(hideStatus, 2000);
            } catch (error) {
                showStatus('Failed to save token: ' + error.message, 'error');
                return;
            }
        }
        hideGitHubModal();
    }
}

async function clearGitHubConfig() {
    try {
        await clearGitHubToken();
        currentFileSha = null;
        originalHtmlHead = '';
        originalHtmlTail = '';
        const input = getElement('githubTokenInput');
        if (input) {
            input.value = '';
        }
        hideGitHubModal();
        showStatus('GitHub token cleared (global)', 'info');
        setTimeout(hideStatus, 2000);
    } catch (error) {
        showStatus('Failed to clear token: ' + error.message, 'error');
    }
}

// Update save indicator
function updateSaveIndicator(state) {
    const indicator = getElement('saveIndicator');
    if (!indicator) return;

    indicator.className = 'save-indicator ' + state;
    const textEl = indicator.querySelector('.save-text');
    if (textEl) {
        switch (state) {
            case 'saving':
                textEl.textContent = 'Syncing...';
                break;
            case 'saved':
                textEl.textContent = 'All changes saved';
                break;
            case 'error':
                textEl.textContent = 'Sync error';
                break;
            default:
                textEl.textContent = '';
        }
    }
}

// Google Sign In (popup flow is more reliable than redirect)
async function signInWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await firebase.auth().signInWithPopup(provider);
    } catch (error) {
        console.error('Sign in error:', error);
        showStatus('Sign in failed: ' + error.message, 'error');
    }
}

// Sign Out
async function signOut() {
    try {
        // Clean up session listener before signing out
        if (sessionRef && sessionListener) {
            sessionRef.off('value', sessionListener);
            sessionListener = null;
        }
        sessionRef = null;
        if (firebaseUnsubscribe) {
            firebaseUnsubscribe();
        }
        if (provider) {
            provider.destroy();
        }
        if (editor) {
            editor.destroy();
        }
        await firebase.auth().signOut();
        // No reload needed - onAuthStateChanged listener handles UI update
    } catch (error) {
        console.error('Sign out error:', error);
    }
}

// Check if user is authorized (in whitelist or is admin)
async function checkAuthorization(user) {
    const db = firebase.database();
    const encodedEmail = encodeEmail(user.email);

    // Check if user is admin
    if (user.email === ADMIN_EMAIL) {
        return true;
    }

    // Check if user is in whitelist
    try {
        const snapshot = await db.ref('users/' + encodedEmail).once('value');
        return snapshot.exists();
    } catch (error) {
        console.error('Authorization check error:', error);
        return false;
    }
}

// Encode email for Firebase path (replace . with ,)
function encodeEmail(email) {
    return email.replace(/\./g, ',');
}

// Google-style avatar colors
const avatarColors = [
    '#f44336', '#e91e63', '#9c27b0', '#673ab7',
    '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
    '#009688', '#4caf50', '#8bc34a', '#ff9800',
    '#ff5722', '#795548', '#607d8b'
];

// Generate consistent color from name (same name = same color)
function getColorFromName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return avatarColors[Math.abs(hash) % avatarColors.length];
}

// Create avatar element (img if photoURL exists, div with initial otherwise)
function createAvatarElement(photoURL, name, size = 32) {
    if (photoURL) {
        const img = document.createElement('img');
        img.src = photoURL;
        img.alt = name;
        img.style.width = size + 'px';
        img.style.height = size + 'px';
        img.style.borderRadius = '50%';
        img.style.objectFit = 'cover';
        return img;
    }

    // Create initial avatar like Google
    const div = document.createElement('div');
    const initial = (name || 'U').charAt(0).toUpperCase();
    const bgColor = getColorFromName(name || 'User');

    div.textContent = initial;
    div.style.width = size + 'px';
    div.style.height = size + 'px';
    div.style.borderRadius = '50%';
    div.style.backgroundColor = bgColor;
    div.style.color = 'white';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    div.style.fontSize = (size * 0.5) + 'px';
    div.style.fontWeight = '500';
    div.style.fontFamily = 'Google Sans, Roboto, Arial, sans-serif';
    div.title = name;

    return div;
}

// Update UI for authenticated user
function updateAuthUI(user) {
    const avatarContainer = getElement('userAvatar');
    const name = getElement('userName');
    const email = getElement('userEmail');

    if (avatarContainer) {
        const newAvatar = createAvatarElement(user.photoURL, user.displayName || user.email, 32);
        newAvatar.id = 'userAvatar';
        newAvatar.className = avatarContainer.className;
        avatarContainer.parentNode.replaceChild(newAvatar, avatarContainer);
    }
    if (name) name.textContent = user.displayName || 'User';
    if (email) email.textContent = user.email;
}

// Show/hide containers
function showAuthContainer() {
    const auth = getElement('authContainer');
    const editorEl = getElement('editorContainer');
    const denied = getElement('accessDenied');

    if (auth) auth.style.display = 'block';
    if (editorEl) editorEl.style.display = 'none';
    if (denied) denied.style.display = 'none';
}

function showEditorContainer() {
    const auth = getElement('authContainer');
    const editorEl = getElement('editorContainer');
    const denied = getElement('accessDenied');

    if (auth) auth.style.display = 'none';
    if (editorEl) editorEl.style.display = 'block';
    if (denied) denied.style.display = 'none';
}

function showAccessDenied() {
    const auth = getElement('authContainer');
    const editorEl = getElement('editorContainer');
    const denied = getElement('accessDenied');
    const deniedEmail = getElement('deniedEmail');

    if (auth) auth.style.display = 'none';
    if (editorEl) editorEl.style.display = 'none';
    if (denied) denied.style.display = 'block';
    if (deniedEmail) deniedEmail.textContent = currentUser?.email || '';
}

// Generate a random color for cursor
function getRandomColor() {
    return avatarColors[Math.floor(Math.random() * avatarColors.length)];
}

// Firebase-based Yjs persistence
class FirebaseYjsProvider {
    constructor(ydoc, roomName, user) {
        this.ydoc = ydoc;
        this.roomName = roomName;
        this.user = user;
        this.db = firebase.database();
        this.docRef = this.db.ref(`documentation/yjs/${roomName}`);
        this.awarenessRef = this.db.ref(`documentation/awareness/${roomName}`);
        this.awareness = new Awareness(ydoc);
        this.userColor = getRandomColor();
        this.clientId = Math.random().toString(36).substring(2, 15);
        this.synced = false;
        this.whenSynced = new Promise((resolve) => {
            this._resolveSynced = resolve;
        });

        this.init();
    }

    async init() {
        // Set up local awareness
        this.awareness.setLocalStateField('user', {
            name: this.user.displayName || this.user.email,
            color: this.userColor,
            photoURL: this.user.photoURL
        });

        // Load initial document state
        await this.loadDocument();

        // Listen for remote updates
        this.docRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (data.update && data.clientId !== this.clientId) {
                    try {
                        const update = this.base64ToUint8Array(data.update);
                        Y.applyUpdate(this.ydoc, update, 'firebase');
                    } catch (e) {
                        console.warn('Error applying remote update:', e?.message || e);
                    }
                }
            }
        });

        // Listen for local updates
        this.ydoc.on('update', (update, origin) => {
            if (origin !== 'firebase') {
                this.saveDocument(update);
            }
        });

        // Set up awareness sync
        this.setupAwareness();
    }

    async loadDocument() {
        try {
            const snapshot = await this.docRef.once('value');
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (data.state) {
                    const state = this.base64ToUint8Array(data.state);
                    Y.applyUpdate(this.ydoc, state, 'firebase');
                }
            }
        } catch (e) {
            console.warn('Error loading document (ignoring persisted state):', e?.message || e);
        } finally {
            this.synced = true;
            this._resolveSynced();
        }
    }

    async saveDocument(update) {
        try {
            updateSaveIndicator('saving');
            const state = Y.encodeStateAsUpdate(this.ydoc);
            await this.docRef.set({
                state: this.uint8ArrayToBase64(state),
                update: this.uint8ArrayToBase64(update),
                clientId: this.clientId,
                updatedAt: firebase.database.ServerValue.TIMESTAMP,
                updatedBy: this.user.email
            });
            updateSaveIndicator('saved');
        } catch (e) {
            console.error('Error saving document:', e);
            updateSaveIndicator('error');
        }
    }

    setupAwareness() {
        // Update awareness in Firebase when local state changes
        this.awareness.on('change', () => {
            const state = this.awareness.getLocalState();
            if (state) {
                this.awarenessRef.child(this.clientId).set({
                    ...state,
                    lastSeen: firebase.database.ServerValue.TIMESTAMP
                });
            }
        });

        // Heartbeat to keep presence alive
        const heartbeat = () => {
            this.awarenessRef.child(this.clientId).update({
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        };
        this.awarenessInterval = setInterval(heartbeat, 10000);

        // Remove on disconnect
        this.awarenessRef.child(this.clientId).onDisconnect().remove();

        // Listen for other users
        this.awarenessRef.on('value', (snapshot) => {
            const states = snapshot.val() || {};
            this.updatePresenceUI(states);
        });
    }

    updatePresenceUI(states) {
        const container = getElement('presenceAvatars');
        if (!container) return;

        container.innerHTML = '';
        const now = Date.now();
        const TIMEOUT = 30000; // 30 seconds

        Object.entries(states).forEach(([clientId, state]) => {
            // Skip stale entries
            if (state.lastSeen && (now - state.lastSeen > TIMEOUT)) return;

            if (state.user) {
                const userName = state.user.name || 'User';
                const badge = document.createElement('span');
                badge.className = 'presence-badge';
                badge.textContent = userName;
                badge.style.backgroundColor = state.user.color || '#a0aec0';
                badge.style.color = 'white';
                badge.style.padding = '4px 10px';
                badge.style.borderRadius = '12px';
                badge.style.fontSize = '12px';
                badge.style.fontWeight = '500';
                badge.style.marginLeft = '6px';
                container.appendChild(badge);
            }
        });
    }

    uint8ArrayToBase64(uint8Array) {
        const CHUNK_SIZE = 0x8000;
        const chunks = [];
        for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
            chunks.push(String.fromCharCode.apply(null, uint8Array.subarray(i, i + CHUNK_SIZE)));
        }
        return btoa(chunks.join(''));
    }

    base64ToUint8Array(base64) {
        const binary = atob(base64);
        const uint8Array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            uint8Array[i] = binary.charCodeAt(i);
        }
        return uint8Array;
    }

    destroy() {
        if (this.awarenessInterval) {
            clearInterval(this.awarenessInterval);
        }
        this.docRef.off();
        this.awarenessRef.off();
        this.awarenessRef.child(this.clientId).remove();
    }
}

// Hide loading indicator
function hideLoading() {
    const loading = getElement('loadingIndicator');
    if (loading) {
        loading.style.display = 'none';
    }
}

// Initialize Tiptap editor
async function initEditor(ydoc, provider) {
    const fragment = ydoc.getXmlFragment('prosemirror');

    editor = new Editor({
        element: getElement('editor'),
        extensions: [
            StarterKit.configure({
                history: false, // Yjs handles history
            }),
            Collaboration.configure({
                document: ydoc,
                fragment: fragment
            }),
            CollaborationCursor.configure({
                provider: provider,
                user: {
                    name: currentUser.displayName || currentUser.email,
                    color: provider.userColor
                }
            }),
            Table.configure({
                resizable: true
            }),
            TableRow,
            TableCell,
            TableHeader,
            Link.configure({
                openOnClick: false
            }),
            Underline
        ],
        editorProps: {
            attributes: {
                class: 'tiptap'
            }
        }
    });

    // Set up toolbar buttons
    setupToolbar();

    hideLoading();

    return editor;
}

// Setup toolbar button handlers
function setupToolbar() {
    const buttons = {
        'btn-bold': () => editor.chain().focus().toggleBold().run(),
        'btn-italic': () => editor.chain().focus().toggleItalic().run(),
        'btn-underline': () => editor.chain().focus().toggleUnderline().run(),
        'btn-strike': () => editor.chain().focus().toggleStrike().run(),
        'btn-code': () => editor.chain().focus().toggleCode().run(),
        'btn-h1': () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        'btn-h2': () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        'btn-h3': () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        'btn-paragraph': () => editor.chain().focus().setParagraph().run(),
        'btn-bullet-list': () => editor.chain().focus().toggleBulletList().run(),
        'btn-ordered-list': () => editor.chain().focus().toggleOrderedList().run(),
        'btn-code-block': () => editor.chain().focus().toggleCodeBlock().run(),
        'btn-blockquote': () => editor.chain().focus().toggleBlockquote().run(),
        'btn-hr': () => editor.chain().focus().setHorizontalRule().run(),
        'btn-undo': () => editor.chain().focus().undo().run(),
        'btn-redo': () => editor.chain().focus().redo().run(),
        'btn-table': () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        'btn-table-add-row': () => editor.chain().focus().addRowAfter().run(),
        'btn-table-add-col': () => editor.chain().focus().addColumnAfter().run(),
        'btn-table-delete-row': () => editor.chain().focus().deleteRow().run(),
        'btn-table-delete-col': () => editor.chain().focus().deleteColumn().run(),
        'btn-table-delete': () => editor.chain().focus().deleteTable().run(),
        'btn-link': () => {
            const url = prompt('Enter URL:');
            if (url) {
                editor.chain().focus().setLink({ href: url }).run();
            }
        },
        'btn-unlink': () => editor.chain().focus().unsetLink().run(),
    };

    Object.entries(buttons).forEach(([id, handler]) => {
        const btn = getElement(id);
        if (btn) {
            btn.addEventListener('click', handler);
        }
    });

    // Update active states
    editor.on('selectionUpdate', updateToolbarState);
    editor.on('update', updateToolbarState);
}

// Update toolbar button active states and enable/disable table ops
function updateToolbarState() {
    if (!editor) return;

    const activeStates = {
        'btn-bold': editor.isActive('bold'),
        'btn-italic': editor.isActive('italic'),
        'btn-underline': editor.isActive('underline'),
        'btn-strike': editor.isActive('strike'),
        'btn-code': editor.isActive('code'),
        'btn-h1': editor.isActive('heading', { level: 1 }),
        'btn-h2': editor.isActive('heading', { level: 2 }),
        'btn-h3': editor.isActive('heading', { level: 3 }),
        'btn-paragraph': editor.isActive('paragraph'),
        'btn-bullet-list': editor.isActive('bulletList'),
        'btn-ordered-list': editor.isActive('orderedList'),
        'btn-code-block': editor.isActive('codeBlock'),
        'btn-blockquote': editor.isActive('blockquote'),
    };

    Object.entries(activeStates).forEach(([id, isActive]) => {
        const btn = getElement(id);
        if (btn) {
            btn.classList.toggle('is-active', isActive);
        }
    });

    // Enable table operation buttons only when cursor is inside a table
    const inTable = editor.isActive('table');
    ['btn-table-add-row', 'btn-table-add-col', 'btn-table-delete-row', 'btn-table-delete-col', 'btn-table-delete'].forEach(id => {
        const btn = getElement(id);
        if (btn) {
            btn.disabled = !inTable;
        }
    });
}

// Publish content to Firebase htmlCache and optionally to GitHub
async function publishContent() {
    if (!editor) return;

    const html = editor.getHTML();
    const db = firebase.database();
    let firebaseSuccess = false;
    let githubSuccess = false;
    let githubError = null;

    try {
        // Step 1: Publish to Firebase
        showStatus('Publishing to Firebase...', 'loading');
        await db.ref('documentation/htmlCache').set({
            content: html,
            updatedAt: firebase.database.ServerValue.TIMESTAMP,
            updatedBy: currentUser.email
        });
        firebaseSuccess = true;

        // Step 2: Publish to GitHub if token is configured
        const githubToken = await getGitHubToken();
        if (githubToken) {
            showStatus('Publishing to GitHub...', 'loading');
            try {
                await updateGitHubFile(html, 'Update documentation via collaborative editor');
                githubSuccess = true;
            } catch (error) {
                githubError = error;
                console.error('GitHub publish error:', error);
            }
        }

        // Show final status
        if (firebaseSuccess && githubSuccess) {
            showStatus('Published to Firebase and GitHub!', 'success');
        } else if (firebaseSuccess && !githubToken) {
            showStatus('Published to Firebase. (GitHub not configured)', 'info');
        } else if (firebaseSuccess && githubError) {
            showStatus('Published to Firebase. GitHub failed: ' + githubError.message, 'error');
        }
        setTimeout(hideStatus, 5000);
    } catch (error) {
        console.error('Publish error:', error);
        showStatus('Failed to publish: ' + error.message, 'error');
    }
}

// Load initial content only when the Yjs document is empty (no remote state yet).
// Uses try/catch because setContent(html) can throw "Unexpected content type" if
// the HTML or cached content doesn't match the collaboration schema.
async function loadInitialContent(provider) {
    if (!editor || !ydoc) return;

    const fragment = ydoc.getXmlFragment('prosemirror');
    const isEmpty = fragment.length === 0 || (fragment.length === 1 && fragment.toArray()[0].length === 0);

    if (!isEmpty) {
        // Document has content, but check if htmlCache is newer
        await checkForNewerCache();
        return;
    }

    const db = firebase.database();
    try {
        const cacheSnapshot = await db.ref('documentation/htmlCache').once('value');
        if (cacheSnapshot.exists()) {
            const data = cacheSnapshot.val();
            if (data && data.content && typeof data.content === 'string') {
                try {
                    editor.commands.setContent(data.content);
                    lastKnownCacheTimestamp = data.updatedAt || 0;
                } catch (e) {
                    console.warn('Failed to set content from cache:', e?.message || e);
                }
            }
            return;
        }

        // Fetch with cache busting
        const cacheBuster = Date.now();
        const response = await fetch('documentation.html?_=' + cacheBuster, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
        });
        if (response.ok) {
            const html = await response.text();
            const mainMatch = html.match(/<main[^>]*id="mainContent"[^>]*>([\s\S]*?)<\/main>/i) ||
                             html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
            if (mainMatch && mainMatch[1]) {
                try {
                    editor.commands.setContent(mainMatch[1]);
                } catch (e) {
                    console.warn('Failed to set content from HTML:', e?.message || e);
                    return;
                }
                await db.ref('documentation/htmlCache').set({
                    content: mainMatch[1],
                    updatedAt: firebase.database.ServerValue.TIMESTAMP,
                    updatedBy: 'migration'
                });
            }
        }
    } catch (error) {
        console.warn('Failed to load initial content (doc may already be synced):', error?.message || error);
    }
}

// Check if Firebase htmlCache has newer content than what we have
async function checkForNewerCache() {
    const db = firebase.database();
    try {
        const cacheSnapshot = await db.ref('documentation/htmlCache').once('value');
        if (cacheSnapshot.exists()) {
            const data = cacheSnapshot.val();
            const cacheTimestamp = data.updatedAt || 0;

            // If cache is newer and was updated by github-actions or manual-fix, prompt to refresh
            if (cacheTimestamp > lastKnownCacheTimestamp &&
                (data.updatedBy === 'github-actions' || data.updatedBy === 'manual-fix')) {
                lastKnownCacheTimestamp = cacheTimestamp;
                const shouldRefresh = confirm(
                    'A newer version of the documentation was pushed to GitHub. ' +
                    'Would you like to load it? (This will replace the current editor content)'
                );
                if (shouldRefresh) {
                    await forceRefreshFromCache();
                }
            }
        }
    } catch (error) {
        console.error('Error checking for newer cache:', error);
    }
}

// Force refresh content from Firebase htmlCache
async function forceRefreshFromCache() {
    if (!editor) return false;

    const db = firebase.database();
    try {
        showStatus('Refreshing content from source...', 'loading');

        const cacheSnapshot = await db.ref('documentation/htmlCache').once('value');
        if (cacheSnapshot.exists()) {
            const data = cacheSnapshot.val();
            if (data.content) {
                editor.commands.setContent(data.content);
                lastKnownCacheTimestamp = data.updatedAt || 0;
                showStatus('Content refreshed successfully!', 'success');
                setTimeout(hideStatus, 3000);
                return true;
            }
        }

        showStatus('No cached content found', 'error');
        setTimeout(hideStatus, 3000);
        return false;
    } catch (error) {
        console.error('Failed to refresh from cache:', error);
        showStatus('Failed to refresh: ' + error.message, 'error');
        return false;
    }
}

// Force refresh from documentation.html file (bypasses all caches)
async function forceRefreshFromFile() {
    if (!editor) return false;

    const db = firebase.database();
    try {
        showStatus('Fetching fresh content from file...', 'loading');

        const cacheBuster = Date.now();
        const response = await fetch('documentation.html?_=' + cacheBuster, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });

        if (response.ok) {
            const html = await response.text();
            const mainMatch = html.match(/<main[^>]*id="mainContent"[^>]*>([\s\S]*?)<\/main>/i) ||
                             html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
            if (mainMatch && mainMatch[1]) {
                editor.commands.setContent(mainMatch[1]);

                // Update Firebase cache too
                await db.ref('documentation/htmlCache').set({
                    content: mainMatch[1],
                    updatedAt: firebase.database.ServerValue.TIMESTAMP,
                    updatedBy: currentUser ? currentUser.email : 'refresh'
                });
                lastKnownCacheTimestamp = Date.now();

                showStatus('Content refreshed from file!', 'success');
                setTimeout(hideStatus, 3000);
                return true;
            }
        }

        showStatus('Failed to fetch file', 'error');
        return false;
    } catch (error) {
        console.error('Failed to refresh from file:', error);
        showStatus('Failed to refresh: ' + error.message, 'error');
        return false;
    }
}

// Clear Yjs document state and reload (nuclear option)
async function resetEditorState() {
    if (!confirm('This will clear all collaborative editing state and reload from the latest cache. Continue?')) {
        return;
    }

    const db = firebase.database();
    try {
        showStatus('Resetting editor state...', 'loading');

        // Clear the Yjs document in Firebase (path must match FirebaseYjsProvider)
        await db.ref('documentation/yjs/content').remove();

        // Reload the page
        window.location.reload();
    } catch (error) {
        console.error('Failed to reset state:', error);
        showStatus('Failed to reset: ' + error.message, 'error');
    }
}

// Auth state listener
// Track session to prevent duplicate logins
async function trackSession(user) {
    const db = firebase.database();
    const encodedEmail = encodeEmail(user.email);
    sessionRef = db.ref('sessions/' + encodedEmail);

    // Generate unique session ID for this window
    sessionId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);

    // Set this session as active
    await sessionRef.set(sessionId);

    // Remove session on disconnect
    sessionRef.onDisconnect().remove();

    // Listen for session changes (another window signed in)
    sessionListener = sessionRef.on('value', (snapshot) => {
        const activeSession = snapshot.val();
        // If session changed and it's not ours, sign out
        if (activeSession && activeSession !== sessionId) {
            sessionRef.off('value', sessionListener);
            sessionListener = null;
            showStatus('You signed in from another window. This session will be closed.', 'error');
            setTimeout(() => signOut(), 2000);
        }
    });
}

function initAuthListener() {
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            updateAuthUI(user);

            // Check authorization
            const authorized = await checkAuthorization(user);

            if (authorized) {
                isAuthorized = true;
                showEditorContainer();

                // Track this session (will sign out old windows)
                await trackSession(user);

                // Create Yjs document
                ydoc = new Y.Doc();

                // Initialize Firebase provider
                provider = new FirebaseYjsProvider(ydoc, 'content', user);
                awareness = provider.awareness;

                // Wait for provider sync before initializing editor
                provider.whenSynced.then(async () => {
                    await initEditor(ydoc, provider);
                    await loadInitialContent(provider);
                });
            } else {
                showAccessDenied();
            }
        } else {
            currentUser = null;
            isAuthorized = false;
            showAuthContainer();
        }
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    initAuthListener();
});

// Expose functions globally
window.signInWithGoogle = signInWithGoogle;
window.signOut = signOut;
window.publishContent = publishContent;
window.showGitHubConfig = showGitHubConfig;
window.hideGitHubModal = hideGitHubModal;
window.saveGitHubConfig = saveGitHubConfig;
window.clearGitHubConfig = clearGitHubConfig;
window.forceRefreshFromCache = forceRefreshFromCache;
window.forceRefreshFromFile = forceRefreshFromFile;
window.resetEditorState = resetEditorState;
