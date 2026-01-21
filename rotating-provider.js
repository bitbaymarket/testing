/**
 * Rotating Provider for Web3.js
 * 
 * A simple, elegant library that handles RPC provider rotation
 * with rate limit detection and two-tier provider support.
 * 
 * Usage:
 *   const provider = new RotatingProvider(preferredConfig, fallbackConfig);
 *   const web3 = new Web3(provider);
 * 
 * Global state available at window.RPCState
 */

var preferredProvidersDefault = [
  { 
    url: "https://polygon.drpc.org/",
    limitPerMinute: 100,
    limitPerHour: 1000,
    limitPerDay: 25000
  },
  { 
    url: "https://1rpc.io/matic",
    limitPerMinute: 70
  },
  { 
    url: "https://polygon-rpc.com",
    limitPerMinute: 70
  },
  { 
    url: "https://polygon-bor.publicnode.com",
    limitPerMinute: 100
  }
];

// Fallback providers - used when all preferred providers fail
var fallbackProvidersDefault = [
  { url: "https://api.blockeden.xyz/polygon/67nCBdZQSH9z3YqDDjdm" },
  { url: "https://polygon-mainnet.gateway.tatum.io/" },
  { url: "https://go.getblock.us/6fc0e1edcb0a41dd8c7d729e67b97970" },
  { url: "https://pol.leorpc.com/?api_key=FREE" },
  { url: "https://api.noderpc.xyz/rpc-polygon-pos/public" },
  { url: "https://endpoints.omniatech.io/v1/matic/mainnet/public" },
  { url: "https://polygon.api.onfinality.io/public" },
  { url: "https://poly.api.pocket.network/" },
  { url: "https://polygon-public.nodies.app" },
];

(function(global) {
  'use strict';

  /**
   * Check if an error is a rate limit error
   * @param {Error} err - The error to check
   * @returns {boolean}
   */
  function isRateLimitError(err) {
    if (!err) return false;
    
    var message = (err.message || '').toLowerCase();
    var code = err.code;
    
    // Common rate limit indicators
    return (
      code === 429 ||
      code === -32005 ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('exceeded') ||
      message.includes('throttl')
    );
  }

  /**
   * Provider statistics tracker
   * @param {Object} config - Provider configuration
   */
  function ProviderStats(config) {
    this.url = config.url;
    this.limitPerMinute = config.limitPerMinute || Infinity;
    this.limitPerHour = config.limitPerHour || Infinity;
    this.limitPerDay = config.limitPerDay || Infinity;
    
    this.requestsThisMinute = 0;
    this.requestsThisHour = 0;
    this.requestsThisDay = 0;
    
    this.minuteStart = Date.now();
    this.hourStart = Date.now();
    this.dayStart = Date.now();
  }

  /**
   * Record a request and check if we should rotate due to limits
   * @returns {boolean} - true if limit exceeded and should rotate
   */
  ProviderStats.prototype.recordRequest = function() {
    var now = Date.now();
    
    // Reset minute counter if needed
    if (now - this.minuteStart >= 60000) {
      this.requestsThisMinute = 0;
      this.minuteStart = now;
    }
    
    // Reset hour counter if needed
    if (now - this.hourStart >= 3600000) {
      this.requestsThisHour = 0;
      this.hourStart = now;
    }
    
    // Reset day counter if needed
    if (now - this.dayStart >= 86400000) {
      this.requestsThisDay = 0;
      this.dayStart = now;
    }
    
    this.requestsThisMinute++;
    this.requestsThisHour++;
    this.requestsThisDay++;
    
    // Check if any limit exceeded
    return (
      this.requestsThisMinute > this.limitPerMinute ||
      this.requestsThisHour > this.limitPerHour ||
      this.requestsThisDay > this.limitPerDay
    );
  };

  /**
   * Get current stats as plain object
   * @returns {Object}
   */
  ProviderStats.prototype.getStats = function() {
    return {
      url: this.url,
      requestsThisMinute: this.requestsThisMinute,
      requestsThisHour: this.requestsThisHour,
      requestsThisDay: this.requestsThisDay,
      limitPerMinute: this.limitPerMinute,
      limitPerHour: this.limitPerHour,
      limitPerDay: this.limitPerDay
    };
  };

  /**
   * RotatingProvider - Web3 compatible provider with automatic rotation
   * 
   * @param {Array} preferredProviders - Array of preferred provider configs
   *   Each config: { url: string, limitPerMinute?: number, limitPerHour?: number, limitPerDay?: number }
   * @param {Array} fallbackProviders - Array of fallback provider configs (optional)
   */
  function RotatingProvider(prefInx = 0, preferredProviders = preferredProvidersDefault, fallbackProviders = fallbackProvidersDefault) {
    var self = this;
    
    // Normalize inputs
    this.preferredConfigs = (preferredProviders || []).map(function(p) {
      return typeof p === 'string' ? { url: p } : p;
    });
    
    this.fallbackConfigs = (fallbackProviders || []).map(function(p) {
      return typeof p === 'string' ? { url: p } : p;
    });
    
    // Create providers and stats
    this.preferredProviders = [];
    this.preferredStats = [];
    this.fallbackProviders = [];
    this.fallbackStats = [];
    
    // Track indices
    this.preferredIndex = prefInx;
    this.fallbackIndex = 0;
    this.usingFallback = false;
    
    // Initialize global state
    if (typeof window !== 'undefined') {
      window.RPCState = {
        currentProvider: null,
        currentTier: 'preferred',
        preferredIndex: 0,
        fallbackIndex: 0,
        providers: {
          preferred: [],
          fallback: []
        },
        getStats: function() {
          return self._getGlobalStats();
        }
      };
    }
    
    // Lazy-initialize providers (deferred until Web3 is available)
    this._initialized = false;
  }

  /**
   * Initialize providers (called lazily when first request is made)
   */
  RotatingProvider.prototype._ensureInitialized = function() {
    if (this._initialized) return;
    
    var Web3Provider = this._getWeb3Provider();
    if (!Web3Provider) {
      throw new Error('Web3 is not available. Please include web3.js before using RotatingProvider.');
    }
    
    var self = this;
    
    // Create preferred providers
    this.preferredConfigs.forEach(function(config) {
      self.preferredProviders.push(new Web3Provider(config.url));
      self.preferredStats.push(new ProviderStats(config));
    });
    
    // Create fallback providers
    this.fallbackConfigs.forEach(function(config) {
      self.fallbackProviders.push(new Web3Provider(config.url));
      self.fallbackStats.push(new ProviderStats(config));
    });
    
    this._initialized = true;
    this._updateGlobalState();
  };

  /**
   * Get Web3 HttpProvider class
   * @returns {Function|null}
   */
  RotatingProvider.prototype._getWeb3Provider = function() {
    if (typeof Web3 !== 'undefined') {
      return Web3.providers.HttpProvider;
    }
    return null;
  };

  /**
   * Update global state
   */
  RotatingProvider.prototype._updateGlobalState = function() {
    if (typeof window === 'undefined') return;
    
    var currentStats = this._getCurrentStats();
    
    window.RPCState.currentProvider = currentStats ? currentStats.url : null;
    window.RPCState.currentTier = this.usingFallback ? 'fallback' : 'preferred';
    window.RPCState.preferredIndex = this.preferredIndex;
    window.RPCState.fallbackIndex = this.fallbackIndex;
    window.RPCState.providers.preferred = this.preferredStats.map(function(s) {
      return s.getStats();
    });
    window.RPCState.providers.fallback = this.fallbackStats.map(function(s) {
      return s.getStats();
    });
  };

  /**
   * Get global stats snapshot
   * @returns {Object}
   */
  RotatingProvider.prototype._getGlobalStats = function() {
    if (typeof window === 'undefined' || !window.RPCState) {
      return null;
    }
    return {
      currentProvider: window.RPCState.currentProvider,
      currentTier: window.RPCState.currentTier,
      preferredIndex: window.RPCState.preferredIndex,
      fallbackIndex: window.RPCState.fallbackIndex,
      providers: {
        preferred: window.RPCState.providers.preferred.slice(),
        fallback: window.RPCState.providers.fallback.slice()
      }
    };
  };

  /**
   * Get current provider
   * @returns {Object|null}
   */
  RotatingProvider.prototype._getCurrentProvider = function() {
    if (this.usingFallback) {
      return this.fallbackProviders[this.fallbackIndex] || null;
    }
    return this.preferredProviders[this.preferredIndex] || null;
  };

  /**
   * Get current provider stats
   * @returns {ProviderStats|null}
   */
  RotatingProvider.prototype._getCurrentStats = function() {
    if (this.usingFallback) {
      return this.fallbackStats[this.fallbackIndex] || null;
    }
    return this.preferredStats[this.preferredIndex] || null;
  };

  /**
   * Rotate to next provider
   * @returns {boolean} - true if there are more providers to try
   */
  RotatingProvider.prototype._rotateProvider = function() {
    if (!this.usingFallback) {
      // Still in preferred tier
      this.preferredIndex++;
      
      if (this.preferredIndex >= this.preferredProviders.length) {
        // Switch to fallback tier
        this.usingFallback = true;
        this.fallbackIndex = 0;
        
        if (this.fallbackProviders.length === 0) {
          // No fallback providers, wrap preferred
          this.usingFallback = false;
          this.preferredIndex = 0;
          return false;
        }
      }
    } else {
      // In fallback tier
      this.fallbackIndex++;
      
      if (this.fallbackIndex >= this.fallbackProviders.length) {
        // All providers exhausted
        return false;
      }
    }
    var stats = this._getCurrentStats();
    if (stats) {
      console.log(
        '[RotatingProvider] Switched to',
        this.usingFallback ? 'fallback' : 'preferred',
        'provider:',
        stats.url
      );
    }
    this._updateGlobalState();
    return true;
  };

  /**
   * Reset to start of preferred providers
   */
  RotatingProvider.prototype._resetProviders = function() {
    this.preferredIndex = 0;
    this.fallbackIndex = 0;
    this.usingFallback = false;
    this._updateGlobalState();
  };

  /**
   * Generate a unique request ID
   * Uses timestamp + random to ensure uniqueness across concurrent requests
   */
  function getNextRequestId() {
    return Date.now() * 1000 + Math.floor(Math.random() * 1000);
  }

  /**
   * Ensure payload has all required JSON-RPC 2.0 fields
   * Some RPC providers are strict and require jsonrpc and id fields
   * @param {Object} payload - The request payload
   * @returns {Object} - Payload with required fields
   */
  function ensureJsonRpcFormat(payload) {
    if (!payload) return payload;
    
    // If payload already has jsonrpc field, assume it's complete
    if (payload.jsonrpc) {
      return payload;
    }
    
    // Add required JSON-RPC 2.0 fields
    return {
      jsonrpc: '2.0',
      id: (payload.id !== null && payload.id !== undefined) ? payload.id : getNextRequestId(),
      method: payload.method,
      params: payload.params  // Preserve original params value
    };
  }

  /**
   * Send a request to the underlying provider (wraps callback in Promise)
   * Returns the FULL JSON-RPC response unchanged - true passthrough
   * @param {Object} provider - The HttpProvider to use
   * @param {Object} payload - JSON-RPC request payload
   * @returns {Promise} - Resolves with full JSON-RPC response object
   */
  function sendToProvider(provider, payload) {
    return new Promise(function(resolve, reject) {
      // Ensure payload has required JSON-RPC 2.0 fields
      // Some RPC providers are strict and reject requests without jsonrpc/id
      var formattedPayload = ensureJsonRpcFormat(payload);
      
      provider.send(formattedPayload, function(err, result) {
        if (err) {
          reject(err);
        } else if (result && result.error) {
          // JSON-RPC error - pass through the error info
          var rpcError = new Error(result.error.message || 'RPC Error');
          rpcError.code = result.error.code;
          rpcError.data = result.error.data;
          reject(rpcError);
        } else {
          // Return the FULL response unchanged - true passthrough
          resolve(result);
        }
      });
    });
  }

  /**
   * Web3 provider interface - request method (Promise-based, EIP-1193)
   * @param {Object} payload - JSON-RPC request payload
   * @returns {Promise} - Resolves with just the result value (per EIP-1193)
   */
  RotatingProvider.prototype.request = function(payload) {
    var self = this;
    
    this._ensureInitialized();
    
    // Calculate max attempts (all preferred + up to 4 fallback)
    var maxAttempts = this.preferredProviders.length + 
      Math.min(4, this.fallbackProviders.length);
    
    if (maxAttempts === 0) {
      return Promise.reject(new Error('No providers configured'));
    }
    
    var lastError = null;
    var attempts = 0;
    
    // Save starting position to reset after
    var startPreferredIndex = this.preferredIndex;
    var startFallbackIndex = this.fallbackIndex;
    var startUsingFallback = this.usingFallback;
    
    function tryRequest() {
      if (attempts >= maxAttempts) {
        // Reset to starting position for next request
        self.preferredIndex = startPreferredIndex;
        self.fallbackIndex = startFallbackIndex;
        self.usingFallback = startUsingFallback;
        self._updateGlobalState();
        
        return Promise.reject(lastError || new Error('All providers failed'));
      }
      
      var provider = self._getCurrentProvider();
      var stats = self._getCurrentStats();
      
      if (!provider) {
        return Promise.reject(new Error('No provider available'));
      }
      
      // Check if we should pre-emptively rotate due to limits
      var shouldRotate = stats.recordRequest();
      if (shouldRotate && attempts < maxAttempts - 1) {
        self._rotateProvider();
        provider = self._getCurrentProvider();
        stats = self._getCurrentStats();
        // Note: We don't record again here - the next iteration will record
      }
      
      self._updateGlobalState();
      
      attempts++;
      
      return sendToProvider(provider, payload).then(function(response) {
        // EIP-1193 request() should return just the result value
        return response && response.result !== undefined ? response.result : response;
      }).catch(function(err) {
        lastError = err;
        
        // Only rotate on rate limit errors
        if (!isRateLimitError(err)) {
          throw err; // Semantic error, don't retry
        }
        
        // Rotate and retry
        var hasMore = self._rotateProvider();
        if (!hasMore || attempts >= maxAttempts) {
          throw lastError;
        }
        
        return tryRequest();
      });
    }
    
    return tryRequest();
  };

  /**
   * Web3 provider interface - send method (legacy callback style)
   * TRUE PASSTHROUGH - passes the response from HttpProvider unchanged
   * @param {Object} payload - JSON-RPC request payload
   * @param {Function} callback - Callback function(error, result)
   */
  RotatingProvider.prototype.send = function(payload, callback) {
    var self = this;
    
    if (typeof callback !== 'function') {
      throw new Error('Synchronous send is not supported');
    }
    
    this._ensureInitialized();
    
    // Get the current provider and send directly
    var provider = this._getCurrentProvider();
    var stats = this._getCurrentStats();
    
    if (!provider) {
      callback(new Error('No provider available'), null);
      return;
    }
    
    // Record the request
    stats.recordRequest();
    this._updateGlobalState();
    
    // Ensure payload has required JSON-RPC 2.0 fields
    // Some RPC providers are strict and reject requests without jsonrpc/id
    var formattedPayload = ensureJsonRpcFormat(payload);
    
    // TRUE PASSTHROUGH: Call the underlying HttpProvider's send directly
    // Pass response unchanged
    provider.send(formattedPayload, function(err, result) {
      if (err) {
        // Check if we should rotate on error
        if (isRateLimitError(err)) {
          self._rotateProvider();
        }
        callback(err, null);
      } else {
        // Pass through the FULL response unchanged (whether success or JSON-RPC error)
        callback(null, result);
      }
    });
  };

  /**
   * Web3 provider interface - sendAsync method
   * @param {Object} payload - JSON-RPC request payload
   * @param {Function} callback - Callback function(error, result)
   */
  RotatingProvider.prototype.sendAsync = function(payload, callback) {
    this.send(payload, callback);
  };

  /**
   * Check if connected
   * @returns {boolean}
   */
  RotatingProvider.prototype.isConnected = function() {
    return this._initialized && this._getCurrentProvider() !== null;
  };

  /**
   * Get current provider URL for debugging
   * @returns {string|null}
   */
  RotatingProvider.prototype.getCurrentUrl = function() {
    var stats = this._getCurrentStats();
    return stats ? stats.url : null;
  };

  // Export for different module systems
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RotatingProvider;
  } else if (typeof define === 'function' && define.amd) {
    define(function() { return RotatingProvider; });
  } else {
    global.RotatingProvider = RotatingProvider;
  }

})(typeof window !== 'undefined' ? window : this);
