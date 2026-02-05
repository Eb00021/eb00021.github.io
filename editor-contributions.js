// Editor contributions panel: read-only view + editable Other contributions

(function () {
    function enc(email) { return (email || '').replace(/\./g, ','); }
    function escapeHtml(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : s;
        return d.innerHTML;
    }

    function buildReadOnlyHtml(contributionsData, assignments) {
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
        var otherEdit = document.getElementById('contributionsOtherEdit');
        if (!panel || !readOnly || !otherEdit) return;

        var db = firebase.database();
        var defPromise = db.ref('contributions/definition').once('value').then(function (snap) {
            var val = snap.val();
            if (val && val.releases && val.releases.length) return val;
            return fetch('data/contributions.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
        }).catch(function () { return fetch('data/contributions.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); });
        var assignPromise = db.ref('contributions/assignments').once('value').then(function (snap) { return snap.val() || {}; }).catch(function () { return {}; });
        var otherPromise = db.ref('contributions/otherContributions').once('value').then(function (snap) { return snap.val() || {}; }).catch(function () { return {}; });

        Promise.all([defPromise, assignPromise, otherPromise]).then(function (results) {
            var contributionsData = results[0];
            var assignments = results[1];
            var otherContributions = results[2];
            if (!contributionsData || !contributionsData.releases) return;
            var keys = Object.keys(assignments || {});
            if (keys.length === 0) return;

            var byMember = {};
            keys.forEach(function (id) {
                var a = assignments[id];
                var email = a && (typeof a === 'string' ? a : a.email);
                var name = (a && a.displayName) ? a.displayName : (email ? email.split('@')[0] : 'Unknown');
                if (!email) return;
                if (!byMember[email]) byMember[email] = { name: name, ids: [] };
                byMember[email].ids.push(id);
            });

            readOnly.innerHTML = buildReadOnlyHtml(contributionsData, assignments);
            otherEdit.innerHTML = '';

            Object.keys(byMember).sort().forEach(function (email) {
                var m = byMember[email];
                var encoded = enc(email);
                var items = (otherContributions && otherContributions[encoded]) || [];
                var text = items.join('\n');

                var wrap = document.createElement('div');
                wrap.className = 'contributions-other-block';
                var label = document.createElement('h4');
                label.textContent = 'Other contributions: ' + m.name;
                wrap.appendChild(label);
                var ta = document.createElement('textarea');
                ta.placeholder = 'One line per item';
                ta.value = text;
                ta.setAttribute('data-email-enc', encoded);
                wrap.appendChild(ta);
                var saved = document.createElement('div');
                saved.className = 'other-saved';
                saved.style.display = 'none';
                saved.textContent = 'Saved';
                wrap.appendChild(saved);
                ta.addEventListener('blur', function () {
                    var lines = ta.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
                    db.ref('contributions/otherContributions/' + encoded).set(lines.length ? lines : null).then(function () {
                        saved.style.display = 'block';
                        setTimeout(function () { saved.style.display = 'none'; }, 2000);
                    });
                });
                otherEdit.appendChild(wrap);
            });

            panel.style.display = 'block';
        }).catch(function () {});
    }

    function init() {
        if (typeof firebase === 'undefined' || !firebase.auth) return;
        firebase.auth().onAuthStateChanged(function (user) {
            if (!user) return;
            setTimeout(loadAndShow, 1500);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
