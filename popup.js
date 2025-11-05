// X Bookmarks Analyzer with AI - Popup Script v0.6.0

class PopupController {
  constructor() {
    this.initializeState();
    this.bindElements();
    this.setupEventListeners();
    this.loadSettings().then(() => {
      this.loadLastExtraction();
      this.render();
    });
  }

  initializeState = () => {
    this.state = {
      lastExtraction: null,
      isDarkMode: false,
      aiAnalysis: null,
      apiKey: '',
      progress: {
        current: 0,
        total: 0,
        status: 'Ready'
      }
    };

    this.constants = {
      BATCH_SIZE: 100,
      SCROLL_DELAY: 1000,
      MAX_SAFE_BOOKMARKS: 500
    };
  };

  bindElements = () => {
    this.elements = {
      statusBar: document.getElementById('status-bar'),
      extractionStatus: document.getElementById('extraction-status'),
      progressBar: document.getElementById('progress-container'),
      progressFill: document.querySelector('.progress-fill'),
      progressText: document.getElementById('progress-text'),
      darkModeToggle: document.getElementById('darkModeToggle'),
      clearStorageBtn: document.getElementById('clearStorageBtn'),
      bookmarksBtn: document.getElementById('bookmarksBtn'),
      scanBtn: document.getElementById('scanBtn'),
      autoScrollBtn: document.getElementById('autoScrollBtn'),
      analyzeAiBtn: document.getElementById('analyzeAiBtn'),
      exportMdBtn: document.getElementById('exportMdBtn'),
      exportCsvBtn: document.getElementById('exportCsvBtn'),
      copyClipboardBtn: document.getElementById('copyClipboardBtn'),
      mainContent: document.getElementById('mainContent'),
      closeBtn: document.getElementById('closeBtn'),
      settingsBtn: document.getElementById('settingsBtn')
    };
  };

  loadSettings = async () => {
    const settings = await chrome.storage.local.get(['settings', 'apiKey']);
    if (settings.settings) {
      this.state.isDarkMode = settings.settings.darkMode || false;
      this.updateTheme();
    }
    if (settings.apiKey) {
      this.state.apiKey = settings.apiKey;
    }
  };

  saveSettings = async () => {
    await chrome.storage.local.set({
      settings: {
        darkMode: this.state.isDarkMode
      }
    });
  };

  saveApiKey = async (apiKey) => {
    this.state.apiKey = apiKey;
    await chrome.storage.local.set({ apiKey: apiKey });
  };

  loadLastExtraction = async () => {
    const result = await chrome.storage.local.get(['lastExtraction', 'aiAnalysis']);
    if (result.lastExtraction) {
      this.state.lastExtraction = result.lastExtraction.bookmarks;
      this.updateExtractionStatus(result.lastExtraction.timestamp);
      this.updateUI();
    }
    if (result.aiAnalysis) {
      this.state.aiAnalysis = result.aiAnalysis;
    }
  };

  setupEventListeners = () => {
    // Dark mode toggle
    this.elements.darkModeToggle.addEventListener('change', e => this.handleDarkModeToggle(e));

    // Clear storage
    this.elements.clearStorageBtn.addEventListener('click', () => this.handleClearStorage());

    // Scan buttons
    this.elements.scanBtn.addEventListener('click', () => this.handleScan());
    this.elements.autoScrollBtn.addEventListener('click', () => this.handleAutoScroll());
    this.elements.bookmarksBtn.addEventListener('click', () => this.openBookmarksPage());

    // AI Analysis button
    this.elements.analyzeAiBtn.addEventListener('click', () => this.analyzeBookmarks());

    // Export buttons
    this.elements.exportMdBtn.addEventListener('click', () => this.downloadMarkdown());
    this.elements.exportCsvBtn.addEventListener('click', () => this.downloadCSV());
    this.elements.copyClipboardBtn.addEventListener('click', () => this.copyToClipboard());

    // Settings and close
    this.elements.closeBtn.addEventListener('click', () => window.close());
    this.elements.settingsBtn.addEventListener('click', () => this.showSettingsDialog());

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'progressUpdate') {
        this.handleProgressUpdate(msg.progress);
      } else if (msg.type === 'scanComplete') {
        this.handleScanComplete(msg.bookmarks);
      }
    });
  };

  updateUI = () => {
    this.updateExportButtons();
    this.updateProgressBar();
  };

  updateExportButtons = () => {
    const hasData = this.state.lastExtraction && this.state.lastExtraction.length > 0;
    this.elements.exportMdBtn.disabled = !hasData;
    this.elements.exportCsvBtn.disabled = !hasData;
    this.elements.copyClipboardBtn.disabled = !hasData;
    this.elements.analyzeAiBtn.disabled = !hasData;
  };

  updateProgressBar = () => {
    const { current, total } = this.state.progress;
    if (total > 0) {
      const percent = (current / total) * 100;
      this.elements.progressFill.style.width = `${percent}%`;
      this.elements.progressText.textContent = `${current} / ${total} bookmarks`;
      this.elements.progressBar.style.display = 'block';
    } else {
      this.elements.progressBar.style.display = 'none';
    }
  };

  updateTheme = () => {
    document.body.setAttribute('data-theme', this.state.isDarkMode ? 'dark' : 'light');
  };

  updateStatus = (message) => {
    this.elements.statusBar.textContent = message;
    this.elements.statusBar.setAttribute('aria-label', message);
  };

  updateExtractionStatus = (timestamp) => {
    if (!this.state.lastExtraction) {
      this.elements.extractionStatus.textContent = '';
      return;
    }

    const age = Date.now() - timestamp;
    const minutes = Math.floor(age / 60000);
    this.elements.extractionStatus.textContent =
      `${this.state.lastExtraction.length} bookmarks from ${minutes} minutes ago`;
  };

  // Event Handlers
  handleDarkModeToggle = async (event) => {
    this.state.isDarkMode = event.target.checked;
    this.updateTheme();
    await this.saveSettings();
  };

  handleClearStorage = async () => {
    this.state.lastExtraction = null;
    this.state.aiAnalysis = null;
    await chrome.storage.local.remove(['lastExtraction', 'aiAnalysis']);
    this.updateStatus('Stored bookmarks and analysis cleared');
    this.updateUI();
  };

  handleProgressUpdate = (progress) => {
    this.state.progress = progress;
    this.updateUI();
  };

  handleScanComplete = async (bookmarks) => {
    this.state.lastExtraction = bookmarks;
    await chrome.storage.local.set({
      lastExtraction: {
        timestamp: Date.now(),
        bookmarks: bookmarks
      }
    });

    this.updateStatus(`Successfully extracted ${bookmarks.length} bookmarks`);
    if (bookmarks.length > this.constants.MAX_SAFE_BOOKMARKS) {
      this.updateStatus('Warning: Large bookmark set detected. Consider batch processing.');
    }

    this.updateUI();

    // Automatically analyze with AI if API key is set
    if (this.state.apiKey && bookmarks.length > 0) {
      this.analyzeBookmarks();
    }
  };

  handleScan = () => {
    this.updateStatus('Scanning bookmarks...');
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'scanBookmarks'
      }, (response) => {
        if (chrome.runtime.lastError) {
          this.updateStatus('Error: Could not connect to page. Please refresh and try again.');
          return;
        }
        if (response && response.success) {
          this.handleScanComplete(response.tweets || []);
        } else {
          this.updateStatus('Error: Failed to scan bookmarks.');
        }
      });
    });
  };

  handleAutoScroll = () => {
    this.updateStatus('Auto-scrolling and scanning...');
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      // First, inject auto-scroll script
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: async () => {
          const scrollAndWait = async () => {
            let lastHeight = 0;
            let scrollAttempts = 0;
            const maxAttempts = 50;

            while (scrollAttempts < maxAttempts) {
              window.scrollTo(0, document.body.scrollHeight);
              await new Promise(r => setTimeout(r, 2000));

              const newHeight = document.body.scrollHeight;
              if (newHeight === lastHeight) {
                scrollAttempts++;
                if (scrollAttempts >= 3) break;
              } else {
                scrollAttempts = 0;
              }
              lastHeight = newHeight;
            }

            window.scrollTo(0, 0);
            await new Promise(r => setTimeout(r, 1000));
          };

          await scrollAndWait();
        }
      }, () => {
        // After scrolling, scan
        setTimeout(() => {
          this.handleScan();
        }, 2000);
      });
    });
  };

  analyzeBookmarks = async () => {
    if (!this.state.apiKey) {
      this.updateStatus('No API key configured. Click settings to add one.');
      return;
    }

    if (!this.state.lastExtraction || this.state.lastExtraction.length === 0) {
      this.updateStatus('No bookmarks to analyze.');
      return;
    }

    this.updateStatus('Analyzing bookmarks with AI...');

    try {
      const aiService = new AIAnalysisService(this.state.apiKey);
      const analysis = await aiService.analyzeBookmarks(this.state.lastExtraction);

      this.state.aiAnalysis = analysis;
      await chrome.storage.local.set({ aiAnalysis: analysis });

      this.updateStatus(`Analysis complete! Found ${analysis.tags.length} tags and ${analysis.categories.length} categories.`);
      this.showAnalysisResults(analysis);
    } catch (error) {
      console.error('AI Analysis error:', error);
      this.updateStatus(`Analysis failed: ${error.message}`);
    }
  };

  showAnalysisResults = (analysis) => {
    // Create analysis results display
    const existingResults = document.getElementById('ai-results');
    if (existingResults) {
      existingResults.remove();
    }

    const resultsDiv = document.createElement('div');
    resultsDiv.id = 'ai-results';
    resultsDiv.style.cssText = `
      margin: 16px 0;
      padding: 16px;
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 8px;
    `;

    let html = '<h3 style="margin-top: 0; color: var(--text-color);">AI Analysis Results</h3>';

    // Overall summary
    if (analysis.overallSummary) {
      html += `<div style="margin-bottom: 16px;">
        <strong style="color: var(--text-color);">Overall Summary:</strong>
        <p style="color: var(--text-color); margin: 8px 0;">${analysis.overallSummary}</p>
      </div>`;
    }

    // Tags
    if (analysis.tags && analysis.tags.length > 0) {
      html += `<div style="margin-bottom: 16px;">
        <strong style="color: var(--text-color);">Tags:</strong><br>
        <div style="margin-top: 8px;">
          ${analysis.tags.map(tag => `<span style="display: inline-block; background: var(--primary-color); color: white; padding: 4px 12px; margin: 4px; border-radius: 16px; font-size: 12px;">${tag}</span>`).join('')}
        </div>
      </div>`;
    }

    // Categories
    if (analysis.categories && analysis.categories.length > 0) {
      html += `<div style="margin-bottom: 16px;">
        <strong style="color: var(--text-color);">Categories:</strong>
        <ul style="color: var(--text-color); margin: 8px 0; padding-left: 20px;">
          ${analysis.categories.map(cat => `<li>${cat}</li>`).join('')}
        </ul>
      </div>`;
    }

    // Analyze more button
    html += `<button id="analyzeBtn" style="background: var(--primary-color); color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 8px;">Re-analyze</button>`;

    resultsDiv.innerHTML = html;

    // Insert after status container
    const statusContainer = document.querySelector('.status-container');
    if (statusContainer && statusContainer.parentNode) {
      statusContainer.parentNode.insertBefore(resultsDiv, statusContainer.nextSibling);
    }

    // Bind analyze button
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', () => this.analyzeBookmarks());
    }
  };

  showSettingsDialog = () => {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;

    const dialogContent = document.createElement('div');
    dialogContent.style.cssText = `
      background: var(--bg-color);
      padding: 24px;
      border-radius: 8px;
      max-width: 400px;
      width: 90%;
    `;

    dialogContent.innerHTML = `
      <h2 style="margin-top: 0; color: var(--text-color);">Settings</h2>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; color: var(--text-color);">
          AI API Key (OpenAI):
          <input type="password" id="apiKeyInput" value="${this.state.apiKey}"
                 style="width: 100%; padding: 8px; margin-top: 4px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-color); color: var(--text-color);">
        </label>
        <small style="color: var(--disabled-color);">Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" style="color: var(--primary-color);">OpenAI</a></small>
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="cancelBtn" style="padding: 8px 16px; border: 1px solid var(--border-color); background: transparent; color: var(--text-color); border-radius: 4px; cursor: pointer;">Cancel</button>
        <button id="saveBtn" style="padding: 8px 16px; border: none; background: var(--primary-color); color: white; border-radius: 4px; cursor: pointer;">Save</button>
      </div>
    `;

    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);

    // Event handlers
    document.getElementById('cancelBtn').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });

    document.getElementById('saveBtn').addEventListener('click', async () => {
      const apiKey = document.getElementById('apiKeyInput').value.trim();
      await this.saveApiKey(apiKey);
      this.updateStatus('Settings saved!');
      document.body.removeChild(dialog);
    });

    // Close on background click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog);
      }
    });
  };

  render = () => {
    // Update UI based on current state
    this.updateUI();

    // Show AI results if available
    if (this.state.aiAnalysis) {
      this.showAnalysisResults(this.state.aiAnalysis);
    }
  };

  generateMarkdown = () => {
    if (!this.state.lastExtraction || this.state.lastExtraction.length === 0) return '';

    let md = '# X Bookmarks Export\n\n';

    // Add AI analysis if available
    if (this.state.aiAnalysis) {
      md += '## AI Analysis\n\n';
      if (this.state.aiAnalysis.overallSummary) {
        md += `**Summary:** ${this.state.aiAnalysis.overallSummary}\n\n`;
      }
      if (this.state.aiAnalysis.tags && this.state.aiAnalysis.tags.length > 0) {
        md += `**Tags:** ${this.state.aiAnalysis.tags.join(', ')}\n\n`;
      }
      if (this.state.aiAnalysis.categories && this.state.aiAnalysis.categories.length > 0) {
        md += `**Categories:**\n${this.state.aiAnalysis.categories.map(c => `- ${c}`).join('\n')}\n\n`;
      }
      md += '---\n\n';
    }

    md += '## Bookmarks\n\n';
    md += `| Author | Username | Date | Text | Likes | Retweets | Replies | Views | Link |\n`;
    md += `|--------|----------|------|------|-------|----------|---------|-------|------|\n`;

    this.state.lastExtraction.forEach(t => {
      const safeText = (t.text || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').substring(0, 100);
      md += `| ${t.displayName || ''} | @${t.username || ''} | ${t.dateTime || ''} | ${safeText} | ${t.likes || ''} | ${t.retweets || ''} | ${t.replies || ''} | ${t.views || ''} | [Link](${t.url}) |\n`;
    });

    return md;
  };

  generateCSV = () => {
    if (!this.state.lastExtraction || this.state.lastExtraction.length === 0) return '';

    const escapeCSV = (val) => {
      if (val === undefined || val === null) return '';
      const str = String(val).replace(/\n/g, ' ');
      if (/[",]/.test(str)) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    let csv = 'Author,Username,Date,Text,Likes,Retweets,Replies,Views,Link';

    // Add AI analysis columns if available
    if (this.state.aiAnalysis) {
      csv += ',Tags,Categories\n';
      const tags = this.state.aiAnalysis.tags ? this.state.aiAnalysis.tags.join('; ') : '';
      const categories = this.state.aiAnalysis.categories ? this.state.aiAnalysis.categories.join('; ') : '';

      this.state.lastExtraction.forEach(t => {
        const row = [
          escapeCSV(t.displayName || ''),
          escapeCSV('@' + (t.username || '')),
          escapeCSV(t.dateTime || ''),
          escapeCSV(t.text || ''),
          escapeCSV(t.likes || ''),
          escapeCSV(t.retweets || ''),
          escapeCSV(t.replies || ''),
          escapeCSV(t.views || ''),
          escapeCSV(t.url),
          escapeCSV(tags),
          escapeCSV(categories)
        ].join(',');
        csv += row + '\n';
      });
    } else {
      csv += '\n';
      this.state.lastExtraction.forEach(t => {
        const row = [
          escapeCSV(t.displayName || ''),
          escapeCSV('@' + (t.username || '')),
          escapeCSV(t.dateTime || ''),
          escapeCSV(t.text || ''),
          escapeCSV(t.likes || ''),
          escapeCSV(t.retweets || ''),
          escapeCSV(t.replies || ''),
          escapeCSV(t.views || ''),
          escapeCSV(t.url)
        ].join(',');
        csv += row + '\n';
      });
    }

    return csv;
  };

  downloadMarkdown = () => {
    const md = this.generateMarkdown();
    if (!md) return;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `x-bookmarks-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.updateStatus('Downloaded Markdown file!');
  };

  downloadCSV = () => {
    const csv = this.generateCSV();
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `x-bookmarks-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.updateStatus('Downloaded CSV file!');
  };

  copyToClipboard = () => {
    const md = this.generateMarkdown();
    if (!md) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(md)
        .then(() => {
          this.updateStatus('Copied to clipboard!');
        })
        .catch(err => {
          console.error('Clipboard error:', err);
          this.fallbackCopyToClipboard(md);
        });
    } else {
      this.fallbackCopyToClipboard(md);
    }
  };

  fallbackCopyToClipboard = (text) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      this.updateStatus('Copied to clipboard (fallback)!');
    } catch (err) {
      console.error('Fallback copy failed:', err);
      this.updateStatus('Failed to copy. Please try again.');
    }
    document.body.removeChild(textarea);
  };

  openBookmarksPage = () => {
    const url = 'https://x.com/i/bookmarks';
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs.update(tabs[0].id, { url });
      } else {
        chrome.tabs.create({ url });
      }
    });
  };
}

// AI Analysis Service
class AIAnalysisService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
  }

  async analyzeBookmarks(bookmarks) {
    // Prepare bookmark data for analysis
    const bookmarkTexts = bookmarks
      .filter(b => b.text && b.text.trim())
      .slice(0, 50) // Limit to first 50 for cost efficiency
      .map(b => `@${b.username}: ${b.text}`)
      .join('\n\n');

    if (!bookmarkTexts) {
      throw new Error('No bookmark content to analyze');
    }

    const prompt = `Analyze these Twitter/X bookmarks and provide:
1. An overall summary (2-3 sentences) of the main themes
2. A list of 5-10 relevant tags/keywords
3. 3-5 main categories these bookmarks fall into

Bookmarks:
${bookmarkTexts}

Respond in JSON format:
{
  "overallSummary": "...",
  "tags": ["tag1", "tag2", ...],
  "categories": ["category1", "category2", ...]
}`;

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that analyzes social media content and provides structured summaries.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
      }

      const analysis = JSON.parse(jsonMatch[0]);
      return {
        overallSummary: analysis.overallSummary || '',
        tags: analysis.tags || [],
        categories: analysis.categories || [],
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('AI Analysis error:', error);
      throw error;
    }
  }
}

// Initialize the popup controller when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
