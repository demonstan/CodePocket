// GitHub Gist Sync Service
class GistSyncService {
    constructor() {
        this.apiBase = 'https://api.github.com';
        this.gistFileName = 'code-snippets-data.json';
        this.gistDescription = 'CodePocket - Backup Data';
        // Detect if Chrome storage is available
        this.useLocalStorage = typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local;
    }

    // Storage abstraction - get value
    async _getStorage(keys) {
        if (this.useLocalStorage) {
            const result = {};
            if (Array.isArray(keys)) {
                keys.forEach(key => {
                    const value = localStorage.getItem(key);
                    if (value !== null) {
                        try {
                            result[key] = JSON.parse(value);
                        } catch (error) {
                            console.error(`Failed to parse localStorage value for key "${key}":`, error);
                            result[key] = null;
                        }
                    }
                });
            } else {
                const value = localStorage.getItem(keys);
                if (value !== null) {
                    try {
                        result[keys] = JSON.parse(value);
                    } catch (error) {
                        console.error(`Failed to parse localStorage value for key "${keys}":`, error);
                        result[keys] = null;
                    }
                }
            }
            return result;
        } else {
            return await chrome.storage.local.get(keys);
        }
    }

    // Storage abstraction - set value
    async _setStorage(items) {
        if (this.useLocalStorage) {
            Object.keys(items).forEach(key => {
                try {
                    localStorage.setItem(key, JSON.stringify(items[key]));
                } catch (error) {
                    console.error(`Failed to save to localStorage for key "${key}":`, error);
                    throw error;
                }
            });
        } else {
            await chrome.storage.local.set(items);
        }
    }

    // Storage abstraction - remove value
    async _removeStorage(keys) {
        if (this.useLocalStorage) {
            const keysArray = Array.isArray(keys) ? keys : [keys];
            keysArray.forEach(key => {
                localStorage.removeItem(key);
            });
        } else {
            await chrome.storage.local.remove(keys);
        }
    }

    // Get stored GitHub token
    async getToken() {
        const result = await this._getStorage(['githubToken']);
        return result.githubToken;
    }

    // Store GitHub token
    async setToken(token) {
        await this._setStorage({ githubToken: token });
    }

    // Get stored Gist ID
    async getGistId() {
        const result = await this._getStorage(['gistId']);
        return result.gistId;
    }

    // Store Gist ID
    async setGistId(gistId) {
        await this._setStorage({ gistId: gistId });
    }

    // Remove authentication data
    async clearAuth() {
        await this._removeStorage(['githubToken', 'gistId', 'lastSyncTime']);
    }

    // Check if user is authenticated
    async isAuthenticated() {
        try {
            const token = await this.getToken();
            return !!token;
        } catch (error) {
            console.error('Error checking authentication:', error);
            return false;
        }
    }

    // Validate GitHub token by making a test API call
    async validateToken(token) {
        try {
            const response = await fetch(`${this.apiBase}/user`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            return response.ok;
        } catch (error) {
            console.error('Token validation error:', error);
            return false;
        }
    }

    // Get user info from GitHub
    async getUserInfo() {
        const token = await this.getToken();
        if (!token) throw new Error('No authentication token');

        const response = await fetch(`${this.apiBase}/user`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to get user info');
        }

        return await response.json();
    }

    // Create a new Gist
    async createGist(snippets) {
        const token = await this.getToken();
        if (!token) throw new Error('No authentication token');

        const gistData = {
            description: this.gistDescription,
            public: false,
            files: {
                [this.gistFileName]: {
                    content: JSON.stringify({
                        version: '1.0',
                        timestamp: new Date().toISOString(),
                        snippets: snippets
                    }, null, 2)
                }
            }
        };

        const response = await fetch(`${this.apiBase}/gists`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(gistData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Failed to create Gist: ${error.message || 'Unknown error'}`);
        }

        const gist = await response.json();
        await this.setGistId(gist.id);
        await this.updateLastSyncTime();
        return gist;
    }

    // Update existing Gist
    async updateGist(snippets) {
        const token = await this.getToken();
        const gistId = await this.getGistId();

        if (!token) throw new Error('No authentication token');
        if (!gistId) throw new Error('No Gist ID found');

        const gistData = {
            description: this.gistDescription,
            files: {
                [this.gistFileName]: {
                    content: JSON.stringify({
                        version: '1.0',
                        timestamp: new Date().toISOString(),
                        snippets: snippets
                    }, null, 2)
                }
            }
        };

        const response = await fetch(`${this.apiBase}/gists/${gistId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(gistData)
        });

        if (!response.ok) {
            if (response.status === 404) {
                // Gist not found, create a new one
                return await this.createGist(snippets);
            }
            const error = await response.json();
            throw new Error(`Failed to update Gist: ${error.message || 'Unknown error'}`);
        }

        const gist = await response.json();
        await this.updateLastSyncTime();
        return gist;
    }

    // Get Gist content
    async getGist() {
        const token = await this.getToken();
        const gistId = await this.getGistId();

        if (!token) throw new Error('No authentication token');
        if (!gistId) throw new Error('No Gist ID found');

        const response = await fetch(`${this.apiBase}/gists/${gistId}`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Gist not found');
            }
            const error = await response.json();
            throw new Error(`Failed to get Gist: ${error.message || 'Unknown error'}`);
        }

        return await response.json();
    }

    // Upload snippets to Gist
    async uploadSnippets(snippets) {
        try {
            const gistId = await this.getGistId();
            let gist;

            if (gistId) {
                gist = await this.updateGist(snippets);
            } else {
                gist = await this.createGist(snippets);
            }

            return {
                success: true,
                gistId: gist.id,
                url: gist.html_url,
                updatedAt: gist.updated_at
            };
        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        }
    }

    // Download snippets from Gist
    async downloadSnippets() {
        try {
            const gist = await this.getGist();
            const file = gist.files[this.gistFileName];

            if (!file) {
                throw new Error('Snippets file not found in Gist');
            }

            const content = JSON.parse(file.content);
            return {
                success: true,
                snippets: content.snippets || [],
                timestamp: content.timestamp,
                version: content.version
            };
        } catch (error) {
            console.error('Download error:', error);
            throw error;
        }
    }

    // List user's Gists to find existing snippet Gists
    async findSnippetGists() {
        const token = await this.getToken();
        if (!token) throw new Error('No authentication token');

        const response = await fetch(`${this.apiBase}/gists`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Failed to list Gists: ${error.message || 'Unknown error'}`);
        }

        const gists = await response.json();
        return gists.filter(gist =>
            gist.description === this.gistDescription ||
            Object.keys(gist.files).includes(this.gistFileName)
        );
    }

    // Update last sync time
    async updateLastSyncTime() {
        await this._setStorage({
            lastSyncTime: new Date().toISOString()
        });
    }

    // Get last sync time
    async getLastSyncTime() {
        const result = await this._getStorage(['lastSyncTime']);
        return result.lastSyncTime;
    }

    // Get sync status
    async getSyncStatus() {
        const isAuth = await this.isAuthenticated();
        const gistId = await this.getGistId();
        const lastSync = await this.getLastSyncTime();

        return {
            authenticated: isAuth,
            hasGist: !!gistId,
            lastSync: lastSync,
            canSync: isAuth && true
        };
    }

    // Find and reconnect to existing Gist
    async findAndConnectExistingGist() {
        try {
            const snippetGists = await this.findSnippetGists();

            if (snippetGists.length > 0) {
                // Use the most recently updated Gist
                const latestGist = snippetGists.sort((a, b) =>
                    new Date(b.updated_at) - new Date(a.updated_at)
                )[0];

                await this.setGistId(latestGist.id);
                console.log('Reconnected to existing Gist:', latestGist.id);
                return latestGist;
            }

            return null;
        } catch (error) {
            console.error('Error finding existing Gist:', error);
            return null;
        }
    }
}