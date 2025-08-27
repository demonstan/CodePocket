// Content script for Code Snippet Saver Extension
console.log('Content script loaded on:', window.location.href);

class CodeCapture {
    constructor() {
        this.selectedText = '';
        this.contextMenu = null;
        console.log('CodeCapture initialized');
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

        // Listen for keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+S or Cmd+Shift+S to save selected code
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
                e.preventDefault();

                // Get fresh selection when using keyboard shortcut
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    this.selectedText = selection.toString();
                    console.log('Keyboard shortcut - fresh selection:', this.selectedText);
                    console.log('Line count:', this.selectedText.split('\n').length);
                }

                this.captureSelectedCode();
            }
        });

        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'captureCode') {
                // Get the selected text directly from the page selection with better preservation
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);

                    // Method 1: Try to get text with better line preservation
                    this.selectedText = selection.toString();

                    // Method 2: If the text seems to have lost formatting, try cloneContents
                    if (this.selectedText && this.selectedText.indexOf('\n') === -1) {
                        const clonedContent = range.cloneContents();
                        const tempDiv = document.createElement('div');
                        tempDiv.appendChild(clonedContent);

                        // Convert HTML back to text, preserving line breaks
                        let textContent = tempDiv.textContent || tempDiv.innerText || '';

                        // If the cloned content has more line breaks, use it
                        if (textContent.split('\n').length > this.selectedText.split('\n').length) {
                            this.selectedText = textContent;
                            console.log('Using cloned content method for better line preservation');
                        }
                    }

                    console.log('Fresh selection from page:', this.selectedText);
                    console.log('Text length:', this.selectedText.length);
                    console.log('Line count:', this.selectedText.split('\n').length);
                    console.log('Raw text with escapes:', JSON.stringify(this.selectedText));
                } else {
                    // Fallback to the text passed from background script
                    this.selectedText = request.selectedText;
                    console.log('Using fallback text from context menu:', this.selectedText);
                }

                this.captureSelectedCode()
                    .then(() => sendResponse({ success: true }))
                    .catch((error) => sendResponse({ success: false, error: error.message }));
                return true; // Will respond asynchronously
            }
        });
    }

    handleTextSelection(e) {
        const selection = window.getSelection();
        // Don't trim() here to preserve leading/trailing whitespace for code
        this.selectedText = selection.toString();

        console.log('Text selected:', this.selectedText.length, 'characters');
        console.log('Line count:', this.selectedText.split('\n').length);

        // Just store the selected text for keyboard shortcut use
        if (this.selectedText && this.selectedText.length > 5) {
            if (this.looksLikeCode(this.selectedText)) {
                console.log('Code detected, available for context menu capture');
            } else {
                console.log('Selected text does not look like code');
            }
        } else {
            console.log('Selected text too short or empty');
        }
    }

    handleContextMenu(e) {
        if (this.selectedText && this.looksLikeCode(this.selectedText)) {
            // Add custom context menu option for code capture
            setTimeout(() => this.addContextMenuOption(e), 10);
        }
    }

    addContextMenuOption(e) {
        // Remove any existing custom context menu
        this.removeCustomContextMenu();

        // Create custom context menu overlay
        const contextMenu = document.createElement('div');
        contextMenu.id = 'code-snippet-context-menu';
        contextMenu.className = 'code-snippet-context-menu';

        const menuItem = document.createElement('div');
        menuItem.className = 'code-snippet-menu-item';
        menuItem.innerHTML = '💾 Save Code Snippet';

        menuItem.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.captureSelectedCode();
            this.removeCustomContextMenu();
        });

        contextMenu.appendChild(menuItem);

        // Position the menu near the mouse cursor
        let mouseX = e.clientX || 100;
        let mouseY = e.clientY || 100;

        contextMenu.style.cssText = `
            position: fixed !important;
            top: ${mouseY + 5}px !important;
            left: ${mouseX + 5}px !important;
            background: white !important;
            border: 1px solid #ccc !important;
            border-radius: 4px !important;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1) !important;
            z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            font-size: 14px !important;
            min-width: 150px !important;
            padding: 4px 0 !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
        `;

        menuItem.style.cssText = `
            padding: 8px 16px !important;
            cursor: pointer !important;
            color: #333 !important;
            border: none !important;
            background: transparent !important;
            width: 100% !important;
            text-align: left !important;
            font-size: 14px !important;
            line-height: 1.4 !important;
            display: block !important;
        `;

        // Add hover effect
        menuItem.addEventListener('mouseenter', () => {
            menuItem.style.setProperty('background-color', '#f0f0f0', 'important');
        });

        menuItem.addEventListener('mouseleave', () => {
            menuItem.style.setProperty('background-color', 'transparent', 'important');
        });

        document.body.appendChild(contextMenu);
        this.contextMenu = contextMenu;

        // Auto-remove context menu after 5 seconds or on outside click
        setTimeout(() => this.removeCustomContextMenu(), 5000);

        console.log('Custom context menu added');
    }

    removeCustomContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }

        const existing = document.getElementById('code-snippet-context-menu');
        if (existing) {
            existing.remove();
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

        const hasCodeIndicator = codeIndicators.some(pattern => pattern.test(text));
        const isMultiLine = text.split('\n').length > 1;

        console.log('Code detection:', {
            text: text.substring(0, 50) + '...',
            hasCodeIndicator,
            isMultiLine,
            result: hasCodeIndicator || isMultiLine
        });

        return hasCodeIndicator || isMultiLine; // Multi-line text or code patterns
    }

    // Removed showQuickCaptureButton method - using Chrome native context menu

    // Removed setupButtonProtection method - no longer needed

    // Removed hideQuickCaptureButton method - no longer needed

    async captureSelectedCode() {
        if (!this.selectedText) {
            this.showNotification('Please select some code first!', 'error');
            return;
        }

        console.log('Capturing selected code:');
        console.log('Raw text:', JSON.stringify(this.selectedText));
        console.log('Length:', this.selectedText.length);
        console.log('Lines:', this.selectedText.split('\n').length);

        const detectedLanguage = this.detectLanguage(this.selectedText);
        const pageTitle = document.title;
        const pageUrl = window.location.href;

        // Create a snippet object - preserve the original text without trimming
        const snippet = {
            id: Date.now().toString(),
            title: this.generateTitle(pageTitle, detectedLanguage),
            description: `Captured from: ${pageUrl}`,
            language: detectedLanguage,
            code: this.selectedText, // Keep original text with all whitespace
            tags: ['web-capture', this.getDomainTag()],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        console.log('Snippet to save:', snippet);

        try {
            // Send snippet to background script for saving
            const response = await chrome.runtime.sendMessage({
                action: 'saveSnippet',
                snippet: snippet
            });

            if (response.success) {
                console.log('Snippet saved successfully:', snippet);
                this.showNotification('Code snippet saved successfully!', 'success');
            } else {
                throw new Error(response.error || 'Failed to save snippet');
            }

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
        // Remove existing notifications immediately
        const existing = document.querySelectorAll('.code-snippet-notification');
        existing.forEach(el => {
            el.style.transition = 'none';
            el.remove();
        });

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
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            visibility: visible;
        `;

        document.body.appendChild(notification);

        // Trigger slide in animation
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        });

        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';

                // Remove after transition completes
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, 3000);
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