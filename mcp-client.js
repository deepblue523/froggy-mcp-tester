const https = require('https');
const http = require('http');
const { URL } = require('url');

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
  }

  async connect() {
    if (this.config.transport === 'rest') {
      // REST transport - parse URL and API key
      this.restBaseUrl = this.config.address.trim();
      this.restApiKey = this.config.apiKey || null;
      
      // Validate URL
      try {
        new URL(this.restBaseUrl);
      } catch (e) {
        throw new Error(`Invalid REST URL: ${this.restBaseUrl}`);
      }
      
      // Note: We don't initialize REST connections upfront
      // The connection will be tested when we make the first request
    } else {
      // Stdio transport - dynamically import ES modules
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

  async restRequest(method, params = {}) {
    const url = new URL(this.restBaseUrl);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const requestData = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: method,
      params: params
    };

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(requestData);
      
      // Construct the full path - include the method as part of the path
      // Remove trailing slash from base pathname, then append method
      let basePath = url.pathname || '/';
      if (basePath !== '/' && basePath.endsWith('/')) {
        basePath = basePath.slice(0, -1);
      }
      // Avoid double slash when basePath is '/'
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

        // Check status code
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.on('data', (chunk) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            const contentType = res.headers['content-type'] || '';
            // Save debug info for non-2xx as well
            const fullUrl = `${url.protocol}//${url.hostname}${url.port && url.port !== (isHttps ? '443' : '80') ? `:${url.port}` : ''}${options.path}`;
            this.lastDebug = {
              transport: 'rest',
              url: fullUrl,
              requestBody: requestData,
              statusCode: res.statusCode,
              responseHeaders: res.headers,
              responseBodyPreview: data.substring(0, 1000)
            };
            if (contentType.includes('text/html') || data.trim().startsWith('<!DOCTYPE') || data.trim().startsWith('<html')) {
              // Extract a meaningful error from HTML if possible
              const statusText = res.statusMessage || 'Unknown error';
              reject(new Error(`Server returned HTML (status ${res.statusCode} ${statusText}). The endpoint may not exist or the server may have returned an error page. Response preview: ${data.substring(0, 200)}...`));
            } else {
              reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage || 'Error'}: ${data.substring(0, 500)}`));
            }
          });
          return;
        }

        // Check content type for successful responses
        const contentType = res.headers['content-type'] || '';
        if (contentType && !contentType.includes('application/json') && !contentType.includes('text/json')) {
          res.on('data', (chunk) => {
            data += chunk.toString();
          });
          res.on('end', () => {
            const fullUrl = `${url.protocol}//${url.hostname}${url.port && url.port !== (isHttps ? '443' : '80') ? `:${url.port}` : ''}${options.path}`;
            this.lastDebug = {
              transport: 'rest',
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
          // Check if response looks like HTML
          const trimmedData = data.trim();
          if (trimmedData.startsWith('<!DOCTYPE') || trimmedData.startsWith('<html') || trimmedData.startsWith('<HTML')) {
            const fullUrl = `${url.protocol}//${url.hostname}${url.port && url.port !== (isHttps ? '443' : '80') ? `:${url.port}` : ''}${options.path}`;
            this.lastDebug = {
              transport: 'rest',
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
                url: fullUrl,
                requestBody: requestData,
                statusCode: res.statusCode,
                responseHeaders: res.headers,
                responseBody: response
              };
              resolve(response.result);
            }
          } catch (e) {
            // Provide more context about the parsing error
            const preview = data.length > 200 ? data.substring(0, 200) + '...' : data;
            const fullUrl = `${url.protocol}//${url.hostname}${url.port && url.port !== (isHttps ? '443' : '80') ? `:${url.port}` : ''}${options.path}`;
            this.lastDebug = {
              transport: 'rest',
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
      const response = await this.restRequest('tools/list');
      return response.tools || [];
    } else {
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
  }

  async callTool(name, args) {
    if (this.config.transport === 'rest') {
      return await this.restRequest('tools/call', {
        name: name,
        arguments: args || {}
      });
    } else {
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
  }

  async callMethod(method, params = {}) {
    if (this.config.transport === 'rest') {
      return await this.restRequest(method, params);
    } else {
      if (!this.client) {
        throw new Error('Not connected to MCP server');
      }

      // For stdio, handle known methods or try generic request
      // The MCP SDK Client may have a request method for arbitrary calls
      try {
        // Try using request method if available
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
        
        // Fallback: handle specific known methods
        if (method === 'tools/list') {
          const tools = await this.listTools();
          return { tools: tools };
        } else if (method === 'tools/call') {
          if (!params.name) {
            throw new Error('Tool name is required for tools/call');
          }
          return await this.callTool(params.name, params.arguments || {});
        } else {
          throw new Error(`Method "${method}" is not directly supported for stdio transport. Use REST transport for arbitrary method calls, or use the specific SDK methods (listTools, callTool).`);
        }
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
  }

  async disconnect() {
    if (this.config.transport === 'rest') {
      // REST doesn't need explicit disconnect
      this.restBaseUrl = null;
      this.restApiKey = null;
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

module.exports = { MCPClient };

