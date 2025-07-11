// Background service worker for X Bookmark Analyzer
console.log('X Bookmark Analyzer: Background script loaded');

class BackgroundService {
  constructor() {
    this.rateLimiter = new Map();
    this.retryAttempts = new Map();
    this.maxRetries = 3;
    this.setupMessageListeners();
    this.setupContextMenus();
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'analyzeUrl') {
        this.analyzeUrlWithRetry(request.url).then(result => {
          sendResponse({ result, success: true });
        }).catch(error => {
          console.error('Analysis error:', error);
          sendResponse({ 
            result: this.getFallbackAnalysis(request.url), 
            success: false, 
            error: this.sanitizeError(error.message)
          });
        });
        return true; // Keep message channel open
      }
      
      if (request.action === 'fetchContent') {
        this.fetchUrlContentWithTimeout(request.url).then(content => {
          sendResponse({ content, success: true });
        }).catch(error => {
          console.error('Fetch error:', error);
          sendResponse({ content: '', success: false, error: this.sanitizeError(error.message) });
        });
        return true;
      }
      
      if (request.action === 'batchAnalyze') {
        this.batchAnalyzeUrlsWithLimits(request.urls, sendResponse);
        return true;
      }
    });
  }

  // Rate limiting protection
  async checkRateLimit(key = 'default') {
    const now = Date.now();
    const lastCall = this.rateLimiter.get(key) || 0;
    const minInterval = 1000; // Minimum 1 second between calls
    
    if (now - lastCall < minInterval) {
      const waitTime = minInterval - (now - lastCall);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.rateLimiter.set(key, Date.now());
  }

  // Retry logic for failed requests
  async analyzeUrlWithRetry(url) {
    const retryKey = url;
    let attempts = this.retryAttempts.get(retryKey) || 0;
    
    try {
      const result = await this.analyzeUrl(url);
      this.retryAttempts.delete(retryKey);
      return result;
    } catch (error) {
      attempts++;
      this.retryAttempts.set(retryKey, attempts);
      
      if (attempts < this.maxRetries) {
        // Exponential backoff
        const delay = Math.pow(2, attempts) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.analyzeUrlWithRetry(url);
      } else {
        this.retryAttempts.delete(retryKey);
        throw error;
      }
    }
  }

  // Fetch with timeout
  async fetchUrlContentWithTimeout(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const html = await response.text();
      // Delegate parsing to content script
      const content = await this.parseHtmlInTab(html);
      return content;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  async fetchUrlContent(url) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const html = await response.text();
      // Delegate parsing to content script
      const content = await this.parseHtmlInTab(html);
      return content;
    } catch (error) {
      console.error('Failed to fetch content:', error);
      return `Content from ${new URL(url).hostname}`;
    }
  }

  // Helper to send HTML to content script for parsing
  async parseHtmlInTab(html) {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) {
          return reject(new Error('No active tab found for parsing. Please make sure you are on an X/Twitter page.'));
        }
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: 'parseHtmlContent', html },
          (response) => {
            if (chrome.runtime.lastError) {
              return reject(new Error('Could not connect to content script. Please make sure you are on an X/Twitter page and the extension is enabled.'));
            }
            if (response && response.success) {
              resolve(response.content);
            } else {
              reject(new Error(response && response.error ? response.error : 'Failed to parse HTML in tab.'));
            }
          }
        );
      });
    });
  }

  // Helper to get tweet content from the content script in the active tab
  async getTweetContentFromTab(url) {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) {
          return reject(new Error('No active tab found for extracting tweet content. Please make sure you are on an X/Twitter page.'));
        }
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: 'extractTweetContent', url },
          (response) => {
            if (chrome.runtime.lastError) {
              return reject(new Error('Could not connect to content script. Please make sure you are on an X/Twitter page and the extension is enabled.'));
            }
            if (response && response.success) {
              resolve(response.content);
            } else {
              reject(new Error(response && response.error ? response.error : 'Failed to extract tweet content in tab.'));
            }
          }
        );
      });
    });
  }

  // Security: Sanitize error messages
  sanitizeError(message) {
    if (!message) return 'Unknown error';
    return message.replace(/[<>]/g, '').slice(0, 100);
  }

  setupContextMenus() {
    chrome.runtime.onInstalled.addListener(() => {
      chrome.contextMenus.create({
        id: 'analyzeBookmarks',
        title: 'Analyze X Bookmarks',
        contexts: ['page'],
        documentUrlPatterns: ['https://x.com/*', 'https://twitter.com/*']
      });
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'analyzeBookmarks') {
        // chrome.action.openPopup(); // Not supported in service workers
        chrome.runtime.openOptionsPage(); // Open options page as a safe default
      }
    });
  }

  async analyzeUrl(url) {
    try {
      // Get tweet content directly from the content script in the tab
      const content = await this.getTweetContentFromTab(url);
      // Use the current Google Gemini API key directly
      const apiKey = 'AIzaSyBv5jWoX3bOWlq0pHna1Nyl5fiNdHrGLYo';
      // Analyze with Gemini API
      const analysis = await this.callGeminiAPI(apiKey, url, content);
      return analysis;
    } catch (error) {
      console.error('Analysis failed:', error);
      return this.getFallbackAnalysis(url);
    }
  }

  async callGeminiAPI(apiKey, url, content) {
    // Use the Gemini 1.5 Pro Latest model endpoint
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const prompt = `You are a senior business analyst. Check out what this tweet says and create an executive summary about it. Keep it concise and if there is an action suggested by the original poster, add this as an action point. Analyze it individually.\n\nTweet URL: ${this.sanitizeUrl(url)}\nTweet Content: ${this.sanitizeContent(content)}\n\nRespond with JSON only:\n{\n  "executive_summary": "Your concise summary here.",\n  "action_point": "Action point if any, otherwise null."\n}\n\nIMPORTANT: Respond only with valid JSON, no other text.`;
    try {
      const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
      console.log('[Gemini API] Endpoint:', endpoint);
      console.log('[Gemini API] Payload:', payload);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      console.log('[Gemini API] Status:', response.status);
      let data;
      try {
        data = await response.clone().json();
        console.log('[Gemini API] Response JSON:', data);
      } catch (jsonErr) {
        const text = await response.text();
        console.error('[Gemini API] Failed to parse JSON. Raw response:', text);
        throw new Error('Failed to parse Gemini API response as JSON');
      }
      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }
      // Gemini returns candidates[0].content.parts[0].text
      const analysisText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!analysisText) {
        console.error('[Gemini API] No analysis text in response:', data);
        throw new Error('Empty response from Gemini API');
      }
      try {
        const parsed = JSON.parse(analysisText);
        console.log('[Gemini API] Parsed analysis:', parsed);
        return parsed;
      } catch (parseError) {
        console.warn('[Gemini API] Failed to parse analysis text as JSON:', analysisText);
        return this.getFallbackAnalysis(url);
      }
    } catch (error) {
      console.error('[Gemini API] Error:', error);
      throw error;
    }
  }

  // Security: Sanitize content for API
  sanitizeContent(content) {
    if (!content) return 'No content available';
    return content.replace(/[<>]/g, '').slice(0, 1000);
  }

  // Security: Sanitize URL for API
  sanitizeUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.href;
    } catch {
      return 'Invalid URL';
    }
  }

  getFallbackAnalysis(url) {
    const hostname = new URL(url).hostname;
    return {
      topic: "Social Media",
      summary: `Bookmarked content from ${hostname}`,
      hashtags: ["bookmark", "social", "saved"]
    };
  }

  async batchAnalyzeUrlsWithLimits(urls, sendResponse) {
    // Limit batch size to prevent overwhelming
    const maxBatchSize = 50;
    const limitedUrls = urls.slice(0, maxBatchSize);
    const results = [];
    const total = limitedUrls.length;
    
    for (let i = 0; i < limitedUrls.length; i++) {
      try {
        // Rate limiting
        await this.checkRateLimit();
        
        const result = await this.analyzeUrlWithRetry(limitedUrls[i]);
        results.push({
          url: limitedUrls[i],
          title: `Content from ${new URL(limitedUrls[i]).hostname}`,
          ...result,
          timestamp: new Date().toISOString()
        });
        
        // Send progress update via runtime message
        chrome.runtime.sendMessage({
          type: 'progress',
          completed: i + 1,
          total: total,
          results: results
        });
        
      } catch (error) {
        console.error(`Failed to analyze ${limitedUrls[i]}:`, error);
        results.push({
          url: limitedUrls[i],
          title: 'Analysis failed',
          topic: 'Error',
          summary: 'Could not analyze this bookmark',
          hashtags: ['error'],
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Only call sendResponse once at the end
    sendResponse({
      type: 'complete',
      results: results
    });
  }
}

// Initialize background service
new BackgroundService();

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('options.html')
    });
  }
});