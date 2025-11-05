// X Bookmarks Analyzer with AI - Popup Script v0.7.0

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
      llmProvider: 'none', // 'openai', 'anthropic', 'none'
      progress: {
        current: 0,
        total: 0,
        status: 'Ready'
      }
    };

    this.constants = {
      BATCH_SIZE: 100,
      SCROLL_DELAY: 1000,
      MAX_SAFE_BOOKMARKS: 500,
      AI_ANALYSIS_LIMIT: 50,
      AI_MAX_TOKENS: 500,
      AI_TEMPERATURE: 0.7,
      AI_MODEL: 'gpt-3.5-turbo',
      AUTO_SCROLL_DELAY: 2000,
      AUTO_SCROLL_MAX_ATTEMPTS: 50,
      AUTO_SCROLL_STABLE_ATTEMPTS: 3,
      POST_SCROLL_DELAY: 1000,
      POST_SCAN_DELAY: 1000,
      API_KEY_MIN_LENGTH: 20,
      MAX_TAGS: 20,
      MAX_CATEGORIES: 10
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
    const settings = await chrome.storage.local.get(['settings', 'apiKey', 'llmProvider']);
    if (settings.settings) {
      this.state.isDarkMode = settings.settings.darkMode || false;
      this.updateTheme();
    }
    if (settings.apiKey) {
      this.state.apiKey = settings.apiKey;
    }
    if (settings.llmProvider) {
      this.state.llmProvider = settings.llmProvider;
    }
  };

  saveSettings = async () => {
    await chrome.storage.local.set({
      settings: {
        darkMode: this.state.isDarkMode
      }
    });
  };

  validateApiKey = (apiKey, provider) => {
    if (!apiKey || typeof apiKey !== 'string') {
      return { valid: false, error: 'API key is required' };
    }

    const trimmedKey = apiKey.trim();

    // Empty check
    if (trimmedKey.length === 0) {
      return { valid: false, error: 'API key cannot be empty' };
    }

    // Provider-specific validation
    if (provider === 'openai') {
      // OpenAI API keys start with 'sk-' and are typically 40+ characters
      if (!trimmedKey.startsWith('sk-')) {
        return { valid: false, error: 'Invalid API key format. OpenAI keys start with "sk-"' };
      }
    } else if (provider === 'anthropic') {
      // Anthropic API keys start with 'sk-ant-'
      if (!trimmedKey.startsWith('sk-ant-')) {
        return { valid: false, error: 'Invalid API key format. Anthropic keys start with "sk-ant-"' };
      }
    }

    if (trimmedKey.length < this.constants.API_KEY_MIN_LENGTH) {
      return { valid: false, error: 'API key is too short. Please check your key.' };
    }

    return { valid: true, error: null };
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
      const percent = Math.round((current / total) * 100);
      this.elements.progressFill.style.width = `${percent}%`;
      this.elements.progressText.textContent = `${current} / ${total} bookmarks`;
      this.elements.progressBar.style.display = 'block';

      // Update ARIA attributes for accessibility
      const progressBarEl = document.getElementById('progress-bar');
      if (progressBarEl) {
        progressBarEl.setAttribute('aria-valuenow', percent);
        progressBarEl.setAttribute('aria-valuetext', `${current} of ${total} bookmarks processed`);
      }
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

  showConfirmDialog = (message, onConfirm) => {
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

    const messageEl = document.createElement('p');
    messageEl.style.cssText = 'color: var(--text-color); margin: 0 0 16px 0; font-size: 15px;';
    messageEl.textContent = message;
    dialogContent.appendChild(messageEl);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding: 8px 16px; border: 1px solid var(--border-color); background: transparent; color: var(--text-color); border-radius: 4px; cursor: pointer;';
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(dialog);
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Confirm';
    confirmBtn.style.cssText = 'padding: 8px 16px; border: none; background: var(--danger-color); color: white; border-radius: 4px; cursor: pointer;';
    confirmBtn.addEventListener('click', () => {
      document.body.removeChild(dialog);
      onConfirm();
    });

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);
    dialogContent.appendChild(buttonContainer);
    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);

    // ESC key to close
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(dialog);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Close on background click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog);
        document.removeEventListener('keydown', escHandler);
      }
    });
  };

  handleClearStorage = async () => {
    this.showConfirmDialog(
      'Are you sure you want to clear all stored bookmarks and AI analysis? This cannot be undone.',
      async () => {
        this.state.lastExtraction = null;
        this.state.aiAnalysis = null;
        await chrome.storage.local.remove(['lastExtraction', 'aiAnalysis']);

        // Remove AI results display if present
        const existingResults = document.getElementById('ai-results');
        if (existingResults) {
          existingResults.remove();
        }

        this.updateStatus('Stored bookmarks and analysis cleared');
        this.updateUI();
      }
    );
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

    // Automatically analyze with AI if provider is configured and API key is set (or if using LLM-free mode)
    if (bookmarks.length > 0) {
      if (this.state.llmProvider === 'none') {
        // Auto-analyze with LLM-free mode
        this.analyzeBookmarks();
      } else if (this.state.apiKey && this.state.llmProvider !== 'none') {
        // Auto-analyze with configured LLM provider
        this.analyzeBookmarks();
      }
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
      const tabId = tabs[0].id;

      // First, inject auto-scroll script
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: async () => {
          const scrollAndWait = async () => {
            let lastHeight = 0;
            let scrollAttempts = 0;
            const maxAttempts = 50; // Note: Using local constant as this runs in injected context
            const scrollDelay = 2000;
            const stableAttempts = 3;
            const postScrollDelay = 1000;

            while (scrollAttempts < maxAttempts) {
              window.scrollTo(0, document.body.scrollHeight);
              await new Promise(r => setTimeout(r, scrollDelay));

              const newHeight = document.body.scrollHeight;
              if (newHeight === lastHeight) {
                scrollAttempts++;
                if (scrollAttempts >= stableAttempts) break;
              } else {
                scrollAttempts = 0;
              }
              lastHeight = newHeight;
            }

            window.scrollTo(0, 0);
            await new Promise(r => setTimeout(r, postScrollDelay));
          };

          await scrollAndWait();
          return { success: true };
        }
      }, (results) => {
        // Check for errors
        if (chrome.runtime.lastError) {
          this.updateStatus('Error during auto-scroll. Please refresh and try again.');
          return;
        }

        // After scrolling completes successfully, scan
        this.updateStatus('Auto-scroll complete. Scanning bookmarks...');
        setTimeout(() => {
          this.handleScan();
        }, this.constants.POST_SCAN_DELAY);
      });
    });
  };

  analyzeBookmarks = async () => {
    if (!this.state.lastExtraction || this.state.lastExtraction.length === 0) {
      this.updateStatus('No bookmarks to analyze.');
      return;
    }

    // Check if LLM provider is configured
    if (this.state.llmProvider === 'none') {
      // Use LLM-free analysis
      this.analyzeLLMFree();
      return;
    }

    if (!this.state.apiKey && this.state.llmProvider !== 'none') {
      this.updateStatus('No API key configured. Click settings to add one or use LLM-free mode.');
      return;
    }

    // Show loading state
    this.elements.analyzeAiBtn.disabled = true;
    this.elements.analyzeAiBtn.textContent = 'Analyzing...';

    const bookmarkCount = this.state.lastExtraction.length;
    const analyzeCount = Math.min(bookmarkCount, this.constants.AI_ANALYSIS_LIMIT);

    if (bookmarkCount > this.constants.AI_ANALYSIS_LIMIT) {
      this.updateStatus(`Analyzing first ${analyzeCount} of ${bookmarkCount} bookmarks...`);
    } else {
      this.updateStatus(`Analyzing ${analyzeCount} bookmarks...`);
    }

    try {
      const provider = this.createLLMProvider();
      const analysis = await provider.analyzeBookmarks(this.state.lastExtraction);

      this.state.aiAnalysis = analysis;
      await chrome.storage.local.set({ aiAnalysis: analysis });

      let statusMsg = `Analysis complete! Found ${analysis.tags.length} tags and ${analysis.categories.length} categories.`;
      if (bookmarkCount > this.constants.AI_ANALYSIS_LIMIT) {
        statusMsg += ` (Analyzed first ${this.constants.AI_ANALYSIS_LIMIT} of ${bookmarkCount} bookmarks)`;
      }

      this.updateStatus(statusMsg);
      this.showAnalysisResults(analysis);
    } catch (error) {
      console.error('AI Analysis error:', error);
      this.updateStatus(`Analysis failed: ${error.message}`);
    } finally {
      // Reset button state
      this.elements.analyzeAiBtn.disabled = false;
      this.elements.analyzeAiBtn.textContent = 'Analyze Bookmarks';
    }
  };

  createLLMProvider = () => {
    switch (this.state.llmProvider) {
      case 'openai':
        return new OpenAIProvider(this.state.apiKey, this.constants);
      case 'anthropic':
        return new AnthropicProvider(this.state.apiKey, this.constants);
      case 'none':
      default:
        return new LLMFreeProvider(this.constants);
    }
  };

  analyzeLLMFree = async () => {
    // Show loading state
    this.elements.analyzeAiBtn.disabled = true;
    this.elements.analyzeAiBtn.textContent = 'Analyzing...';

    const bookmarkCount = this.state.lastExtraction.length;
    this.updateStatus(`Analyzing ${bookmarkCount} bookmarks (LLM-free mode)...`);

    try {
      const provider = new LLMFreeProvider(this.constants);
      const analysis = await provider.analyzeBookmarks(this.state.lastExtraction);

      this.state.aiAnalysis = analysis;
      await chrome.storage.local.set({ aiAnalysis: analysis });

      this.updateStatus(`Analysis complete! Found ${analysis.tags.length} tags and ${analysis.categories.length} categories.`);
      this.showAnalysisResults(analysis);
    } catch (error) {
      console.error('Analysis error:', error);
      this.updateStatus(`Analysis failed: ${error.message}`);
    } finally {
      // Reset button state
      this.elements.analyzeAiBtn.disabled = false;
      this.elements.analyzeAiBtn.textContent = 'Analyze Bookmarks';
    }
  };

  // Sanitize text to prevent XSS attacks
  sanitizeText = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  showAnalysisResults = (analysis) => {
    // Create analysis results display
    const existingResults = document.getElementById('ai-results');
    if (existingResults) {
      existingResults.remove();
    }

    // Create container using DOM methods instead of innerHTML
    const resultsDiv = document.createElement('div');
    resultsDiv.id = 'ai-results';
    resultsDiv.style.cssText = `
      margin: 16px 0;
      padding: 16px;
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 8px;
    `;

    // Title
    const title = document.createElement('h3');
    title.style.cssText = 'margin-top: 0; color: var(--text-color);';
    title.textContent = 'AI Analysis Results';
    resultsDiv.appendChild(title);

    // Overall summary
    if (analysis.overallSummary) {
      const summaryDiv = document.createElement('div');
      summaryDiv.style.cssText = 'margin-bottom: 16px;';

      const summaryLabel = document.createElement('strong');
      summaryLabel.style.color = 'var(--text-color)';
      summaryLabel.textContent = 'Overall Summary:';
      summaryDiv.appendChild(summaryLabel);

      const summaryText = document.createElement('p');
      summaryText.style.cssText = 'color: var(--text-color); margin: 8px 0;';
      summaryText.textContent = analysis.overallSummary; // textContent auto-escapes
      summaryDiv.appendChild(summaryText);

      resultsDiv.appendChild(summaryDiv);
    }

    // Tags
    if (analysis.tags && analysis.tags.length > 0) {
      const tagsDiv = document.createElement('div');
      tagsDiv.style.cssText = 'margin-bottom: 16px;';

      const tagsLabel = document.createElement('strong');
      tagsLabel.style.color = 'var(--text-color)';
      tagsLabel.textContent = 'Tags:';
      tagsDiv.appendChild(tagsLabel);

      tagsDiv.appendChild(document.createElement('br'));

      const tagsContainer = document.createElement('div');
      tagsContainer.style.cssText = 'margin-top: 8px;';

      analysis.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.style.cssText = 'display: inline-block; background: var(--primary-color); color: white; padding: 4px 12px; margin: 4px; border-radius: 16px; font-size: 12px;';
        tagSpan.textContent = tag; // textContent auto-escapes
        tagsContainer.appendChild(tagSpan);
      });

      tagsDiv.appendChild(tagsContainer);
      resultsDiv.appendChild(tagsDiv);
    }

    // Categories
    if (analysis.categories && analysis.categories.length > 0) {
      const categoriesDiv = document.createElement('div');
      categoriesDiv.style.cssText = 'margin-bottom: 16px;';

      const categoriesLabel = document.createElement('strong');
      categoriesLabel.style.color = 'var(--text-color)';
      categoriesLabel.textContent = 'Categories:';
      categoriesDiv.appendChild(categoriesLabel);

      const categoriesList = document.createElement('ul');
      categoriesList.style.cssText = 'color: var(--text-color); margin: 8px 0; padding-left: 20px;';

      analysis.categories.forEach(cat => {
        const li = document.createElement('li');
        li.textContent = cat; // textContent auto-escapes
        categoriesList.appendChild(li);
      });

      categoriesDiv.appendChild(categoriesList);
      resultsDiv.appendChild(categoriesDiv);
    }

    // Analyze more button
    const analyzeBtn = document.createElement('button');
    analyzeBtn.id = 'analyzeBtn';
    analyzeBtn.style.cssText = 'background: var(--primary-color); color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 8px;';
    analyzeBtn.textContent = 'Re-analyze';
    analyzeBtn.addEventListener('click', () => this.analyzeBookmarks());
    resultsDiv.appendChild(analyzeBtn);

    // Insert after status container
    const statusContainer = document.querySelector('.status-container');
    if (statusContainer && statusContainer.parentNode) {
      statusContainer.parentNode.insertBefore(resultsDiv, statusContainer.nextSibling);
    }
  };

  showSettingsDialog = () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'settings-dialog-title');
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
      max-width: 450px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
    `;

    const providerOptions = `
      <option value="none" ${this.state.llmProvider === 'none' ? 'selected' : ''}>None (LLM-free mode)</option>
      <option value="openai" ${this.state.llmProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
      <option value="anthropic" ${this.state.llmProvider === 'anthropic' ? 'selected' : ''}>Anthropic (Claude)</option>
    `;

    dialogContent.innerHTML = `
      <h2 id="settings-dialog-title" style="margin-top: 0; color: var(--text-color);">Settings</h2>

      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; color: var(--text-color);">
          Analysis Provider:
          <select id="providerSelect" style="width: 100%; padding: 8px; margin-top: 4px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-color); color: var(--text-color);">
            ${providerOptions}
          </select>
        </label>
        <small style="color: var(--disabled-color);">Choose an LLM provider or use LLM-free mode for basic analysis</small>
      </div>

      <div id="apiKeySection" style="margin-bottom: 16px; ${this.state.llmProvider === 'none' ? 'display: none;' : ''}">
        <label style="display: block; margin-bottom: 8px; color: var(--text-color);">
          <span id="apiKeyLabel">API Key:</span>
          <input type="password" id="apiKeyInput" value="${this.state.apiKey}"
                 style="width: 100%; padding: 8px; margin-top: 4px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-color); color: var(--text-color);">
        </label>
        <small id="apiKeyHelp" style="color: var(--disabled-color);"></small>
      </div>

      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="cancelBtn" style="padding: 8px 16px; border: 1px solid var(--border-color); background: transparent; color: var(--text-color); border-radius: 4px; cursor: pointer;">Cancel</button>
        <button id="saveBtn" style="padding: 8px 16px; border: none; background: var(--primary-color); color: white; border-radius: 4px; cursor: pointer;">Save</button>
      </div>
    `;

    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);

    // Update API key section based on provider selection
    const updateApiKeySection = (provider) => {
      const apiKeySection = document.getElementById('apiKeySection');
      const apiKeyLabel = document.getElementById('apiKeyLabel');
      const apiKeyHelp = document.getElementById('apiKeyHelp');

      if (provider === 'none') {
        apiKeySection.style.display = 'none';
      } else {
        apiKeySection.style.display = 'block';
        if (provider === 'openai') {
          apiKeyLabel.textContent = 'OpenAI API Key:';
          apiKeyHelp.innerHTML = 'Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" style="color: var(--primary-color);">OpenAI</a>';
        } else if (provider === 'anthropic') {
          apiKeyLabel.textContent = 'Anthropic API Key:';
          apiKeyHelp.innerHTML = 'Get your API key from <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color: var(--primary-color);">Anthropic Console</a>';
        }
      }
    };

    // Initialize API key section
    const providerSelect = document.getElementById('providerSelect');
    updateApiKeySection(providerSelect.value);

    // Handle provider selection change
    providerSelect.addEventListener('change', (e) => {
      updateApiKeySection(e.target.value);
    });

    // Store currently focused element to restore later
    const previouslyFocused = document.activeElement;

    // Get all focusable elements in dialog
    const getFocusableElements = () => {
      return dialogContent.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
    };

    // Focus first element
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Focus trap
    const handleTabKey = (e) => {
      const focusables = Array.from(getFocusableElements());
      const firstFocusable = focusables[0];
      const lastFocusable = focusables[focusables.length - 1];

      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable.focus();
          }
        } else {
          if (document.activeElement === lastFocusable) {
            e.preventDefault();
            firstFocusable.focus();
          }
        }
      }
    };

    const closeDialog = () => {
      document.body.removeChild(dialog);
      document.removeEventListener('keydown', handleDialogKeys);
      if (previouslyFocused) {
        previouslyFocused.focus();
      }
    };

    // ESC key and tab trap
    const handleDialogKeys = (e) => {
      if (e.key === 'Escape') {
        closeDialog();
      } else {
        handleTabKey(e);
      }
    };

    document.addEventListener('keydown', handleDialogKeys);

    // Event handlers
    document.getElementById('cancelBtn').addEventListener('click', closeDialog);

    document.getElementById('saveBtn').addEventListener('click', async () => {
      const provider = document.getElementById('providerSelect').value;
      const apiKey = document.getElementById('apiKeyInput').value.trim();

      // Validate API key before saving (only if provider requires it)
      if (provider !== 'none' && apiKey.length > 0) {
        const validation = this.validateApiKey(apiKey, provider);
        if (!validation.valid) {
          // Show error in dialog
          const existingError = document.getElementById('apiKeyError');
          if (existingError) {
            existingError.textContent = validation.error;
          } else {
            const errorDiv = document.createElement('div');
            errorDiv.id = 'apiKeyError';
            errorDiv.style.cssText = 'color: var(--danger-color); font-size: 13px; margin-top: 8px;';
            errorDiv.textContent = validation.error;
            const inputParent = document.getElementById('apiKeyInput').parentElement;
            inputParent.appendChild(errorDiv);
          }
          // Keep focus on input
          document.getElementById('apiKeyInput').focus();
          return;
        }
      }

      // Save provider and API key
      this.state.llmProvider = provider;
      await chrome.storage.local.set({ llmProvider: provider });

      if (provider !== 'none') {
        await this.saveApiKey(apiKey);
      }

      this.updateStatus('Settings saved!');
      closeDialog();
    });

    // Close on background click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        closeDialog();
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

    const bookmarks = this.state.lastExtraction;
    const exportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let md = `# X Bookmarks Export\n\n`;
    md += `**Exported:** ${exportDate}\n`;
    md += `**Total Bookmarks:** ${bookmarks.length}\n\n`;

    // Add basic statistics
    const stats = this.calculateBasicStats(bookmarks);
    md += `## Statistics\n\n`;
    md += `- **Total Engagement:** ${stats.totalLikes + stats.totalRetweets} interactions\n`;
    md += `- **Average Likes:** ${Math.round(stats.avgLikes)}\n`;
    md += `- **Top Author:** @${stats.topAuthor.username || 'N/A'} (${stats.topAuthor.count} bookmarks)\n`;
    md += `- **Date Range:** ${stats.dateRange}\n\n`;

    // Add AI analysis if available
    if (this.state.aiAnalysis) {
      md += `## Analysis\n\n`;
      if (this.state.aiAnalysis.overallSummary) {
        md += `**Summary:** ${this.state.aiAnalysis.overallSummary}\n\n`;
      }
      if (this.state.aiAnalysis.tags && this.state.aiAnalysis.tags.length > 0) {
        md += `**Tags:** ${this.state.aiAnalysis.tags.join(', ')}\n\n`;
      }
      if (this.state.aiAnalysis.categories && this.state.aiAnalysis.categories.length > 0) {
        md += `**Categories:**\n${this.state.aiAnalysis.categories.map(c => `- ${c}`).join('\n')}\n\n`;
      }
      md += `---\n\n`;
    }

    md += `## Bookmarks\n\n`;

    // Use a more readable format instead of a table
    bookmarks.forEach((bookmark, index) => {
      md += `### ${index + 1}. ${bookmark.displayName || 'Unknown'} (@${bookmark.username || 'unknown'})\n\n`;

      if (bookmark.text) {
        md += `${bookmark.text}\n\n`;
      }

      md += `**Stats:** ${bookmark.likes || '0'} likes • ${bookmark.retweets || '0'} retweets • ${bookmark.replies || '0'} replies`;
      if (bookmark.views) {
        md += ` • ${bookmark.views} views`;
      }
      md += `\n\n`;

      if (bookmark.dateTime) {
        const date = new Date(bookmark.dateTime);
        md += `**Date:** ${date.toLocaleString()}\n\n`;
      }

      md += `**Link:** ${bookmark.url}\n\n`;
      md += `---\n\n`;
    });

    return md;
  };

  calculateBasicStats = (bookmarks) => {
    let totalLikes = 0;
    let totalRetweets = 0;
    const authorCounts = {};
    let minDate = null;
    let maxDate = null;

    bookmarks.forEach(b => {
      totalLikes += parseInt(b.likes || 0);
      totalRetweets += parseInt(b.retweets || 0);

      if (b.username) {
        authorCounts[b.username] = (authorCounts[b.username] || 0) + 1;
      }

      if (b.dateTime) {
        const date = new Date(b.dateTime);
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;
      }
    });

    const avgLikes = bookmarks.length > 0 ? totalLikes / bookmarks.length : 0;

    let topAuthor = { username: null, count: 0 };
    Object.entries(authorCounts).forEach(([username, count]) => {
      if (count > topAuthor.count) {
        topAuthor = { username, count };
      }
    });

    let dateRange = 'N/A';
    if (minDate && maxDate) {
      const minStr = minDate.toLocaleDateString();
      const maxStr = maxDate.toLocaleDateString();
      dateRange = minStr === maxStr ? minStr : `${minStr} - ${maxStr}`;
    }

    return {
      totalLikes,
      totalRetweets,
      avgLikes,
      topAuthor,
      dateRange
    };
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

// LLM Provider Base Class
class LLMProvider {
  constructor(constants) {
    this.constants = constants || {
      AI_ANALYSIS_LIMIT: 50,
      AI_MAX_TOKENS: 500,
      AI_TEMPERATURE: 0.7,
      MAX_TAGS: 20,
      MAX_CATEGORIES: 10
    };
  }

  prepareBookmarkTexts(bookmarks) {
    return bookmarks
      .filter(b => b.text && b.text.trim())
      .slice(0, this.constants.AI_ANALYSIS_LIMIT)
      .map(b => `@${b.username}: ${b.text}`)
      .join('\n\n');
  }

  parseJSONResponse(content) {
    let analysis = null;

    // Strategy 1: Try parsing entire content as JSON
    try {
      analysis = JSON.parse(content);
      return analysis;
    } catch (e) {
      // Strategy 2: Extract JSON from markdown code blocks
      const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        try {
          analysis = JSON.parse(codeBlockMatch[1]);
          return analysis;
        } catch (e2) {
          // Continue to next strategy
        }
      }

      // Strategy 3: Find first JSON object in content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          analysis = JSON.parse(jsonMatch[0]);
          return analysis;
        } catch (e3) {
          throw new Error('Failed to parse response as JSON');
        }
      } else {
        throw new Error('No JSON found in response');
      }
    }
  }

  validateAnalysis(analysis) {
    if (!analysis || typeof analysis !== 'object') {
      throw new Error('Analysis is not a valid object');
    }

    const validatedAnalysis = {
      overallSummary: typeof analysis.overallSummary === 'string' ? analysis.overallSummary : '',
      tags: Array.isArray(analysis.tags) ? analysis.tags.filter(t => typeof t === 'string').slice(0, this.constants.MAX_TAGS) : [],
      categories: Array.isArray(analysis.categories) ? analysis.categories.filter(c => typeof c === 'string').slice(0, this.constants.MAX_CATEGORIES) : [],
      timestamp: Date.now()
    };

    if (!validatedAnalysis.overallSummary && validatedAnalysis.tags.length === 0 && validatedAnalysis.categories.length === 0) {
      throw new Error('Response contained no useful analysis data');
    }

    return validatedAnalysis;
  }

  async analyzeBookmarks(bookmarks) {
    throw new Error('analyzeBookmarks must be implemented by subclass');
  }
}

// OpenAI Provider
class OpenAIProvider extends LLMProvider {
  constructor(apiKey, constants) {
    super(constants);
    this.apiKey = apiKey;
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
    this.model = 'gpt-3.5-turbo';
  }

  async analyzeBookmarks(bookmarks) {
    const bookmarkTexts = this.prepareBookmarkTexts(bookmarks);

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
          model: this.model,
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
          temperature: this.constants.AI_TEMPERATURE,
          max_tokens: this.constants.AI_MAX_TOKENS
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error('Invalid API response structure');
      }

      if (!data.choices[0].message || !data.choices[0].message.content) {
        throw new Error('Missing content in API response');
      }

      const content = data.choices[0].message.content;
      const analysis = this.parseJSONResponse(content);
      return this.validateAnalysis(analysis);
    } catch (error) {
      console.error('OpenAI Analysis error:', error);
      throw error;
    }
  }
}

// Anthropic Provider
class AnthropicProvider extends LLMProvider {
  constructor(apiKey, constants) {
    super(constants);
    this.apiKey = apiKey;
    this.apiUrl = 'https://api.anthropic.com/v1/messages';
    this.model = 'claude-3-5-sonnet-20241022';
  }

  async analyzeBookmarks(bookmarks) {
    const bookmarkTexts = this.prepareBookmarkTexts(bookmarks);

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
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.constants.AI_MAX_TOKENS,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
        throw new Error('Invalid API response structure');
      }

      const content = data.content[0].text;
      const analysis = this.parseJSONResponse(content);
      return this.validateAnalysis(analysis);
    } catch (error) {
      console.error('Anthropic Analysis error:', error);
      throw error;
    }
  }
}

// LLM-Free Provider (Basic Analysis)
class LLMFreeProvider extends LLMProvider {
  constructor(constants) {
    super(constants);
  }

  async analyzeBookmarks(bookmarks) {
    // Perform basic text analysis without external LLM
    if (!bookmarks || bookmarks.length === 0) {
      throw new Error('No bookmark content to analyze');
    }

    // Extract common words for tags
    const wordFrequency = {};
    const authorFrequency = {};
    const allText = [];

    bookmarks.forEach(b => {
      if (b.text) {
        allText.push(b.text.toLowerCase());
        // Extract words (simple tokenization)
        const words = b.text.toLowerCase()
          .replace(/[^\w\s#@]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 3 && !this.isStopWord(w));

        words.forEach(word => {
          wordFrequency[word] = (wordFrequency[word] || 0) + 1;
        });
      }

      if (b.username) {
        authorFrequency[b.username] = (authorFrequency[b.username] || 0) + 1;
      }
    });

    // Get top tags (most frequent words)
    const tags = Object.entries(wordFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);

    // Detect categories based on keywords
    const categories = this.detectCategories(allText.join(' '));

    // Generate basic summary
    const topAuthor = Object.entries(authorFrequency)
      .sort((a, b) => b[1] - a[1])[0];

    const summary = `This collection contains ${bookmarks.length} bookmarks. ` +
      `Most frequently bookmarked author: @${topAuthor ? topAuthor[0] : 'N/A'}. ` +
      `Common topics include: ${tags.slice(0, 3).join(', ')}.`;

    return {
      overallSummary: summary,
      tags: tags,
      categories: categories,
      timestamp: Date.now()
    };
  }

  isStopWord(word) {
    const stopWords = ['that', 'this', 'with', 'from', 'have', 'will', 'your', 'they', 'been', 'more', 'when', 'there', 'their', 'would', 'about', 'which', 'these', 'https'];
    return stopWords.includes(word);
  }

  detectCategories(text) {
    const categories = [];
    const lowerText = text.toLowerCase();

    const categoryKeywords = {
      'Technology': ['tech', 'software', 'code', 'programming', 'developer', 'ai', 'data', 'cloud', 'api'],
      'Business': ['business', 'startup', 'entrepreneur', 'market', 'company', 'revenue', 'growth'],
      'News & Politics': ['news', 'political', 'government', 'election', 'policy', 'breaking'],
      'Science': ['science', 'research', 'study', 'paper', 'scientific', 'discovery'],
      'Entertainment': ['movie', 'music', 'game', 'entertainment', 'show', 'video'],
      'Sports': ['sport', 'team', 'player', 'game', 'match', 'football', 'basketball'],
      'Education': ['learn', 'education', 'course', 'tutorial', 'teaching', 'university'],
      'Health': ['health', 'medical', 'wellness', 'fitness', 'mental', 'exercise']
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      const matches = keywords.filter(keyword => lowerText.includes(keyword)).length;
      if (matches >= 2) {
        categories.push(category);
      }
    }

    if (categories.length === 0) {
      categories.push('General');
    }

    return categories.slice(0, 5);
  }
}

// Initialize the popup controller when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
