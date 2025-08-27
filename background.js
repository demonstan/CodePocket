// Background script for Code Snippet Saver Extension
console.log('Background script loaded');

// Create context menu item when extension is installed
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'save-code-snippet',
        title: 'Save code snippet to CodePocket',
        contexts: ['selection'],
        documentUrlPatterns: ['http://*/*', 'https://*/*']
    });
    console.log('Context menu item created');
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'save-code-snippet') {
        console.log('Context menu clicked, selected text:', info.selectionText);

        // Preserve line breaks and whitespace in selected text
        const selectedText = info.selectionText;

        // Send message to content script to handle the capture
        chrome.tabs.sendMessage(tab.id, {
            action: 'captureCode',
            selectedText: selectedText,
            pageUrl: info.pageUrl,
            frameUrl: info.frameUrl || info.pageUrl
        });
    }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'saveSnippet') {
        saveSnippet(request.snippet)
            .then(() => {
                sendResponse({ success: true });
            })
            .catch((error) => {
                console.error('Error saving snippet:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Will respond asynchronously
    }
});

async function saveSnippet(snippet) {
    try {
        // Get existing snippets
        const result = await chrome.storage.local.get(['snippets']);
        const snippets = result.snippets || [];

        // Add new snippet to the beginning
        snippets.unshift(snippet);

        // Save updated snippets
        await chrome.storage.local.set({ snippets });
        console.log('Snippet saved successfully:', snippet);

        return true;
    } catch (error) {
        console.error('Error in saveSnippet:', error);
        throw error;
    }
}