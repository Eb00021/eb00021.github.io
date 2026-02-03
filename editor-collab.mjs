// Collaborative Editor with Tiptap + Yjs + Firebase
// ES Module version for proper imports

import { Editor } from 'https://esm.sh/@tiptap/core@2.1.13';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.1.13';
import Collaboration from 'https://esm.sh/@tiptap/extension-collaboration@2.1.13';
import CollaborationCursor from 'https://esm.sh/@tiptap/extension-collaboration-cursor@2.1.13';
import Table from 'https://esm.sh/@tiptap/extension-table@2.1.13';
import TableRow from 'https://esm.sh/@tiptap/extension-table-row@2.1.13';
import TableCell from 'https://esm.sh/@tiptap/extension-table-cell@2.1.13';
import TableHeader from 'https://esm.sh/@tiptap/extension-table-header@2.1.13';
import Link from 'https://esm.sh/@tiptap/extension-link@2.1.13';
import Underline from 'https://esm.sh/@tiptap/extension-underline@2.1.13';
import * as Y from 'https://esm.sh/yjs@13.6.8';
import { Awareness } from 'https://esm.sh/y-protocols@1.0.6/awareness';

// Editor state
let editor = null;
let ydoc = null;
let currentUser = null;
let isAuthorized = false;
let awareness = null;
let firebaseUnsubscribe = null;
let sessionId = null;
let sessionListener = null;

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

// Google Sign In
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
        if (firebaseUnsubscribe) {
            firebaseUnsubscribe();
        }
        if (editor) {
            editor.destroy();
        }
        await firebase.auth().signOut();
        window.location.reload();
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
                        console.error('Error applying update:', e);
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
            console.error('Error loading document:', e);
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
        let binary = '';
        uint8Array.forEach(byte => binary += String.fromCharCode(byte));
        return btoa(binary);
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
                provider: {
                    awareness: provider.awareness
                },
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
        'btn-link': () => {
            const url = prompt('Enter URL:');
            if (url) {
                editor.chain().focus().setLink({ href: url }).run();
            }
        }
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

// Update toolbar button active states
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
}

// Publish content to Firebase htmlCache (for documentation.html to read)
async function publishContent() {
    if (!editor) return;

    const html = editor.getHTML();
    const db = firebase.database();

    try {
        showStatus('Publishing...', 'loading');
        await db.ref('documentation/htmlCache').set({
            content: html,
            updatedAt: firebase.database.ServerValue.TIMESTAMP,
            updatedBy: currentUser.email
        });
        showStatus('Content published successfully!', 'success');
        setTimeout(hideStatus, 3000);
    } catch (error) {
        console.error('Publish error:', error);
        showStatus('Failed to publish: ' + error.message, 'error');
    }
}

// Load initial content if document is empty
async function loadInitialContent(provider) {
    const fragment = ydoc.getXmlFragment('prosemirror');

    // Check if document is empty after a short delay
    setTimeout(async () => {
        if (fragment.length === 0 || (fragment.length === 1 && fragment.toArray()[0].length === 0)) {
            const db = firebase.database();

            try {
                // First try to load from Firebase htmlCache
                const cacheSnapshot = await db.ref('documentation/htmlCache/content').once('value');
                if (cacheSnapshot.exists()) {
                    editor.commands.setContent(cacheSnapshot.val());
                    return;
                }

                // If no cache, fetch from documentation.html
                const response = await fetch('documentation.html');
                if (response.ok) {
                    const html = await response.text();
                    // Extract main content
                    const mainMatch = html.match(/<main[^>]*id="mainContent"[^>]*>([\s\S]*?)<\/main>/i) ||
                                     html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
                    if (mainMatch) {
                        editor.commands.setContent(mainMatch[1]);
                        // Also save to htmlCache
                        await db.ref('documentation/htmlCache').set({
                            content: mainMatch[1],
                            updatedAt: firebase.database.ServerValue.TIMESTAMP,
                            updatedBy: 'migration'
                        });
                    }
                }
            } catch (error) {
                console.error('Failed to load initial content:', error);
            }
        }
    }, 1000);
}

// Auth state listener
// Track session to prevent duplicate logins
async function trackSession(user) {
    const db = firebase.database();
    const encodedEmail = encodeEmail(user.email);
    const sessionRef = db.ref('sessions/' + encodedEmail);

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
            alert('You signed in from another window. This session will be closed.');
            signOut();
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
                const provider = new FirebaseYjsProvider(ydoc, 'content', user);
                awareness = provider.awareness;

                // Initialize editor after a short delay to let the doc sync
                setTimeout(async () => {
                    await initEditor(ydoc, provider);
                    loadInitialContent(provider);
                }, 500);
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
