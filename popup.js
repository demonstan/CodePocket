
// Initialize Prism and wait for it to load
function initializePrism() {
    return new Promise((resolve) => {
        if (typeof Prism !== 'undefined') {
            resolve();
            return;
        }

        // Wait for Prism to load
        const checkPrism = setInterval(() => {
            if (typeof Prism !== 'undefined') {
                clearInterval(checkPrism);
                resolve();
            }
        }, 50);

        // Timeout after 3 seconds
        setTimeout(() => {
            clearInterval(checkPrism);
            console.warn('Prism failed to load within timeout');
            resolve();
        }, 3000);
    });
}

class SnippetManager {
    constructor() {
        this.snippets = [];
        this.editingId = null;
        this.useLocalStorageFallback = false;
        this.initialized = false;
        this.gistSync = new GistSyncService();
        this.autoSyncEnabled = true; // 启用自动同步
        this.syncQueue = []; // 同步队列
        this.isSyncing = false; // 同步状态标记

        // 调试信息
        console.log('SnippetManager constructing...');

        // 延迟初始化以确保DOM完全准备好
        setTimeout(() => {
            this.initialize().catch(error => {
                console.error('Initialization failed:', error);
                this.showFallbackUI('Failed to initialize extension. Please refresh the page.');
            });
        }, 100);
    }

    async initialize() {
        try {
            // 确保DOM完全加载
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }

            await this.testStoragePermissions();
            this.initializeElements();
            this.attachEventListeners();
            await this.loadAutoSyncSetting(); // 加载自动同步设置
            await this.loadSnippets();
            this.initialized = true;
            console.log('SnippetManager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize SnippetManager:', error);
            this.showFallbackUI('Failed to initialize extension. Please refresh the page.');
        }
    }

    showFallbackUI(message) {
        document.body.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #f44336; font-family: Arial, sans-serif;">
                <h3>Extension Error</h3>
                <p>${message}</p>
                <button onclick="location.reload()" style="
                    background: #4CAF50;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-top: 10px;
                ">Refresh</button>
            </div>
        `;
    }

    async testStoragePermissions() {
        try {
            // 等待一小段时间确保Chrome API准备就绪
            await new Promise(resolve => setTimeout(resolve, 100));

            // 检查chrome.storage是否可用
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
                throw new Error('Chrome storage API not available');
            }

            // 测试存储权限
            await chrome.storage.local.set({ test: 'test' });
            const result = await chrome.storage.local.get(['test']);
            console.log('Storage test result:', result);
            await chrome.storage.local.remove(['test']);
            console.log('Storage permissions: OK');
        } catch (error) {
            console.error('Storage permissions error:', error);

            // 提供更详细的错误信息和解决方案
            let errorMessage = 'Storage permission error. ';
            if (typeof chrome === 'undefined') {
                errorMessage += 'Extension context not available. Please reload the extension.';
            } else if (!chrome.storage) {
                errorMessage += 'Storage API not available. Please check manifest permissions.';
            } else {
                errorMessage += 'Please check extension permissions and try again.';
            }

            this.showNotification(errorMessage, 'error');

            // 尝试使用localStorage作为后备
            this.useLocalStorageFallback = true;
            console.log('Falling back to localStorage');
        }
    }

    initializeElements() {
        try {
            this.elements = {
                addBtn: document.getElementById('addSnippetBtn'),
                syncBtn: document.getElementById('syncBtn'),
                importBtn: document.getElementById('importBtn'),
                exportBtn: document.getElementById('exportBtn'),
                searchInput: document.getElementById('searchInput'),
                languageFilter: document.getElementById('languageFilter'),
                snippetForm: document.getElementById('snippetForm'),
                snippetsList: document.getElementById('snippetsList'),
                emptyState: document.getElementById('emptyState'),

                // Form elements
                snippetTitle: document.getElementById('snippetTitle'),
                snippetDescription: document.getElementById('snippetDescription'),
                snippetLanguage: document.getElementById('snippetLanguage'),
                snippetTags: document.getElementById('snippetTags'),
                snippetCode: document.getElementById('snippetCode'),
                saveBtn: document.getElementById('saveSnippetBtn'),
                cancelBtn: document.getElementById('cancelBtn'),

                // Sync modal elements
                syncModal: document.getElementById('syncModal'),
                modalOverlay: document.getElementById('modalOverlay'),
                closeSyncModal: document.getElementById('closeSyncModal'),
                authSection: document.getElementById('authSection'),
                syncSection: document.getElementById('syncSection'),
                syncProgress: document.getElementById('syncProgress'),
                githubToken: document.getElementById('githubToken'),
                authenticateBtn: document.getElementById('authenticateBtn'),
                githubUsername: document.getElementById('githubUsername'),
                lastSyncTime: document.getElementById('lastSyncTime'),
                gistStatus: document.getElementById('gistStatus'),
                uploadBtn: document.getElementById('uploadBtn'),
                downloadBtn: document.getElementById('downloadBtn'),
                disconnectBtn: document.getElementById('disconnectBtn'),

                // Hidden file input
                fileInput: document.getElementById('fileInput')
            };

            // 检查关键元素是否存在
            const requiredElements = ['addBtn', 'snippetForm', 'snippetsList', 'snippetTitle', 'snippetCode', 'saveBtn', 'cancelBtn'];
            const missingElements = requiredElements.filter(key => !this.elements[key]);

            if (missingElements.length > 0) {
                console.error('Missing required elements:', missingElements);
                throw new Error(`Missing required elements: ${missingElements.join(', ')}`);
            }

            console.log('All elements initialized successfully');
        } catch (error) {
            console.error('Error initializing elements:', error);
            throw error;
        }
    }

    attachEventListeners() {
        try {
            if (this.elements.addBtn) {
                this.elements.addBtn.addEventListener('click', () => {
                    console.log('Add button clicked');
                    this.showForm();
                });
            }

            if (this.elements.syncBtn) {
                this.elements.syncBtn.addEventListener('click', () => this.showSyncModal());
            }

            // Dropdown menu handling
            const moreActionsBtn = document.getElementById('moreActionsBtn');
            const dropdownMenu = document.getElementById('dropdownMenu');

            if (moreActionsBtn && dropdownMenu) {
                // Toggle dropdown
                moreActionsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();

                    // 切换显示状态
                    const isVisible = dropdownMenu.classList.contains('show');

                    if (isVisible) {
                        // 隐藏下拉菜单
                        dropdownMenu.classList.remove('show');
                        setTimeout(() => {
                            dropdownMenu.classList.add('hidden');
                        }, 300);
                    } else {
                        // 显示下拉菜单
                        dropdownMenu.classList.remove('hidden');
                        // 强制重排
                        dropdownMenu.offsetHeight;
                        // 触发渐入动画
                        setTimeout(() => {
                            dropdownMenu.classList.add('show');
                        }, 10);
                    }
                });

                // Close dropdown when clicking outside
                document.addEventListener('click', (e) => {
                    if (!moreActionsBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
                        if (dropdownMenu.classList.contains('show')) {
                            dropdownMenu.classList.remove('show');
                            setTimeout(() => {
                                dropdownMenu.classList.add('hidden');
                            }, 300);
                        }
                    }
                });
            }

            const autoSyncToggle = document.getElementById('autoSyncToggle');
            if (autoSyncToggle) {
                autoSyncToggle.addEventListener('click', () => {
                    this.toggleAutoSync();
                    // Close dropdown after action
                    const dropdownMenu = document.getElementById('dropdownMenu');
                    if (dropdownMenu && dropdownMenu.classList.contains('show')) {
                        dropdownMenu.classList.remove('show');
                        setTimeout(() => {
                            dropdownMenu.classList.add('hidden');
                        }, 300);
                    }
                });
            }

            if (this.elements.importBtn) {
                this.elements.importBtn.addEventListener('click', () => {
                    this.importSnippets();
                    // Close dropdown after action
                    const dropdownMenu = document.getElementById('dropdownMenu');
                    if (dropdownMenu && dropdownMenu.classList.contains('show')) {
                        dropdownMenu.classList.remove('show');
                        setTimeout(() => {
                            dropdownMenu.classList.add('hidden');
                        }, 300);
                    }
                });
            }

            if (this.elements.exportBtn) {
                this.elements.exportBtn.addEventListener('click', () => {
                    this.exportSnippets();
                    // Close dropdown after action
                    const dropdownMenu = document.getElementById('dropdownMenu');
                    if (dropdownMenu && dropdownMenu.classList.contains('show')) {
                        dropdownMenu.classList.remove('show');
                        setTimeout(() => {
                            dropdownMenu.classList.add('hidden');
                        }, 300);
                    }
                });
            }

            if (this.elements.searchInput) {
                this.elements.searchInput.addEventListener('input', () => this.filterSnippets());
            }

            if (this.elements.languageFilter) {
                this.elements.languageFilter.addEventListener('change', () => this.filterSnippets());
            }

            if (this.elements.saveBtn) {
                this.elements.saveBtn.addEventListener('click', () => this.saveSnippet());
            }

            if (this.elements.cancelBtn) {
                this.elements.cancelBtn.addEventListener('click', () => this.hideForm());
            }

            if (this.elements.fileInput) {
                this.elements.fileInput.addEventListener('change', (e) => this.handleFileImport(e));
            }

            // Sync modal event listeners
            if (this.elements.closeSyncModal) {
                this.elements.closeSyncModal.addEventListener('click', () => this.hideSyncModal());
            }

            if (this.elements.modalOverlay) {
                this.elements.modalOverlay.addEventListener('click', () => this.hideSyncModal());
            }

            if (this.elements.authenticateBtn) {
                this.elements.authenticateBtn.addEventListener('click', () => this.authenticateGitHub());
            }

            if (this.elements.uploadBtn) {
                this.elements.uploadBtn.addEventListener('click', () => this.uploadToGist());
            }

            if (this.elements.downloadBtn) {
                this.elements.downloadBtn.addEventListener('click', () => this.downloadFromGist());
            }

            if (this.elements.disconnectBtn) {
                this.elements.disconnectBtn.addEventListener('click', () => this.disconnectGitHub());
            }

            // Handle Enter key in form
            if (this.elements.snippetForm) {
                this.elements.snippetForm.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        this.saveSnippet();
                    }
                });
            }

            console.log('Event listeners attached successfully');
        } catch (error) {
            console.error('Error attaching event listeners:', error);
            throw error;
        }
    }

    async loadSnippets() {
        try {
            let result;

            if (this.useLocalStorageFallback || typeof chrome === 'undefined' || !chrome.storage) {
                // 使用localStorage作为后备
                const stored = localStorage.getItem('code-snippets');
                result = { snippets: stored ? JSON.parse(stored) : [] };
                console.log('Using localStorage fallback');
            } else {
                // 使用 chrome.storage.local
                result = await chrome.storage.local.get(['snippets']);
            }

            this.snippets = result.snippets || [];
            console.log('Loaded snippets:', this.snippets.length);

            // 如果没有snippets，添加一个示例snippet用于测试
            if (this.snippets.length === 0) {
                console.log('No snippets found, adding sample snippet');
                const sampleSnippet = {
                    id: 'sample-' + Date.now(),
                    title: 'Welcome Example',
                    description: 'This is a sample snippet to get you started',
                    language: 'javascript',
                    code: 'console.log("Hello, Code Snippet Saver!");',
                    tags: ['example', 'welcome'],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                this.snippets.push(sampleSnippet);
                await this.saveSnippetsToStorage();
                this.showNotification('Welcome! Sample snippet added.', 'info');
            }

            this.renderSnippets();
        } catch (error) {
            console.error('Error loading snippets:', error);
            // 尝试使用localStorage作为最后的后备
            try {
                const stored = localStorage.getItem('code-snippets');
                this.snippets = stored ? JSON.parse(stored) : [];
                this.useLocalStorageFallback = true;
                console.log('Fallback to localStorage successful');
                this.renderSnippets();
                this.showNotification('Loaded snippets from local storage', 'info');
            } catch (fallbackError) {
                console.error('Fallback error:', fallbackError);
                this.snippets = [];
                this.renderSnippets();
                this.showNotification('Error loading snippets: ' + error.message, 'error');
            }
        }
    }

    async saveSnippetsToStorage() {
        try {
            if (this.useLocalStorageFallback || typeof chrome === 'undefined' || !chrome.storage) {
                // 使用localStorage作为后备
                localStorage.setItem('code-snippets', JSON.stringify(this.snippets));
                console.log('Saved snippets to localStorage:', this.snippets.length);
            } else {
                // 使用chrome.storage.local
                await chrome.storage.local.set({ snippets: this.snippets });
                console.log('Saved snippets to chrome.storage:', this.snippets.length);
            }
        } catch (error) {
            console.error('Error saving snippets:', error);

            // 尝试使用localStorage作为后备
            try {
                localStorage.setItem('code-snippets', JSON.stringify(this.snippets));
                this.useLocalStorageFallback = true;
                console.log('Fallback save to localStorage successful');
                this.showNotification('Snippets saved to local storage', 'info');
            } catch (fallbackError) {
                console.error('Fallback save error:', fallbackError);
                this.showNotification('Failed to save snippet. Please try again.', 'error');
            }
        }
    }

    showForm(snippet = null) {
        console.log('showForm called with snippet:', snippet);

        // 检查是否已初始化
        if (!this.initialized) {
            console.error('SnippetManager not initialized');
            this.showNotification('Extension not ready. Please wait...', 'error');
            return;
        }

        // 确保所有表单元素都存在
        if (!this.elements || !this.elements.snippetForm || !this.elements.snippetTitle ||
            !this.elements.snippetDescription || !this.elements.snippetLanguage ||
            !this.elements.snippetTags || !this.elements.snippetCode ||
            !this.elements.saveBtn) {
            console.error('Form elements not found');
            this.showNotification('Form elements not found. Please refresh the page.', 'error');
            return;
        }

        this.editingId = snippet ? snippet.id : null;

        if (snippet) {
            try {
                this.elements.snippetTitle.value = snippet.title || '';
                this.elements.snippetDescription.value = snippet.description || '';
                this.elements.snippetLanguage.value = snippet.language || '';
                this.elements.snippetTags.value = Array.isArray(snippet.tags) ? snippet.tags.join(', ') : '';
                this.elements.snippetCode.value = snippet.code || '';
                this.elements.saveBtn.textContent = 'Update';
                console.log('Form populated with snippet data');
            } catch (error) {
                console.error('Error populating form:', error);
                this.showNotification('Error loading snippet data. Please try again.', 'error');
                return;
            }
        } else {
            this.clearForm();
            this.elements.saveBtn.textContent = 'Save';
        }

        // 隐藏搜索框和snippet列表
        const searchContainer = document.querySelector('.search-container');
        if (searchContainer) {
            searchContainer.classList.add('hidden');
        }
        this.elements.snippetsList.classList.add('hidden');
        this.elements.emptyState.classList.add('hidden');

        // Force reflow to ensure proper layout calculation
        document.body.offsetHeight;

        this.elements.snippetForm.classList.remove('hidden');

        // 安全地聚焦到标题字段
        setTimeout(() => {
            if (this.elements.snippetTitle) {
                this.elements.snippetTitle.focus();
            }
        }, 100);
    }

    hideForm() {
        this.elements.snippetForm.classList.add('hidden');
        this.clearForm();
        this.editingId = null;

        // Force layout reflow before showing other elements
        document.body.offsetHeight;

        // 重新显示搜索框和snippet列表
        const searchContainer = document.querySelector('.search-container');
        if (searchContainer) {
            searchContainer.classList.remove('hidden');
        }
        this.elements.snippetsList.classList.remove('hidden');

        // 如果没有snippets，显示空状态
        if (this.snippets.length === 0) {
            this.elements.emptyState.classList.remove('hidden');
        }
    }

    clearForm() {
        this.elements.snippetTitle.value = '';
        this.elements.snippetDescription.value = '';
        this.elements.snippetLanguage.value = '';
        this.elements.snippetTags.value = '';
        this.elements.snippetCode.value = '';
    }

    async saveSnippet() {
        try {
            // 检查表单元素是否存在
            if (!this.elements || !this.elements.snippetTitle || !this.elements.snippetCode) {
                this.showNotification('Form not ready. Please try again.', 'error');
                return;
            }

            const title = this.elements.snippetTitle.value.trim();
            const description = this.elements.snippetDescription.value.trim();
            const language = this.elements.snippetLanguage.value;
            const tags = this.elements.snippetTags.value.split(',').map(t => t.trim()).filter(t => t);
            const code = this.elements.snippetCode.value.trim();

            if (!title || !language || !code) {
                this.showNotification('Please fill in all required fields (Title, Language, Code)', 'error');
                return;
            }

            const snippet = {
                id: this.editingId || Date.now().toString() + Math.random().toString(36).substr(2, 5),
                title,
                description,
                language,
                tags,
                code,
                createdAt: this.editingId ?
                    this.snippets.find(s => s.id === this.editingId)?.createdAt || new Date().toISOString() :
                    new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            if (this.editingId) {
                const index = this.snippets.findIndex(s => s.id === this.editingId);
                if (index !== -1) {
                    this.snippets[index] = snippet;
                } else {
                    this.snippets.unshift(snippet);
                }
            } else {
                this.snippets.unshift(snippet);
            }

            await this.saveSnippetsToStorage();
            this.showNotification(`Snippet ${this.editingId ? 'updated' : 'saved'} successfully!`, 'success');

            // Add success animation to save button
            this.elements.saveBtn.classList.add('success-animation');
            setTimeout(() => {
                this.elements.saveBtn.classList.remove('success-animation');
            }, 600);

            this.renderSnippets();
            this.hideForm();

            // 自动同步到 Gist
            this.autoSyncToGist();

            // Show success animation
            setTimeout(() => {
                const newCard = document.querySelector(`[data-id="${snippet.id}"]`);
                if (newCard) {
                    newCard.classList.add('new');
                    setTimeout(() => newCard.classList.remove('new'), 300);
                }
            }, 50);

        } catch (error) {
            console.error('Error saving snippet:', error);
            this.showNotification('Failed to save snippet. Please check permissions.', 'error');
        }
    }

    async deleteSnippet(id) {
        if (confirm('Are you sure you want to delete this snippet?')) {
            this.snippets = this.snippets.filter(s => s.id !== id);
            await this.saveSnippetsToStorage();
            this.renderSnippets();
            this.showNotification('Snippet deleted successfully!', 'success');

            // 自动同步到 Gist
            this.autoSyncToGist();
        }
    }

    filterSnippets() {
        const searchTerm = this.elements.searchInput.value.toLowerCase();
        const selectedLanguage = this.elements.languageFilter.value;

        const filteredSnippets = this.snippets.filter(snippet => {
            const matchesSearch = !searchTerm ||
                snippet.title.toLowerCase().includes(searchTerm) ||
                snippet.description.toLowerCase().includes(searchTerm) ||
                snippet.code.toLowerCase().includes(searchTerm) ||
                snippet.tags.some(tag => tag.toLowerCase().includes(searchTerm));

            const matchesLanguage = !selectedLanguage || snippet.language === selectedLanguage;

            return matchesSearch && matchesLanguage;
        });

        this.renderSnippets(filteredSnippets);
    }

    renderSnippets(snippetsToRender = null) {
        const snippets = snippetsToRender || this.snippets;
        console.log('Rendering snippets:', snippets.length);

        if (snippets.length === 0) {
            this.elements.snippetsList.innerHTML = '';
            this.elements.emptyState.classList.remove('hidden');
            console.log('Showing empty state');
            return;
        }

        this.elements.emptyState.classList.add('hidden');

        this.elements.snippetsList.innerHTML = snippets.map(snippet => `
            <div class="snippet-card" data-id="${snippet.id}">
                <div class="snippet-header">
                    <div class="snippet-title">${this.escapeHtml(snippet.title)}</div>
                    <div class="snippet-meta">
                        <span class="language-badge">${snippet.language.toUpperCase()}</span>
                        <span>${this.formatDate(snippet.createdAt)}</span>
                    </div>
                    ${snippet.description ? `<div class="snippet-description">${this.escapeHtml(snippet.description)}</div>` : ''}
                    ${snippet.tags.length > 0 ? `
                        <div class="snippet-tags">
                            ${snippet.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="snippet-code">
                    <pre><code class="language-${snippet.language}">${this.escapeHtml(snippet.code)}</code></pre>
                    <button class="copy-btn" data-snippet-id="${snippet.id}">Copy</button>
                </div>
                <div class="snippet-actions">
                    <button class="action-btn edit-btn" data-id="${snippet.id}" title="Edit snippet">✏️</button>
                    <button class="action-btn delete-btn" data-id="${snippet.id}" title="Delete snippet">×</button>
                </div>
            </div>
        `).join('');

        console.log('Snippets rendered successfully');

        // Apply syntax highlighting
        this.applySyntaxHighlighting();

        // Attach event listeners to new elements
        this.attachSnippetEventListeners();
    }

    async applySyntaxHighlighting() {
        try {
            await initializePrism();
            if (typeof Prism !== 'undefined') {
                // Re-highlight all code blocks with error handling
                const codeBlocks = document.querySelectorAll('code[class*="language-"]');
                let highlightedCount = 0;

                codeBlocks.forEach(block => {
                    try {
                        if (block.classList.length > 0) {
                            // Try to highlight, but don't fail if language module is missing
                            Prism.highlightElement(block);
                            highlightedCount++;
                        }
                    } catch (highlightError) {
                        console.warn('Failed to highlight code block:', highlightError);
                        // Apply basic styling as fallback for this block
                        this.applyBasicCodeStylingToElement(block);
                    }
                });

                console.log('Prism highlighting applied to', highlightedCount, 'of', codeBlocks.length, 'code blocks');
            } else {
                console.warn('Prism still not available after initialization');
                this.applyBasicCodeStyling();
            }
        } catch (error) {
            console.error('Error applying Prism highlighting:', error);
            this.applyBasicCodeStyling();
        }
    }

    applyBasicCodeStyling() {
        const codeBlocks = document.querySelectorAll('code[class*="language-"]');
        codeBlocks.forEach(block => this.applyBasicCodeStylingToElement(block));
        console.log('Applied basic code styling to', codeBlocks.length, 'code blocks');
    }

    applyBasicCodeStylingToElement(block) {
        block.style.fontFamily = 'Monaco, Menlo, Ubuntu Mono, monospace';
        block.style.fontSize = '13px';
        block.style.lineHeight = '1.4';
        block.style.color = '#ccc';
        block.style.whiteSpace = 'pre-wrap';
        block.style.wordBreak = 'break-word';
    }

    attachSnippetEventListeners() {
        // Edit buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                try {
                    e.preventDefault();
                    e.stopPropagation();

                    const id = e.target.getAttribute('data-id') || e.target.dataset.id;
                    console.log('Edit button clicked, ID:', id);

                    if (!id) {
                        console.error('No ID found on edit button');
                        this.showNotification('Error: Snippet ID not found', 'error');
                        return;
                    }

                    const snippet = this.snippets.find(s => s.id === id);
                    if (!snippet) {
                        console.error('Snippet not found for ID:', id);
                        this.showNotification('Error: Snippet not found', 'error');
                        return;
                    }

                    console.log('Found snippet for edit:', snippet);
                    this.showForm(snippet);
                } catch (error) {
                    console.error('Error in edit button handler:', error);
                    this.showNotification('Error editing snippet: ' + error.message, 'error');
                }
            });
        });

        // Delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                try {
                    e.preventDefault();
                    e.stopPropagation();

                    const id = e.target.getAttribute('data-id') || e.target.dataset.id;
                    console.log('Delete button clicked, ID:', id);

                    if (id) {
                        this.deleteSnippet(id);
                    } else {
                        console.error('No ID found on delete button');
                        this.showNotification('Error: Snippet ID not found', 'error');
                    }
                } catch (error) {
                    console.error('Error in delete button handler:', error);
                    this.showNotification('Error deleting snippet: ' + error.message, 'error');
                }
            });
        });

        // Copy buttons
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                try {
                    e.preventDefault();
                    e.stopPropagation();

                    const snippetId = e.target.dataset.snippetId;
                    if (snippetId) {
                        const snippet = this.snippets.find(s => s.id === snippetId);
                        if (snippet) {
                            this.copyToClipboard(snippet.code, e.target);
                        } else {
                            this.showNotification('Error: Snippet not found', 'error');
                        }
                    } else {
                        this.showNotification('Error: No snippet ID found', 'error');
                    }
                } catch (error) {
                    console.error('Error in copy button handler:', error);
                    this.showNotification('Error copying code: ' + error.message, 'error');
                }
            });
        });
    }

    async copyToClipboard(text, button) {
        try {
            await navigator.clipboard.writeText(text);
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            button.classList.add('copied', 'success-copy');

            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('copied', 'success-copy');
            }, 2000);
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);

            button.textContent = 'Copied!';
            button.classList.add('success-copy');
            setTimeout(() => {
                button.textContent = 'Copy';
                button.classList.remove('success-copy');
            }, 2000);
        }
    }

    importSnippets() {
        this.elements.fileInput.click();
    }

    async handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const importedData = JSON.parse(text);

            if (Array.isArray(importedData)) {
                // Validate imported snippets
                const validSnippets = importedData.filter(snippet =>
                    snippet.title && snippet.language && snippet.code
                );

                if (validSnippets.length === 0) {
                    this.showNotification('No valid snippets found in the imported file.', 'error');
                    return;
                }

                // Add unique IDs and timestamps to imported snippets
                validSnippets.forEach(snippet => {
                    snippet.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                    snippet.createdAt = snippet.createdAt || new Date().toISOString();
                    snippet.updatedAt = new Date().toISOString();
                    snippet.tags = snippet.tags || [];
                });

                this.snippets = [...validSnippets, ...this.snippets];
                await this.saveSnippetsToStorage();
                this.renderSnippets();

                this.showNotification(`Successfully imported ${validSnippets.length} snippet(s)!`, 'success');

                // Auto-sync to Gist if configured
                await this.autoSyncAfterImport();
            } else {
                this.showNotification('Invalid file format. Please select a valid JSON file.', 'error');
            }
        } catch (error) {
            console.error('Import error:', error);
            this.showNotification('Error importing file. Please make sure it\'s a valid JSON file.', 'error');
        }

        // Clear the file input
        event.target.value = '';
    }

    // Auto-sync after importing snippets
    async autoSyncAfterImport() {
        try {
            // Check if user is authenticated with GitHub
            const isAuthenticated = await this.gistSync.isAuthenticated();
            if (!isAuthenticated) {
                console.log('Gist not configured, skipping auto-sync after import');
                return;
            }

            // Check if auto-sync is enabled
            if (!this.autoSyncEnabled) {
                console.log('Auto-sync disabled, skipping sync after import');
                return;
            }

            // Show notification about auto-sync
            this.showNotification('Syncing imported snippets to GitHub Gist...', 'info');

            // Perform the sync
            await this.performAutoSync();

            this.showNotification('Import completed and synced to GitHub Gist!', 'success');

        } catch (error) {
            console.error('Auto-sync after import failed:', error);
            this.showNotification('Import successful, but sync to Gist failed. You can sync manually.', 'error');
        }
    }

    exportSnippets() {
        if (this.snippets.length === 0) {
            this.showNotification('No snippets to export!', 'error');
            return;
        }

        const dataStr = JSON.stringify(this.snippets, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `code-snippets-${new Date().toISOString().split('T')[0]}.json`;
        link.click();

        URL.revokeObjectURL(link.href);
        this.showNotification('Snippets exported successfully!', 'success');
    }

    // GitHub Sync Modal Methods
    async showSyncModal() {
        // Show modal with loading state first
        this.elements.modalOverlay.classList.remove('hidden');
        this.elements.syncModal.classList.remove('hidden');

        // Trigger reflow to ensure the element is visible before adding animation class
        this.elements.modalOverlay.offsetHeight;
        this.elements.syncModal.offsetHeight;

        // Add animation classes
        this.elements.modalOverlay.classList.add('show');
        this.elements.syncModal.classList.add('show');

        // Hide all sections initially
        this.elements.authSection.classList.add('hidden');
        this.elements.syncSection.classList.add('hidden');
        this.elements.syncProgress.classList.add('hidden');

        try {
            // Check authentication status
            const isAuthenticated = await this.gistSync.isAuthenticated();

            // Show loading state
            this.showSyncProgress('Checking authentication...');

            if (isAuthenticated) {
                await this.updateSyncModalAuthenticatedState();

                // Hide loading state
                this.hideSyncProgress();
            } else {
                this.showSyncModalAuthSection();
            }
        } catch (error) {
            console.error('Error checking authentication:', error);
            this.showSyncModalAuthSection();
        }
    }

    hideSyncModal() {
        // Add fade out animation
        this.elements.syncModal.classList.remove('show');
        this.elements.modalOverlay.classList.remove('show');

        // Wait for animation to complete before hiding
        setTimeout(() => {
            this.elements.syncModal.classList.add('hidden');
            this.elements.modalOverlay.classList.add('hidden');
        }, 300);

        this.hideSyncProgress();
    }

    showSyncModalAuthSection() {
        this.elements.authSection.classList.remove('hidden');
        this.elements.syncSection.classList.add('hidden');
        this.elements.syncProgress.classList.add('hidden');
    }

    hideSyncModalAuthSection() {
        this.elements.authSection.classList.add('hidden');
    }

    async updateSyncModalAuthenticatedState() {
        try {
            // Get user info
            const userInfo = await this.gistSync.getUserInfo();
            const syncStatus = await this.gistSync.getSyncStatus();

            // Update UI
            this.elements.githubUsername.textContent = userInfo.login;
            this.elements.lastSyncTime.textContent = syncStatus.lastSync ?
                this.formatDate(syncStatus.lastSync) : 'Never';
            this.elements.gistStatus.textContent = syncStatus.hasGist ?
                'Connected' : 'Not created';

            // Show sync section
            this.elements.authSection.classList.add('hidden');
            this.elements.syncSection.classList.remove('hidden');
            this.elements.syncProgress.classList.add('hidden');

            // Update sync button status
            this.updateSyncButtonStatus('authenticated');

        } catch (error) {
            console.error('Error updating sync modal:', error);
            this.showNotification('Failed to get sync status: ' + error.message, 'error');
            this.showSyncModalAuthSection();
        }
    }

    async authenticateGitHub() {
        const token = this.elements.githubToken.value.trim();

        if (!token) {
            this.showNotification('Please enter a GitHub token', 'error');
            return;
        }

        this.showSyncProgress('Validating token...');
        this.hideSyncModalAuthSection();

        try {
            // Validate token
            const isValid = await this.gistSync.validateToken(token);

            if (!isValid) {
                throw new Error('Invalid GitHub token');
            }

            // Store token
            await this.gistSync.setToken(token);

            // Try to find and reconnect to existing Gist
            this.showSyncProgress('Looking for existing Gists...');
            const existingGist = await this.gistSync.findAndConnectExistingGist();

            if (existingGist) {
                console.log('Found and reconnected to existing Gist:', existingGist.id);
                this.showNotification('Authenticated and reconnected to existing Gist!', 'success');
            } else {
                console.log('No existing Gist found, will create new one when uploading');
                this.showNotification('Successfully authenticated with GitHub!', 'success');
            }

            // Update UI
            await this.updateSyncModalAuthenticatedState();
            this.elements.githubToken.value = '';

        } catch (error) {
            console.error('Authentication error:', error);
            // show auth section again
            this.showSyncModalAuthSection();
            this.showNotification('Authentication failed: ' + error.message, 'error');
        } finally {
            this.hideSyncProgress();
        }
    }

    async uploadToGist() {
        if (this.snippets.length === 0) {
            this.showNotification('No snippets to upload', 'error');
            return;
        }

        this.showSyncProgress('Uploading snippets to Gist...');
        this.updateSyncButtonStatus('syncing');

        try {
            const result = await this.gistSync.uploadSnippets(this.snippets);

            this.showNotification(`Successfully uploaded ${this.snippets.length} snippets to Gist!`, 'success');

            // Update sync status
            await this.updateSyncModalAuthenticatedState();

        } catch (error) {
            console.error('Upload error:', error);
            this.showNotification('Upload failed: ' + error.message, 'error');
            this.updateSyncButtonStatus('error');
        } finally {
            this.hideSyncProgress();
        }
    }

    async downloadFromGist() {
        this.showSyncProgress('Downloading snippets from Gist...');
        this.updateSyncButtonStatus('syncing');

        try {
            // Check if we have a Gist ID, if not try to find one
            const currentGistId = await this.gistSync.getGistId();
            if (!currentGistId) {
                this.showSyncProgress('Looking for existing Gists...');
                const existingGist = await this.gistSync.findAndConnectExistingGist();
                if (!existingGist) {
                    throw new Error('No Gist found. Please upload your snippets first to create a Gist.');
                }
                console.log('Found and connected to Gist:', existingGist.id);
            }

            const result = await this.gistSync.downloadSnippets();

            if (result.snippets.length === 0) {
                this.showNotification('No snippets found in Gist', 'info');
                return;
            }

            // Ask user if they want to merge or replace
            const shouldMerge = confirm(
                `Found ${result.snippets.length} snippets in Gist. ` +
                `Click OK to merge with existing snippets, or Cancel to replace all snippets.`
            );

            if (shouldMerge) {
                // Merge with existing snippets (avoid duplicates by ID)
                const existingIds = new Set(this.snippets.map(s => s.id));
                const newSnippets = result.snippets.filter(s => !existingIds.has(s.id));
                this.snippets = [...newSnippets, ...this.snippets];
            } else {
                // Replace all snippets
                this.snippets = result.snippets;
            }

            await this.saveSnippetsToStorage();
            this.renderSnippets();

            this.showNotification(
                `Successfully downloaded ${result.snippets.length} snippets from Gist!`,
                'success'
            );

            // Update sync status
            await this.updateSyncModalAuthenticatedState();

        } catch (error) {
            console.error('Download error:', error);
            this.showNotification('Download failed: ' + error.message, 'error');
            this.updateSyncButtonStatus('error');
        } finally {
            this.hideSyncProgress();
        }
    }

    async disconnectGitHub() {
        const confirmed = confirm(
            'Are you sure you want to disconnect from GitHub? ' +
            'This will remove your authentication token but keep your local snippets.'
        );

        if (!confirmed) return;

        try {
            await this.gistSync.clearAuth();
            this.showSyncModalAuthSection();
            this.updateSyncButtonStatus('disconnected');
            this.showNotification('Successfully disconnected from GitHub', 'success');
        } catch (error) {
            console.error('Disconnect error:', error);
            this.showNotification('Failed to disconnect: ' + error.message, 'error');
        }
    }

    showSyncProgress(message = 'Syncing...') {
        this.elements.syncProgress.classList.remove('hidden');
        this.elements.syncProgress.querySelector('.progress-text').textContent = message;
    }

    hideSyncProgress() {
        this.elements.syncProgress.classList.add('hidden');
    }

    updateSyncButtonStatus(status) {
        const syncBtn = this.elements.syncBtn;
        const syncIcon = document.getElementById('syncIcon');

        // Remove all status classes
        syncBtn.classList.remove('syncing', 'error');

        switch (status) {
            case 'syncing':
                syncBtn.classList.add('syncing');
                syncIcon.textContent = '⏳';
                break;
            case 'error':
                syncBtn.classList.add('error');
                syncIcon.textContent = '❌';
                // Reset to normal after 3 seconds
                setTimeout(() => this.updateSyncButtonStatus('authenticated'), 3000);
                break;
            case 'authenticated':
                syncIcon.textContent = '☁️';
                break;
            case 'disconnected':
                syncIcon.textContent = '☁️';
                break;
            default:
                syncIcon.textContent = '☁️';
        }
    }

    showNotification(message, type = 'info') {
        try {
            // 移除现有通知
            const existing = document.querySelectorAll('.notification');
            existing.forEach(el => {
                el.style.animation = 'slideOutUp 0.3s ease';
                setTimeout(() => el.remove(), 300);
            });

            const notification = document.createElement('div');
            notification.className = 'notification';
            notification.textContent = message;

            const colors = {
                success: '#4CAF50',
                error: '#f44336',
                info: '#2196F3'
            };

            notification.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                left: 10px;
                background: ${colors[type] || colors.info};
                color: white;
                padding: 10px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 500;
                z-index: 10001;
                text-align: center;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                animation: slideInDown 0.3s ease;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                transform: translateY(0);
                opacity: 1;
            `;

            document.body.appendChild(notification);

            // 添加弹跳效果
            setTimeout(() => {
                notification.style.animation = 'bounceIn 0.3s ease';
            }, 50);

            // 3秒后自动移除
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.animation = 'slideOutUp 0.3s ease';
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.remove();
                        }
                    }, 300);
                }
            }, 3000);
        } catch (error) {
            console.error('Error showing notification:', error);
            // 后备通知方式
            alert(message);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);

        const diffMinutes = Math.floor(diffTime / (1000 * 60));
        const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffMinutes < 1) {
            return 'Just now';
        } else if (diffMinutes < 60) {
            return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
        } else if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays <= 7) {
            return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    // 自动同步到 Gist
    async autoSyncToGist() {
        try {
            // 检查是否启用了自动同步
            if (!this.autoSyncEnabled) {
                console.log('Auto sync is disabled');
                return;
            }

            // 检查是否已经认证
            const isAuthenticated = await this.gistSync.isAuthenticated();
            if (!isAuthenticated) {
                console.log('Not authenticated with GitHub, skipping auto sync');
                return;
            }

            // 检查是否正在同步中
            if (this.isSyncing) {
                console.log('Already syncing, adding to queue');
                this.syncQueue.push('sync');
                return;
            }

            // 执行同步
            await this.performAutoSync();

        } catch (error) {
            console.error('Auto sync error:', error);
            // 静默处理自动同步错误，不打扰用户
            this.updateSyncButtonStatus('error');
        }
    }

    // 执行自动同步
    async performAutoSync() {
        try {
            this.isSyncing = true;
            this.updateSyncButtonStatus('syncing');

            console.log('Performing auto sync...');

            // 上传当前的 snippets 到 Gist
            await this.gistSync.uploadSnippets(this.snippets);

            console.log('Auto sync completed successfully');
            this.updateSyncButtonStatus('authenticated');

            // 处理队列中的同步请求
            if (this.syncQueue.length > 0) {
                this.syncQueue = []; // 清空队列
                console.log('Processing queued sync requests...');
                // 延迟一段时间再执行，避免频繁同步
                setTimeout(() => {
                    if (this.syncQueue.length === 0) {
                        this.performAutoSync();
                    }
                }, 2000);
            }

        } catch (error) {
            console.error('Auto sync failed:', error);
            this.updateSyncButtonStatus('error');
            throw error;
        } finally {
            this.isSyncing = false;
        }
    }

    // 切换自动同步状态
    toggleAutoSync() {
        this.autoSyncEnabled = !this.autoSyncEnabled;

        // 更新UI显示
        this.updateAutoSyncUI();

        const status = this.autoSyncEnabled ? 'enabled' : 'disabled';
        console.log(`Auto sync ${status}`);
        this.showNotification(`Auto sync ${status}`, 'info');

        // 保存设置到存储
        this.saveAutoSyncSetting();
    }

    // 更新自动同步UI显示
    updateAutoSyncUI() {
        const autoSyncIcon = document.getElementById('autoSyncIcon');
        const autoSyncText = document.getElementById('autoSyncText');

        if (autoSyncIcon && autoSyncText) {
            if (this.autoSyncEnabled) {
                autoSyncIcon.textContent = '🔄';
                autoSyncText.textContent = 'Auto Sync: ON';
                autoSyncText.style.color = '#4CAF50'; // Green color for enabled
            } else {
                autoSyncIcon.textContent = '⏸️';
                autoSyncText.textContent = 'Auto Sync: OFF';
                autoSyncText.style.color = '#f44336'; // Red color for disabled
            }
        }
    }

    // 保存自动同步设置
    async saveAutoSyncSetting() {
        try {
            if (this.useLocalStorageFallback || typeof chrome === 'undefined' || !chrome.storage) {
                localStorage.setItem('autoSyncEnabled', JSON.stringify(this.autoSyncEnabled));
            } else {
                await chrome.storage.local.set({ autoSyncEnabled: this.autoSyncEnabled });
            }
        } catch (error) {
            console.error('Error saving auto sync setting:', error);
        }
    }

    // 加载自动同步设置
    async loadAutoSyncSetting() {
        try {
            let result;
            if (this.useLocalStorageFallback || typeof chrome === 'undefined' || !chrome.storage) {
                const stored = localStorage.getItem('autoSyncEnabled');
                result = { autoSyncEnabled: stored ? JSON.parse(stored) : true };
            } else {
                result = await chrome.storage.local.get(['autoSyncEnabled']);
            }

            this.autoSyncEnabled = result.autoSyncEnabled !== undefined ? result.autoSyncEnabled : true;
            console.log('Auto sync setting loaded:', this.autoSyncEnabled);

            // 初始化UI显示
            this.updateAutoSyncUI();
        } catch (error) {
            console.error('Error loading auto sync setting:', error);
            this.autoSyncEnabled = true; // 默认启用
            this.updateAutoSyncUI();
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing SnippetManager');
    new SnippetManager();
});

// Also try to initialize immediately if DOM is already ready
if (document.readyState !== 'loading') {
    console.log('DOM already ready, initializing SnippetManager immediately');
    new SnippetManager();
}