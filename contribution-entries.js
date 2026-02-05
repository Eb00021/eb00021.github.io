// Contribution Entries - add/edit modules (releases) and rows; stored in Firebase contributions/definition

var currentUser = null;
var contributionsData = { releases: [] };
var teamMembers = [];
var DEF_REF = 'contributions/definition';

function encodeEmail(email) {
    return (email || '').replace(/\./g, ',');
}

function initFirebase() {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
}

function showStatus(msg, type) {
    var el = document.getElementById('statusBar');
    if (el) { el.textContent = msg; el.className = 'status-bar status-' + (type || ''); }
}

function hideStatus() {
    var el = document.getElementById('statusBar');
    if (el) el.className = 'status-bar';
}

function isAuthorized(email) {
    if (email === ADMIN_EMAIL) return true;
    return teamMembers.some(function (m) { return m.email === email || encodeEmail(m.email) === encodeEmail(email); });
}

function signInWithGoogle() {
    firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(function (err) {
        console.error(err);
        showStatus('Sign in failed: ' + err.message, 'error');
    });
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

function loadDefinition() {
    return firebase.database().ref(DEF_REF).once('value').then(function (snap) {
        var val = snap.val();
        contributionsData = (val && val.releases) ? { releases: val.releases } : { releases: [] };
        return contributionsData;
    });
}

function saveDefinition() {
    return firebase.database().ref(DEF_REF).set(contributionsData).then(function () {
        showStatus('Saved.', 'success');
        setTimeout(hideStatus, 2000);
    }).catch(function (err) {
        showStatus('Error: ' + err.message, 'error');
    });
}

function addRelease() {
    var idEl = document.getElementById('newReleaseId');
    var titleEl = document.getElementById('newReleaseTitle');
    var id = (idEl && idEl.value || '').trim();
    var title = (titleEl && titleEl.value || '').trim();
    if (!id || !title) {
        showStatus('Enter module id and title.', 'error');
        return;
    }
    if (contributionsData.releases.some(function (r) { return r.id === id; })) {
        showStatus('A module with that id already exists.', 'error');
        return;
    }
    contributionsData.releases.push({ id: id, title: title, rows: [] });
    if (idEl) idEl.value = '';
    if (titleEl) titleEl.value = '';
    saveDefinition().then(render);
}

function removeRelease(releaseIndex) {
    if (!confirm('Remove this module and all its rows?')) return;
    contributionsData.releases.splice(releaseIndex, 1);
    saveDefinition().then(render);
}

function addRow(releaseIndex) {
    var release = contributionsData.releases[releaseIndex];
    if (!release) return;
    var task = prompt('Task (short name):', '');
    if (task === null) return;
    task = task.trim();
    var desc = prompt('Description:', '');
    if (desc === null) return;
    desc = (desc || '').trim();
    var files = prompt('Files (e.g. path):', '');
    if (files === null) return;
    files = (files || '').trim();
    release.rows.push({ task: task, description: desc, files: files });
    saveDefinition().then(render);
}

function removeRow(releaseIndex, rowIndex) {
    if (!confirm('Remove this row?')) return;
    contributionsData.releases[releaseIndex].rows.splice(rowIndex, 1);
    saveDefinition().then(render);
}

function editRow(releaseIndex, rowIndex) {
    var row = contributionsData.releases[releaseIndex].rows[rowIndex];
    if (!row) return;
    var task = prompt('Task:', row.task);
    if (task === null) return;
    var desc = prompt('Description:', row.description);
    if (desc === null) return;
    var files = prompt('Files:', row.files);
    if (files === null) return;
    row.task = (task || '').trim();
    row.description = (desc || '').trim();
    row.files = (files || '').trim();
    saveDefinition().then(render);
}

function render() {
    var root = document.getElementById('releasesRoot');
    if (!root) return;
    root.innerHTML = '';
    contributionsData.releases.forEach(function (release, rIdx) {
        var block = document.createElement('div');
        block.className = 'release-block';
        var h3 = document.createElement('h3');
        h3.innerHTML = '<span>' + escapeHtml(release.id) + '</span>' +
            '<input type="text" class="release-title" data-release-index="' + rIdx + '" value="' + escapeAttr(release.title) + '" placeholder="Title">' +
            '<button type="button" class="btn btn-danger btn-small" data-release-index="' + rIdx + '" onclick="removeRelease(' + rIdx + ')">Remove module</button>';
        block.appendChild(h3);
        var rowList = document.createElement('div');
        rowList.className = 'row-list';
        release.rows.forEach(function (row, rowIdx) {
            var item = document.createElement('div');
            item.className = 'row-item';
            item.innerHTML =
                '<input type="text" class="task" value="' + escapeAttr(row.task) + '" data-r="' + rIdx + '" data-c="' + rowIdx + '" data-field="task" placeholder="Task">' +
                '<input type="text" class="desc" value="' + escapeAttr(row.description) + '" data-r="' + rIdx + '" data-c="' + rowIdx + '" data-field="description" placeholder="Description">' +
                '<input type="text" class="files" value="' + escapeAttr(row.files) + '" data-r="' + rIdx + '" data-c="' + rowIdx + '" data-field="files" placeholder="Files">' +
                '<span class="actions"><button type="button" class="btn btn-small" onclick="editRow(' + rIdx + ',' + rowIdx + ')">Edit</button> <button type="button" class="btn btn-danger btn-small" onclick="removeRow(' + rIdx + ',' + rowIdx + ')">Remove</button></span>';
            rowList.appendChild(item);
        });
        block.appendChild(rowList);
        var addRowForm = document.createElement('div');
        addRowForm.className = 'add-row-form';
        addRowForm.innerHTML = '<button type="button" class="btn btn-save btn-small" onclick="addRow(' + rIdx + ')">+ Add row</button>';
        block.appendChild(addRowForm);
        root.appendChild(block);
    });
    root.querySelectorAll('.release-title').forEach(function (input) {
        input.addEventListener('change', function () {
            var idx = parseInt(this.getAttribute('data-release-index'), 10);
            contributionsData.releases[idx].title = this.value.trim();
            saveDefinition();
        });
    });
    root.querySelectorAll('.row-item input').forEach(function (input) {
        input.addEventListener('change', function () {
            var r = parseInt(this.getAttribute('data-r'), 10);
            var c = parseInt(this.getAttribute('data-c'), 10);
            var field = this.getAttribute('data-field');
            if (contributionsData.releases[r] && contributionsData.releases[r].rows[c])
                contributionsData.releases[r].rows[c][field] = this.value.trim();
            saveDefinition();
        });
    });
}

function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function escapeAttr(s) {
    return escapeHtml(s || '').replace(/"/g, '&quot;');
}

function seedFromJson() {
    fetch('data/contributions.json').then(function (r) {
        if (!r.ok) throw new Error('Failed to load JSON');
        return r.json();
    }).then(function (data) {
        if (!data.releases || !data.releases.length) throw new Error('No releases in file');
        contributionsData = { releases: data.releases };
        return saveDefinition();
    }).then(function () {
        showStatus('Seeded from data/contributions.json', 'success');
        render();
        setTimeout(hideStatus, 3000);
    }).catch(function (err) {
        showStatus('Seed failed: ' + err.message, 'error');
    });
}

function loadUsers() {
    return firebase.database().ref('users').once('value').then(function (snap) {
        var val = snap.val();
        teamMembers = [];
        if (val) {
            Object.keys(val).forEach(function (key) {
                var u = val[key];
                teamMembers.push({ email: u.email || key.replace(/,/g, '.'), name: u.name || '' });
            });
        }
        return teamMembers;
    }).catch(function () { teamMembers = []; return teamMembers; });
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
            return loadDefinition();
        }).then(function () {
            render();
        }).catch(function (err) {
            showStatus('Error: ' + err.message, 'error');
        });
    });
}

document.addEventListener('DOMContentLoaded', init);
window.signInWithGoogle = signInWithGoogle;
window.signOut = signOut;
window.addRelease = addRelease;
window.removeRelease = removeRelease;
window.addRow = addRow;
window.removeRow = removeRow;
window.editRow = editRow;
window.seedFromJson = seedFromJson;
