// Content script for X Bookmarks Extractor
console.log('X Bookmarks Extractor: Content script loaded');

class XBookmarkScanner {
  constructor() {
    this.setupMessageListener();
    this.cachedElements = new Map(); // Cache for DOM elements
    this.performanceMetrics = { startTime: 0, endTime: 0, articlesProcessed: 0 };
    console.log('[X Extractor] XBookmarkScanner initialized');
    this.sendProgress('Content script initialized.');
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
          foundUrls.add(tweetData.url);
          tweets.push(tweetData);
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
  extractTweetData(article) {
    // URL
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

    // Date/time
    const timeEl = article.querySelector('time');
    const dateTime = timeEl ? timeEl.getAttribute('datetime') || '' : '';

    // Engagement metrics
    const likeEl = article.querySelector('[data-testid="like"]');
    const likes = likeEl ? likeEl.textContent?.replace(/[^\d]/g, '') || '' : '';

    const retweetEl = article.querySelector('[data-testid="retweet"]');
    const retweets = retweetEl ? retweetEl.textContent?.replace(/[^\d]/g, '') || '' : '';

    const replyEl = article.querySelector('[data-testid="reply"]');
    const replies = replyEl ? replyEl.textContent?.replace(/[^\d]/g, '') || '' : '';

    // Views - use find for better performance
    let views = '';
    const viewEl = Array.from(article.querySelectorAll('span, div')).find(el => {
      const label = el.getAttribute('aria-label') || el.textContent || '';
      return /views?/i.test(label);
    });
    if (viewEl) {
      const match = viewEl.textContent?.match(/([\d,.]+)/);
      if (match) views = match[1].replace(/,/g, '');
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
  }
}

// Initialize the scanner
new XBookmarkScanner();