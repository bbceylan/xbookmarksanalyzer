# X Bookmark Analyzer - Browser Extension

Transform your X/Twitter bookmarks into organized knowledge with AI-powered analysis.

## 🚀 Features

- **Smart Scanning**: Automatically detects bookmark URLs from X.com pages
- **AI-Powered Analysis**: Uses Claude AI to generate topics, summaries, and hashtags
- **Organized Export**: Export results as structured Markdown files
- **Privacy First**: All processing happens locally, data never leaves your browser
- **Manual Trigger**: User-controlled scanning, no automatic background activity

## 📦 Installation

### Option 1: Load Unpacked Extension (Recommended for Development)

1. **Download Files**: Save all the extension files to a folder:
   - `manifest.json`
   - `background.js`
   - `content-script.js`
   - `popup.html`
   - `popup.js`
   - `popup.css`
   - `options.html`
   - `options.js`

2. **Create Icons Folder**: Create an `icons/` folder and add extension icons:
   - `icon16.png` (16x16)
   - `icon32.png` (32x32)
   - `icon48.png` (48x48)
   - `icon128.png` (128x128)

3. **Load in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select your extension folder

4. **Configure API Key**:
   - Click the extension icon
   - Go to Settings
   - Enter your Claude API key from [Anthropic Console](https://console.anthropic.com/)

### Option 2: Chrome Web Store (Future)
*Coming soon - the extension will be published to the Chrome Web Store*

## 🔑 API Key Setup

1. **Get Claude API Key**:
   - Visit [Anthropic Console](https://console.anthropic.com/)
   - Create an account or sign in
   - Generate a new API key
   - Copy the key (starts with `sk-ant-api`)

2. **Configure Extension**:
   - Right-click the extension icon → Options
   - Paste your API key in the "Claude API Key" field
   - Click "Test API Connection" to verify
   - Save settings

## 📖 How to Use

### Step 1: Navigate to X Bookmarks
- Go to [x.com/i/bookmarks](https://x.com/i/bookmarks)
- Make sure you're logged in and can see your bookmarks

### Step 2: Scan Bookmarks
- Click the extension icon (📊) in your browser toolbar
- The extension will detect you're on the bookmarks page
- Click "Scan Current Page" to automatically extract bookmark URLs
- Or manually paste bookmark URLs in the text area

### Step 3: Analyze with AI
- Click "Analyze Bookmarks" to process URLs with Claude AI
- Wait for analysis to complete (progress bar will show status)
- Each bookmark gets categorized with topics, summaries, and hashtags

### Step 4: Export Results
- Click "Export MD" to download a Markdown file
- Results are organized by topic with clean formatting
- Use the file for reference, note-taking, or further processing

## ⚙️ Settings

Access settings by clicking the gear icon or going to Extension Options:

### API Configuration
- **Claude API Key**: Your Anthropic API key
- **Show API Key**: Toggle to reveal/hide the key

### Analysis Settings
- **Max Bookmarks**: Limit bookmarks per analysis (25-200)
- **Request Delay**: Time between API calls to avoid rate limiting
- **Auto Export**: Automatically download results after analysis
- **Group by Topic**: Organize exports by AI-generated topics

### Export Settings
- **Export Format**: Choose Markdown, JSON, or CSV
- **Filename Pattern**: Customize output filename with variables

## 🛠️ Development

### Project Structure
```
x-bookmark-analyzer-extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for API calls
├── content-script.js      # X.com page scanning
├── popup.html            # Main interface
├── popup.js              # Popup functionality
├── popup.css             # Popup styling
├── options.html          # Settings page
├── options.js            # Settings functionality
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md             # This file
```

### Key Technologies
- **Manifest V3**: Latest Chrome extension standard
- **Claude API**: Anthropic's AI for content analysis
- **Chrome Storage API**: Secure settings and statistics storage
- **Chrome Tabs API**: Page detection and messaging

### Architecture
1. **Content Script**: Scans X.com pages for bookmark URLs
2. **Background Service**: Handles Claude API calls and content fetching
3. **Popup Interface**: Main user interaction and results display
4. **Options Page**: Settings and configuration management

## 🔒 Privacy & Security

- **Local Processing**: All bookmark analysis happens in your browser
- **Secure Storage**: API keys stored using Chrome's encrypted storage
- **No Data Collection**: Extension doesn't collect or transmit personal data
- **User Control**: Manual trigger means you control when scanning happens
- **API Communication**: Only your browser communicates with Claude API

## 🐛 Troubleshooting

### Extension Not Working
- Refresh the X.com page
- Check if you're on the correct bookmarks page
- Verify API key is configured correctly
- Look for errors in browser console

### Scanning Issues
- Make sure you're logged into X.com
- Try scrolling down to load more bookmarks
- Check that bookmarks are visible on the page
- Reload the extension if needed

### Analysis Fails
- Verify API key with "Test Connection" button
- Check your Anthropic account has available credits
- Reduce the number of bookmarks being analyzed
- Increase delay between requests in settings

### Rate Limiting
- Increase delay between requests (2-5 seconds)
- Reduce max bookmarks per batch
- Wait before running another analysis

## 💡 Tips & Best Practices

1. **Start Small**: Test with 10-25 bookmarks first
2. **Use Delays**: Set 1-2 second delays to avoid rate limiting
3. **Organize Results**: Enable "Group by Topic" for better organization
4. **Regular Exports**: Export results frequently to avoid losing work
5. **Monitor API Usage**: Keep track of your Anthropic API credits

## 🎯 Future Enhancements

- Chrome Web Store publication
- Support for more AI providers (OpenAI, Google)
- Integration with note-taking apps (Notion, Obsidian)
- Duplicate bookmark detection
- Bulk operations and scheduling
- Advanced filtering and search

## 📝 License

MIT License - feel free to modify and distribute

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

- **Issues**: Report bugs and request features
- **API Support**: [Anthropic Documentation](https://docs.anthropic.com/)
- **Chrome Extensions**: [Developer Guide](https://developer.chrome.com/docs/extensions/)

---

**Transform your X bookmarks into organized knowledge! 🚀**