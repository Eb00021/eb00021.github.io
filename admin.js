// Admin Page Logic
// Manages team member whitelist for collaborative editing

let currentUser = null;

// DOM Elements
const elements = {
    authContainer: () => document.getElementById('authContainer'),
    adminContainer: () => document.getElementById('adminContainer'),
    accessDenied: () => document.getElementById('accessDenied'),
    deniedEmail: () => document.getElementById('deniedEmail'),
    userAvatar: () => document.getElementById('userAvatar'),
    userName: () => document.getElementById('userName'),
    userEmail: () => document.getElementById('userEmail'),
    usersList: () => document.getElementById('usersList'),
    statusBar: () => document.getElementById('statusBar'),
    adminEmailDisplay: () => document.getElementById('adminEmailDisplay'),
    newUserEmail: () => document.getElementById('newUserEmail'),
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
        await firebase.auth().signOut();
        window.location.reload();
    } catch (error) {
        console.error('Sign out error:', error);
    }
}

// Encode email for Firebase path (replace . with ,)
function encodeEmail(email) {
    return email.replace(/\./g, ',');
}

// Decode email from Firebase path (replace , with .)
function decodeEmail(encoded) {
    return encoded.replace(/,/g, '.');
}

// Check if user is admin
function isAdmin(email) {
    return email === ADMIN_EMAIL;
}

// Default avatar as data URI
const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#a0aec0"/><circle cx="16" cy="12" r="5" fill="#fff"/><path d="M16 19c-5 0-9 2.5-9 6v3h18v-3c0-3.5-4-6-9-6z" fill="#fff"/></svg>');

// Update UI for authenticated user
function updateAuthUI(user) {
    const avatar = elements.userAvatar();
    const name = elements.userName();
    const email = elements.userEmail();
    const adminDisplay = elements.adminEmailDisplay();

    if (avatar) {
        avatar.src = user.photoURL || DEFAULT_AVATAR;
        avatar.onerror = () => { avatar.src = DEFAULT_AVATAR; };
    }
    if (name) name.textContent = user.displayName || 'User';
    if (email) email.textContent = user.email;
    if (adminDisplay) adminDisplay.textContent = ADMIN_EMAIL;
}

// Show/hide containers
function showAuthContainer() {
    elements.authContainer().style.display = 'block';
    elements.adminContainer().style.display = 'none';
    elements.accessDenied().style.display = 'none';
}

function showAdminContainer() {
    elements.authContainer().style.display = 'none';
    elements.adminContainer().style.display = 'block';
    elements.accessDenied().style.display = 'none';
}

function showAccessDenied(email) {
    elements.authContainer().style.display = 'none';
    elements.adminContainer().style.display = 'none';
    elements.accessDenied().style.display = 'block';
    elements.deniedEmail().textContent = email;
}

// Load users list
async function loadUsers() {
    const db = firebase.database();
    const usersList = elements.usersList();

    try {
        const snapshot = await db.ref('users').once('value');
        const users = snapshot.val();

        usersList.innerHTML = '';

        if (!users || Object.keys(users).length === 0) {
            usersList.innerHTML = '<li class="no-users">No team members added yet.</li>';
            return;
        }

        Object.entries(users).forEach(([encodedEmail, userData]) => {
            const email = decodeEmail(encodedEmail);
            const li = document.createElement('li');

            const addedDate = userData.addedAt
                ? new Date(userData.addedAt).toLocaleDateString()
                : 'Unknown';

            const userDetails = document.createElement('div');
            userDetails.className = 'user-details';

            const userName = document.createElement('span');
            userName.className = 'user-name';
            userName.textContent = userData.name || email;

            const userAddedInfo = document.createElement('span');
            userAddedInfo.className = 'user-added-info';
            userAddedInfo.textContent = `Added ${addedDate} by ${userData.addedBy || 'admin'}`;

            userDetails.appendChild(userName);
            userDetails.appendChild(userAddedInfo);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-danger btn-small';
            removeBtn.textContent = 'Remove';
            removeBtn.addEventListener('click', () => removeUser(encodedEmail));

            li.appendChild(userDetails);
            li.appendChild(removeBtn);
            usersList.appendChild(li);
        });
    } catch (error) {
        console.error('Error loading users:', error);
        usersList.innerHTML = '<li class="no-users">Error loading users.</li>';
    }
}

// Add a new user
async function addUser(event) {
    event.preventDefault();

    const emailInput = elements.newUserEmail();
    const email = emailInput.value.trim().toLowerCase();

    if (!email) {
        showStatus('Please enter an email address.', 'error');
        return;
    }

    // Check if it's the admin email
    if (email === ADMIN_EMAIL) {
        showStatus('Admin is already authorized by default.', 'info');
        emailInput.value = '';
        return;
    }

    const db = firebase.database();
    const encodedEmail = encodeEmail(email);

    try {
        // Check if user already exists
        const existing = await db.ref('users/' + encodedEmail).once('value');
        if (existing.exists()) {
            showStatus('User already has access.', 'info');
            emailInput.value = '';
            return;
        }

        // Add user
        await db.ref('users/' + encodedEmail).set({
            email: email,
            name: email.split('@')[0],
            addedAt: firebase.database.ServerValue.TIMESTAMP,
            addedBy: currentUser.email
        });

        showStatus('User added successfully!', 'success');
        emailInput.value = '';
        setTimeout(hideStatus, 3000);

        // Reload list
        loadUsers();
    } catch (error) {
        console.error('Error adding user:', error);
        showStatus('Failed to add user: ' + error.message, 'error');
    }
}

// Remove a user
async function removeUser(encodedEmail) {
    const email = decodeEmail(encodedEmail);

    if (!confirm(`Remove ${email} from the team?`)) {
        return;
    }

    const db = firebase.database();

    try {
        await db.ref('users/' + encodedEmail).remove();
        showStatus('User removed.', 'success');
        setTimeout(hideStatus, 3000);
        loadUsers();
    } catch (error) {
        console.error('Error removing user:', error);
        showStatus('Failed to remove user: ' + error.message, 'error');
    }
}

// Auth state listener
function initAuthListener() {
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;

            if (isAdmin(user.email)) {
                updateAuthUI(user);
                showAdminContainer();
                loadUsers();
            } else {
                showAccessDenied(user.email);
            }
        } else {
            currentUser = null;
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
window.addUser = addUser;
window.removeUser = removeUser;
