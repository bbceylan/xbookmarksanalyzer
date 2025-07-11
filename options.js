// X Bookmark Analyzer Options Script
console.log('X Bookmark Analyzer: Options loaded');

class OptionsController {
  constructor() {
    this.defaultSettings = {
      geminiApiKey: '',
      maxBookmarks: 50,
      analysisDelay: 1,
      autoExport: false,
      groupByTopic: true,
      exportFormat: 'markdown',
      filenamePattern: 'x-bookmarks-{date}'
    };

    this.initializeElements();
    this.setupEventListeners();
    this.loadSettings();
    this.loadStatistics();
  }

  initializeElements() {
    // Form elements
    this.geminiApiKey = document.getElementById('geminiApiKey');
    this.showApiKey = document.getElementById('showApiKey');
    this.maxBookmarks = document.getElementById('maxBookmarks');
    this.analysisDelay = document.getElementById('analysisDelay');
    this.autoExport = document.getElementById('autoExport');
    this.groupByTopic = document.getElementById('groupByTopic');
    this.exportFormat = document.getElementById('exportFormat');
    this.filenamePattern = document.getElementById('filenamePattern');

    // Action buttons (renamed to avoid method clash)
    this.saveSettingsBtn = document.getElementById('saveSettings');
    this.resetSettingsBtn = document.getElementById('resetSettings');
    this.testConnectionBtn = document.getElementById('testConnection');
    this.clearDataBtn = document.getElementById('clearData');

    // Statistics elements
    this.totalAnalyzed = document.getElementById('totalAnalyzed');
    this.totalExports = document.getElementById('totalExports');
    this.avgProcessingTime = document.getElementById('avgProcessingTime');

    // Alert container
    this.alertContainer = document.getElementById('alertContainer');
  }

  setupEventListeners() {
    // Show/hide API key
    this.showApiKey.addEventListener('change', () => {
      this.geminiApiKey.type = this.showApiKey.checked ? 'text' : 'password';
    });

    // Form validation
    this.geminiApiKey.addEventListener('input', () => this.validateApiKey());
    this.filenamePattern.addEventListener('input', () => this.validateFilenamePattern());

    // Action buttons
    this.saveSettingsBtn.addEventListener('click', () => {
      console.log('[DEBUG] Save button clicked');
      this.saveSettings();
    });
    this.resetSettingsBtn.addEventListener('click', () => {
      console.log('[DEBUG] Reset button clicked');
      this.resetToDefaults();
    });
    this.testConnectionBtn.addEventListener('click', () => {
      console.log('[DEBUG] Test API Connection button clicked');
      this.testApiConnection();
    });
    this.clearDataBtn.addEventListener('click', () => {
      console.log('[DEBUG] Clear All Data button clicked');
      this.clearAllData();
    });

    // Auto-save on certain changes
    [this.maxBookmarks, this.analysisDelay, this.exportFormat].forEach(element => {
      element.addEventListener('change', () => {
        console.log('[DEBUG] Auto-save triggered');
        this.autoSave();
      });
    });

    [this.autoExport, this.groupByTopic].forEach(element => {
      element.addEventListener('change', () => {
        console.log('[DEBUG] Auto-save triggered');
        this.autoSave();
      });
    });
  }

  async loadSettings() {
    try {
      const settings = await chrome.storage.sync.get(Object.keys(this.defaultSettings));
      console.log('[DEBUG] Loaded settings from storage:', settings);
      
      // Load values or use defaults
      this.geminiApiKey.value = settings.geminiApiKey || '';
      this.maxBookmarks.value = settings.maxBookmarks || this.defaultSettings.maxBookmarks;
      this.analysisDelay.value = settings.analysisDelay || this.defaultSettings.analysisDelay;
      this.autoExport.checked = settings.autoExport || this.defaultSettings.autoExport;
      this.groupByTopic.checked = settings.groupByTopic !== undefined ? settings.groupByTopic : this.defaultSettings.groupByTopic;
      this.exportFormat.value = settings.exportFormat || this.defaultSettings.exportFormat;
      this.filenamePattern.value = settings.filenamePattern || this.defaultSettings.filenamePattern;

      this.validateApiKey();
      
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.showAlert('Failed to load settings', 'error');
    }
  }

  async loadStatistics() {
    try {
      const stats = await chrome.storage.local.get([
        'totalAnalyzed',
        'totalExports', 
        'analysisHistory'
      ]);

      this.totalAnalyzed.textContent = stats.totalAnalyzed || 0;
      this.totalExports.textContent = stats.totalExports || 0;

      // Calculate average processing time
      if (stats.analysisHistory && stats.analysisHistory.length > 0) {
        const avgTime = stats.analysisHistory.reduce((sum, entry) => {
          return sum + (entry.processingTime || 0);
        }, 0) / stats.analysisHistory.length;
        
        this.avgProcessingTime.textContent = `${(avgTime / 1000).toFixed(1)}s`;
      }

    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  }

  validateApiKey() {
    const apiKey = this.geminiApiKey.value.trim();
    // Gemini API keys start with 'AIza' and are typically 39+ chars
    const isValid = apiKey.startsWith('AIza') && apiKey.length > 30;
    
    if (apiKey && !isValid) {
      this.geminiApiKey.style.borderColor = '#ef4444';
      this.showAlert('Invalid API key format. Should start with "AIza"', 'error');
      return false;
    } else if (apiKey) {
      this.geminiApiKey.style.borderColor = '#10b981';
    } else {
      this.geminiApiKey.style.borderColor = '#e5e7eb';
    }
    
    return true;
  }

  validateFilenamePattern() {
    const pattern = this.filenamePattern.value.trim();
    const hasValidChars = /^[a-zA-Z0-9\-_{}]+$/.test(pattern);
    
    if (!hasValidChars) {
      this.filenamePattern.style.borderColor = '#ef4444';
      return false;
    } else {
      this.filenamePattern.style.borderColor = '#e5e7eb';
      return true;
    }
  }

  async saveSettings() {
    if (!this.validateApiKey() || !this.validateFilenamePattern()) {
      this.showAlert('Please fix validation errors before saving', 'error');
      return;
    }

    const settings = {
      geminiApiKey: this.geminiApiKey.value.trim(),
      maxBookmarks: parseInt(this.maxBookmarks.value),
      analysisDelay: parseFloat(this.analysisDelay.value),
      autoExport: this.autoExport.checked,
      groupByTopic: this.groupByTopic.checked,
      exportFormat: this.exportFormat.value,
      filenamePattern: this.filenamePattern.value.trim()
    };

    console.log('[DEBUG] Saving settings to storage:', settings);
    try {
      await chrome.storage.sync.set(settings);
      this.showAlert('Settings saved successfully!', 'success');
      await this.updateStatistic('settingsSaved', 1);
      console.log('[DEBUG] Settings saved successfully');
    } catch (error) {
      console.error('[DEBUG] Failed to save settings:', error);
      this.showAlert('Failed to save settings: ' + error.message, 'error');
    }
  }

  async autoSave() {
    // Auto-save without showing success message
    try {
      const settings = {
        maxBookmarks: parseInt(this.maxBookmarks.value),
        analysisDelay: parseFloat(this.analysisDelay.value),
        autoExport: this.autoExport.checked,
        groupByTopic: this.groupByTopic.checked,
        exportFormat: this.exportFormat.value
      };

      await chrome.storage.sync.set(settings);
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }

  async resetToDefaults() {
    if (!confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      return;
    }

    try {
      // Keep the API key but reset everything else
      const currentApiKey = this.geminiApiKey.value;
      const defaultsWithApiKey = {
        ...this.defaultSettings,
        geminiApiKey: currentApiKey
      };

      await chrome.storage.sync.set(defaultsWithApiKey);
      await this.loadSettings();
      
      this.showAlert('Settings reset to defaults', 'success');
      
    } catch (error) {
      console.error('Failed to reset settings:', error);
      this.showAlert('Failed to reset settings: ' + error.message, 'error');
    }
  }

  async testApiConnection() {
    const apiKey = this.geminiApiKey.value.trim();
    
    if (!apiKey) {
      this.showAlert('Please enter an API key first', 'error');
      return;
    }

    if (!this.validateApiKey()) {
      this.showAlert('Please enter a valid API key', 'error');
      return;
    }

    this.testConnectionBtn.disabled = true;
    this.testConnectionBtn.textContent = '🔄 Testing...';

    try {
      // Use Gemini API endpoint for a test call
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const prompt = 'Test connection';
      const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        this.showAlert('✅ API connection successful!', 'success');
      } else if (response.status === 401) {
        this.showAlert('❌ Invalid API key', 'error');
      } else if (response.status === 429) {
        this.showAlert('⚠️ Rate limit exceeded, but API key is valid', 'info');
      } else if (response.status === 404) {
        this.showAlert('Gemini API error: 404 — The Gemini model is not available for your API key or project. Please check your Google Cloud project, API key, and model name.', 'error');
      } else if (response.status === 400) {
        const data = await response.json().catch(() => ({}));
        const msg = data.error?.message || 'Bad request. Please check your API key, model, and project permissions.';
        this.showAlert(`❌ API error: 400 — ${msg}`, 'error');
      } else {
        this.showAlert(`❌ API error: ${response.status}`, 'error');
      }
    } catch (error) {
      console.error('API test failed:', error);
      this.showAlert('❌ Connection failed: ' + error.message, 'error');
    } finally {
      this.testConnectionBtn.disabled = false;
      this.testConnectionBtn.textContent = '🧪 Test API Connection';
    }
  }

  async clearAllData() {
    const confirmText = 'This will delete all settings, statistics, and cached data. Type "DELETE" to confirm:';
    const userInput = prompt(confirmText);
    
    if (userInput !== 'DELETE') {
      return;
    }

    try {
      // Clear all storage
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      
      // Reset form to defaults
      await this.loadSettings();
      await this.loadStatistics();
      
      this.showAlert('All data cleared successfully', 'success');
      
    } catch (error) {
      console.error('Failed to clear data:', error);
      this.showAlert('Failed to clear data: ' + error.message, 'error');
    }
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

  showAlert(message, type = 'info') {
    const alert = document.createElement('div');
    alert.className = `alert ${type}`;
    alert.textContent = message;
    alert.style.display = 'block';
    
    // Clear previous alerts
    this.alertContainer.innerHTML = '';
    this.alertContainer.appendChild(alert);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      alert.style.display = 'none';
    }, 5000);
  }

  // Utility method to generate example filename
  generateExampleFilename() {
    const pattern = this.filenamePattern.value;
    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('.')[0];
    
    return pattern
      .replace('{date}', date)
      .replace('{time}', time)
      .replace('{count}', '25');
  }
}

// Initialize options when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new OptionsController();
});