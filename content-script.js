// Content script for X Bookmarks Extractor
console.log('X Bookmarks Extractor: Content script loaded');

class XBookmarkScanner {
  constructor() {
    this.setupMessageListener();
    this.cachedElements = new Map(); // Cache for DOM elements
    this.performanceMetrics = { startTime: 0, endTime: 0, articlesProcessed: 0 };
    console.log('[X Extractor] XBookmarkScanner initialized');
    this.sendProgress('Content script initialized.');

    // Initialize Add to Analyzer button injection
    this.injectedButtons = new Set(); // Track which tweets have buttons
    this.initializeButtonInjection();
  }

  async sendProgress(status) {
    try {
      chrome.runtime
        .sendMessage({ type: 'progressUpdate', status })
        .catch(() => {});
    } catch (e) {
      // ignore
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      try {
        console.log('[X Extractor] Received message:', request);
        if (request.action === 'scanBookmarksWithFallback') {
          this.sendProgress('Starting extraction...');
          this.scanCurrentPage(true).then(result => {
            this.sendProgress('Extraction complete.');
            console.log('[X Extractor] scanCurrentPage complete:', result.tweets.length, 'tweets');
            sendResponse({ ...result, success: true });
          }).catch(error => {
            this.sendProgress('Extraction failed.');
            console.error('[X Extractor] Scanning error (fallback):', error);
            sendResponse({ tweets: [], debugUrls: [], success: false, error: error.message });
          });
          return true;
        }
        if (request.action === 'scanBookmarks') {
          this.sendProgress('Starting extraction...');
          this.scanCurrentPage(false).then(result => {
            this.sendProgress('Extraction complete.');
            console.log('[X Extractor] scanCurrentPage complete:', result.tweets.length, 'tweets');
            sendResponse({ tweets: result.tweets, success: true });
          }).catch(error => {
            this.sendProgress('Extraction failed.');
            console.error('[X Extractor] Scanning error:', error);
            sendResponse({ tweets: [], success: false, error: error.message });
          });
          return true;
        }
        if (request.action === 'getPageInfo') {
          const info = {
            url: window.location.href,
            title: document.title,
            isBookmarksPage: this.isBookmarksPage()
          };
          this.sendProgress('Checking if this is the bookmarks page...');
          console.log('[X Extractor] getPageInfo:', info);
          sendResponse(info);
        }
      } catch (err) {
        this.sendProgress('Error in message listener.');
        console.error('[X Extractor] Message listener error:', err);
        sendResponse({ success: false, error: err.message });
      }
    });
  }

  isBookmarksPage() {
    const isBookmarks = window.location.href.includes('/i/bookmarks');
    this.sendProgress(isBookmarks ? 'On bookmarks page.' : 'Not on bookmarks page.');
    console.log('[X Extractor] isBookmarksPage:', isBookmarks, window.location.href);
    return isBookmarks;
  }

  // Unified scan method with optional fallback
  async scanCurrentPage(useFallback = false) {
    try {
      this.performanceMetrics.startTime = performance.now();
      this.sendProgress(useFallback ? 'Extracting bookmarks (with fallback)...' : 'Extracting visible bookmarks...');
      console.log('[X Extractor] scanCurrentPage started, fallback:', useFallback);

      const tweets = [];
      const foundUrls = new Set();
      const articles = document.querySelectorAll('article');
      this.performanceMetrics.articlesProcessed = articles.length;

      // Batch process articles for better performance
      for (const article of articles) {
        const tweetData = this.extractTweetData(article);
        if (tweetData.url) {
          // Validate bookmark data before adding
          const validation = this.validateBookmarkData(tweetData);
          if (validation.valid) {
            foundUrls.add(tweetData.url);
            tweets.push(tweetData);
          } else {
            console.warn('[X Extractor] Invalid bookmark data:', validation.error, tweetData.url);
          }
        }
      }

      // Fallback: find all tweet links that weren't in articles
      if (useFallback) {
        this.sendProgress('Checking for extra tweet links...');
        const allLinks = Array.from(document.querySelectorAll('a[href*="/status/"]'));
        for (const link of allLinks) {
          if (!foundUrls.has(link.href)) {
            foundUrls.add(link.href);
            // Extract username from URL for minimal data
            const match = link.href.match(/(?:x\.com|twitter\.com)\/([^\/]+)\/status/);
            tweets.push({
              url: link.href,
              text: '',
              displayName: '',
              username: match ? match[1] : '',
              dateTime: '',
              likes: '',
              retweets: '',
              replies: '',
              views: ''
            });
          }
        }
      }

      this.performanceMetrics.endTime = performance.now();
      const duration = Math.round(this.performanceMetrics.endTime - this.performanceMetrics.startTime);

      this.sendProgress('Extraction finished.');
      console.log(`[X Extractor] scanCurrentPage finished: ${tweets.length} tweets, ${duration}ms`);

      return {
        tweets,
        debugUrls: useFallback ? Array.from(foundUrls) : undefined,
        performance: {
          duration,
          articlesProcessed: this.performanceMetrics.articlesProcessed,
          tweetsExtracted: tweets.length
        }
      };
    } catch (err) {
      this.sendProgress('Extraction error.');
      console.error('[X Extractor] scanCurrentPage error:', err);
      throw err;
    }
  }

  // Extract data from a single article element (DRY principle)
  // PERFORMANCE OPTIMIZED: Cache selectors and batch queries
  extractTweetData(article) {
    try {
      // URL - Priority extraction, exit early if no URL
      const link = article.querySelector('a[href*="/status/"]');
      const url = link ? link.href : '';
      if (!url) return { url: '' };

    // Text - use array join for efficiency
    const textEls = article.querySelectorAll('[data-testid="tweetText"]');
    const textParts = [];
    textEls.forEach(el => {
      const text = el.textContent?.trim();
      if (text) textParts.push(text);
    });
    const text = textParts.join(' ');

    // Author display name & username
    let displayName = '';
    let username = '';

    const header = article.querySelector('div[role="group"]')?.parentElement?.parentElement;
    if (header) {
      const spans = header.querySelectorAll('span');
      if (spans.length > 0) displayName = spans[0].textContent?.trim() || '';
      // Find username span
      for (const span of spans) {
        const spanText = span.textContent?.trim();
        if (spanText && spanText.startsWith('@')) {
          username = spanText.replace('@', '');
          break;
        }
      }
    }

    // Fallback for display name
    if (!displayName) {
      const nameSpan = article.querySelector('div[dir="auto"] > span');
      if (nameSpan) displayName = nameSpan.textContent?.trim() || '';
    }

    // Fallback for username
    if (!username) {
      const handleSpan = article.querySelector('div[dir="ltr"] > span');
      if (handleSpan) {
        username = handleSpan.textContent?.replace('@', '').trim() || '';
      }
    }

    // Extract username from URL if still missing
    if (!username && url) {
      const match = url.match(/(?:x\.com|twitter\.com)\/([^\/]+)\/status/);
      if (match) username = match[1];
    }

    // Date/time - single query
    const timeEl = article.querySelector('time');
    const dateTime = timeEl ? timeEl.getAttribute('datetime') || '' : '';

    // Engagement metrics - PERFORMANCE: Query once and extract numbers more efficiently
    const likeEl = article.querySelector('[data-testid="like"]');
    const likes = likeEl ? this.extractNumber(likeEl.textContent) : '';

    const retweetEl = article.querySelector('[data-testid="retweet"]');
    const retweets = retweetEl ? this.extractNumber(retweetEl.textContent) : '';

    const replyEl = article.querySelector('[data-testid="reply"]');
    const replies = replyEl ? this.extractNumber(replyEl.textContent) : '';

    // Views - OPTIMIZED: More targeted selector
    let views = '';
    const allEls = article.querySelectorAll('a[aria-label*="View"], span[aria-label*="View"]');
    for (const el of allEls) {
      const label = el.getAttribute('aria-label');
      if (label && /view/i.test(label)) {
        views = this.extractNumber(label);
        break;
      }
    }

      return {
        url,
        text,
        displayName,
        username,
        dateTime,
        likes,
        retweets,
        replies,
        views
      };
    } catch (error) {
      console.error('[X Extractor] Error extracting tweet data:', error);
      // Return minimal valid data on error
      return {
        url: '',
        text: '',
        displayName: '',
        username: '',
        dateTime: '',
        likes: '',
        retweets: '',
        replies: '',
        views: ''
      };
    }
  }

  // PERFORMANCE HELPER: Extract numbers more efficiently and handle K/M/B abbreviations
  extractNumber(text) {
    if (!text) return '';

    // Match numbers with K/M/B abbreviations (e.g., "1.2K", "3.5M", "1B")
    const abbreviationMatch = text.match(/([\d,.]+)\s*([KMBkmb])/);
    if (abbreviationMatch) {
      const num = parseFloat(abbreviationMatch[1].replace(/,/g, ''));
      const suffix = abbreviationMatch[2].toUpperCase();

      const multipliers = {
        'K': 1000,
        'M': 1000000,
        'B': 1000000000
      };

      const result = num * (multipliers[suffix] || 1);
      return Math.round(result).toString();
    }

    // Match plain numbers with commas (e.g., "1,234" or "1234")
    const numberMatch = text.match(/([\d,.]+)/);
    return numberMatch ? numberMatch[1].replace(/,/g, '') : '';
  }

  // Validate bookmark data before storing
  validateBookmarkData(bookmark) {
    if (!bookmark || typeof bookmark !== 'object') {
      return { valid: false, error: 'Invalid bookmark object' };
    }

    // URL is required
    if (!bookmark.url || typeof bookmark.url !== 'string' || bookmark.url.trim() === '') {
      return { valid: false, error: 'Missing or invalid URL' };
    }

    // URL must be a valid X/Twitter status URL
    if (!bookmark.url.match(/(?:x\.com|twitter\.com)\/[^\/]+\/status\/\d+/)) {
      return { valid: false, error: 'Invalid X/Twitter URL format' };
    }

    return { valid: true, error: null };
  }

  // ============================================
  // ADD TO ANALYZER BUTTON INJECTION
  // ============================================

  initializeButtonInjection() {
    console.log('[X Extractor] Initializing Add to Analyzer button injection');

    // Inject buttons on initial load
    this.injectAddToAnalyzerButtons();

    // Watch for new tweets being loaded (infinite scroll)
    const observer = new MutationObserver((mutations) => {
      // Debounce: only inject after mutations settle
      if (this.injectionTimeout) clearTimeout(this.injectionTimeout);
      this.injectionTimeout = setTimeout(() => {
        this.injectAddToAnalyzerButtons();
      }, 500);
    });

    // Observe the main timeline for new tweets
    const timeline = document.querySelector('div[aria-label="Timeline: Your Home Timeline"]') ||
                     document.querySelector('main[role="main"]') ||
                     document.body;

    if (timeline) {
      observer.observe(timeline, {
        childList: true,
        subtree: true
      });
      console.log('[X Extractor] Mutation observer attached to timeline');
    }
  }

  injectAddToAnalyzerButtons() {
    const articles = document.querySelectorAll('article');
    let injectedCount = 0;

    articles.forEach(article => {
      const tweetUrl = this.getTweetUrl(article);
      if (!tweetUrl || this.injectedButtons.has(tweetUrl)) {
        return; // Skip if already injected or no URL
      }

      // Find the action bar (like, retweet, reply buttons)
      const actionBar = article.querySelector('div[role="group"]');
      if (!actionBar) return;

      // Create the custom button
      const analyzerButton = this.createAnalyzerButton(article, tweetUrl);

      // Inject the button into the action bar
      const lastButton = actionBar.lastElementChild;
      if (lastButton) {
        actionBar.insertBefore(analyzerButton, lastButton.nextSibling);
        this.injectedButtons.add(tweetUrl);
        injectedCount++;
      }
    });

    if (injectedCount > 0) {
      console.log(`[X Extractor] Injected ${injectedCount} Add to Analyzer buttons`);
    }
  }

  getTweetUrl(article) {
    const link = article.querySelector('a[href*="/status/"]');
    return link ? link.href : null;
  }

  createAnalyzerButton(article, tweetUrl) {
    const container = document.createElement('div');
    container.className = 'x-analyzer-button-container';
    container.style.cssText = `
      display: inline-flex;
      align-items: center;
      margin-left: 8px;
    `;

    const button = document.createElement('button');
    button.className = 'x-analyzer-button';
    button.setAttribute('aria-label', 'Add to Analyzer');
    button.style.cssText = `
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 9999px;
      transition: background-color 0.2s;
      color: rgb(113, 118, 123);
      min-width: 32px;
      min-height: 32px;
    `;

    // Icon (bookmark-plus icon)
    button.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"/>
        <path d="M12 6v4m0 0v4m0-4h4m-4 0H8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;

    // Hover effects
    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = 'rgba(29, 155, 240, 0.1)';
      button.style.color = 'rgb(29, 155, 240)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = 'transparent';
      button.style.color = 'rgb(113, 118, 123)';
    });

    // Click handler
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleAddToAnalyzer(article, tweetUrl, button);
    });

    container.appendChild(button);
    return container;
  }

  async handleAddToAnalyzer(article, tweetUrl, button) {
    console.log('[X Extractor] Add to Analyzer clicked:', tweetUrl);

    // Visual feedback
    button.style.color = 'rgb(29, 155, 240)';
    button.style.transform = 'scale(1.1)';
    setTimeout(() => {
      button.style.transform = 'scale(1)';
    }, 200);

    // Extract tweet data
    const tweetData = this.extractTweetData(article);

    // Show quick tagging dialog
    this.showQuickTagDialog(tweetData, button);
  }

  showQuickTagDialog(tweetData, buttonEl) {
    // Remove any existing dialog
    const existingDialog = document.querySelector('.x-analyzer-tag-dialog');
    if (existingDialog) existingDialog.remove();

    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'x-analyzer-tag-dialog';
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      padding: 24px;
      z-index: 10000;
      min-width: 400px;
      max-width: 500px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;

    // Check for dark mode
    const isDark = document.documentElement.style.backgroundColor === 'rgb(0, 0, 0)' ||
                   document.body.style.backgroundColor === 'rgb(0, 0, 0)' ||
                   window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (isDark) {
      dialog.style.background = 'rgb(21, 32, 43)';
      dialog.style.color = 'rgb(231, 233, 234)';
    }

    dialog.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h3 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700;">Add to Analyzer</h3>
        <p style="margin: 0; font-size: 14px; color: ${isDark ? 'rgb(139, 152, 165)' : 'rgb(83, 100, 113)'};">
          by @${tweetData.username || 'unknown'}
        </p>
      </div>

      <div style="margin-bottom: 16px; max-height: 100px; overflow-y: auto; padding: 12px; background: ${isDark ? 'rgb(15, 20, 25)' : 'rgb(247, 249, 249)'}; border-radius: 8px;">
        <p style="margin: 0; font-size: 14px; line-height: 1.4;">
          ${tweetData.text.substring(0, 200)}${tweetData.text.length > 200 ? '...' : ''}
        </p>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600;">
          Quick Tags (optional)
        </label>
        <input
          type="text"
          id="x-analyzer-tags-input"
          placeholder="e.g., important, to-read, ai"
          style="width: 100%; padding: 10px 12px; border: 1px solid ${isDark ? 'rgb(56, 68, 77)' : 'rgb(207, 217, 222)'}; border-radius: 8px; font-size: 14px; background: ${isDark ? 'rgb(15, 20, 25)' : 'white'}; color: ${isDark ? 'rgb(231, 233, 234)' : 'rgb(15, 20, 25)'};"
        />
        <p style="margin: 8px 0 0 0; font-size: 12px; color: ${isDark ? 'rgb(139, 152, 165)' : 'rgb(83, 100, 113)'};">
          Separate tags with commas
        </p>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600;">
          Notes (optional)
        </label>
        <textarea
          id="x-analyzer-notes-input"
          placeholder="Add any notes about this tweet..."
          style="width: 100%; padding: 10px 12px; border: 1px solid ${isDark ? 'rgb(56, 68, 77)' : 'rgb(207, 217, 222)'}; border-radius: 8px; font-size: 14px; min-height: 60px; resize: vertical; background: ${isDark ? 'rgb(15, 20, 25)' : 'white'}; color: ${isDark ? 'rgb(231, 233, 234)' : 'rgb(15, 20, 25)'}; font-family: inherit;"
        ></textarea>
      </div>

      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button id="x-analyzer-cancel" style="padding: 10px 24px; background: transparent; border: 1px solid ${isDark ? 'rgb(56, 68, 77)' : 'rgb(207, 217, 222)'}; border-radius: 9999px; cursor: pointer; font-weight: 600; font-size: 14px; color: ${isDark ? 'rgb(231, 233, 234)' : 'rgb(15, 20, 25)'}; transition: background-color 0.2s;">
          Cancel
        </button>
        <button id="x-analyzer-save" style="padding: 10px 24px; background: rgb(29, 155, 240); border: none; border-radius: 9999px; cursor: pointer; font-weight: 600; font-size: 14px; color: white; transition: background-color 0.2s;">
          Save to Analyzer
        </button>
      </div>
    `;

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'x-analyzer-backdrop';
    backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9999;
    `;

    // Add to DOM
    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);

    // Focus the tags input
    const tagsInput = dialog.querySelector('#x-analyzer-tags-input');
    setTimeout(() => tagsInput.focus(), 100);

    // Event handlers
    const closeDialog = () => {
      backdrop.remove();
      dialog.remove();
    };

    backdrop.addEventListener('click', closeDialog);

    dialog.querySelector('#x-analyzer-cancel').addEventListener('click', closeDialog);

    dialog.querySelector('#x-analyzer-save').addEventListener('click', async () => {
      const tags = tagsInput.value
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const notes = dialog.querySelector('#x-analyzer-notes-input').value.trim();

      await this.saveToAnalyzer(tweetData, tags, notes);

      // Visual confirmation
      buttonEl.style.color = 'rgb(0, 186, 124)'; // Green checkmark color
      buttonEl.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
        </svg>
      `;

      // Show toast notification
      this.showToast('Saved to Analyzer! ✓');

      closeDialog();
    });
  }

  async saveToAnalyzer(tweetData, tags, notes) {
    try {
      // Validate bookmark data before saving
      const validation = this.validateBookmarkData(tweetData);
      if (!validation.valid) {
        console.error('[X Extractor] Invalid bookmark data:', validation.error);
        this.showToast('Error: ' + validation.error, true);
        return;
      }

      // Get existing manual bookmarks
      const result = await chrome.storage.local.get('manualBookmarks');
      const manualBookmarks = result.manualBookmarks || [];

      // Add timestamp
      const bookmarkWithMetadata = {
        ...tweetData,
        savedAt: new Date().toISOString(),
        customTags: tags,
        notes: notes,
        source: 'manual'
      };

      // Check for duplicates
      const exists = manualBookmarks.some(b => b.url === tweetData.url);
      if (!exists) {
        manualBookmarks.unshift(bookmarkWithMetadata);
      } else {
        // Update existing
        const index = manualBookmarks.findIndex(b => b.url === tweetData.url);
        manualBookmarks[index] = {
          ...manualBookmarks[index],
          ...bookmarkWithMetadata
        };
      }

      // Save to storage
      await chrome.storage.local.set({ manualBookmarks });

      console.log('[X Extractor] Saved to analyzer:', tweetData.url);
    } catch (error) {
      console.error('[X Extractor] Error saving to analyzer:', error);
      this.showToast('Error saving bookmark', true);
    }
  }

  showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: ${isError ? 'rgb(244, 33, 46)' : 'rgb(0, 186, 124)'};
      color: white;
      padding: 12px 24px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 600;
      z-index: 10001;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
}

// Initialize the scanner
new XBookmarkScanner();