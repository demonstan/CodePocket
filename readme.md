# CodePocket - Code Snippet Saver - Chrome Extension

A powerful Chrome extension for saving, organizing, and managing code snippets with syntax highlighting and advanced features.

## ✨ Features

### Core Functionality
- **Save Code Snippets**: Store code with title, description, language, and tags
- **Syntax Highlighting**: Support for 15+ programming languages using Prism.js
- **Smart Organization**: Categorize snippets with tags and language filters
- **Advanced Search**: Find snippets by title, description, code content, or tags
- **Quick Copy**: One-click copy to clipboard functionality

### Data Management
- **Export/Import**: Backup and restore your snippets as JSON files
- **GitHub Gist Sync**: Cloud synchronization using GitHub Gist (requires Personal Access Token)
- **Edit & Delete**: Full CRUD operations for managing your snippets
- **Date Tracking**: Automatic creation and modification timestamps

## 🚀 Installation

### From Source (Developer Mode)

1. **Download the Extension Files**
   - Clone or download all the extension files
   - Make sure you have all these files in a folder:
     - `manifest.json`
     - `popup.html`
     - `popup.css`
     - `popup.js`
     - `content.js`
     - `gist-sync.js`
     - `prism.js`
     - `prism.css`

2. **Load Extension in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select your extension folder
   - The extension should now appear in your extensions list

3. **Pin the Extension** (Recommended)
   - Click the extensions icon (puzzle piece) in Chrome toolbar
   - Find "CodePocket" and click the pin icon
   - The extension icon will now be visible in your toolbar

## 📖 Usage Guide

### Adding Snippets Manually

1. **Click the Extension Icon** in your Chrome toolbar
2. **Click the "+" Button** in the popup header
3. **Fill in the Details**:
   - **Title**: Name for your snippet (required)
   - **Description**: Brief description (optional)
   - **Language**: Select from 15+ supported languages (required)
   - **Tags**: Comma-separated tags for organization (optional)
   - **Code**: Your code content (required)
4. **Click "Save Snippet"** or press `Ctrl+Enter` (or `Cmd+Enter`)

### Managing Your Snippets

#### Searching and Filtering
- **Search Bar**: Type to search across titles, descriptions, code, and tags
- **Language Filter**: Dropdown to filter by specific programming language
- **Combined Filtering**: Use both search and language filter together

#### Editing and Deleting
- **Edit**: Click the "✏️" button in the top-right of any snippet
- **Delete**: Click the "×" button in the top-right of any snippet and confirm
- **Copy**: Click the "Copy" button in the bottom-right of any code block

#### Data Management
- **Export**: Click the "📤" button in the header to download all snippets as JSON
- **Import**: Click the "📥" button to upload and merge snippets from a JSON file
- **GitHub Gist Sync**: Click the "☁️" button to set up cloud synchronization

### 🔄 GitHub Gist Sync Setup

The extension supports cloud synchronization using GitHub Gist for backup and cross-device access.

#### Setting Up GitHub Sync

1. **Click the Cloud Icon (☁️)** in the extension header
2. **Generate a GitHub Personal Access Token**:
   - Go to [GitHub Token Settings](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"
   - Give it a name like "Code Snippet Saver"
   - Select **only** the `gist` scope
   - Click "Generate token" and copy it
3. **Paste the Token** in the extension and click "Authenticate"
4. **Start Syncing**:
   - **Upload**: Push your local snippets to GitHub Gist
   - **Download**: Pull snippets from your GitHub Gist
   - **Auto-merge**: Option to merge or replace when downloading

#### Sync Features
- **Private Gists**: All snippets are stored in private GitHub Gists
- **Automatic Backup**: Your data is safely stored in the cloud
- **Cross-Device Access**: Access your snippets from any device
- **Conflict Resolution**: Choose between merging or replacing data
- **Sync Status**: Monitor last sync time and connection status

## 🎨 Supported Languages

The extension supports syntax highlighting for:

- JavaScript
- TypeScript
- Python
- Java
- C++
- CSS
- HTML
- PHP
- Ruby
- Go
- Rust
- SQL
- Bash
- JSON
- XML
- YAML

## ⚙️ Technical Details

### Architecture
- **Manifest V3**: Uses the latest Chrome extension API
- **Storage**: Chrome's sync storage for cross-device synchronization

### File Structure
```
CodePocket/
├── manifest.json          # Extension configuration
├── popup.html            # Main interface HTML
├── popup.css            # Styling and animations
├── popup.js             # Core functionality
├── content.js           # Web page integration
├── gist-sync.js         # GitHub Gist synchronization
├── prism.js             # Syntax highlighting library
├── prism.css            # Syntax highlighting styles
├── icons/              # Extension icons (optional)
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           # This file
```

### Permissions Used
- **storage**: For saving and syncing snippets
- **host_permissions**: For GitHub API access (api.github.com, gist.github.com)

## 🔧 Customization

### Adding New Languages
To add support for more languages:

1. **Add to Language Options** in both `popup.html` select elements
2. **Update Detection Patterns** in `content.js` `detectLanguage()` function
3. **Ensure Prism.js Support** (most languages are auto-loaded)

### Styling Changes
- Modify `popup.css` for visual customizations
- Uses CSS custom properties for easy color scheme changes
- Responsive design adapts to different screen sizes

## 🐛 Troubleshooting

### Common Issues

**Extension not loading:**
- Check that all files are in the same folder
- Verify manifest.json syntax
- Look for errors in Chrome's extension management page

**Snippets not saving:**
- Check Chrome storage permissions
- Ensure you're not in incognito mode (unless extension is enabled for incognito)
- Try refreshing the extension

## 📝 Data Format

### Export/Import JSON Structure
```json
[
  {
    "id": "1645123456789",
    "title": "React useState Hook",
    "description": "Basic useState example",
    "language": "javascript",
    "code": "const [count, setCount] = useState(0);",
    "tags": ["react", "hooks", "state"],
    "createdAt": "2024-02-18T10:30:00.000Z",
    "updatedAt": "2024-02-18T10:30:00.000Z"
  }
]
```

## 🤝 Contributing

Feel free to submit issues, feature requests, or pull requests to improve the extension!

## 📄 License

This project is open source and available under the Apache-2.0 License.

---

**Happy Coding!** 🚀