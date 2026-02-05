// Export documentation as a single static HTML file (content + contributions baked in, no Firebase/fetch).
// Also pushes the file to export/documentation-static.html in the repo when a GitHub token is set (same as editor).

var EXPORT_REPO_OWNER = 'eb00021';
var EXPORT_REPO_NAME = 'eb00021.github.io';
var EXPORT_FILE_PATH = 'export/documentation-static.html';
var GITHUB_API = 'https://api.github.com';

function getGitHubToken() {
    return localStorage.getItem('github_token') || '';
}

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

function encEmail(e) { return (e || '').replace(/\./g, ','); }

function normalizeEmail(e) {
    if (!e || typeof e !== 'string') return '';
    return e.replace(/,/g, '.').toLowerCase().trim();
}

function resolveDisplayName(email, assignment, usersMap) {
    if (!email) return 'Unknown';
    var canonical = normalizeEmail(email);
    var fromUser = (usersMap && usersMap[email] && usersMap[email].name) || (usersMap && canonical && usersMap[canonical] && usersMap[canonical].name);
    if (fromUser && String(fromUser).trim()) return String(fromUser).trim();
    if (assignment && assignment.displayName) return assignment.displayName;
    return email.split('@')[0];
}

function buildContributionsHtml(contributionsData, assignments, usersMap) {
    if (!contributionsData || !contributionsData.releases || !contributionsData.releases.length) return '';
    assignments = assignments || {};
    usersMap = usersMap || {};
    var keys = Object.keys(assignments);

    var byMember = {};
    keys.forEach(function (id) {
        var a = assignments[id];
        var email = a && (typeof a === 'string' ? a : a.email);
        var name = resolveDisplayName(email, a, usersMap);
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
    if (keys.length > 0) {
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
            html += '</tbody></table>';
        });
    }
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

    var usersPromise = db.ref('users').once('value').then(function (snap) {
        var val = snap.val();
        var map = {};
        if (val) {
            Object.keys(val).forEach(function (k) {
                var u = val[k];
                var email = (u.email || k.replace(/,/g, '.')).trim();
                var canonical = email.toLowerCase();
                var entry = { name: u.name || '' };
                map[email] = entry;
                if (canonical !== email) map[canonical] = entry;
                if (k.replace(/,/g, '.') !== email) map[k.replace(/,/g, '.')] = entry;
            });
        }
        return map;
    }).catch(function () { return {}; });

    Promise.all([ docContentPromise, defPromise, assignPromise, usersPromise ]).then(function (results) {
        var docContent = results[0];
        var contributionsData = results[1];
        var assignments = results[2];
        var usersMap = results[3];
        var contributionsHtml = buildContributionsHtml(contributionsData, assignments, usersMap);
        var fullMainContent = docContent + contributionsHtml;

        var staticScript = '    <script>\n        (function(){ if (typeof Prism !== \'undefined\') Prism.highlightAll(); })();\n    <\/script>';
        return Promise.all([
            fetch('documentation.html').then(function (r) { return r.text(); }),
            fetch('css/style.css').then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; })
        ]).then(function (arr) {
            var templateHtml = arr[0];
            var styleCss = arr[1] || getInlineDocCss();
            // Remove edit link and its comment (editor-only UI; export is view-only)
            templateHtml = templateHtml.replace(/\s*<!-- Edit Link -->\s*<a [^>]*class="edit-link"[^>]*>[\s\S]*?<\/a>/i, '');
            // Replace main content
            templateHtml = templateHtml.replace(/<main id="mainContent">[\s\S]*?<\/main>/, '<main id="mainContent">' + fullMainContent + '</main>');
            // Replace Firebase block with Prism-only and inject embedded CSS for standalone viewing
            var styleBlock = '<style>\n' + styleCss + '\n</style>';
            templateHtml = templateHtml.replace(/<link rel="stylesheet" href="css\/style\.css">/i, styleBlock);
            templateHtml = templateHtml.replace(/<!-- Firebase SDK for loading dynamic content -->[\s\S]*?<!-- smooth scrolling/, staticScript + '\n\n    <!-- smooth scrolling');

            var blob = new Blob([ templateHtml ], { type: 'text/html;charset=utf-8' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'documentation-static.html';
            a.click();
            URL.revokeObjectURL(a.href);
            showStatus('Downloaded documentation-static.html', 'success');
            pushExportToRepo(templateHtml).then(function () {
                showStatus('Downloaded and updated export file in repo.', 'success');
            }).catch(function (err) {
                showStatus('Downloaded. Repo update failed: ' + (err && err.message ? err.message : 'unknown'), 'error');
            });
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
            pushExportToRepo(fullHtml).then(function () {
                showStatus('Downloaded and updated export file in repo.', 'success');
            }).catch(function (err) {
                showStatus('Downloaded. Repo update failed: ' + (err && err.message ? err.message : 'unknown'), 'error');
            });
        });
    }).catch(function (err) {
        showStatus('Export failed: ' + err.message, 'error');
    });
}

function pushExportToRepo(htmlContent) {
    var rawToken = getGitHubToken();
    var token = rawToken && rawToken.trim();
    if (!token) return Promise.resolve();

    var encodedContent = btoa(unescape(encodeURIComponent(htmlContent)));
    var body = {
        message: 'Export static documentation (auto from Export static page)',
        content: encodedContent
    };

    function doGet(authHeader) {
        return fetch(GITHUB_API + '/repos/' + EXPORT_REPO_OWNER + '/' + EXPORT_REPO_NAME + '/contents/' + EXPORT_FILE_PATH, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
    }
    function doPut(authHeader, reqBody) {
        return fetch(GITHUB_API + '/repos/' + EXPORT_REPO_OWNER + '/' + EXPORT_REPO_NAME + '/contents/' + EXPORT_FILE_PATH, {
            method: 'PUT',
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(reqBody)
        });
    }

    function runWithAuth(authHeader) {
        return doGet(authHeader).then(function (res) {
            var reqBody = { message: body.message, content: body.content };
            if (res.ok) {
                return res.json().then(function (data) { reqBody.sha = data.sha; return reqBody; });
            }
            return reqBody;
        }).catch(function () { return { message: body.message, content: body.content }; }).then(function (reqBody) {
            return doPut(authHeader, reqBody);
        });
    }

    return runWithAuth('Bearer ' + token).then(function (res) {
        if (res.ok) return res.json();
        if (res.status === 401) {
            return runWithAuth('token ' + token).then(function (res2) {
                if (!res2.ok) throw new Error('Invalid or expired GitHub token. Set it again in the Editor (GitHub button).');
                return res2.json();
            });
        }
        throw new Error('Failed to update export file in repo.');
    });
}

function getStaticFallbackContent() {
    return '<p>Content not available. Publish from the editor first or run export from the documentation site.</p>';
}

function getInlineDocCss() {
    return 'body{font-family:Georgia,serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.5;box-sizing:border-box}main{display:block;width:100%;max-width:100%}code,pre{font-family:monospace;background:#f4f4f4}pre{padding:10px;overflow-x:auto;border:1px solid #ddd}table{border-collapse:collapse;margin:1em 0}th,td{border:1px solid #000;padding:5px 10px}';
}

function getDocTemplate() {
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<link rel="icon" type="image/svg+xml" href="favicon.svg">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>T4BF MPX Documentation</title>\n<style>\n' + getInlineDocCss() + '\n</style>\n</head>\n<body>\n<main id="mainContent"></main>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"><\/script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-c.min.js"><\/script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-bash.min.js"><\/script>\n<script>(function(){ if (typeof Prism !== \'undefined\') Prism.highlightAll(); })();<\/script>\n</body>\n</html>';
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
