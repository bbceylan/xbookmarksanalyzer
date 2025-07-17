# X Bookmarks Extractor - Browser Extension

Extract and export your X (Twitter) bookmarks as Markdown. No AI, no API keys—just simple, robust, and accessible bookmark extraction.

## 🚀 Features

- **Go to Bookmarks Page**: Quickly open your X/Twitter bookmarks page.
- **Scan Bookmarks**: Extract all tweet URLs from your X Bookmarks page with one click.
- **Auto-Scroll & Scan All**: Automatically scrolls your bookmarks page to load and extract all bookmarks, even for large accounts.
- **Download as Markdown**: Export your bookmarks as a clean Markdown list for easy reference or note-taking.
- **Download as CSV**: Export your bookmarks in a spreadsheet-friendly format.
- **Copy to Clipboard**: Instantly copy your bookmarks in Markdown format to your clipboard, with a robust fallback if permissions are denied.
- **Status Bar Feedback**: All actions provide clear, accessible feedback at the top of the popup—no intrusive popups.
- **Accessibility First**: Full keyboard navigation, ARIA labels, visible focus outlines, and screen reader support.
- **Large Bookmark Set Warning**: If you have more than 500 bookmarks, you'll be warned to consider exporting in batches.
- **Privacy First**: No data leaves your browser. No API keys, no external servers, no analysis—just your bookmarks.

## 📦 Installation

### Load Unpacked Extension

1. **Download Files**: Save all the extension files to a folder:
   - `manifest.json`
   - `background.js`
   - `content-script.js`
   - `popup.html`
   - `popup.js`
   - `popup.css`
   - `icons/` (with icon PNGs)

2. **Load in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select your extension folder

## 📖 How to Use

1. **Go to Bookmarks Page**
   - Click the "Go to Bookmarks Page" button in the popup. It opens `https://x.com/i/bookmarks` in your current tab (or a new one if needed).
2. **Scan Bookmarks**
   - Make sure you're on the X Bookmarks page (`https://x.com/i/bookmarks`).
   - Click "Scan Bookmarks" to extract all tweet URLs currently loaded on the page.
3. **Auto-Scroll & Scan All**
   - For large accounts, click "Auto-Scroll & Scan All" to automatically scroll and load all bookmarks, then extract them.
4. **Export or Copy**
   - Click "Download .md" to save your bookmarks as a Markdown file.
   - Click "Download .csv" to save your bookmarks as a CSV file.
   - Or click "Copy to Clipboard" to copy the Markdown list for pasting anywhere. If clipboard permissions are denied, the extension will select the text for you to copy manually.

## 🛠️ Development

### Project Structure
```
x-bookmarks-extractor-extension/
├── manifest.json          # Extension configuration
├── background.js          # (Minimal stub, not used)
├── content-script.js      # X.com page scanning
├── popup.html             # Main interface
├── popup.js               # Popup functionality
├── popup.css              # Popup styling
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              # This file
```

### Key Technologies
- **Manifest V3**: Latest Chrome extension standard
- **Chrome Tabs & Scripting API**: Page detection, messaging, and auto-scroll
- **Accessibility**: ARIA, keyboard navigation, focus management

### Architecture
1. **Content Script**: Scans X.com pages for bookmark URLs
2. **Popup Interface**: Main user interaction and results display

## 🔒 Privacy & Security

- **Local Processing**: All bookmark extraction happens in your browser
- **No Data Collection**: Extension doesn't collect or transmit personal data
- **No API Keys**: No configuration or external services required
- **Minimal Permissions**: Only `tabs`, `activeTab`, `clipboardWrite`, and `scripting` are used

## 🐛 Troubleshooting

- Make sure you are on the X Bookmarks page (`https://x.com/i/bookmarks`) when scanning.
- If scanning fails, refresh the page and try again.
- If you see no results, scroll down to load more bookmarks or use "Auto-Scroll & Scan All".
- If clipboard copy fails, the extension will select the text for you—just press `Ctrl+C` or `Cmd+C` to copy manually.
- If you have more than 500 bookmarks, consider exporting in batches for best performance.
- All errors and statuses are shown in the status bar at the top of the popup.

## ♿ Accessibility

- All buttons and textareas are keyboard accessible and have ARIA labels.
- Status bar uses `role=status` and `aria-live` for screen readers.
- Focus outlines are strong and visible.
- Logical tab order for all interactive elements.

## 📝 License

MIT License - feel free to modify and distribute

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Extract and export your X bookmarks with ease, accessibility, and privacy!**