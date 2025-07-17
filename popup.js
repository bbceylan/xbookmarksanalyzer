// X Bookmarks Extractor Popup Script v0.5.0

document.addEventListener('DOMContentLoaded', () => {
  const popup = new PopupController();
});

class PopupController {
  constructor() {
    this.initializeState();
    this.bindElements();
    this.setupEventListeners();
    this.setupFooter();
    this.loadSettings().then(() => {
      this.loadLastExtraction();
      this.render();
    });
  }

  initializeState = () => {
    this.state = {
      lastExtraction: null,
      isDarkMode: false,
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
      exportButtons: document.querySelectorAll('.export-button'),
      scanBtn: document.getElementById('scanBtn'),
      autoScrollBtn: document.getElementById('autoScrollBtn')
    };
  }

  loadSettings = async () => {
    const settings = await chrome.storage.local.get('settings');
    if (settings.settings) {
      this.state.isDarkMode = settings.settings.darkMode || false;
      this.updateTheme();
    }
  };

  saveSettings = async () => {
    await chrome.storage.local.set({
      settings: {
        darkMode: this.state.isDarkMode
      }
    });
  };

  loadLastExtraction = async () => {
    const result = await chrome.storage.local.get('lastExtraction');
    if (result.lastExtraction) {
      this.state.lastExtraction = result.lastExtraction.bookmarks;
      this.updateExtractionStatus(result.lastExtraction.timestamp);
      this.updateUI();
    }
  };

  setupEventListeners = () => {
    this.elements.darkModeToggle.addEventListener('change', e => this.handleDarkModeToggle(e));
    this.elements.clearStorageBtn.addEventListener('click', () => this.handleClearStorage());
    this.elements.scanBtn.addEventListener('click', () => this.handleScan());
    this.elements.autoScrollBtn.addEventListener('click', () => this.handleAutoScroll());

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
    this.elements.exportButtons.forEach(button => {
      button.disabled = !this.state.lastExtraction;
    });
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
    await chrome.storage.local.remove('lastExtraction');
    this.updateStatus('Stored bookmarks cleared');
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
  };

  handleScan = () => {
    this.updateStatus('Scanning bookmarks...');
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, {
        command: 'scan',
        options: { batchSize: this.constants.BATCH_SIZE }
      });
    });
  };

  handleAutoScroll = () => {
    this.updateStatus('Auto-scrolling and scanning...');
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, {
        command: 'autoScroll',
        options: { 
          batchSize: this.constants.BATCH_SIZE,
          scrollDelay: this.constants.SCROLL_DELAY
        }
      });
    });
  };

  constructor() {
    this.scannedTweets = [];
    this.lastExtraction = null;
    this.isDarkMode = false;
    this.warning = '';
    this.progress = {
      current: 0,
      total: 0,
      status: 'Initializing...'
    };

    // Constants
    this.BATCH_SIZE = 100;
    this.SCROLL_DELAY = 1000;
    this.MAX_SAFE_BOOKMARKS = 500;

    // Elements
    this.mainContent = document.getElementById('mainContent');
    this.statusBar = document.getElementById('status-bar');
    this.extractionStatus = document.getElementById('extraction-status');
    this.progressBar = document.getElementById('progress-bar');
    this.progressText = document.getElementById('progress-text');
    this.darkModeToggle = document.getElementById('darkModeToggle');
    this.clearStorageBtn = document.getElementById('clearStorageBtn');

    // Initialize
    this.loadSettings();
    this.loadLastExtraction();
    this.setupEventListeners();
    this.updateUI();
  }

  // Storage Management
  loadSettings = async () => {
    const settings = await chrome.storage.local.get('settings');
    if (settings.settings) {
      this.isDarkMode = settings.settings.darkMode || false;
      this.updateTheme();
    }
  };

  saveSettings = async () => {
    await chrome.storage.local.set({
      settings: {
        darkMode: this.isDarkMode
      }
    });
  };

  loadLastExtraction = async () => {
    const result = await chrome.storage.local.get('lastExtraction');
    if (result.lastExtraction) {
      this.lastExtraction = result.lastExtraction.bookmarks;
      this.updateExtractionStatus(result.lastExtraction.timestamp);
    }
  };

  setupFooter = () => {
    this.rescanLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.setState('initial');
    });
    this.settingsBtn.addEventListener('click', () => {
      this.autoScroll = !this.autoScroll;
      alert('Auto-Scroll is now ' + (this.autoScroll ? 'ON' : 'OFF'));
    });
    this.closeBtn.addEventListener('click', () => {
      window.close();
    });
  };

  // UI Updates
  updateUI = () => {
    this.updateExportButtons();
    this.updateProgressBar();
    this.updateTheme();
  };

  updateExportButtons = () => {
    const exportButtons = document.querySelectorAll('.export-button');
    exportButtons.forEach(button => {
      button.disabled = !this.lastExtraction;
    });
  };

  updateProgressBar = () => {
    if (this.progress.total > 0) {
      const percent = (this.progress.current / this.progress.total) * 100;
      this.progressBar.style.width = `${percent}%`;
      this.progressText.textContent = `${this.progress.current} / ${this.progress.total} bookmarks`;
      this.progressBar.setAttribute('aria-valuenow', percent);
    }
  };

  updateTheme = () => {
    document.body.setAttribute('data-theme', this.isDarkMode ? 'dark' : 'light');
  };

  updateExtractionStatus = (timestamp) => {
    if (!this.lastExtraction) {
      this.extractionStatus.textContent = '';
      return;
    }
    
    const age = Date.now() - timestamp;
    const minutes = Math.floor(age / 60000);
    this.extractionStatus.textContent = 
      `${this.lastExtraction.length} bookmarks from ${minutes} minutes ago`;
  };

  updateStatus = (message) => {
    this.statusBar.textContent = message;
    this.statusBar.setAttribute('aria-label', message);
  };

  // Event Handlers
  handleDarkModeToggle = async (event) => {
    this.isDarkMode = event.target.checked;
    this.updateTheme();
    await this.saveSettings();
  };

  handleClearStorage = async () => {
    this.lastExtraction = null;
    await chrome.storage.local.remove('lastExtraction');
    this.updateStatus('Stored bookmarks cleared');
    this.updateUI();
  };

  handleScanComplete = async (bookmarks) => {
    this.lastExtraction = bookmarks;
    await chrome.storage.local.set({
      lastExtraction: {
        timestamp: Date.now(),
        bookmarks: bookmarks
      }
    });
    
    this.updateStatus(`Successfully extracted ${bookmarks.length} bookmarks`);
    if (bookmarks.length > this.MAX_SAFE_BOOKMARKS) {
      this.updateStatus('Warning: Large bookmark set detected. Consider batch processing.');
    }
    
    this.updateUI();
  };

  // Event Listeners
  setupEventListeners = () => {
    this.darkModeToggle.addEventListener('change', this.handleDarkModeToggle.bind(this));
    this.clearStorageBtn.addEventListener('click', this.handleClearStorage.bind(this));
    
    // Progress updates from content script
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'progressUpdate') {
        this.progress = msg.progress;
        this.updateUI();
      } else if (msg.type === 'scanComplete') {
        this.handleScanComplete(msg.bookmarks);
      }
    });
    
    this.render();
  };

  render = () => {
    this.mainContent.innerHTML = '';
    this.rescanLink.style.display = this.state === 'complete' ? '' : 'none';
    if (this.state === 'initial') {
      this.renderInitial();
    } else if (this.state === 'scanning') {
      this.renderScanning();
    } else if (this.state === 'complete') {
      this.renderComplete();
    }
  };

  renderInitial = () => {
    const container = document.createElement('div');
    container.className = 'state-initial';
    const openBtn = document.createElement('button');
    openBtn.className = 'bookmark-page-btn';
    openBtn.textContent = 'Go to Bookmarks Page';
    openBtn.setAttribute('aria-label', 'Go to Bookmarks Page');
    openBtn.addEventListener('click', () => this.openBookmarksPage());
    container.appendChild(openBtn);
    const scanBtn = document.createElement('button');
    scanBtn.className = 'scan-btn';
    scanBtn.innerHTML = '<span class="icon-scan"></span>Scan Bookmarks';
    scanBtn.setAttribute('aria-label', 'Scan Bookmarks');
    scanBtn.addEventListener('click', () => this.startScan());
    container.appendChild(scanBtn);
    const help = document.createElement('div');
    help.className = 'help-text';
    help.textContent = 'Find all your bookmarks to export.';
    container.appendChild(help);
    const settings = document.createElement('div');
    settings.className = 'settings';
    const label = document.createElement('label');
    label.className = 'toggle-label';
    label.setAttribute('for', 'autoScrollToggle');
    label.textContent = 'Auto-Scroll & Scan';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.id = 'autoScrollToggle';
    toggle.className = 'toggle-switch';
    toggle.checked = this.autoScroll;
    toggle.addEventListener('change', (e) => {
      this.autoScroll = toggle.checked;
    });
    const slider = document.createElement('span');
    slider.className = 'toggle-slider';
    label.appendChild(toggle);
    label.appendChild(slider);
    settings.appendChild(label);
    container.appendChild(settings);
    this.mainContent.appendChild(container);
  };

  renderScanning = () => {
    const container = document.createElement('div');
    container.className = 'state-scanning';
    const scanBtn = document.createElement('button');
    scanBtn.className = 'scan-btn';
    scanBtn.innerHTML = '<span class="icon-scan"></span>Scanning...';
    scanBtn.setAttribute('aria-label', 'Scanning...');
    scanBtn.disabled = true;
    container.appendChild(scanBtn);
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    container.appendChild(spinner);
    const progress = document.createElement('div');
    progress.className = 'progress-status';
    progress.textContent = this.progress || 'Working...';
    progress.style.marginTop = '12px';
    progress.style.fontSize = '15px';
    container.appendChild(progress);
    this.mainContent.appendChild(container);
  };

  renderComplete = () => {
    const container = document.createElement('div');
    container.className = 'state-complete';
    const status = document.createElement('div');
    status.className = 'status';
    status.textContent = `${this.scannedTweets.length} Bookmarks Found`;
    container.appendChild(status);
    if (this.warning) {
      const warn = document.createElement('div');
      warn.style.color = '#ffb300';
      warn.style.background = 'rgba(255,179,0,0.08)';
      warn.style.borderRadius = '8px';
      warn.style.padding = '8px 14px';
      warn.style.margin = '12px 0 0 0';
      warn.style.fontSize = '15px';
      warn.textContent = this.warning;
      container.appendChild(warn);
    }
    const actions = document.createElement('div');
    actions.className = 'export-actions';
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'export-btn';
    downloadBtn.innerHTML = '<span class="icon-download"></span>Download as .md';
    downloadBtn.disabled = this.scannedTweets.length === 0;
    downloadBtn.addEventListener('click', () => this.downloadMarkdown());
    actions.appendChild(downloadBtn);
    const csvBtn = document.createElement('button');
    csvBtn.className = 'export-btn';
    csvBtn.innerHTML = '<span class="icon-download"></span>Download .csv';
    csvBtn.disabled = this.scannedTweets.length === 0;
    csvBtn.addEventListener('click', () => this.downloadCSV());
    actions.appendChild(csvBtn);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'export-btn';
    copyBtn.innerHTML = '<span class="icon-copy"></span>Copy All';
    copyBtn.disabled = this.scannedTweets.length === 0;
    copyBtn.addEventListener('click', () => this.copyToClipboard());
    actions.appendChild(copyBtn);
    container.appendChild(actions);
    const resultsList = document.createElement('div');
    resultsList.className = 'results-list';
    if (this.scannedTweets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'results-list-item';
      empty.textContent = 'No bookmarks or tweets extracted yet...';
      resultsList.appendChild(empty);
    } else {
      this.scannedTweets.forEach((t, i) => {
        const item = document.createElement('div');
        item.className = 'results-list-item';
        item.innerHTML = `<strong>#${i + 1}</strong> <a href="${t.url}" target="_blank" rel="noopener" style="color:#1D9BF0;text-decoration:none;">${t.url}</a><br><span style="color:#fff;">@${t.username}</span> <span style="color:#8899A6;">${t.text}</span>`;
        resultsList.appendChild(item);
      });
    }
    container.appendChild(resultsList);

    const mdToggleBtn = document.createElement('button');
    mdToggleBtn.className = 'markdown-toggle-btn';
    mdToggleBtn.textContent = 'Show Markdown';
    const mdArea = document.createElement('textarea');
    mdArea.className = 'markdown-output';
    mdArea.value = this.generateMarkdown();
    mdArea.readOnly = true;
    mdArea.style.display = 'none';
    mdArea.addEventListener('focus', () => mdArea.select());
    mdToggleBtn.addEventListener('click', () => {
      const isHidden = mdArea.style.display === 'none';
      mdArea.style.display = isHidden ? 'block' : 'none';
      mdToggleBtn.textContent = isHidden ? 'Hide Markdown' : 'Show Markdown';
    });
    container.appendChild(mdToggleBtn);
    container.appendChild(mdArea);

    this.mainContent.appendChild(container);
  }

  startScan = () => {
    this.progress = 'Initializing...';
    this.setState('scanning');
    setTimeout(() => {
      this.doScan();
    }, 400);
  };

  doScan = () => {
    if (this.autoScroll) {
      this.aggressiveAutoScrollAndScan();
    } else {
      this.basicScan();
    }
  };

  basicScan = () => {
    this.sendScanMessage();
  };

  aggressiveAutoScrollAndScan = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) {
        this.setState('initial');
        alert('No active tab found.');
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: async () => {
          const sendProgress = (status) => {
            try {
              chrome.runtime.sendMessage({ type: 'progressUpdate', status });
            } catch (e) {
              // ignore
            }
          };
          // Aggressive: scroll down, up, down, with long waits
          sendProgress('Scrolling page...');
          for (let cycle = 0; cycle < 2; cycle++) {
            for (let i = 0; i < 60; i++) {
              window.scrollTo(0, document.body.scrollHeight);
              await new Promise(r => setTimeout(r, 2500));
            }
            window.scrollTo(0, 0);
            await new Promise(r => setTimeout(r, 2500));
          }
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise(r => setTimeout(r, 3000));
          sendProgress('Scanning loaded content...');
        }
      }, () => {
        setTimeout(() => {
          this.sendScanMessage();
        }, 2000);
      });
    });
  }

  sendScanMessage = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) {
        this.setState('initial');
        alert('No active tab found.');
        return;
      }
      chrome.tabs.sendMessage(
        tabs[0].id,
        { command: 'startScanning' },
        (response) => {
          if (chrome.runtime.lastError) {
            this.setState('initial');
            alert('Could not connect to the page. Refresh and try again.');
            return;
          }
          if (response && response.success && Array.isArray(response.tweets)) {
            // Check for missing metadata
            const incomplete = response.tweets.some(t => !t.text || !t.username);
            let warning = '';
            if (incomplete) {
              warning = 'Some bookmarks could not be fully extracted. Try scrolling manually and scanning again.';
            } else if (response.tweets.length < 10) {
              warning = 'Warning: Only ' + response.tweets.length + ' items found. Try scrolling manually and scan again.';
            }
            this.setState('complete', response.tweets, warning);
          } else {
            this.setState('initial');
            alert('Failed to scan. Make sure you are on the X Bookmarks page.');
          }
        }
      );
    });
  };

  generateMarkdown = () => {
    if (!this.scannedTweets.length) return '';
    let md = `| Author | Username | Date | Text | Likes | Retweets | Replies | Views | Link |\n`;
    md += `|--------|----------|------|------|-------|----------|---------|-------|------|\n`;
    this.scannedTweets.forEach(t => {
      const safeText = (t.text || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      md += `| ${t.displayName || ''} | @${t.username || ''} | ${t.dateTime || ''} | ${safeText} | ${t.likes || ''} | ${t.retweets || ''} | ${t.replies || ''} | ${t.views || ''} | [Link](${t.url}) |\n`;
    });
    return md;
  };

  generateCSV = () => {
    if (!this.scannedTweets.length) return '';
    const escapeCSV = (val) => {
      if (val === undefined || val === null) return '';
      const str = String(val).replace(/\n/g, ' ');
      if (/[",]/.test(str)) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };
    let csv = 'Author,Username,Date,Text,Likes,Retweets,Replies,Views,Link\n';
    this.scannedTweets.forEach(t => {
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
    return csv;
  }

  downloadMarkdown = () => {
    const md = this.generateMarkdown();
    if (!md) return;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'x-bookmarks.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  downloadCSV = () => {
    const csv = this.generateCSV();
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'x-bookmarks.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  copyToClipboard = () => {
    const md = this.generateMarkdown();
    if (!md) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(md);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = md;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
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

// Initialize the popup controller when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});