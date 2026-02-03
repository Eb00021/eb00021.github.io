// Collaborative Editor with Tiptap + Yjs + Firebase
// This module handles real-time collaborative editing

// Editor state
let editor = null;
let ydoc = null;
let provider = null;
let currentUser = null;
let isAuthorized = false;

// DOM Elements
const elements = {
    authContainer: () => document.getElementById('authContainer'),
    editorContainer: () => document.getElementById('editorContainer'),
    userInfo: () => document.getElementById('userInfo'),
    userAvatar: () => document.getElementById('userAvatar'),
    userName: () => document.getElementById('userName'),
    userEmail: () => document.getElementById('userEmail'),
    statusBar: () => document.getElementById('statusBar'),
    saveIndicator: () => document.getElementById('saveIndicator'),
    presenceAvatars: () => document.getElementById('presenceAvatars'),
    editorElement: () => document.getElementById('editor'),
    loadingIndicator: () => document.getElementById('loadingIndicator'),
    accessDenied: () => document.getElementById('accessDenied'),
};

// Initialize Firebase
function initFirebase() {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
}

// Show status message
function showStatus(message, type) {
    const statusBar = elements.statusBar();
    if (statusBar) {
        statusBar.textContent = message;
        statusBar.className = 'status-bar status-' + type;
    }
}

function hideStatus() {
    const statusBar = elements.statusBar();
    if (statusBar) {
        statusBar.className = 'status-bar';
    }
}

// Update save indicator
function updateSaveIndicator(state) {
    const indicator = elements.saveIndicator();
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
        if (provider) {
            provider.destroy();
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

// Update UI for authenticated user
function updateAuthUI(user) {
    const avatar = elements.userAvatar();
    const name = elements.userName();
    const email = elements.userEmail();

    if (avatar) avatar.src = user.photoURL || 'https://via.placeholder.com/32';
    if (name) name.textContent = user.displayName || 'User';
    if (email) email.textContent = user.email;
}

// Show/hide containers
function showAuthContainer() {
    const auth = elements.authContainer();
    const editor = elements.editorContainer();
    const denied = elements.accessDenied();

    if (auth) auth.style.display = 'block';
    if (editor) editor.style.display = 'none';
    if (denied) denied.style.display = 'none';
}

function showEditorContainer() {
    const auth = elements.authContainer();
    const editor = elements.editorContainer();
    const denied = elements.accessDenied();

    if (auth) auth.style.display = 'none';
    if (editor) editor.style.display = 'block';
    if (denied) denied.style.display = 'none';
}

function showAccessDenied() {
    const auth = elements.authContainer();
    const editor = elements.editorContainer();
    const denied = elements.accessDenied();

    if (auth) auth.style.display = 'none';
    if (editor) editor.style.display = 'none';
    if (denied) denied.style.display = 'block';
}

// Generate a random color for cursor
function getRandomColor() {
    const colors = [
        '#f44336', '#e91e63', '#9c27b0', '#673ab7',
        '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
        '#009688', '#4caf50', '#8bc34a', '#cddc39',
        '#ff9800', '#ff5722', '#795548'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Initialize Yjs and Firebase provider
async function initCollaboration(user) {
    const { Doc } = Y;
    const { FirebaseProvider } = YFirebase;

    // Create Yjs document
    ydoc = new Doc();

    // Connect to Firebase
    const db = firebase.database();

    // Initialize Firebase provider
    provider = new FirebaseProvider(firebaseConfig, 'documentation', ydoc, {
        awareness: {
            user: {
                name: user.displayName || user.email,
                color: getRandomColor(),
                photoURL: user.photoURL
            }
        }
    });

    // Handle connection status
    provider.on('status', (event) => {
        if (event.status === 'connected') {
            updateSaveIndicator('saved');
        } else if (event.status === 'disconnected') {
            updateSaveIndicator('error');
        }
    });

    // Handle sync
    provider.on('sync', (isSynced) => {
        if (isSynced) {
            updateSaveIndicator('saved');
            hideLoading();
        }
    });

    return { ydoc, provider };
}

// Update presence display
function updatePresence() {
    if (!provider || !provider.awareness) return;

    const avatarsContainer = elements.presenceAvatars();
    if (!avatarsContainer) return;

    avatarsContainer.innerHTML = '';

    const states = provider.awareness.getStates();
    states.forEach((state, clientId) => {
        if (state.user) {
            const avatar = document.createElement('img');
            avatar.className = 'presence-avatar';
            avatar.src = state.user.photoURL || 'https://via.placeholder.com/28';
            avatar.alt = state.user.name;
            avatar.dataset.name = state.user.name;
            avatar.style.borderColor = state.user.color;
            avatarsContainer.appendChild(avatar);
        }
    });
}

// Hide loading indicator
function hideLoading() {
    const loading = elements.loadingIndicator();
    if (loading) {
        loading.style.display = 'none';
    }
}

// Initialize Tiptap editor
async function initEditor(ydoc, provider) {
    const { Editor } = Tiptap;
    const {
        StarterKit,
        Collaboration,
        CollaborationCursor,
        Table,
        TableRow,
        TableCell,
        TableHeader,
        CodeBlockLowlight,
        Link,
        Underline
    } = TiptapExtensions;

    // Get the XML fragment from Yjs
    const fragment = ydoc.getXmlFragment('prosemirror');

    editor = new Editor({
        element: elements.editorElement(),
        extensions: [
            StarterKit.configure({
                history: false, // Yjs handles history
                codeBlock: false, // Use CodeBlockLowlight instead
            }),
            Collaboration.configure({
                document: ydoc,
                fragment: fragment
            }),
            CollaborationCursor.configure({
                provider: provider,
                user: {
                    name: currentUser.displayName || currentUser.email,
                    color: getRandomColor()
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
        },
        onUpdate: () => {
            updateSaveIndicator('saving');
            // Firebase provider auto-syncs, so we just update indicator
            setTimeout(() => updateSaveIndicator('saved'), 500);
        }
    });

    // Set up toolbar buttons
    setupToolbar();

    // Update presence on awareness changes
    if (provider.awareness) {
        provider.awareness.on('change', updatePresence);
        updatePresence();
    }

    return editor;
}

// Setup toolbar button handlers
function setupToolbar() {
    // Bold
    document.getElementById('btn-bold')?.addEventListener('click', () => {
        editor.chain().focus().toggleBold().run();
    });

    // Italic
    document.getElementById('btn-italic')?.addEventListener('click', () => {
        editor.chain().focus().toggleItalic().run();
    });

    // Underline
    document.getElementById('btn-underline')?.addEventListener('click', () => {
        editor.chain().focus().toggleUnderline().run();
    });

    // Strike
    document.getElementById('btn-strike')?.addEventListener('click', () => {
        editor.chain().focus().toggleStrike().run();
    });

    // Code
    document.getElementById('btn-code')?.addEventListener('click', () => {
        editor.chain().focus().toggleCode().run();
    });

    // Headings
    document.getElementById('btn-h1')?.addEventListener('click', () => {
        editor.chain().focus().toggleHeading({ level: 1 }).run();
    });

    document.getElementById('btn-h2')?.addEventListener('click', () => {
        editor.chain().focus().toggleHeading({ level: 2 }).run();
    });

    document.getElementById('btn-h3')?.addEventListener('click', () => {
        editor.chain().focus().toggleHeading({ level: 3 }).run();
    });

    // Paragraph
    document.getElementById('btn-paragraph')?.addEventListener('click', () => {
        editor.chain().focus().setParagraph().run();
    });

    // Lists
    document.getElementById('btn-bullet-list')?.addEventListener('click', () => {
        editor.chain().focus().toggleBulletList().run();
    });

    document.getElementById('btn-ordered-list')?.addEventListener('click', () => {
        editor.chain().focus().toggleOrderedList().run();
    });

    // Code Block
    document.getElementById('btn-code-block')?.addEventListener('click', () => {
        editor.chain().focus().toggleCodeBlock().run();
    });

    // Blockquote
    document.getElementById('btn-blockquote')?.addEventListener('click', () => {
        editor.chain().focus().toggleBlockquote().run();
    });

    // Horizontal Rule
    document.getElementById('btn-hr')?.addEventListener('click', () => {
        editor.chain().focus().setHorizontalRule().run();
    });

    // Undo/Redo (via Yjs)
    document.getElementById('btn-undo')?.addEventListener('click', () => {
        editor.chain().focus().undo().run();
    });

    document.getElementById('btn-redo')?.addEventListener('click', () => {
        editor.chain().focus().redo().run();
    });

    // Table operations
    document.getElementById('btn-table')?.addEventListener('click', () => {
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    });

    // Link
    document.getElementById('btn-link')?.addEventListener('click', () => {
        const url = prompt('Enter URL:');
        if (url) {
            editor.chain().focus().setLink({ href: url }).run();
        }
    });

    // Update active states
    editor.on('selectionUpdate', updateToolbarState);
    editor.on('update', updateToolbarState);
}

// Update toolbar button active states
function updateToolbarState() {
    if (!editor) return;

    const buttons = {
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

    Object.entries(buttons).forEach(([id, isActive]) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.classList.toggle('is-active', isActive);
        }
    });
}

// Export content to HTML (for publishing to documentation.html)
function exportToHtml() {
    if (!editor) return '';
    return editor.getHTML();
}

// Publish content to Firebase htmlCache (for documentation.html to read)
async function publishContent() {
    if (!editor) return;

    const html = editor.getHTML();
    const db = firebase.database();

    try {
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
async function loadInitialContent() {
    const fragment = ydoc.getXmlFragment('prosemirror');

    // If document is empty, try to load from htmlCache or fetch from documentation.html
    if (fragment.length === 0) {
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
                const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
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
}

// Auth state listener
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

                // Initialize collaboration
                const { ydoc: doc, provider: prov } = await initCollaboration(user);
                ydoc = doc;
                provider = prov;

                // Initialize editor
                await initEditor(ydoc, provider);

                // Load initial content if needed
                setTimeout(loadInitialContent, 1000);
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
window.exportToHtml = exportToHtml;
