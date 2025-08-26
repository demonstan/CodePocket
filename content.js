// Content script for Code Snippet Saver Extension
class CodeCapture {
    constructor() {
        this.selectedText = '';
        this.contextMenu = null;
        this.init();
    }

    init() {
        this.attachEventListeners();
        this.injectStyles();
    }

    attachEventListeners() {
        // Listen for text selection
        document.addEventListener('mouseup', (e) => this.handleTextSelection(e));
        document.addEventListener('keyup', (e) => this.handleTextSelection(e));

        // Listen for context menu events
        document.addEventListener('contextmenu', (e) => this.handleContextMenu(e));

        // Clean up on click elsewhere
        document.addEventListener('click', (e) => this.cleanup(e));

        // Listen for Escape key to close context menu
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.cleanup();
            }
        });

        // Listen for keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+S or Cmd+Shift+S to save selected code
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
                e.preventDefault();
                this.captureSelectedCode();
            }
        });
    }

    handleTextSelection(e) {
        const selection = window.getSelection();
        this.selectedText = selection.toString().trim();

        if (this.selectedText && this.selectedText.length > 10) {
            // Check if selected text looks like code
            if (this.looksLikeCode(this.selectedText)) {
                this.showQuickCaptureButton(e);
            }
        } else {
            this.hideQuickCaptureButton();
        }
    }

    handleContextMenu(e) {
        if (this.selectedText && this.looksLikeCode(this.selectedText)) {
            // Don't prevent default context menu, but prepare for our addition
            setTimeout(() => this.addContextMenuOption(e), 10);
        }
    }

    looksLikeCode(text) {
        // Simple heuristics to detect if text might be code
        const codeIndicators = [
            /^[\s]*[<>{}[\]()]/m,  // HTML/XML tags or brackets
            /[{};]\s*$/m,          // Ends with semicolon or brace
            /^\s*(function|class|def|var|let|const|import|export)/m, // Keywords
            /^\s*[#\/\/\*]/m,      // Comments
            /[=<>!&|+\-*/%]{2,}/,  // Operators
            /\b(if|else|for|while|return|try|catch)\b/, // Control flow
            /^\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[(:=]/m, // Function/variable declarations
        ];

        return codeIndicators.some(pattern => pattern.test(text)) ||
               text.split('\n').length > 2; // Multi-line text
    }

    showQuickCaptureButton(e) {
        this.hideQuickCaptureButton();

        const button = document.createElement('div');
        button.id = 'code-snippet-capture-btn';
        button.innerHTML = '💾 Save Snippet';
        button.style.cssText = `
            position: absolute;
            top: ${e.pageY - 40}px;
            left: ${e.pageX}px;
            background: #667eea;
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            transition: all 0.2s ease;
            border: none;
            user-select: none;
        `;

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.captureSelectedCode();
        });

        button.addEventListener('mouseenter', () => {
            button.style.background = '#5a6fd8';
            button.style.transform = 'translateY(-2px)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.background = '#667eea';
            button.style.transform = 'translateY(0)';
        });

        document.body.appendChild(button);

        // Auto-hide after 3 seconds
        setTimeout(() => this.hideQuickCaptureButton(), 3000);
    }

    hideQuickCaptureButton() {
        const existingButton = document.getElementById('code-snippet-capture-btn');
        if (existingButton) {
            existingButton.remove();
        }
    }

    async captureSelectedCode() {
        if (!this.selectedText) {
            this.showNotification('Please select some code first!', 'error');
            return;
        }

        const detectedLanguage = this.detectLanguage(this.selectedText);
        const pageTitle = document.title;
        const pageUrl = window.location.href;

        // Create a snippet object
        const snippet = {
            id: Date.now().toString(),
            title: this.generateTitle(pageTitle, detectedLanguage),
            description: `Captured from: ${pageUrl}`,
            language: detectedLanguage,
            code: this.selectedText,
            tags: ['web-capture', this.getDomainTag()],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        try {
            // Get existing snippets
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['snippets'], resolve);
            });

            const snippets = result.snippets || [];
            snippets.unshift(snippet);

            // Save updated snippets
            await new Promise((resolve) => {
                chrome.storage.local.set({ snippets }, resolve);
            });

            this.showNotification('Code snippet saved successfully!', 'success');
            this.cleanup();

        } catch (error) {
            console.error('Error saving snippet:', error);
            this.showNotification('Failed to save snippet. Please try again.', 'error');
        }
    }

    detectLanguage(code) {
        // Simple language detection based on patterns
        const patterns = {
            'html': [/<\/?[a-z][\s\S]*>/i, /<!DOCTYPE/i],
            'css': [/[.#]?[a-zA-Z-]+\s*{[\s\S]*}/],
            'javascript': [/function\s+\w+|const\s+\w+|let\s+\w+|var\s+\w+/, /console\.(log|error|warn)/],
            'typescript': [/interface\s+\w+|type\s+\w+/, /:\s*(string|number|boolean)/],
            'python': [/def\s+\w+|class\s+\w+|import\s+\w+/, /print\(|input\(/],
            'java': [/public\s+class|private\s+\w+|public\s+static/, /System\.out\.print/],
            'cpp': [/#include\s*<|using\s+namespace/, /std::|cout\s*<</],
            'php': [/<\?php|function\s+\w+/, /echo\s+|print\s+/],
            'ruby': [/def\s+\w+|class\s+\w+/, /puts\s+|p\s+/],
            'go': [/func\s+\w+|package\s+\w+/, /fmt\.Print|import\s+"fmt"/],
            'rust': [/fn\s+\w+|let\s+mut/, /println!|std::/],
            'sql': [/SELECT\s+|INSERT\s+|UPDATE\s+|DELETE\s+/i, /FROM\s+|WHERE\s+|JOIN\s+/i],
            'json': [/^\s*[{\[]/m, /[}\]]\s*$/m],
            'xml': [/<\?xml/, /<\/\w+>/],
            'yaml': [/^\s*\w+:\s*/m, /^\s*-\s+/m],
            'bash': [/#!\/bin\/bash|#!\/bin\/sh/, /echo\s+|grep\s+|awk\s+/]
        };

        for (const [lang, langPatterns] of Object.entries(patterns)) {
            if (langPatterns.some(pattern => pattern.test(code))) {
                return lang;
            }
        }

        // Default fallback
        return 'text';
    }

    generateTitle(pageTitle, language) {
        const cleanTitle = pageTitle.replace(/[^\w\s-]/g, '').trim();
        const langSuffix = language !== 'text' ? ` (${language.toUpperCase()})` : '';
        return `${cleanTitle}${langSuffix}`.substring(0, 50) || `Code Snippet${langSuffix}`;
    }

    getDomainTag() {
        try {
            return new URL(window.location.href).hostname.replace('www.', '');
        } catch {
            return 'unknown-domain';
        }
    }

    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existing = document.querySelectorAll('.code-snippet-notification');
        existing.forEach(el => el.remove());

        const notification = document.createElement('div');
        notification.className = 'code-snippet-notification';
        notification.textContent = message;

        const colors = {
            success: '#4CAF50',
            error: '#f44336',
            info: '#2196F3'
        };

        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${colors[type]};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10001;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 300px;
            word-wrap: break-word;
            animation: slideInRight 0.3s ease;
        `;

        document.body.appendChild(notification);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOutRight 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }
        }, 3000);
    }

    cleanup(e) {
        if (e && e.target && e.target.id === 'code-snippet-capture-btn') {
            return; // Don't cleanup if clicking the capture button
        }

        this.hideQuickCaptureButton();
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }
    }

    injectStyles() {
        if (document.getElementById('code-snippet-styles')) return;

        const style = document.createElement('style');
        style.id = 'code-snippet-styles';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }

            .code-snippet-highlight {
                background-color: rgba(102, 126, 234, 0.2) !important;
                border-radius: 3px;
                transition: background-color 0.2s ease;
            }
        `;

        document.head.appendChild(style);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new CodeCapture());
} else {
    new CodeCapture();
}