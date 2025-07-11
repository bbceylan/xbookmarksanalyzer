// X Bookmark Analyzer Popup Script
console.log('X Bookmark Analyzer: Popup loaded');

class PopupController {
  constructor() {
    this.currentTab = null;
    this.scannedUrls = [];
    this.analysisResults = [];
    this.isOnline = navigator.onLine;
    this.resultCache = new Map();
    this.currentPage = 0;
    this.pageSize = 10;
    
    this.initializeElements();
    this.setupEventListeners();
    this.setupOfflineDetection();
    this.initializePopup();
  }

  setupOfflineDetection() {
    const updateOnlineStatus = () => {
      this.isOnline = navigator.onLine;
      if (!this.isOnline) {
        this.showStatus('⚠️ You are offline. Some features may not work.', 'error');
        this.analyzeBtn.disabled = true;
      } else {
        this.hideStatus();
        this.updateUrlCount();
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
  }

  // Security: Sanitize HTML content
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text).slice(0, 500); // Limit length
    return div.innerHTML;
  }

  // Extract URLs with better validation
  extractUrlsFromText(text) {
    if (!text) return [];
    
    const urlPattern = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlPattern) || [];
    
    return urls
      .filter(url => {
        try {
          const urlObj = new URL(url);
          return (urlObj.hostname.includes('x.com') || urlObj.hostname.includes('twitter.com')) && 
                 urlObj.pathname.includes('/status/');
        } catch {
          return false;
        }
      })
      .slice(0, 100); // Limit to prevent crashes
  }

  initializeElements() {
    // Page info elements
    this.pageIndicator = document.getElementById('pageIndicator');
    this.pageText = document.getElementById('pageText');
    this.refreshBtn = document.getElementById('refreshBtn');
    
    // Scan elements
    this.scanBtn = document.getElementById('scanBtn');
    this.scanResults = document.getElementById('scanResults');
    this.urlCount = document.getElementById('urlCount');
    
    // URL elements
    this.urlInput = document.getElementById('urlInput');
    this.pasteBtn = document.getElementById('pasteBtn');
    this.clearBtn = document.getElementById('clearBtn');
    
    // Analysis elements
    this.analyzeBtn = document.getElementById('analyzeBtn');
    this.progressSection = document.getElementById('progressSection');
    this.progressFill = document.getElementById('progressFill');
    this.progressText = document.getElementById('progressText');
    this.progressPercent = document.getElementById('progressPercent');
    
    // Results elements
    this.resultsSection = document.getElementById('resultsSection');
    this.resultsCount = document.getElementById('resultsCount');
    this.resultsList = document.getElementById('resultsList');
    this.exportBtn = document.getElementById('exportBtn');
    
    // Action elements
    this.optionsBtn = document.getElementById('optionsBtn');
    this.helpBtn = document.getElementById('helpBtn');
    this.settingsBtn = document.getElementById('settingsBtn');
    
    // Status and modal elements
    this.statusBar = document.getElementById('statusBar');
    this.statusText = document.getElementById('statusText');
    this.statusSpinner = document.getElementById('statusSpinner');
    this.loadingOverlay = document.getElementById('loadingOverlay');
    this.errorModal = document.getElementById('errorModal');
    this.errorMessage = document.getElementById('errorMessage');
    this.closeError = document.getElementById('closeError');
    this.errorOk = document.getElementById('errorOk');
  }

  setupEventListeners() {
    // Page refresh
    this.refreshBtn.addEventListener('click', () => this.refreshPageInfo());
    
    // Scanning
    this.scanBtn.addEventListener('click', () => this.debouncedScan());
    
    // URL management
    this.pasteBtn.addEventListener('click', () => this.pasteFromClipboard());
    this.clearBtn.addEventListener('click', () => this.clearUrls());
    this.urlInput.addEventListener('input', () => this.debounce(() => this.updateUrlCount(), 300));
    
    // Analysis
    this.analyzeBtn.addEventListener('click', () => this.analyzeBookmarks());
    
    // Export
    this.exportBtn.addEventListener('click', this.exportResults.bind(this));
    
    // Settings and help
    this.optionsBtn.addEventListener('click', () => this.openOptions());
    this.helpBtn.addEventListener('click', () => this.showHelp());
    this.settingsBtn.addEventListener('click', () => this.openOptions());
    
    // Error modal
    this.closeError.addEventListener('click', () => this.hideError());
    this.errorOk.addEventListener('click', () => this.hideError());

    // Keyboard navigation
    document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

    // Prevent form submission
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
      }
    });
  }

  // Debounce utility
  debounce(func, wait) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(func, wait);
  }

  // Keyboard shortcuts
  handleKeyboardShortcuts(e) {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 's':
          e.preventDefault();
          if (!this.scanBtn.disabled) this.debouncedScan();
          break;
        case 'a':
          e.preventDefault();
          if (!this.analyzeBtn.disabled) this.analyzeBookmarks();
          break;
        case 'e':
          e.preventDefault();
          if (!this.exportBtn.disabled) this.exportResults();
          break;
      }
    }
    
    if (e.key === 'Escape') {
      this.hideError();
    }
  }

  // Debounced scanning to prevent rapid clicks
  debouncedScan() {
    if (this.scanInProgress) return;
    this.debounce(() => this.scanCurrentPage(), 300);
  }

  async initializePopup() {
    await this.getCurrentTab();
    await this.checkPageInfo();
    await this.checkApiKey();
  }

  async getCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tab;
    } catch (error) {
      console.error('Failed to get current tab:', error);
    }
  }

  async checkPageInfo() {
    if (!this.currentTab) {
      this.updatePageStatus('❌', 'No active tab detected');
      return;
    }

    const url = this.currentTab.url;
    const isXSite = url.includes('x.com') || url.includes('twitter.com');
    const isBookmarksPage = url.includes('/i/bookmarks') || url.includes('/bookmarks');

    if (!isXSite) {
      this.updatePageStatus('❌', 'Not on X.com - Navigate to X bookmarks');
      this.scanBtn.disabled = true;
      return;
    }

    if (isBookmarksPage) {
      this.updatePageStatus('✅', 'X Bookmarks page detected');
      this.scanBtn.disabled = false;
    } else {
      this.updatePageStatus('⚠️', 'On X.com - Go to bookmarks page');
      this.scanBtn.disabled = true;
    }

    // Try to get more detailed page info from content script
    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, { 
        action: 'getPageInfo' 
      });
      
      if (response && response.isBookmarksPage) {
        this.updatePageStatus('✅', 'X Bookmarks page detected');
        this.scanBtn.disabled = false;
      }
    } catch (error) {
      console.log('Content script not available:', error);
    }
  }

  async checkApiKey() {
    try {
      const result = await chrome.storage.sync.get(['geminiApiKey']);
      if (!result.geminiApiKey) {
        this.showStatus('⚠️ Gemini API key not configured', 'error');
        this.analyzeBtn.disabled = true;
      }
    } catch (error) {
      console.error('Failed to check API key:', error);
    }
  }

  updatePageStatus(indicator, text) {
    this.pageIndicator.textContent = indicator;
    this.pageText.textContent = text;
  }

  async refreshPageInfo() {
    await this.getCurrentTab();
    await this.checkPageInfo();
  }

  async scanCurrentPage() {
    if (!this.currentTab) {
      this.showError('No active tab available');
      return;
    }

    this.showStatus('Scanning page for bookmarks...', 'info');
    this.scanBtn.disabled = true;

    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'scanBookmarks'
      });

      if (response && response.success) {
        this.scannedUrls = response.urls;
        this.urlInput.value = this.scannedUrls.join('\n');
        this.updateUrlCount();
        this.showScanResults(this.scannedUrls.length);
        this.showStatus(`Found ${this.scannedUrls.length} bookmarks`, 'success');
      } else {
        this.showError('Failed to scan page: ' + (response?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Scan failed:', error);
      this.showError('Content script not available. Please refresh the X.com page.');
    } finally {
      this.scanBtn.disabled = false;
    }
  }

  async pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const urls = this.extractUrlsFromText(text);
      
      if (urls.length > 0) {
        this.urlInput.value = urls.join('\n');
        this.updateUrlCount();
        this.showStatus(`Pasted ${urls.length} URLs`, 'success');
      } else {
        this.showStatus('No valid URLs found in clipboard', 'error');
      }
    } catch (error) {
      console.error('Paste failed:', error);
      this.showError('Failed to access clipboard');
    }
  }

  extractUrlsFromText(text) {
    const urlPattern = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlPattern) || [];
    
    return urls.filter(url => {
      return (url.includes('x.com') || url.includes('twitter.com')) && 
             url.includes('/status/');
    });
  }

  clearUrls() {
    this.urlInput.value = '';
    this.scannedUrls = [];
    this.updateUrlCount();
    this.hideScanResults();
    this.hideResults();
  }

  updateUrlCount() {
    const urls = this.getUrlsFromInput();
    this.urlCount.textContent = urls.length;
    this.analyzeBtn.disabled = urls.length === 0;
  }

  getUrlsFromInput() {
    return this.urlInput.value
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0);
  }

  showScanResults(count) {
    this.urlCount.textContent = count;
    this.scanResults.classList.remove('hidden');
  }

  hideScanResults() {
    this.scanResults.classList.add('hidden');
  }

  async analyzeBookmarks() {
    const urls = this.getUrlsFromInput();
    if (urls.length === 0) {
      this.showError('No URLs to analyze');
      return;
    }
    // Check API key again
    const apiKeyCheck = await chrome.storage.sync.get(['geminiApiKey']);
    if (!apiKeyCheck.geminiApiKey) {
      this.showError('Gemini API key not configured. Please set it in Settings.');
      return;
    }
    this.showProgress();
    this.analyzeBtn.disabled = true;
    this.analysisResults = [];
    try {
      await this.processBatchAnalysis(urls);
      if (this.analysisResults.length === 0) {
        this.showError('No analysis results were generated. Please check your API key, model, and network connection.');
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      if (String(error).includes('Gemini API error: 404')) {
        this.showError('Gemini API error: 404 — The Gemini model is not available for your API key or project. Please check your Google Cloud project, API key, and model name.');
      } else {
        this.showError('Analysis failed: ' + error.message);
      }
    } finally {
      this.hideProgress();
      this.analyzeBtn.disabled = false;
    }
  }

  async processBatchAnalysis(urls) {
    return new Promise((resolve, reject) => {
      // Listen for progress updates from background
      const progressListener = (message, sender, sendResponse) => {
        if (message && message.type === 'progress') {
          this.updateProgress(message.completed, message.total);
          this.analysisResults = message.results;
        }
      };
      chrome.runtime.onMessage.addListener(progressListener);
      chrome.runtime.sendMessage({
        action: 'batchAnalyze',
        urls: urls
      }, (response) => {
        chrome.runtime.onMessage.removeListener(progressListener);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response.type === 'complete') {
          this.analysisResults = response.results;
          this.showResults();
          resolve();
        }
      });
    });
  }

  showProgress() {
    this.progressSection.classList.remove('hidden');
    this.updateProgress(0, 1);
  }

  hideProgress() {
    this.progressSection.classList.add('hidden');
  }

  updateProgress(completed, total) {
    const percent = Math.round((completed / total) * 100);
    this.progressFill.style.width = `${percent}%`;
    this.progressPercent.textContent = `${percent}%`;
    this.progressText.textContent = `Analyzing ${completed}/${total}...`;
  }

  showResults() {
    this.resultsCount.textContent = this.analysisResults.length;
    this.renderResults();
    this.resultsSection.classList.remove('hidden');
  }

  hideResults() {
    this.resultsSection.classList.add('hidden');
    this.analysisResults = [];
  }

  renderResults() {
    this.resultsList.innerHTML = '';
    
    if (this.analysisResults.length === 0) {
      this.resultsList.innerHTML = '<div class="no-results">No results to display</div>';
      return;
    }

    // Pagination
    const startIndex = this.currentPage * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize, this.analysisResults.length);
    const pageResults = this.analysisResults.slice(startIndex, endIndex);
    
    pageResults.forEach((result, index) => {
      const resultElement = this.createResultElement(result, startIndex + index);
      this.resultsList.appendChild(resultElement);
    });

    // Add pagination controls if needed
    if (this.analysisResults.length > this.pageSize) {
      this.addPaginationControls();
    }
  }

  addPaginationControls() {
    const totalPages = Math.ceil(this.analysisResults.length / this.pageSize);
    
    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'pagination-controls';
    paginationDiv.innerHTML = `
      <button id="prevPage" ${this.currentPage === 0 ? 'disabled' : ''}>← Previous</button>
      <span>Page ${this.currentPage + 1} of ${totalPages}</span>
      <button id="nextPage" ${this.currentPage >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
    `;
    
    this.resultsList.appendChild(paginationDiv);

    // Add event listeners
    document.getElementById('prevPage')?.addEventListener('click', () => {
      if (this.currentPage > 0) {
        this.currentPage--;
        this.renderResults();
      }
    });

    document.getElementById('nextPage')?.addEventListener('click', () => {
      const totalPages = Math.ceil(this.analysisResults.length / this.pageSize);
      if (this.currentPage < totalPages - 1) {
        this.currentPage++;
        this.renderResults();
      }
    });
  }

  // Improved progress tracking with recovery
  updateProgress(completed, total) {
    if (completed > total) completed = total; // Sanity check
    
    const percent = Math.round((completed / total) * 100);
    this.progressFill.style.width = `${percent}%`;
    this.progressPercent.textContent = `${percent}%`;
    this.progressText.textContent = `Analyzing ${completed}/${total}...`;

    // Auto-hide if stuck at 100% for too long
    if (percent === 100) {
      setTimeout(() => {
        if (this.progressSection && !this.progressSection.classList.contains('hidden')) {
          this.hideProgress();
          this.showStatus('Analysis completed', 'success');
        }
      }, 2000);
    }
  }

  generateMarkdown() {
    let markdown = `Generated on: ${new Date().toLocaleDateString()}`;
    markdown += `\nTotal bookmarks: ${this.analysisResults.length}\n\n`;
    // Group by topic if available, else group all under 'Social Media'
    const groupedByTopic = this.analysisResults.reduce((acc, item) => {
      const topic = item.topic || 'Social Media';
      if (!acc[topic]) acc[topic] = [];
      acc[topic].push(item);
      return acc;
    }, {});
    Object.entries(groupedByTopic).forEach(([topic, items]) => {
      markdown += `## ${topic}\n\n`;
      items.forEach((item, idx) => {
        // Use Gemini output fields if available
        const summary = item.executive_summary || item.summary || 'No summary available';
        const action = item.action_point ? `\n**Action Point:** ${item.action_point}` : '';
        const hashtags = item.hashtags || [];
        const url = item.url || '';
        const hostname = url ? new URL(url).hostname : '';
        markdown += `### Content ${idx + 1} from ${hostname}\n`;
        markdown += `**URL:** ${url}\n\n`;
        markdown += `**Summary:** ${summary}${action}\n\n`;
        if (hashtags.length > 0) {
          markdown += `**Tags:** ${hashtags.map(tag => `#${tag}`).join(' ')}\n\n`;
        }
      });
    });
    return markdown;
  }

  exportResults() {
    console.log('[DEBUG] Export button clicked');
    if (this.analysisResults.length === 0) {
      this.showError('No analysis results available to export. Please run analysis first.');
      return;
    }
    try {
      const markdown = this.generateMarkdown();
      console.log('[DEBUG] Generated markdown:', markdown);
      this.downloadMarkdown(markdown);
      this.showStatus('Markdown file downloaded', 'success');
      this.updateStatistic('totalExports', 1);
    } catch (error) {
      console.error('Export failed:', error);
      this.showError('Export failed: ' + error.message);
    }
  }

  downloadMarkdown(content) {
    console.log('[DEBUG] downloadMarkdown called');
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const filename = `x-bookmarks-${new Date().toISOString().split('T')[0]}.md`;
    console.log('[DEBUG] Downloading file:', filename, url);
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });
  }

  openOptions() {
    chrome.runtime.openOptionsPage();
  }

  showHelp() {
    const helpText = `
X Bookmark Analyzer Help:

1. Navigate to x.com/i/bookmarks
2. Click "Scan Current Page" to detect bookmarks
3. Or paste bookmark URLs manually
4. Click "Analyze Bookmarks" to process with AI
5. Export results as Markdown file

Requirements:
- Gemini API key (set in Settings)
- Active internet connection
- Valid X/Twitter bookmark URLs

Troubleshooting:
- Refresh the X.com page if scanning fails
- Check API key in Settings
- Ensure you're on the bookmarks page
    `;
    
    this.showError(helpText.trim());
  }

  showStatus(message, type = 'info') {
    this.statusText.textContent = message;
    this.statusBar.className = `status-bar ${type}`;
    this.statusBar.classList.remove('hidden');
    
    if (type === 'info') {
      this.statusSpinner.classList.remove('hidden');
    } else {
      this.statusSpinner.classList.add('hidden');
    }
    
    // Auto-hide after 3 seconds for success messages
    if (type === 'success') {
      setTimeout(() => {
        this.statusBar.classList.add('hidden');
      }, 3000);
    }
  }

  hideStatus() {
    this.statusBar.classList.add('hidden');
  }

  showError(message) {
    this.errorMessage.textContent = message;
    this.errorModal.classList.remove('hidden');
  }

  hideError() {
    this.errorModal.classList.add('hidden');
  }

  // Add this method to PopupController
  createResultElement(result, index) {
    const div = document.createElement('div');
    div.className = 'result-item';
    const title = result.title || `Bookmark ${index + 1}`;
    const topic = result.topic || 'Uncategorized';
    const summary = result.summary || 'No summary available';
    const hashtags = result.hashtags || [];
    div.innerHTML = `
      <div class="result-header">
        <div class="result-title">${this.escapeHtml(title)}</div>
        <div class="result-topic">${this.escapeHtml(topic)}</div>
      </div>
      <div class="result-summary">${this.escapeHtml(summary)}</div>
      <div class="result-tags">
        ${hashtags.map(tag => `<span class="result-tag">#${this.escapeHtml(tag)}</span>`).join('')}
      </div>
      <a href="${this.escapeHtml(result.url)}" target="_blank" class="result-url">${this.escapeHtml(result.url)}</a>
    `;
    return div;
  }

  async updateStatistic(key, increment = 1) {
    try {
      const current = await chrome.storage.local.get([key]);
      const newValue = (current[key] || 0) + increment;
      await chrome.storage.local.set({ [key]: newValue });
    } catch (error) {
      console.error('Failed to update statistic:', error);
    }
  }
}

// Ensure PopupController is only instantiated after DOMContentLoaded
if (window.PopupControllerInstance) {
  // Already initialized
} else {
  document.addEventListener('DOMContentLoaded', () => {
    window.PopupControllerInstance = new PopupController();
  });
}