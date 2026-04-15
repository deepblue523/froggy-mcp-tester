const https = require('https');
const http = require('http');
const { URL } = require('url');

/** Relative paths tried in order when discovering a Streamable HTTP / JSON-RPC MCP endpoint. */
const MCP_ENDPOINT_PATH_CANDIDATES = ['/mcp', '/api/mcp', '/rpc', '/'];

const DEFAULT_INITIALIZE_PARAMS = {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: {
    name: 'mcp-test-electron',
    version: '1.0.0'
  }
};

function trimTrailingSlash(s) {
  return s.replace(/\/+$/, '');
}

/**
 * Build candidate MCP POST URLs from a user-entered base (may include path prefix).
 * @param {string} baseAddress
 * @returns {string[]}
 */
function buildMcpCandidateUrls(baseAddress) {
  const trimmed = trimTrailingSlash(baseAddress.trim());
  let baseUrl;
  try {
    baseUrl = new URL(trimmed);
  } catch {
    return [];
  }
  const origin = baseUrl.origin;
  const pathPrefix = (baseUrl.pathname || '').replace(/\/$/, '');
  const out = [];
  const seen = new Set();

  const push = (href) => {
    if (!seen.has(href)) {
      seen.add(href);
      out.push(href);
    }
  };

  push(trimmed);

  for (const suffix of MCP_ENDPOINT_PATH_CANDIDATES) {
    if (suffix === '/') {
      const path = pathPrefix ? `${pathPrefix}/` : '/';
      push(`${origin}${path}`);
    } else {
      push(`${origin}${pathPrefix}${suffix}`);
    }
  }

  return out;
}

function isJsonRpcEnvelope(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.jsonrpc !== '2.0') return false;
  return Object.prototype.hasOwnProperty.call(obj, 'result') || Object.prototype.hasOwnProperty.call(obj, 'error');
}

function mcpInitializeSucceeded(parsed) {
  if (!isJsonRpcEnvelope(parsed)) return false;
  if (parsed.error) return false;
  const r = parsed.result;
  if (!r || typeof r !== 'object') return false;
  return Boolean(r.protocolVersion || r.serverInfo || r.capabilities);
}

class MCPClient {
  constructor(serverConfig) {
    this.config = serverConfig;
    this.client = null;
    this.transport = null;
    this.restBaseUrl = null;
    this.restApiKey = null;
    this.Client = null;
    this.StdioClientTransport = null;
    this.lastDebug = null;
    /** @type {string|null} */
    this.mcpHttpPostUrl = null;
    /** REST MCP session established (initialize + notifications/initialized) */
    this.restMcpSessionReady = false;
  }

  isRestLegacyPathMode() {
    return this.config.transport === 'rest' && Boolean(this.config.restLegacyPathPerMethod);
  }

  isRestMcpJsonRpcMode() {
    return this.config.transport === 'rest' && !this.isRestLegacyPathMode();
  }

  async connect() {
    if (this.config.transport === 'rest') {
      this.restBaseUrl = this.config.address.trim();
      this.restApiKey = this.config.apiKey || null;

      try {
        new URL(this.restBaseUrl);
      } catch (e) {
        throw new Error(`Invalid REST URL: ${this.restBaseUrl}`);
      }

      if (this.isRestMcpJsonRpcMode()) {
        this.mcpHttpPostUrl = (this.config.mcpHttpUrl && String(this.config.mcpHttpUrl).trim()) || null;
        this.restMcpSessionReady = false;
        if (!this.mcpHttpPostUrl) {
          const detected = await this.detectRestMcpEndpoint(this.restBaseUrl);
          this.mcpHttpPostUrl = detected.url;
          this._appendDetectionDebug(detected);
          await this.finishRestMcpSessionAfterDetection(detected.steps);
        } else {
          await this.establishRestMcpSession();
        }
      }
    } else {
      if (!this.Client || !this.StdioClientTransport) {
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        this.Client = Client;
        this.StdioClientTransport = StdioClientTransport;
      }

      const parts = this.config.address.trim().split(/\s+/);
      const command = parts[0];
      const args = parts.slice(1);

      this.transport = new this.StdioClientTransport({
        command,
        args
      });

      this.client = new this.Client({
        name: 'froggy-mcp-tester',
        version: '1.0.0'
      }, {
        capabilities: {
          tools: {}
        }
      });

      await this.client.connect(this.transport);
    }
  }

  _newRpcId() {
    return Date.now() + Math.floor(Math.random() * 1000);
  }

  /**
   * POST JSON body to a URL; returns transport-level result (always resolves unless thrown before request).
   */
  async rawHttpPost(urlString, jsonBody, options = {}) {
    const url = new URL(urlString);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    const postData = typeof jsonBody === 'string' ? jsonBody : JSON.stringify(jsonBody);

    return new Promise((resolve, reject) => {
      const reqOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      if (this.restApiKey) {
        reqOptions.headers['Authorization'] = `Bearer ${this.restApiKey}`;
        reqOptions.headers['X-API-Key'] = this.restApiKey;
      }

      const req = httpModule.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          const contentType = res.headers['content-type'] || '';
          let parsed = null;
          let parseError = null;
          const trimmed = data.trim();
          try {
            if (trimmed) parsed = JSON.parse(trimmed);
          } catch (e) {
            parseError = e.message;
          }
          resolve({
            url: urlString,
            statusCode: res.statusCode,
            headers: res.headers,
            contentType,
            rawText: data,
            parsed,
            parseError
          });
        });
      });

      req.on('error', (e) => {
        reject(new Error(`HTTP request failed: ${e.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  async rawHttpGet(urlString) {
    const url = new URL(urlString);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const reqOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: 'GET',
        headers: {
          Accept: 'application/json, text/event-stream'
        }
      };

      if (this.restApiKey) {
        reqOptions.headers['Authorization'] = `Bearer ${this.restApiKey}`;
        reqOptions.headers['X-API-Key'] = this.restApiKey;
      }

      const req = httpModule.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          resolve({
            url: urlString,
            statusCode: res.statusCode,
            headers: res.headers,
            contentType: res.headers['content-type'] || '',
            rawTextPreview: data.substring(0, 800)
          });
        });
      });

      req.on('error', (e) => {
        reject(new Error(`GET failed: ${e.message}`));
      });

      req.end();
    });
  }

  _buildLastDebugMcpBase(stepSummary) {
    const flags = {
      httpReachable: false,
      jsonParseSucceeded: false,
      jsonRpcValid: false,
      mcpInitializeSucceeded: false
    };

    for (const s of stepSummary.steps || []) {
      if (typeof s.statusCode === 'number' && s.statusCode >= 200 && s.statusCode < 300) {
        flags.httpReachable = true;
      }
      if (s.parseSucceeded) flags.jsonParseSucceeded = true;
      if (s.jsonRpcValid) flags.jsonRpcValid = true;
      if (s.mcpInitializeSucceeded) flags.mcpInitializeSucceeded = true;
    }

    return {
      transport: 'rest',
      mode: 'mcp-jsonrpc',
      mcpHttpUrl: this.mcpHttpPostUrl,
      ...stepSummary,
      flags
    };
  }

  async detectRestMcpEndpoint(baseAddress) {
    const candidates = buildMcpCandidateUrls(baseAddress);
    const steps = [];

    const initBody = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { ...DEFAULT_INITIALIZE_PARAMS }
    };

    for (const candidateUrl of candidates) {
      let httpRes;
      try {
        httpRes = await this.rawHttpPost(candidateUrl, initBody);
      } catch (e) {
        steps.push({
          phase: 'initialize',
          url: candidateUrl,
          errorMessage: e.message,
          httpReachable: false
        });
        continue;
      }

      const parseSucceeded = !httpRes.parseError;
      const jsonRpcValid = isJsonRpcEnvelope(httpRes.parsed);
      const initOk = mcpInitializeSucceeded(httpRes.parsed);

      steps.push({
        phase: 'initialize',
        url: candidateUrl,
        statusCode: httpRes.statusCode,
        requestBody: initBody,
        responseRawPreview: httpRes.rawText.substring(0, 2000),
        parsedResponse: httpRes.parsed,
        parseSucceeded,
        parseError: httpRes.parseError,
        jsonRpcValid,
        mcpInitializeSucceeded: initOk,
        httpReachable: httpRes.statusCode >= 200 && httpRes.statusCode < 300
      });

      if (httpRes.statusCode >= 200 && httpRes.statusCode < 300 && initOk) {
        return { url: candidateUrl, steps };
      }
    }

    const err = new Error('Could not find a working MCP JSON-RPC endpoint. Tried: ' + candidates.join(', '));
    err.detectionSteps = steps;
    throw err;
  }

  _appendDetectionDebug(detection) {
    this.lastDebug = this._buildLastDebugMcpBase({
      phase: 'detect',
      steps: detection.steps
    });
  }

  async establishRestMcpSession() {
    if (!this.isRestMcpJsonRpcMode() || !this.mcpHttpPostUrl) return;

    const steps = [];

    const initBody = {
      jsonrpc: '2.0',
      id: this._newRpcId(),
      method: 'initialize',
      params: { ...DEFAULT_INITIALIZE_PARAMS }
    };

    const initRes = await this.rawHttpPost(this.mcpHttpPostUrl, initBody);
    const initParseOk = !initRes.parseError;
    const initRpc = isJsonRpcEnvelope(initRes.parsed);
    const initOk = mcpInitializeSucceeded(initRes.parsed);

    steps.push({
      phase: 'initialize',
      url: this.mcpHttpPostUrl,
      statusCode: initRes.statusCode,
      requestBody: initBody,
      responseBody: initRes.parsed,
      responseRawPreview: initRes.rawText.substring(0, 2000),
      parseSucceeded: initParseOk,
      jsonRpcValid: initRpc,
      mcpInitializeSucceeded: initOk,
      httpReachable: initRes.statusCode >= 200 && initRes.statusCode < 300
    });

    if (!initOk) {
      const msg = initRes.parsed && initRes.parsed.error
        ? initRes.parsed.error.message || JSON.stringify(initRes.parsed.error)
        : `MCP initialize failed (HTTP ${initRes.statusCode})`;
      this.lastDebug = this._buildLastDebugMcpBase({ phase: 'session', steps });
      throw new Error(msg);
    }

    const notif = {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    };

    const notifRes = await this.rawHttpPost(this.mcpHttpPostUrl, notif);
    steps.push({
      phase: 'notifications/initialized',
      url: this.mcpHttpPostUrl,
      statusCode: notifRes.statusCode,
      requestBody: notif,
      responseBody: notifRes.parsed,
      responseRawPreview: notifRes.rawText.substring(0, 2000),
      parseSucceeded: !notifRes.parseError,
      jsonRpcValid: notifRes.parsed ? isJsonRpcEnvelope(notifRes.parsed) : false,
      httpReachable: notifRes.statusCode >= 200 && notifRes.statusCode < 300
    });

    let getProbe = null;
    try {
      getProbe = await this.rawHttpGet(this.mcpHttpPostUrl);
    } catch (e) {
      getProbe = { url: this.mcpHttpPostUrl, errorMessage: e.message };
    }
    steps.push({ phase: 'optional-get-probe', ...getProbe });

    this.restMcpSessionReady = true;
    this.lastDebug = this._buildLastDebugMcpBase({ phase: 'session', steps });
  }

  /**
   * After auto-detect, initialize already succeeded; send notifications/initialized and optional GET probe only.
   * @param {object[]} priorSteps
   */
  async finishRestMcpSessionAfterDetection(priorSteps) {
    if (!this.isRestMcpJsonRpcMode() || !this.mcpHttpPostUrl) return;

    const steps = Array.isArray(priorSteps) ? [...priorSteps] : [];

    const notif = {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    };

    const notifRes = await this.rawHttpPost(this.mcpHttpPostUrl, notif);
    steps.push({
      phase: 'notifications/initialized',
      url: this.mcpHttpPostUrl,
      statusCode: notifRes.statusCode,
      requestBody: notif,
      responseBody: notifRes.parsed,
      responseRawPreview: notifRes.rawText.substring(0, 2000),
      parseSucceeded: !notifRes.parseError,
      jsonRpcValid: notifRes.parsed ? isJsonRpcEnvelope(notifRes.parsed) : false,
      httpReachable: notifRes.statusCode >= 200 && notifRes.statusCode < 300
    });

    let getProbe = null;
    try {
      getProbe = await this.rawHttpGet(this.mcpHttpPostUrl);
    } catch (e) {
      getProbe = { url: this.mcpHttpPostUrl, errorMessage: e.message };
    }
    steps.push({ phase: 'optional-get-probe', ...getProbe });

    this.restMcpSessionReady = true;
    this.lastDebug = this._buildLastDebugMcpBase({ phase: 'session-after-detect', steps });
  }

  getMcpHttpPostUrl() {
    return this.mcpHttpPostUrl;
  }

  /**
   * POST a user-supplied JSON object to the resolved MCP endpoint (after connect).
   * @param {object} bodyObject
   */
  async restMcpPostUserBody(bodyObject) {
    if (!this.isRestMcpJsonRpcMode()) {
      throw new Error('Raw JSON-RPC POST requires standard MCP (HTTP) mode. Disable legacy path-per-method REST.');
    }
    if (!this.mcpHttpPostUrl) {
      throw new Error('MCP HTTP URL is not set. Connect or detect an endpoint first.');
    }

    const httpRes = await this.rawHttpPost(this.mcpHttpPostUrl, bodyObject);

    const step = {
      phase: 'raw-user',
      url: this.mcpHttpPostUrl,
      statusCode: httpRes.statusCode,
      requestBody: bodyObject,
      responseRawPreview: httpRes.rawText.substring(0, 4000),
      parsedResponse: httpRes.parsed,
      parseSucceeded: !httpRes.parseError,
      parseError: httpRes.parseError,
      jsonRpcValid: httpRes.parsed ? isJsonRpcEnvelope(httpRes.parsed) : false,
      mcpInitializeSucceeded: false,
      httpReachable: httpRes.statusCode >= 200 && httpRes.statusCode < 300
    };

    this.lastDebug = this._buildLastDebugMcpBase({
      phase: 'raw-user',
      steps: [step]
    });

    return {
      statusCode: httpRes.statusCode,
      rawText: httpRes.rawText,
      parsed: httpRes.parsed,
      parseError: httpRes.parseError
    };
  }

  async restMcpJsonRpcRequest(method, params = {}, options = {}) {
    if (!this.mcpHttpPostUrl) {
      throw new Error('MCP HTTP URL is not set');
    }
    const isNotification = Boolean(options.notification);
    const body = {
      jsonrpc: '2.0',
      method,
      params: params || {}
    };
    if (!isNotification) {
      body.id = options.id != null ? options.id : this._newRpcId();
    }

    const httpRes = await this.rawHttpPost(this.mcpHttpPostUrl, body);

    const step = {
      phase: 'rpc',
      method,
      url: this.mcpHttpPostUrl,
      statusCode: httpRes.statusCode,
      requestBody: body,
      responseRawPreview: httpRes.rawText.substring(0, 2000),
      parsedResponse: httpRes.parsed,
      parseSucceeded: !httpRes.parseError,
      parseError: httpRes.parseError,
      jsonRpcValid: isJsonRpcEnvelope(httpRes.parsed),
      mcpInitializeSucceeded: false,
      httpReachable: httpRes.statusCode >= 200 && httpRes.statusCode < 300
    };

    this.lastDebug = this._buildLastDebugMcpBase({
      phase: 'rpc',
      steps: [step]
    });

    if (httpRes.statusCode < 200 || httpRes.statusCode >= 300) {
      throw new Error(`HTTP ${httpRes.statusCode}: ${httpRes.rawText.substring(0, 400)}`);
    }

    if (httpRes.parseError) {
      throw new Error(`Invalid JSON in response: ${httpRes.parseError}`);
    }

    if (!isJsonRpcEnvelope(httpRes.parsed)) {
      throw new Error('Response is not valid JSON-RPC 2.0');
    }

    if (httpRes.parsed.error) {
      const em = httpRes.parsed.error.message || JSON.stringify(httpRes.parsed.error);
      throw new Error(em);
    }

    return httpRes.parsed.result;
  }

  async restRequest(method, params = {}) {
    const url = new URL(this.restBaseUrl);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const requestData = {
      jsonrpc: '2.0',
      id: this._newRpcId(),
      method: method,
      params: params
    };

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(requestData);

      let basePath = url.pathname || '/';
      if (basePath !== '/' && basePath.endsWith('/')) {
        basePath = basePath.slice(0, -1);
      }
      const fullPath = basePath === '/' ? `/${method}` : `${basePath}/${method}`;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: fullPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      if (this.restApiKey) {
        options.headers['Authorization'] = `Bearer ${this.restApiKey}`;
        options.headers['X-API-Key'] = this.restApiKey;
      }

      const req = httpModule.request(options, (res) => {
        let data = '';

        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.on('data', (chunk) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            const contentType = res.headers['content-type'] || '';
            const fullUrl = `${url.protocol}//${url.hostname}${url.port && url.port !== (isHttps ? '443' : '80') ? `:${url.port}` : ''}${options.path}`;
            this.lastDebug = {
              transport: 'rest',
              mode: 'legacy-path',
              url: fullUrl,
              requestBody: requestData,
              statusCode: res.statusCode,
              responseHeaders: res.headers,
              responseBodyPreview: data.substring(0, 1000)
            };
            if (contentType.includes('text/html') || data.trim().startsWith('<!DOCTYPE') || data.trim().startsWith('<html')) {
              const statusText = res.statusMessage || 'Unknown error';
              reject(new Error(`Server returned HTML (status ${res.statusCode} ${statusText}). The endpoint may not exist or the server may have returned an error page. Response preview: ${data.substring(0, 200)}...`));
            } else {
              reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage || 'Error'}: ${data.substring(0, 500)}`));
            }
          });
          return;
        }

        const contentType = res.headers['content-type'] || '';
        if (contentType && !contentType.includes('application/json') && !contentType.includes('text/json')) {
          res.on('data', (chunk) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            const fullUrl = `${url.protocol}//${url.hostname}${url.port && url.port !== (isHttps ? '443' : '80') ? `:${url.port}` : ''}${options.path}`;
            this.lastDebug = {
              transport: 'rest',
              mode: 'legacy-path',
              url: fullUrl,
              requestBody: requestData,
              statusCode: res.statusCode,
              responseHeaders: res.headers,
              responseBodyPreview: data.substring(0, 1000)
            };
            reject(new Error(`Unexpected content type: ${contentType}. Expected JSON but received: ${data.substring(0, 200)}...`));
          });
          return;
        }

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const trimmedData = data.trim();
          if (trimmedData.startsWith('<!DOCTYPE') || trimmedData.startsWith('<html') || trimmedData.startsWith('<HTML')) {
            const fullUrl = `${url.protocol}//${url.hostname}${url.port && url.port !== (isHttps ? '443' : '80') ? `:${url.port}` : ''}${options.path}`;
            this.lastDebug = {
              transport: 'rest',
              mode: 'legacy-path',
              url: fullUrl,
              requestBody: requestData,
              statusCode: res.statusCode,
              responseHeaders: res.headers,
              responseBodyPreview: trimmedData.substring(0, 1000)
            };
            reject(new Error(`Server returned HTML instead of JSON. This usually means the endpoint doesn't exist or the server returned an error page. Response preview: ${trimmedData.substring(0, 500)}...`));
            return;
          }

          try {
            const response = JSON.parse(data);
            if (response.error) {
              const fullUrl = `${url.protocol}//${url.hostname}${url.port && url.port !== (isHttps ? '443' : '80') ? `:${url.port}` : ''}${options.path}`;
              this.lastDebug = {
                transport: 'rest',
                mode: 'legacy-path',
                url: fullUrl,
                requestBody: requestData,
                statusCode: res.statusCode,
                responseHeaders: res.headers,
                responseBodyPreview: data.substring(0, 1000)
              };
              reject(new Error(response.error.message || 'REST request failed'));
            } else {
              const fullUrl = `${url.protocol}//${url.hostname}${url.port && url.port !== (isHttps ? '443' : '80') ? `:${url.port}` : ''}${options.path}`;
              this.lastDebug = {
                transport: 'rest',
                mode: 'legacy-path',
                url: fullUrl,
                requestBody: requestData,
                statusCode: res.statusCode,
                responseHeaders: res.headers,
                responseBody: response
              };
              resolve(response.result);
            }
          } catch (e) {
            const preview = data.length > 200 ? data.substring(0, 200) + '...' : data;
            const fullUrl = `${url.protocol}//${url.hostname}${url.port && url.port !== (isHttps ? '443' : '80') ? `:${url.port}` : ''}${options.path}`;
            this.lastDebug = {
              transport: 'rest',
              mode: 'legacy-path',
              url: fullUrl,
              requestBody: requestData,
              statusCode: res.statusCode,
              responseHeaders: res.headers,
              responseBodyPreview: preview
            };
            reject(new Error(`Failed to parse JSON response: ${e.message}. Response preview: ${preview}`));
          }
        });
      });

      req.on('error', (e) => {
        const fullUrl = `${url.protocol}//${url.hostname}${url.port && url.port !== (isHttps ? '443' : '80') ? `:${url.port}` : ''}${options.path}`;
        this.lastDebug = {
          transport: 'rest',
          mode: 'legacy-path',
          url: fullUrl,
          requestBody: requestData,
          errorMessage: e.message
        };
        reject(new Error(`REST request failed: ${e.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  async listTools() {
    if (this.config.transport === 'rest') {
      if (this.isRestMcpJsonRpcMode()) {
        if (!this.restMcpSessionReady) {
          await this.establishRestMcpSession();
        }
        return (await this.restMcpJsonRpcRequest('tools/list', {})).tools || [];
      }
      const response = await this.restRequest('tools/list');
      return response.tools || [];
    }

    if (!this.client) {
      throw new Error('Not connected to MCP server');
    }

    const response = await this.client.listTools();
    this.lastDebug = {
      transport: 'stdio',
      action: 'listTools'
    };
    return response.tools || [];
  }

  async callTool(name, args) {
    if (this.config.transport === 'rest') {
      if (this.isRestMcpJsonRpcMode()) {
        if (!this.restMcpSessionReady) {
          await this.establishRestMcpSession();
        }
        return await this.restMcpJsonRpcRequest('tools/call', {
          name: name,
          arguments: args || {}
        });
      }
      return await this.restRequest('tools/call', {
        name: name,
        arguments: args || {}
      });
    }

    if (!this.client) {
      throw new Error('Not connected to MCP server');
    }

    const response = await this.client.callTool({
      name,
      arguments: args || {}
    });

    this.lastDebug = {
      transport: 'stdio',
      action: 'callTool',
      requestBody: { name, arguments: args || {} },
      responseBody: response
    };
    return response;
  }

  async callMethod(method, params = {}) {
    if (this.config.transport === 'rest') {
      if (this.isRestMcpJsonRpcMode()) {
        if (!this.restMcpSessionReady) {
          await this.establishRestMcpSession();
        }
        if (method === 'notifications/initialized') {
          await this.restMcpJsonRpcRequest(method, params || {}, { notification: true });
          return null;
        }
        return await this.restMcpJsonRpcRequest(method, params || {});
      }
      return await this.restRequest(method, params);
    }

    if (!this.client) {
      throw new Error('Not connected to MCP server');
    }

    try {
      if (typeof this.client.request === 'function') {
        const response = await this.client.request({
          method: method,
          params: params
        });

        this.lastDebug = {
          transport: 'stdio',
          action: method,
          requestBody: params,
          responseBody: response
        };
        return response;
      }

      if (method === 'tools/list') {
        const tools = await this.listTools();
        return { tools: tools };
      }
      if (method === 'tools/call') {
        if (!params.name) {
          throw new Error('Tool name is required for tools/call');
        }
        return await this.callTool(params.name, params.arguments || {});
      }
      throw new Error(`Method "${method}" is not directly supported for stdio transport. Use REST transport for arbitrary method calls, or use the specific SDK methods (listTools, callTool).`);
    } catch (error) {
      this.lastDebug = {
        transport: 'stdio',
        action: method,
        requestBody: params,
        errorMessage: error.message
      };
      throw error;
    }
  }

  async disconnect() {
    if (this.config.transport === 'rest') {
      this.restBaseUrl = null;
      this.restApiKey = null;
      this.mcpHttpPostUrl = null;
      this.restMcpSessionReady = false;
    } else {
      if (this.client) {
        await this.client.close();
        this.client = null;
      }
      if (this.transport) {
        this.transport = null;
      }
    }
  }

  getLastDebug() {
    return this.lastDebug;
  }
}

module.exports = { MCPClient, buildMcpCandidateUrls, MCP_ENDPOINT_PATH_CANDIDATES, DEFAULT_INITIALIZE_PARAMS };
