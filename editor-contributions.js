// Editor contributions panel: read-only view (assignments edited in contribution-editor)

(function () {
    function escapeHtml(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : s;
        return d.innerHTML;
    }

    function resolveDisplayName(email, assignment, usersMap) {
        if (!email) return 'Unknown';
        var fromUser = usersMap && usersMap[email] && usersMap[email].name;
        if (fromUser && fromUser.trim()) return fromUser.trim();
        if (assignment && assignment.displayName) return assignment.displayName;
        return email.split('@')[0];
    }

    function buildReadOnlyHtml(contributionsData, assignments, usersMap) {
        if (!contributionsData || !contributionsData.releases) return '';
        var keys = Object.keys(assignments || {});
        if (keys.length === 0) return '';

        var byMember = {};
        keys.forEach(function (id) {
            var a = assignments[id];
            var email = a && (typeof a === 'string' ? a : a.email);
            var name = resolveDisplayName(email, a, usersMap);
            if (!email) return;
            if (!byMember[email]) byMember[email] = { name: name, ids: [] };
            byMember[email].ids.push(id);
        });

        var html = '<h2>Overview</h2><p>This section documents each team member\'s contributions.</p>';
        contributionsData.releases.forEach(function (release) {
            html += '<h2>' + escapeHtml(release.title) + '</h2><table><tbody><tr><th>Task</th><th>Description</th><th>Files</th></tr>';
            (release.rows || []).forEach(function (row, idx) {
                html += '<tr><td>' + escapeHtml(row.task) + '</td><td>' + escapeHtml(row.description) + '</td><td>' + escapeHtml(row.files) + '</td></tr>';
            });
            html += '</tbody></table>';
        });
        html += '<h2>Team Members</h2>';
        Object.keys(byMember).sort().forEach(function (email) {
            var m = byMember[email];
            html += '<h3>' + escapeHtml(m.name) + '</h3><h4>Functions Implemented</h4><table><tbody><tr><th>Function</th><th>Module</th><th>Description</th></tr>';
            m.ids.forEach(function (cid) {
                var parts = cid.split('-');
                var release = contributionsData.releases.filter(function (r) { return r.id === parts[0]; })[0];
                if (!release || !release.rows || !release.rows[parseInt(parts[1], 10)]) return;
                var row = release.rows[parseInt(parts[1], 10)];
                html += '<tr><td><code>' + escapeHtml(row.task) + '</code></td><td>' + escapeHtml(row.files) + '</td><td>' + escapeHtml(row.description) + '</td></tr>';
            });
            html += '</tbody></table>';
        });
        return html;
    }

    function loadAndShow() {
        var panel = document.getElementById('contributionsPanel');
        var readOnly = document.getElementById('contributionsReadOnly');
        if (!panel || !readOnly) return;
        if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;

        var db = firebase.database();
        var defPromise = db.ref('contributions/definition').once('value').then(function (snap) {
            var val = snap.val();
            if (val && val.releases && val.releases.length) return val;
            return fetch('data/contributions.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
        }).catch(function () { return fetch('data/contributions.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); });
        var assignPromise = db.ref('contributions/assignments').once('value').then(function (snap) { return snap.val() || {}; }).catch(function () { return {}; });
        var usersPromise = db.ref('users').once('value').then(function (snap) {
            var val = snap.val();
            var map = {};
            if (val) {
                Object.keys(val).forEach(function (k) {
                    var u = val[k];
                    var email = u.email || k.replace(/,/g, '.');
                    map[email] = { name: u.name || '' };
                });
            }
            return map;
        }).catch(function () { return {}; });

        Promise.all([defPromise, assignPromise, usersPromise]).then(function (results) {
            var contributionsData = results[0];
            var assignments = results[1];
            var usersMap = results[2];
            var keys = Object.keys(assignments || {});

            if (!contributionsData || !contributionsData.releases) {
                readOnly.innerHTML = '<p class="contributions-empty">No contribution data loaded. Add modules in Contribution entries or ensure <code>data/contributions.json</code> exists.</p>';
                panel.style.display = 'block';
                return;
            }

            var byMember = {};
            keys.forEach(function (id) {
                var a = assignments[id];
                var email = a && (typeof a === 'string' ? a : a.email);
                var name = resolveDisplayName(email, a, usersMap);
                if (!email) return;
                if (!byMember[email]) byMember[email] = { name: name, ids: [] };
                byMember[email].ids.push(id);
            });

            if (keys.length === 0) {
                var emptyHtml = '<h2>Overview</h2><p>No contributions assigned yet. Go to <a href="contribution-editor.html">Assign Contributions</a> to assign tasks to team members.</p>';
                contributionsData.releases.forEach(function (release) {
                    emptyHtml += '<h2>' + escapeHtml(release.title) + '</h2><table><tbody><tr><th>Task</th><th>Description</th><th>Files</th></tr>';
                    (release.rows || []).forEach(function (row) {
                        emptyHtml += '<tr><td>' + escapeHtml(row.task) + '</td><td>' + escapeHtml(row.description) + '</td><td>' + escapeHtml(row.files) + '</td></tr>';
                    });
                    emptyHtml += '</tbody></table>';
                });
                readOnly.innerHTML = emptyHtml;
                panel.style.display = 'block';
                return;
            }

            readOnly.innerHTML = buildReadOnlyHtml(contributionsData, assignments, usersMap);
            panel.style.display = 'block';
        }).catch(function (err) {
            readOnly.innerHTML = '<p class="contributions-empty">Could not load contributions. ' + (err && err.message ? err.message : '') + '</p>';
            panel.style.display = 'block';
        });
    }

    function init() {
        if (typeof firebase === 'undefined' || !firebase.auth) return;
        if (firebase.apps && firebase.apps.length === 0 && typeof firebaseConfig !== 'undefined') {
            firebase.initializeApp(firebaseConfig);
        }
        firebase.auth().onAuthStateChanged(function (user) {
            if (!user) return;
            setTimeout(loadAndShow, 800);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
