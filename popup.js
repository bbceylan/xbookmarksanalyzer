// X Bookmarks Extractor Popup Script
console.log('X Bookmarks Extractor: Popup loaded');

class PopupController {
  constructor() {
    this.state = 'initial';
    this.scannedTweets = [];
    this.autoScroll = true;
    this.warning = '';
    this.progress = 'Initializing...';
    this.mainContent = document.getElementById('mainContent');
    this.rescanLink = document.getElementById('rescanLink');
    this.settingsBtn = document.getElementById('settingsBtn');
    this.closeBtn = document.getElementById('closeBtn');
    this.render();
    this.setupFooter();
    this.setupProgressListener();
  }

  setupFooter() {
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
  }

  setupProgressListener() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'progressUpdate') {
        this.progress = msg.status;
        if (this.state === 'scanning') this.render();
      }
    });
  }

  setState(state, tweets = [], warning = '') {
    this.state = state;
    if (state === 'complete') {
      this.scannedTweets = tweets;
      this.warning = warning;
    } else {
      this.warning = '';
    }
    this.render();
  }

  render() {
    this.mainContent.innerHTML = '';
    this.rescanLink.style.display = this.state === 'complete' ? '' : 'none';
    if (this.state === 'initial') {
      this.renderInitial();
    } else if (this.state === 'scanning') {
      this.renderScanning();
    } else if (this.state === 'complete') {
      this.renderComplete();
    }
  }

  renderInitial() {
    const container = document.createElement('div');
    container.className = 'state-initial';
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
  }

  renderScanning() {
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
  }

  renderComplete() {
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
    this.mainContent.appendChild(container);
  }

  startScan() {
    this.progress = 'Initializing...';
    this.setState('scanning');
    setTimeout(() => {
      this.doScan();
    }, 400);
  }

  doScan() {
    if (this.autoScroll) {
      this.aggressiveAutoScrollAndScan();
    } else {
      this.basicScan();
    }
  }

  basicScan() {
    this.sendScanMessage();
  }

  aggressiveAutoScrollAndScan() {
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

  sendScanMessage() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) {
        this.setState('initial');
        alert('No active tab found.');
        return;
      }
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: 'getPageInfo' },
        (pageInfo) => {
          if (!pageInfo || !pageInfo.isBookmarksPage) {
            this.setState('initial');
            alert('Please open your X Bookmarks page.');
            return;
          }
          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: 'scanBookmarksWithFallback' },
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
        }
      );
    });
  }

  generateMarkdown() {
    if (!this.scannedTweets.length) return '';
    let md = `| Author | Username | Date | Text | Likes | Retweets | Replies | Views | Link |\n`;
    md += `|--------|----------|------|------|-------|----------|---------|-------|------|\n`;
    this.scannedTweets.forEach(t => {
      const safeText = (t.text || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      md += `| ${t.displayName || ''} | @${t.username || ''} | ${t.dateTime || ''} | ${safeText} | ${t.likes || ''} | ${t.retweets || ''} | ${t.replies || ''} | ${t.views || ''} | [Link](${t.url}) |\n`;
    });
    return md;
  }

  downloadMarkdown() {
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
  }

  copyToClipboard() {
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
  }
}

new PopupController();