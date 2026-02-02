// Configuration
const REPO_OWNER = 'eb00021';
const REPO_NAME = 'eb00021.github.io';
const FILE_PATH = 'documentation.html';
const GITHUB_API = 'https://api.github.com';

// State
let currentFileSha = null;
let originalHtmlHead = '';
let originalHtmlTail = '';
let editorInstance = null;

// Token management
function getToken() {
    return localStorage.getItem('github_token');
}

function setToken(token) {
    localStorage.setItem('github_token', token);
}

function clearToken() {
    localStorage.removeItem('github_token');
}

function saveToken() {
    const token = document.getElementById('tokenInput').value.trim();
    if (token) {
        setToken(token);
        hideTokenModal();
        loadDocumentation();
    }
}

function showTokenModal() {
    document.getElementById('tokenModal').classList.remove('modal-hidden');
}

function hideTokenModal() {
    document.getElementById('tokenModal').classList.add('modal-hidden');
}

function logout() {
    clearToken();
    showTokenModal();
    if (editorInstance) {
        editorInstance.setContent('');
    }
    document.getElementById('saveBtn').disabled = true;
}

// Status messages
function showStatus(message, type) {
    const statusBar = document.getElementById('statusBar');
    statusBar.textContent = message;
    statusBar.className = 'status-bar status-' + type;
}

function hideStatus() {
    document.getElementById('statusBar').className = 'status-bar';
}

// GitHub API calls
async function fetchFile() {
    const token = getToken();
    const response = await fetch(
        `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
        {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        }
    );

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('Invalid or expired token. Please re-enter your token.');
        }
        throw new Error(`Failed to fetch file: ${response.statusText}`);
    }

    return response.json();
}

async function updateFile(content, commitMessage) {
    const token = getToken();
    const encodedContent = btoa(unescape(encodeURIComponent(content)));

    const response = await fetch(
        `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
        {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
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
        if (response.status === 401) {
            throw new Error('Invalid or expired token. Please re-enter your token.');
        }
        if (response.status === 409) {
            throw new Error('Conflict: The file has been modified. Please reload and try again.');
        }
        throw new Error(`Failed to save file: ${response.statusText}`);
    }

    return response.json();
}

// Extract body content from full HTML
function extractBodyContent(html) {
    // Find the main content area
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
        // Store the parts before and after <main>
        const mainIndex = html.indexOf(mainMatch[0]);
        originalHtmlHead = html.substring(0, mainIndex) + '<main>';
        originalHtmlTail = '</main>' + html.substring(mainIndex + mainMatch[0].length);
        return mainMatch[1];
    }

    // Fallback to body content
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
        const bodyStart = html.indexOf(bodyMatch[0]);
        const bodyTagEnd = html.indexOf('>', bodyStart) + 1;
        originalHtmlHead = html.substring(0, bodyTagEnd);
        originalHtmlTail = '</body>' + html.substring(html.indexOf('</body>') + 7);
        return bodyMatch[1];
    }

    // If no body tag found, treat entire content as body
    originalHtmlHead = '<!DOCTYPE html><html><head><title>Documentation</title></head><body>';
    originalHtmlTail = '</body></html>';
    return html;
}

// Rebuild full HTML from body content
function rebuildFullHtml(bodyContent) {
    return originalHtmlHead + bodyContent + originalHtmlTail;
}

// Initialize TinyMCE
function initEditor(initialContent) {
    tinymce.init({
        selector: '#editor',
        height: 600,
        menubar: true,
        plugins: [
            'advlist', 'autolink', 'lists', 'link', 'charmap', 'preview',
            'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
            'insertdatetime', 'table', 'help', 'wordcount', 'codesample'
        ],
        toolbar: 'undo redo | blocks | ' +
            'bold italic backcolor | alignleft aligncenter ' +
            'alignright alignjustify | bullist numlist outdent indent | ' +
            'removeformat | codesample code | help',
        codesample_languages: [
            { text: 'C', value: 'c' },
            { text: 'Bash', value: 'bash' },
            { text: 'Plain Text', value: 'text' }
        ],
        content_style: `
            body {
                font-family: Georgia, serif;
                font-size: 14px;
                line-height: 1.5;
                max-width: 800px;
                margin: 0 auto;
                padding: 10px;
            }
            code, pre {
                font-family: monospace;
                background: #f4f4f4;
            }
            pre {
                padding: 10px;
                border: 1px solid #ddd;
                overflow-x: auto;
            }
            table {
                border-collapse: collapse;
                margin: 1em 0;
            }
            th, td {
                border: 1px solid #000;
                padding: 5px 10px;
            }
        `,
        setup: function(editor) {
            editorInstance = editor;
            editor.on('init', function() {
                editor.setContent(initialContent);
                document.getElementById('loadingIndicator').style.display = 'none';
                document.getElementById('saveBtn').disabled = false;
            });
        }
    });
}

// Load documentation from GitHub
async function loadDocumentation() {
    showStatus('Loading documentation...', 'loading');
    document.getElementById('loadingIndicator').style.display = 'block';

    try {
        const fileData = await fetchFile();
        currentFileSha = fileData.sha;

        // Decode base64 content
        const content = decodeURIComponent(escape(atob(fileData.content)));
        const bodyContent = extractBodyContent(content);

        hideStatus();

        // Initialize or update editor
        if (editorInstance) {
            editorInstance.setContent(bodyContent);
            document.getElementById('loadingIndicator').style.display = 'none';
            document.getElementById('saveBtn').disabled = false;
        } else {
            initEditor(bodyContent);
        }
    } catch (error) {
        showStatus(error.message, 'error');
        document.getElementById('loadingIndicator').style.display = 'none';
        if (error.message.includes('token')) {
            clearToken();
            showTokenModal();
        }
    }
}

// Save documentation to GitHub
async function saveDocumentation() {
    if (!editorInstance) return;

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    showStatus('Saving changes...', 'loading');

    try {
        const bodyContent = editorInstance.getContent();
        const fullHtml = rebuildFullHtml(bodyContent);

        const result = await updateFile(fullHtml, 'Update documentation via editor');
        currentFileSha = result.content.sha;

        showStatus('Changes saved successfully! The site will update shortly.', 'success');
        setTimeout(hideStatus, 5000);
    } catch (error) {
        showStatus(error.message, 'error');
        if (error.message.includes('token')) {
            clearToken();
            showTokenModal();
        }
    } finally {
        saveBtn.disabled = false;
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    const token = getToken();
    if (token) {
        hideTokenModal();
        loadDocumentation();
    } else {
        document.getElementById('loadingIndicator').textContent = 'Please enter your GitHub token to continue.';
    }
});
