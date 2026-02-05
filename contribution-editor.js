// Contribution Selection Editor
// Assign contributions to team members; data in data/contributions.json, assignments in Firebase.

let currentUser = null;
let contributionsData = null;
let teamMembers = [];
let assignments = {};

const ASSIGNMENTS_REF = 'contributions/assignments';
const UNASSIGNED = '';

function encodeEmail(email) {
    return email.replace(/\./g, ',');
}

function decodeEmail(encoded) {
    return encoded.replace(/,/g, '.');
}

function initFirebase() {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
}

function showStatus(message, type) {
    const el = document.getElementById('statusBar');
    if (el) {
        el.textContent = message;
        el.className = 'status-bar status-' + (type || '');
    }
}

function hideStatus() {
    const el = document.getElementById('statusBar');
    if (el) el.className = 'status-bar';
}

function isAuthorized(email) {
    if (email === ADMIN_EMAIL) return true;
    const encoded = encodeEmail(email);
    return teamMembers.some(function (m) { return m.email === email || encodeEmail(m.email) === encoded; });
}

async function signInWithGoogle() {
    try {
        var provider = new firebase.auth.GoogleAuthProvider();
        await firebase.auth().signInWithPopup(provider);
    } catch (err) {
        console.error(err);
        showStatus('Sign in failed: ' + err.message, 'error');
    }
}

function signOut() {
    firebase.auth().signOut().then(function () { window.location.reload(); }).catch(console.error);
}

function showAuth() {
    document.getElementById('authContainer').style.display = 'block';
    document.getElementById('editorContainer').style.display = 'none';
    document.getElementById('accessDenied').style.display = 'none';
}

function showDenied(email) {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('editorContainer').style.display = 'none';
    document.getElementById('accessDenied').style.display = 'block';
    document.getElementById('deniedEmail').textContent = email;
}

function showEditor() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('accessDenied').style.display = 'none';
    document.getElementById('editorContainer').style.display = 'block';
}

function getContributionId(releaseId, rowIndex) {
    return releaseId + '-' + rowIndex;
}

function buildTeamOptions() {
    var opts = '<option value="">Unassigned</option>';
    teamMembers.forEach(function (m) {
        var label = (m.name || m.email) + ' (' + m.email + ')';
        opts += '<option value="' + escapeHtml(m.email) + '">' + escapeHtml(label) + '</option>';
    });
    if (typeof ADMIN_EMAIL !== 'undefined' && ADMIN_EMAIL && !teamMembers.some(function (m) { return m.email === ADMIN_EMAIL; })) {
        opts += '<option value="' + escapeHtml(ADMIN_EMAIL) + '">' + escapeHtml(ADMIN_EMAIL + ' (admin)') + '</option>';
    }
    return opts;
}

function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

function renderTables() {
    if (!contributionsData || !contributionsData.releases) return;
    var root = document.getElementById('contributionsRoot');
    if (!root) return;
    root.innerHTML = '';

    contributionsData.releases.forEach(function (release) {
        var section = document.createElement('div');
        section.className = 'contrib-section';
        var h2 = document.createElement('h2');
        h2.textContent = release.title;
        section.appendChild(h2);

        var table = document.createElement('table');
        table.className = 'contrib-table';
        table.innerHTML = '<thead><tr><th>Task</th><th>Description</th><th>Files</th><th>Assigned to</th></tr></thead><tbody></tbody>';
        var tbody = table.querySelector('tbody');

        release.rows.forEach(function (row, idx) {
            var id = getContributionId(release.id, idx);
            var current = assignments[id];
            var currentEmail = (current && (typeof current === 'string' ? current : current.email)) || '';
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + escapeHtml(row.task) + '</td>' +
                '<td>' + escapeHtml(row.description) + '</td>' +
                '<td>' + escapeHtml(row.files) + '</td>' +
                '<td><select data-contribution-id="' + escapeHtml(id) + '">' + buildTeamOptions() + '</select></td>';
            var sel = tr.querySelector('select');
            sel.value = currentEmail;
            sel.addEventListener('change', function () {
                onAssignmentChange(id, this.value);
            });
            tbody.appendChild(tr);
        });

        section.appendChild(table);
        root.appendChild(section);
    });
}

function onAssignmentChange(contributionId, email) {
    var displayName = '';
    if (email) {
        var m = teamMembers.find(function (x) { return x.email === email; });
        if (m) displayName = m.name || m.email;
        else if (email === ADMIN_EMAIL) displayName = 'Admin';
        else displayName = email.split('@')[0];
    }

    var db = firebase.database();
    var ref = db.ref(ASSIGNMENTS_REF + '/' + contributionId);

    if (!email) {
        ref.remove()
            .then(function () {
                assignments[contributionId] = null;
                delete assignments[contributionId];
                showStatus('Assignment removed.', 'success');
                setTimeout(hideStatus, 2000);
            })
            .catch(function (err) {
                showStatus('Error: ' + err.message, 'error');
            });
        return;
    }

    ref.set({ email: email, displayName: displayName })
        .then(function () {
            assignments[contributionId] = { email: email, displayName: displayName };
            showStatus('Saved.', 'success');
            setTimeout(hideStatus, 2000);
        })
        .catch(function (err) {
            showStatus('Error: ' + err.message, 'error');
        });
}

function loadAssignments() {
    return firebase.database().ref(ASSIGNMENTS_REF).once('value').then(function (snap) {
        assignments = snap.val() || {};
        return assignments;
    });
}

function loadUsers() {
    return firebase.database().ref('users').once('value').then(function (snap) {
        var val = snap.val();
        teamMembers = [];
        if (val) {
            Object.keys(val).forEach(function (encodedEmail) {
                var u = val[encodedEmail];
                teamMembers.push({
                    email: u.email || decodeEmail(encodedEmail),
                    name: u.name || (u.email ? u.email.split('@')[0] : decodeEmail(encodedEmail))
                });
            });
        }
        return teamMembers;
    }).catch(function (err) {
        console.warn('Could not load users (may need rules update):', err.message);
        teamMembers = [];
        return teamMembers;
    });
}

function loadContributions() {
    var db = firebase.database();
    return db.ref('contributions/definition').once('value').then(function (snap) {
        var val = snap.val();
        if (val && val.releases && val.releases.length) {
            contributionsData = val;
            return val;
        }
        return fetch('data/contributions.json').then(function (r) {
            if (!r.ok) throw new Error('Failed to load contributions data');
            return r.json();
        }).then(function (data) {
            contributionsData = data;
            return data;
        });
    }).then(function (data) {
        contributionsData = data;
        return data;
    });
}

function init() {
    initFirebase();

    firebase.auth().onAuthStateChanged(function (user) {
        if (!user) {
            currentUser = null;
            showAuth();
            return;
        }
        currentUser = user;

        loadUsers().then(function () {
            if (!isAuthorized(user.email)) {
                showDenied(user.email);
                return;
            }
            showEditor();
            return loadContributions();
        }).then(function () {
            if (!contributionsData) return;
            return loadAssignments();
        }).then(function () {
            renderTables();
        }).catch(function (err) {
            showStatus('Error loading data: ' + err.message, 'error');
            console.error(err);
        });
    });
}

document.addEventListener('DOMContentLoaded', init);

window.signInWithGoogle = signInWithGoogle;
window.signOut = signOut;
