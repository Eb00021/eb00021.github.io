// Export documentation as a single static HTML file (content + contributions baked in, no Firebase/fetch).

function encodeEmail(e) { return (e || '').replace(/\./g, ','); }

function initFirebase() {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
}

function showStatus(msg, type) {
    var el = document.getElementById('statusBar');
    if (el) { el.textContent = msg; el.className = 'status-bar status-' + (type || ''); }
}

function isAuthorized(email) {
    if (email === ADMIN_EMAIL) return true;
    return window.__teamMembers && window.__teamMembers.some(function (m) {
        return m.email === email || encodeEmail(m.email) === encodeEmail(email);
    });
}

function signInWithGoogle() {
    firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(function (err) {
        showStatus('Sign in failed: ' + err.message, 'error');
    });
}

function signOut() {
    firebase.auth().signOut().then(function () { window.location.reload(); });
}

function loadTeamMembers() {
    return firebase.database().ref('users').once('value').then(function (snap) {
        var val = snap.val();
        var list = [];
        if (val) {
            Object.keys(val).forEach(function (k) {
                var u = val[k];
                list.push({ email: u.email || k.replace(/,/g, '.'), name: u.name || '' });
            });
        }
        window.__teamMembers = list;
        return list;
    }).catch(function () { window.__teamMembers = []; return []; });
}

function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
}

function buildContributionsHtml(contributionsData, assignments) {
    if (!contributionsData || !contributionsData.releases) return '';
    var keys = Object.keys(assignments || {});
    if (keys.length === 0) return '';

    var byMember = {};
    keys.forEach(function (id) {
        var a = assignments[id];
        var email = a && (typeof a === 'string' ? a : a.email);
        var name = (a && a.displayName) ? a.displayName : (email ? email.split('@')[0] : 'Unknown');
        if (!email) return;
        if (!byMember[email]) byMember[email] = { name: name, ids: [] };
        byMember[email].ids.push(id);
    });

    var html = '<h1>Contributions</h1><h2>Overview</h2><p>This section documents each team member\'s contributions to the T4BF MPX project throughout the semester.</p>';
    contributionsData.releases.forEach(function (release) {
        html += '<h2>' + escapeHtml(release.title) + '</h2><table><tbody><tr><th><p>Task</p></th><th><p>Description</p></th><th><p>Files</p></th></tr>';
        (release.rows || []).forEach(function (row, idx) {
            html += '<tr><td><p>' + escapeHtml(row.task) + '</p></td><td><p>' + escapeHtml(row.description) + '</p></td><td><p>' + escapeHtml(row.files) + '</p></td></tr>';
        });
        html += '</tbody></table>';
    });
    html += '<h2>Team Members</h2>';
    Object.keys(byMember).sort().forEach(function (email) {
        var m = byMember[email];
        html += '<h3>' + escapeHtml(m.name) + '</h3><h4>Functions Implemented</h4><table><tbody><tr><th><p>Function</p></th><th><p>Module</p></th><th><p>Description</p></th></tr>';
        m.ids.forEach(function (cid) {
            var parts = cid.split('-');
            var releaseId = parts[0];
            var rowIdx = parseInt(parts[1], 10);
            var release = contributionsData.releases.filter(function (r) { return r.id === releaseId; })[0];
            if (!release || !release.rows || !release.rows[rowIdx]) return;
            var row = release.rows[rowIdx];
            html += '<tr><td><p><code>' + escapeHtml(row.task) + '</code></p></td><td><p>' + escapeHtml(row.files) + '</p></td><td><p>' + escapeHtml(row.description) + '</p></td></tr>';
        });
        html += '</tbody></table><h4>Other Contributions</h4><ul><li><p>[Add contributions here]</p></li></ul>';
    });
    return html;
}

function doExport() {
    var status = document.getElementById('statusBar');
    showStatus('Preparing export...', '');
    var db = firebase.database();

    var docContentPromise = db.ref('documentation/htmlCache').once('value').then(function (snap) {
        var data = snap.val();
        return (data && data.content) ? data.content : getStaticFallbackContent();
    }).catch(function () { return getStaticFallbackContent(); });

    var defPromise = db.ref('contributions/definition').once('value').then(function (snap) {
        var val = snap.val();
        if (val && val.releases && val.releases.length) return val;
        return fetch('data/contributions.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }).catch(function () {
        return fetch('data/contributions.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    });

    var assignPromise = db.ref('contributions/assignments').once('value').then(function (snap) { return snap.val() || {}; }).catch(function () { return {}; });

    Promise.all([ docContentPromise, defPromise, assignPromise ]).then(function (results) {
        var docContent = results[0];
        var contributionsData = results[1];
        var assignments = results[2];
        var contributionsHtml = buildContributionsHtml(contributionsData, assignments);
        var fullMainContent = docContent + contributionsHtml;

        var staticScript = '    <script>\n        (function(){ if (typeof Prism !== \'undefined\') Prism.highlightAll(); })();\n    <\/script>';
        return fetch('documentation.html').then(function (r) { return r.text(); }).then(function (templateHtml) {
            var fullHtml = templateHtml
                .replace(/<main id="mainContent">[\s\S]*?<\/main>/, '<main id="mainContent">' + fullMainContent + '</main>')
                .replace(/<!-- Firebase SDK for loading dynamic content -->[\s\S]*?<!-- smooth scrolling/, staticScript + '\n\n    <!-- smooth scrolling');

            var blob = new Blob([ fullHtml ], { type: 'text/html;charset=utf-8' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'documentation-static.html';
            a.click();
            URL.revokeObjectURL(a.href);
            showStatus('Downloaded documentation-static.html', 'success');
        }).catch(function () {
            var docTemplate = getDocTemplate();
            var fullHtml = docTemplate
                .replace(/<main id="mainContent">[\s\S]*?<\/main>/, '<main id="mainContent">' + fullMainContent + '</main>');
            var blob = new Blob([ fullHtml ], { type: 'text/html;charset=utf-8' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'documentation-static.html';
            a.click();
            URL.revokeObjectURL(a.href);
            showStatus('Downloaded documentation-static.html', 'success');
        });
    }).catch(function (err) {
        showStatus('Export failed: ' + err.message, 'error');
    });
}

function getStaticFallbackContent() {
    return '<p>Content not available. Publish from the editor first or run export from the documentation site.</p>';
}

function getDocTemplate() {
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<link rel="icon" type="image/svg+xml" href="favicon.svg">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>T4BF MPX Documentation</title>\n<link rel="stylesheet" href="css/style.css">\n<style>\n.edit-link{position:fixed;bottom:20px;right:20px;background:#2c5282;color:white;padding:10px 20px;border-radius:5px;text-decoration:none;font-size:14px;}\n.edit-link:hover{background:#1a365d;}\ntable{border-collapse:collapse;width:100%;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}\n</style>\n</head>\n<body>\n<a href="editor.html" class="edit-link">Edit Documentation</a>\n<main id="mainContent"></main>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"><\/script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-c.min.js"><\/script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-bash.min.js"><\/script>\n<script>(function(){ if (typeof Prism !== \'undefined\') Prism.highlightAll(); })();<\/script>\n</body>\n</html>';
}

function init() {
    initFirebase();
    firebase.auth().onAuthStateChanged(function (user) {
        if (!user) {
            document.getElementById('authContainer').style.display = 'block';
            document.getElementById('exportContainer').style.display = 'none';
            document.getElementById('accessDenied').style.display = 'none';
            return;
        }
        loadTeamMembers().then(function () {
            if (!isAuthorized(user.email)) {
                document.getElementById('authContainer').style.display = 'none';
                document.getElementById('exportContainer').style.display = 'none';
                document.getElementById('accessDenied').style.display = 'block';
                document.getElementById('deniedEmail').textContent = user.email;
                return;
            }
            document.getElementById('authContainer').style.display = 'none';
            document.getElementById('accessDenied').style.display = 'none';
            document.getElementById('exportContainer').style.display = 'block';
        });
    });
}

document.addEventListener('DOMContentLoaded', init);
window.signInWithGoogle = signInWithGoogle;
window.signOut = signOut;
window.doExport = doExport;
