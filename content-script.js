// Content script for X/Twitter bookmark scanning
console.log('X Bookmark Analyzer: Content script loaded');

class XBookmarkScanner {
  constructor() {
    this.scannedUrls = new Set();
    this.observers = new Set();
    this.debounceTimers = new Map();
    this.isScanning = false;
    this.setupMessageListener();
    this.setupCleanup();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'scanBookmarks') {
        this.debouncedScan().then(urls => {
          sendResponse({ urls, success: true });
        }).catch(error => {
          console.error('Scanning error:', error);
          sendResponse({ urls: [], success: false, error: this.sanitizeError(error.message) });
        });
        return true; // Keep message channel open for async response
      }
      
      if (request.action === 'getPageInfo') {
        sendResponse({
          url: this.sanitizeUrl(window.location.href),
          title: this.sanitizeText(document.title),
          isBookmarksPage: this.isBookmarksPage()
        });
      }
    });

    // Add handler for HTML parsing from background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'parseHtmlContent' && request.html) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(request.html, 'text/html');
          let content = '';
          // Try to extract tweet text using the latest selector
          const tweetTextEls = doc.querySelectorAll('[data-testid="tweetText"]');
          if (tweetTextEls.length > 0) {
            tweetTextEls.forEach(el => {
              content += (el.textContent?.trim() || '') + ' ';
            });
            content = content.trim();
          }
          // Fallback to previous logic if no tweet text found
          if (!content) {
            const selectors = [
              'meta[property="og:title"]',
              'meta[property="og:description"]',
              'meta[name="description"]',
              'title',
              'h1',
              'h2',
              '.tweet-text'
            ];
            for (const selector of selectors) {
              const element = doc.querySelector(selector);
              if (element) {
                const text = element.getAttribute('content') || element.textContent;
                if (text && text.trim()) {
                  content += text.trim() + ' ';
                }
              }
            }
          }
          if (!content.trim()) {
            const title = doc.querySelector('title');
            content = title ? title.textContent : 'No content available';
          }
          console.log('[Content Script] Extracted content for Gemini:', content.trim().slice(0, 1000));
          sendResponse({ content: content.trim().slice(0, 1000), success: true });
        } catch (e) {
          sendResponse({ content: '', success: false, error: e.message });
        }
        return true;
      }
    });

    // Add handler for extracting tweet content for a given URL from the DOM
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'extractTweetContent' && request.url) {
        try {
          // Find the tweet/article element matching the URL
          let tweetText = '';
          // Try to find an article with a link to the tweet URL
          const articles = document.querySelectorAll('article');
          for (const article of articles) {
            const link = article.querySelector('a[href*="/status/"]');
            if (link && link.href && link.href.includes(request.url)) {
              // Extract tweet text from this article
              const tweetTextEls = article.querySelectorAll('[data-testid="tweetText"]');
              tweetTextEls.forEach(el => {
                tweetText += (el.textContent?.trim() || '') + ' ';
              });
              tweetText = tweetText.trim();
              break;
            }
          }
          // Fallback: try to find any tweetText element matching the URL
          if (!tweetText) {
            const allLinks = document.querySelectorAll('a[href*="/status/"]');
            for (const link of allLinks) {
              if (link.href && link.href.includes(request.url)) {
                const parent = link.closest('article');
                if (parent) {
                  const tweetTextEls = parent.querySelectorAll('[data-testid="tweetText"]');
                  tweetTextEls.forEach(el => {
                    tweetText += (el.textContent?.trim() || '') + ' ';
                  });
                  tweetText = tweetText.trim();
                  break;
                }
              }
            }
          }
          // Fallback: just use the first tweetText on the page
          if (!tweetText) {
            const tweetTextEls = document.querySelectorAll('[data-testid="tweetText"]');
            tweetTextEls.forEach(el => {
              tweetText += (el.textContent?.trim() || '') + ' ';
            });
            tweetText = tweetText.trim();
          }
          if (!tweetText) {
            tweetText = 'No tweet text found.';
          }
          console.log('[Content Script] Extracted tweet text for', request.url, ':', tweetText);
          sendResponse({ content: tweetText, success: true });
        } catch (e) {
          sendResponse({ content: '', success: false, error: e.message });
        }
        return true;
      }
    });
  }

  setupCleanup() {
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });

    // Clean up on navigation (SPA)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = (...args) => {
      this.cleanup();
      return originalPushState.apply(history, args);
    };
    
    history.replaceState = (...args) => {
      this.cleanup();
      return originalReplaceState.apply(history, args);
    };

    window.addEventListener('popstate', () => {
      this.cleanup();
    });
  }

  cleanup() {
    // Disconnect all observers
    this.observers.forEach(observer => {
      try {
        observer.disconnect();
      } catch (e) {
        console.warn('Observer cleanup failed:', e);
      }
    });
    this.observers.clear();

    // Clear debounce timers
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();

    this.isScanning = false;
  }

  debouncedScan() {
    return new Promise((resolve, reject) => {
      const timerId = 'scan';
      
      // Clear existing timer
      if (this.debounceTimers.has(timerId)) {
        clearTimeout(this.debounceTimers.get(timerId));
      }

      // Set new timer
      const timer = setTimeout(async () => {
        try {
          this.debounceTimers.delete(timerId);
          const urls = await this.scanCurrentPage();
          resolve(urls);
        } catch (error) {
          reject(error);
        }
      }, 300); // 300ms debounce

      this.debounceTimers.set(timerId, timer);
    });
  }

  isBookmarksPage() {
    const url = window.location.href;
    return url.includes('/i/bookmarks') || 
           url.includes('/bookmarks') || 
           document.title.toLowerCase().includes('bookmark');
  }

  async scanCurrentPage() {
    if (this.isScanning) {
      throw new Error('Scan already in progress');
    }
    this.isScanning = true;
    console.log('Starting bookmark scan...');
    try {
      // Wait for initial content
      await this.waitForContent();
      // Auto-scroll to load more bookmarks
      let scrolls = 0;
      const maxScrolls = 10; // Prevent infinite loops
      let loadedMore = true;
      while (loadedMore && scrolls < maxScrolls) {
        loadedMore = await this.loadMoreContent();
        scrolls++;
      }
      console.log(`Auto-scrolled ${scrolls} times to load bookmarks.`);
      // Debug: log the HTML of the first article
      const firstArticle = document.querySelector('article');
      if (firstArticle) {
        console.log('[Content Script] First article HTML:', firstArticle.outerHTML);
      }
      const urls = [];
      const maxUrls = 100; // Prevent memory issues
      // Multiple strategies for finding bookmark URLs
      const strategies = [
        () => this.scanByLinkElements(),
        () => this.scanByArticleElements(),
        () => this.scanByTestIds(),
        () => this.scanByHref()
      ];
      for (const strategy of strategies) {
        try {
          const foundUrls = strategy();
          urls.push(...foundUrls);
          if (urls.length >= maxUrls) break;
        } catch (error) {
          console.warn('Strategy failed:', error);
        }
      }
      // Remove duplicates and filter valid URLs
      const uniqueUrls = [...new Set(urls)]
        .filter(url => this.isValidTweetUrl(url))
        .slice(0, maxUrls); // Hard limit to prevent crashes
      console.log(`Found ${uniqueUrls.length} bookmark URLs`);
      // Scroll back to absolute top after scan
      window.scrollTo(0, 0);
      return uniqueUrls;
    } finally {
      this.isScanning = false;
    }
  }

  // Security: Sanitize text content
  sanitizeText(text) {
    if (!text) return '';
    return text.replace(/[<>]/g, '').slice(0, 200);
  }

  // Security: Sanitize URLs
  sanitizeUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.href;
    } catch {
      return '';
    }
  }

  // Security: Sanitize error messages
  sanitizeError(message) {
    if (!message) return 'Unknown error';
    return message.replace(/[<>]/g, '').slice(0, 100);
  }

  scanByLinkElements() {
    const urls = [];
    const links = document.querySelectorAll('a[href*="/status/"]');
    
    links.forEach(link => {
      const href = link.href;
      if (this.isValidTweetUrl(href)) {
        urls.push(href);
      }
    });
    
    return urls;
  }

  scanByArticleElements() {
    const urls = [];
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    
    articles.forEach(article => {
      const links = article.querySelectorAll('a[href*="/status/"]');
      links.forEach(link => {
        if (this.isValidTweetUrl(link.href)) {
          urls.push(link.href);
        }
      });
    });
    
    return urls;
  }

  scanByTestIds() {
    const urls = [];
    const selectors = [
      '[data-testid="tweet"] a[href*="/status/"]',
      '[data-testid="cellInnerDiv"] a[href*="/status/"]',
      '[data-testid="bookmark"] a[href*="/status/"]'
    ];
    
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (this.isValidTweetUrl(el.href)) {
          urls.push(el.href);
        }
      });
    });
    
    return urls;
  }

  scanByHref() {
    const urls = [];
    const allLinks = document.querySelectorAll('a[href]');
    
    allLinks.forEach(link => {
      const href = link.href;
      if (href.includes('/status/') && this.isValidTweetUrl(href)) {
        urls.push(href);
      }
    });
    
    return urls;
  }

  isValidTweetUrl(url) {
    if (!url) return false;
    
    // Clean up the URL
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      // Must be from X/Twitter
      if (!hostname.includes('x.com') && !hostname.includes('twitter.com')) {
        return false;
      }
      
      // Must contain status
      if (!urlObj.pathname.includes('/status/')) {
        return false;
      }
      
      // Extract status ID - should be numeric
      const statusMatch = urlObj.pathname.match(/\/status\/(\d+)/);
      if (!statusMatch || !statusMatch[1]) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  async waitForContent() {
    return new Promise(resolve => {
      if (document.querySelectorAll('article').length > 0) {
        resolve();
        return;
      }
      
      const observer = new MutationObserver((mutations, obs) => {
        if (document.querySelectorAll('article').length > 0) {
          obs.disconnect();
          this.observers.delete(observer);
          resolve();
        }
      });
      
      // Track observer for cleanup
      this.observers.add(observer);
      
      observer.observe(document, {
        childList: true,
        subtree: true
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        observer.disconnect();
        this.observers.delete(observer);
        resolve();
      }, 5000);
    });
  }

  // Helper method to scroll and load more content if needed
  async loadMoreContent() {
    const initialCount = document.querySelectorAll('article').length;
    
    // Scroll to bottom
    window.scrollTo(0, document.body.scrollHeight);
    
    // Wait for new content
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newCount = document.querySelectorAll('article').length;
    return newCount > initialCount;
  }
}

// Initialize scanner
const scanner = new XBookmarkScanner();

// Add persistent extension indicator when script is active
const addPersistentExtensionIndicator = () => {
  let indicator = document.getElementById('x-bookmark-analyzer-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'x-bookmark-analyzer-indicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #1d4ed8;
      color: white;
      padding: 8px 12px;
      border-radius: 20px;
      font-size: 12px;
      z-index: 10000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      pointer-events: none;
    `;
    indicator.textContent = '📊 Bookmark Analyzer Active';
    document.body.appendChild(indicator);
  }
};

const removeExtensionIndicator = () => {
  const indicator = document.getElementById('x-bookmark-analyzer-indicator');
  if (indicator) indicator.remove();
};

// Show indicator when on bookmarks page (persistent)
if (scanner.isBookmarksPage()) {
  addPersistentExtensionIndicator();
}

// Remove indicator on cleanup
const originalCleanup = scanner.cleanup.bind(scanner);
scanner.cleanup = function() {
  removeExtensionIndicator();
  originalCleanup();
};