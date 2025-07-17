// Content script for X Bookmarks Extractor
console.log('X Bookmarks Extractor: Content script loaded');

class XBookmarkScanner {
  constructor() {
    this.setupMessageListener();
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
          this.scanCurrentPageWithFallback().then(({tweets, debugUrls}) => {
            this.sendProgress('Extraction complete.');
            console.log('[X Extractor] scanCurrentPageWithFallback complete:', tweets.length, 'tweets');
            sendResponse({ tweets, debugUrls, success: true });
          }).catch(error => {
            this.sendProgress('Extraction failed.');
            console.error('[X Extractor] Scanning error (fallback):', error);
            sendResponse({ tweets: [], debugUrls: [], success: false, error: error.message });
          });
          return true;
        }
        if (request.action === 'scanBookmarks') {
          this.sendProgress('Starting extraction...');
          this.scanCurrentPage().then(tweets => {
            this.sendProgress('Extraction complete.');
            console.log('[X Extractor] scanCurrentPage complete:', tweets.length, 'tweets');
            sendResponse({ tweets, success: true });
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

  async scanCurrentPage() {
    try {
      this.sendProgress('Extracting visible bookmarks...');
      console.log('[X Extractor] scanCurrentPage started');
      // Extract all tweet data from the bookmarks page
      const tweets = [];
      const articles = document.querySelectorAll('article');
      for (const article of articles) {
        // URL
        let url = '';
        const link = article.querySelector('a[href*="/status/"]');
        if (link) url = link.href;
        if (!url) continue;
        // Text
        let text = '';
        const textEls = article.querySelectorAll('[data-testid="tweetText"]');
        textEls.forEach(el => {
          text += (el.textContent?.trim() || '') + ' ';
        });
        text = text.trim();
        // Author display name & username (from tweet header)
        let displayName = '';
        let username = '';
        const header = article.querySelector('div[role="group"]')?.parentElement?.parentElement;
        if (header) {
          // displayName: first span in header (not in tweet text)
          const spans = header.querySelectorAll('span');
          if (spans.length > 0) displayName = spans[0].textContent?.trim() || '';
          // username: span with '@' in text
          for (const span of spans) {
            if (span.textContent && span.textContent.trim().startsWith('@')) {
              username = span.textContent.trim().replace('@', '');
              break;
            }
          }
        }
        // Fallbacks
        if (!displayName) {
          const nameSpan = article.querySelector('div[dir="auto"] > span');
          if (nameSpan) displayName = nameSpan.textContent?.trim() || '';
        }
        if (!username) {
          const handleSpan = article.querySelector('div[dir="ltr"] > span');
          if (handleSpan) username = handleSpan.textContent?.replace('@', '').trim() || '';
        }
        // Date/time
        let dateTime = '';
        const timeEl = article.querySelector('time');
        if (timeEl) dateTime = timeEl.getAttribute('datetime') || '';
        // Likes, retweets, replies, views
        let likes = '', retweets = '', replies = '', views = '';
        // Use data-testid for stats
        const likeEl = article.querySelector('[data-testid="like"]');
        if (likeEl) likes = likeEl.textContent?.replace(/[^\d]/g, '') || '';
        const retweetEl = article.querySelector('[data-testid="retweet"]');
        if (retweetEl) retweets = retweetEl.textContent?.replace(/[^\d]/g, '') || '';
        const replyEl = article.querySelector('[data-testid="reply"]');
        if (replyEl) replies = replyEl.textContent?.replace(/[^\d]/g, '') || '';
        // Views: look for span/div with 'Views' in aria-label or text
        const viewEl = Array.from(article.querySelectorAll('span, div')).find(el => {
          const label = el.getAttribute('aria-label') || el.textContent || '';
          return /views?/i.test(label);
        });
        if (viewEl) {
          const match = viewEl.textContent?.match(/([\d,.]+)/);
          if (match) views = match[1].replace(/,/g, '');
        }
        // Debug log what we found
        console.log('[X Extractor] Tweet:', {
          url, text, displayName, username, dateTime, likes, retweets, replies, views
        });
        tweets.push({
          url: url || '',
          text: text || '',
          displayName: displayName || '',
          username: username || '',
          dateTime: dateTime || '',
          likes: likes || '',
          retweets: retweets || '',
          replies: replies || '',
          views: views || ''
        });
      }
      this.sendProgress('Extraction finished.');
      console.log('[X Extractor] scanCurrentPage finished:', tweets.length, 'tweets');
      return tweets;
    } catch (err) {
      this.sendProgress('Extraction error.');
      console.error('[X Extractor] scanCurrentPage error:', err);
      throw err;
    }
  }

  async scanCurrentPageWithFallback() {
    try {
      this.sendProgress('Extracting bookmarks (with fallback)...');
      console.log('[X Extractor] scanCurrentPageWithFallback started');
      // Extract all tweet data from the bookmarks page (as before)
      const tweets = [];
      const foundUrls = new Set();
      const articles = document.querySelectorAll('article');
      for (const article of articles) {
        let url = '';
        const link = article.querySelector('a[href*="/status/"]');
        if (link) url = link.href;
        if (!url) continue;
        foundUrls.add(url);
        let text = '';
        const textEls = article.querySelectorAll('[data-testid="tweetText"]');
        textEls.forEach(el => {
          text += (el.textContent?.trim() || '') + ' ';
        });
        text = text.trim();
        let displayName = '';
        let username = '';
        const header = article.querySelector('div[role="group"]')?.parentElement?.parentElement;
        if (header) {
          const spans = header.querySelectorAll('span');
          if (spans.length > 0) displayName = spans[0].textContent?.trim() || '';
          for (const span of spans) {
            if (span.textContent && span.textContent.trim().startsWith('@')) {
              username = span.textContent.trim().replace('@', '');
              break;
            }
          }
        }
        if (!displayName) {
          const nameSpan = article.querySelector('div[dir="auto"] > span');
          if (nameSpan) displayName = nameSpan.textContent?.trim() || '';
        }
        if (!username) {
          const handleSpan = article.querySelector('div[dir="ltr"] > span');
          if (handleSpan) username = handleSpan.textContent?.replace('@', '').trim() || '';
        }
        let dateTime = '';
        const timeEl = article.querySelector('time');
        if (timeEl) dateTime = timeEl.getAttribute('datetime') || '';
        let likes = '', retweets = '', replies = '', views = '';
        const likeEl = article.querySelector('[data-testid="like"]');
        if (likeEl) likes = likeEl.textContent?.replace(/[^\d]/g, '') || '';
        const retweetEl = article.querySelector('[data-testid="retweet"]');
        if (retweetEl) retweets = retweetEl.textContent?.replace(/[^\d]/g, '') || '';
        const replyEl = article.querySelector('[data-testid="reply"]');
        if (replyEl) replies = replyEl.textContent?.replace(/[^\d]/g, '') || '';
        const viewEl = Array.from(article.querySelectorAll('span, div')).find(el => {
          const label = el.getAttribute('aria-label') || el.textContent || '';
          return /views?/i.test(label);
        });
        if (viewEl) {
          const match = viewEl.textContent?.match(/([\d,.]+)/);
          if (match) views = match[1].replace(/,/g, '');
        }
        tweets.push({
          url: url || '',
          text: text || '',
          displayName: displayName || '',
          username: username || '',
          dateTime: dateTime || '',
          likes: likes || '',
          retweets: retweets || '',
          replies: replies || '',
          views: views || ''
        });
      }
      this.sendProgress('Checking for extra tweet links...');
      // Fallback: find all <a> with /status/ in href
      const allLinks = Array.from(document.querySelectorAll('a[href*="/status/"]'));
      for (const link of allLinks) {
        if (!foundUrls.has(link.href)) {
          foundUrls.add(link.href);
          tweets.push({
            url: link.href,
            text: '',
            displayName: '',
            username: '',
            dateTime: '',
            likes: '',
            retweets: '',
            replies: '',
            views: ''
          });
        }
      }
      const debugUrls = Array.from(foundUrls);
      this.sendProgress('Extraction finished.');
      console.log('[X Extractor] scanCurrentPageWithFallback finished:', tweets.length, 'tweets', debugUrls.length, 'unique URLs');
      return { tweets, debugUrls };
    } catch (err) {
      this.sendProgress('Extraction error.');
      console.error('[X Extractor] scanCurrentPageWithFallback error:', err);
      throw err;
    }
  }
}

// Initialize the scanner
new XBookmarkScanner();