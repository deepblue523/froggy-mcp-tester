let servers = [];
let currentServer = null;
let currentTools = [];
let currentEndpoints = [];

// Standard MCP endpoints
const STANDARD_ENDPOINTS = [
  {
    name: 'tools/list',
    description: 'List all available tools from the server',
    samplePayload: {}
  },
  {
    name: 'initialize',
    description: 'Initialize the MCP connection',
    samplePayload: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'froggy-mcp-tester',
        version: '1.0.0'
      }
    }
  },
  {
    name: 'ping',
    description: 'Ping the server to check connectivity',
    samplePayload: {}
  }
];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadServers();
  setupEventListeners();
  setupResizeHandle();
  loadPanelWidth();
});

function setupEventListeners() {
  // Add server button
  document.getElementById('add-server-btn').addEventListener('click', () => {
    showServerModal();
  });

  // Modal controls
  document.getElementById('modal-close').addEventListener('click', hideServerModal);
  document.getElementById('modal-cancel').addEventListener('click', hideServerModal);
  document.getElementById('server-form').addEventListener('submit', handleServerSubmit);

  // Close modal on outside click
  document.getElementById('server-modal').addEventListener('click', (e) => {
    if (e.target.id === 'server-modal') {
      hideServerModal();
    }
  });

  // Transport type change handler
  const transportSelect = document.getElementById('server-transport');
  transportSelect.addEventListener('change', updateTransportFields);

  // Tools refresh button
  const refreshBtn = document.getElementById('tools-refresh-btn');
  refreshBtn.addEventListener('click', () => {
    if (currentServer) {
      loadTools();
    }
  });

  // Help button
  const helpBtn = document.getElementById('help-btn');
  helpBtn.addEventListener('click', async () => {
    await window.electronAPI.openHelp();
  });

  // Request modal controls
  document.getElementById('request-modal-close').addEventListener('click', hideRequestModal);
  document.getElementById('request-modal-cancel').addEventListener('click', hideRequestModal);
  document.getElementById('request-send').addEventListener('click', sendRequest);
  
  // Close modal on outside click
  document.getElementById('request-modal').addEventListener('click', (e) => {
    if (e.target.id === 'request-modal') {
      hideRequestModal();
    }
  });
}

function updateTransportFields() {
  const transportSelect = document.getElementById('server-transport');
  const addressInput = document.getElementById('server-address');
  const restUrlInput = document.getElementById('server-rest-url');
  const stdioGroup = document.getElementById('stdio-address-group');
  const restGroup = document.getElementById('rest-address-group');
  const apiKeyGroup = document.getElementById('rest-api-key-group');
  
  const transport = transportSelect.value;
  if (transport === 'rest') {
    stdioGroup.style.display = 'none';
    restGroup.style.display = 'block';
    apiKeyGroup.style.display = 'block';
    addressInput.removeAttribute('required');
    restUrlInput.setAttribute('required', 'required');
  } else {
    stdioGroup.style.display = 'block';
    restGroup.style.display = 'none';
    apiKeyGroup.style.display = 'none';
    restUrlInput.removeAttribute('required');
    addressInput.setAttribute('required', 'required');
  }
}

async function loadServers() {
  servers = await window.electronAPI.getServers();
  renderServerList();
}

async function saveServers() {
  await window.electronAPI.saveServers(servers);
}

function renderServerList() {
  const list = document.getElementById('server-list');
  list.innerHTML = '';

  if (servers.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>No servers configured. Click "Add Server" to get started.</p></div>';
    return;
  }

  servers.forEach((server, index) => {
    const item = document.createElement('div');
    item.className = `server-item ${currentServer?.index === index ? 'active' : ''}`;
    const transport = server.transport || 'stdio';
    const address = transport === 'rest' ? server.address : server.address;
    const transportLabel = transport === 'rest' ? 'REST' : 'Stdio';
    item.innerHTML = `
      <div class="server-item-info">
        <div class="server-item-name">${escapeHtml(server.name)}</div>
        <div class="server-item-address">
          <span class="transport-badge ${transport}">${transportLabel}</span>
          ${escapeHtml(address)}
        </div>
      </div>
      <div class="server-item-actions">
        <button class="btn btn-sm btn-secondary" onclick="editServer(${index})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteServer(${index})">Delete</button>
      </div>
    `;
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.server-item-actions')) {
        selectServer(index);
      }
    });
    list.appendChild(item);
  });
}

function selectServer(index) {
  currentServer = { index, ...servers[index] };
  renderServerList();
  showStandardEndpoints();
}

function showStandardEndpoints() {
  const toolsContent = document.getElementById('tools-content');
  const panelTitle = document.getElementById('tools-panel-title');
  
  panelTitle.textContent = `Endpoints - ${currentServer.name}`;
  
  // Just show standard endpoints without loading tools
  currentEndpoints = [...STANDARD_ENDPOINTS];
  currentTools = [];
  renderEndpoints();
}

async function loadTools() {
  const toolsContent = document.getElementById('tools-content');
  const panelTitle = document.getElementById('tools-panel-title');
  
  panelTitle.textContent = `Endpoints - ${currentServer.name}`;
  toolsContent.innerHTML = '<div class="loading">Loading endpoints...</div>';

  try {
    // Pass full server config
    const serverConfig = {
      name: currentServer.name,
      address: currentServer.address,
      transport: currentServer.transport || 'stdio',
      apiKey: currentServer.apiKey || null
    };
    
    // Try to load tools to discover available endpoints
    const response = await window.electronAPI.listTools(serverConfig);
    
    if (response.success) {
      currentTools = response.tools || [];
      
      // Build endpoints list: standard endpoints + tool endpoints
      currentEndpoints = [...STANDARD_ENDPOINTS];
      
      // Add tool-specific endpoints
      currentTools.forEach(tool => {
        currentEndpoints.push({
          name: `tools/call`,
          description: `Call tool: ${tool.name}`,
          toolName: tool.name,
          samplePayload: generateToolPayload(tool)
        });
      });
      
      renderEndpoints();
    } else {
      // Even if tools fail, show standard endpoints
      currentEndpoints = [...STANDARD_ENDPOINTS];
      renderEndpoints();
      
      // Show error but still allow testing
      const errorPanel = document.createElement('div');
      errorPanel.className = 'tool-result error';
      errorPanel.innerHTML = `
        <h4>Warning: Could not load tools</h4>
        <pre>${escapeHtml(response.error)}</pre>
        <p>Standard endpoints are still available for testing.</p>
      `;
      toolsContent.prepend(errorPanel);
    }
  } catch (error) {
    // Even on error, show standard endpoints
    currentEndpoints = [...STANDARD_ENDPOINTS];
    renderEndpoints();
    
    const errorPanel = document.createElement('div');
    errorPanel.className = 'tool-result error';
    errorPanel.innerHTML = `
      <h4>Error loading tools</h4>
      <pre>${escapeHtml(error.message)}</pre>
      <p>Standard endpoints are still available for testing.</p>
    `;
    toolsContent.prepend(errorPanel);
  }
}

function generateToolPayload(tool) {
  // For tools/call, the payload should have name and arguments
  const payload = {
    name: tool.name,
    arguments: {}
  };
  
  if (tool.inputSchema && tool.inputSchema.properties) {
    const properties = tool.inputSchema.properties;
    
    Object.keys(properties).forEach(paramName => {
      const param = properties[paramName];
      // Generate sample value based on type
      if (param.type === 'string') {
        payload.arguments[paramName] = '';
      } else if (param.type === 'number') {
        payload.arguments[paramName] = 0;
      } else if (param.type === 'boolean') {
        payload.arguments[paramName] = false;
      } else if (param.type === 'array') {
        payload.arguments[paramName] = [];
      } else if (param.type === 'object') {
        payload.arguments[paramName] = {};
      } else {
        payload.arguments[paramName] = null;
      }
    });
  }
  
  return payload;
}

function renderEndpoints() {
  const toolsContent = document.getElementById('tools-content');
  
  if (currentEndpoints.length === 0) {
    toolsContent.innerHTML = '<div class="empty-state"><p>No endpoints available.</p></div>';
    return;
  }

  const endpointList = document.createElement('div');
  endpointList.className = 'endpoint-list';

  currentEndpoints.forEach((endpoint, index) => {
    const endpointItem = document.createElement('div');
    endpointItem.className = 'endpoint-item';
    const endpointId = `endpoint-${index}`;
    const displayName = endpoint.toolName ? `${endpoint.name} (${endpoint.toolName})` : endpoint.name;
    endpointItem.innerHTML = `
      <div class="endpoint-header">
        <div class="endpoint-name">${escapeHtml(displayName)}</div>
        <button class="btn btn-primary btn-sm" onclick="testEndpoint(${index})">Test</button>
      </div>
      <div class="endpoint-description">${escapeHtml(endpoint.description || 'No description available')}</div>
    `;
    endpointList.appendChild(endpointItem);
  });

  toolsContent.innerHTML = '';
  toolsContent.appendChild(endpointList);
}

function renderToolParameters(tool) {
  if (!tool.inputSchema || !tool.inputSchema.properties) {
    return '<div class="tool-parameters"><p>No parameters required.</p></div>';
  }

  const properties = tool.inputSchema.properties;
  const required = tool.inputSchema.required || [];

  let html = '<div class="tool-parameters"><h4>Parameters:</h4>';
  
  Object.keys(properties).forEach(paramName => {
    const param = properties[paramName];
    const isRequired = required.includes(paramName);
    html += `
      <div class="parameter-item">
        <div>
          <span class="parameter-name">${escapeHtml(paramName)}</span>
          <span class="parameter-type">${escapeHtml(param.type || 'any')}${isRequired ? ' (required)' : ' (optional)'}</span>
        </div>
        ${param.description ? `<div class="parameter-description">${escapeHtml(param.description)}</div>` : ''}
      </div>
    `;
  });
  
  html += '</div>';
  return html;
}

function renderToolExecute(tool) {
  if (!tool.inputSchema || !tool.inputSchema.properties) {
    return `
      <div class="tool-execute">
        <form id="form-${tool.name}" class="tool-execute-form">
          <button type="submit" class="btn btn-primary">Execute Tool</button>
        </form>
      </div>
    `;
  }

  const properties = tool.inputSchema.properties;
  const required = tool.inputSchema.required || [];

  let html = `
    <div class="tool-execute">
      <form id="form-${tool.name}" class="tool-execute-form">
  `;

  Object.keys(properties).forEach(paramName => {
    const param = properties[paramName];
    const isRequired = required.includes(paramName);
    const inputType = param.type === 'number' ? 'number' : 
                     param.type === 'boolean' ? 'checkbox' : 'text';
    
    if (param.type === 'object' || (param.type === 'array' && param.items?.type === 'object')) {
      html += `
        <div class="form-group">
          <label for="param-${tool.name}-${paramName}">${escapeHtml(paramName)}${isRequired ? ' *' : ''}:</label>
          <textarea id="param-${tool.name}-${paramName}" 
                    placeholder='Enter JSON (e.g., {"key": "value"})'
                    ${isRequired ? 'required' : ''}></textarea>
          ${param.description ? `<small>${escapeHtml(param.description)}</small>` : ''}
        </div>
      `;
    } else if (inputType === 'checkbox') {
      html += `
        <div class="form-group">
          <label>
            <input type="checkbox" id="param-${tool.name}-${paramName}" 
                   ${isRequired ? 'required' : ''}>
            ${escapeHtml(paramName)}${isRequired ? ' *' : ''}
          </label>
          ${param.description ? `<small>${escapeHtml(param.description)}</small>` : ''}
        </div>
      `;
    } else {
      html += `
        <div class="form-group">
          <label for="param-${tool.name}-${paramName}">${escapeHtml(paramName)}${isRequired ? ' *' : ''}:</label>
          <input type="${inputType}" id="param-${tool.name}-${paramName}" 
                 ${isRequired ? 'required' : ''}
                 placeholder="${escapeHtml(param.description || '')}">
          ${param.description ? `<small>${escapeHtml(param.description)}</small>` : ''}
        </div>
      `;
    }
  });

  html += `
        <button type="submit" class="btn btn-primary">Execute Tool</button>
      </form>
    </div>
  `;

  return html;
}

async function executeTool(tool) {
  const resultContainer = document.getElementById(`result-${tool.name}`);
  resultContainer.innerHTML = '<div class="loading">Executing tool...</div>';

  try {
    // Collect form values
    const args = {};
    if (tool.inputSchema && tool.inputSchema.properties) {
      Object.keys(tool.inputSchema.properties).forEach(paramName => {
        const input = document.getElementById(`param-${tool.name}-${paramName}`);
        if (input) {
          const param = tool.inputSchema.properties[paramName];
          let value = input.value;

          if (param.type === 'boolean') {
            value = input.checked;
          } else if (param.type === 'number') {
            value = value ? parseFloat(value) : undefined;
          } else if (param.type === 'object' || (param.type === 'array' && param.items?.type === 'object')) {
            try {
              value = value ? JSON.parse(value) : undefined;
            } catch (e) {
              resultContainer.innerHTML = `
                <div class="tool-result error">
                  <h4>Invalid JSON</h4>
                  <pre>${escapeHtml(e.message)}</pre>
                </div>
              `;
              return;
            }
          } else if (param.type === 'array' && param.items?.type !== 'object') {
            value = value ? value.split(',').map(v => v.trim()) : [];
          }

          if (value !== undefined && value !== '') {
            args[paramName] = value;
          }
        }
      });
    }

    const serverConfig = {
      name: currentServer.name,
      address: currentServer.address,
      transport: currentServer.transport || 'stdio',
      apiKey: currentServer.apiKey || null
    };
    const response = await window.electronAPI.callTool(serverConfig, tool.name, args);

    if (response.success) {
      resultContainer.innerHTML = `
        <div class="tool-result success">
          <h4>Result:</h4>
          <pre>${escapeHtml(JSON.stringify(response.result, null, 2))}</pre>
        </div>
        ${response.debug ? `<div class="tool-result"><h4>Request</h4>${renderRequestDebug(response.debug)}</div>` : ''}
      `;
    } else {
      resultContainer.innerHTML = `
        <div class="tool-result error">
          <h4>Error</h4>
          <pre>${escapeHtml(response.error)}</pre>
        </div>
        ${response.debug ? `<div class="tool-result error">${renderRequestDebug(response.debug)}</div>` : ''}
      `;
    }
  } catch (error) {
    resultContainer.innerHTML = `
      <div class="tool-result error">
        <h4>Error</h4>
        <pre>${escapeHtml(error.message)}</pre>
      </div>
    `;
  }
}

function renderRequestDebug(debug) {
  try {
    // Build a human-friendly block containing URL and payloads
    const lines = [];
    if (debug.transport) {
      lines.push(`Transport: ${debug.transport}`);
    }
    if (debug.url) {
      lines.push(`URL: ${debug.url}`);
    }
    if (debug.action) {
      lines.push(`Action: ${debug.action}`);
    }
    if (typeof debug.statusCode !== 'undefined') {
      lines.push(`Status: ${debug.statusCode}`);
    }
    const header = lines.join('\n');

    const request = debug.requestBody ? JSON.stringify(debug.requestBody, null, 2) : null;
    const response = debug.responseBody
      ? JSON.stringify(debug.responseBody, null, 2)
      : (debug.responseBodyPreview ? debug.responseBodyPreview : null);

    return `
      <pre>${escapeHtml(header)}</pre>
      ${request ? `<h5>Payload Sent</h5><pre>${escapeHtml(request)}</pre>` : ''}
      ${response ? `<h5>Payload Received</h5><pre>${escapeHtml(response)}</pre>` : ''}
    `;
  } catch {
    return '<pre>Debug info unavailable</pre>';
  }
}

function showServerModal(serverIndex = null) {
  const modal = document.getElementById('server-modal');
  const form = document.getElementById('server-form');
  const title = document.getElementById('modal-title');
  const nameInput = document.getElementById('server-name');
  const transportSelect = document.getElementById('server-transport');
  const addressInput = document.getElementById('server-address');
  const restUrlInput = document.getElementById('server-rest-url');
  const apiKeyInput = document.getElementById('server-api-key');

  if (serverIndex !== null) {
    // Edit mode
    title.textContent = 'Edit MCP Server';
    const server = servers[serverIndex];
    nameInput.value = server.name;
    transportSelect.value = server.transport || 'stdio';
    if (server.transport === 'rest') {
      restUrlInput.value = server.address;
      apiKeyInput.value = server.apiKey || '';
    } else {
      addressInput.value = server.address;
    }
    updateTransportFields();
    form.dataset.editIndex = serverIndex;
  } else {
    // Add mode
    title.textContent = 'Add MCP Server';
    form.reset();
    transportSelect.value = 'stdio';
    updateTransportFields();
    delete form.dataset.editIndex;
  }

  modal.classList.add('show');
  nameInput.focus();
}

function hideServerModal() {
  const modal = document.getElementById('server-modal');
  modal.classList.remove('show');
}

async function handleServerSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const name = document.getElementById('server-name').value.trim();
  const transport = document.getElementById('server-transport').value;
  const address = transport === 'rest' 
    ? document.getElementById('server-rest-url').value.trim()
    : document.getElementById('server-address').value.trim();
  const apiKey = transport === 'rest' 
    ? document.getElementById('server-api-key').value.trim() || null
    : null;

  if (!name || !address) {
    return;
  }

  const serverData = {
    name,
    transport,
    address
  };
  
  if (apiKey) {
    serverData.apiKey = apiKey;
  }

  const editIndex = form.dataset.editIndex;
  if (editIndex !== undefined) {
    // Update existing
    servers[parseInt(editIndex)] = serverData;
  } else {
    // Add new
    servers.push(serverData);
  }

  await saveServers();
  await loadServers();
  hideServerModal();
}

function editServer(index) {
  showServerModal(index);
}

async function deleteServer(index) {
  if (confirm(`Are you sure you want to delete "${servers[index].name}"?`)) {
    servers.splice(index, 1);
    await saveServers();
    await loadServers();
    
    if (currentServer && currentServer.index === index) {
      currentServer = null;
      document.getElementById('tools-panel-title').textContent = 'Select a server to view endpoints';
      document.getElementById('tools-content').innerHTML = `
        <div class="empty-state">
          <p>Select an MCP server from the list to view and test its endpoints.</p>
        </div>
      `;
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make functions available globally for onclick handlers
window.editServer = editServer;
window.deleteServer = deleteServer;
window.testEndpoint = testEndpoint;

function getPayloadKey(serverName, endpointName, toolName = null) {
  const key = toolName ? `${serverName}_${endpointName}_${toolName}` : `${serverName}_${endpointName}`;
  return `testPayload_${key}`;
}

function savePayload(serverName, endpointName, payload, toolName = null) {
  const key = getPayloadKey(serverName, endpointName, toolName);
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (e) {
    console.error('Failed to save payload:', e);
  }
}

function loadPayload(serverName, endpointName, defaultPayload, toolName = null) {
  const key = getPayloadKey(serverName, endpointName, toolName);
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load payload:', e);
  }
  return defaultPayload || {};
}

function testEndpoint(endpointIndex) {
  if (!currentServer || !currentEndpoints[endpointIndex]) {
    return;
  }
  
  const endpoint = currentEndpoints[endpointIndex];
  const defaultPayload = endpoint.samplePayload || {};
  const savedPayload = loadPayload(currentServer.name, endpoint.name, defaultPayload, endpoint.toolName);
  
  showRequestModal(endpoint, savedPayload);
}

function getFullEndpointUrl(serverConfig, endpointName) {
  if (serverConfig.transport === 'rest') {
    // For REST, construct the full URL
    // MCP REST typically uses the base URL, but we'll show it as baseUrl/endpoint for clarity
    const baseUrl = serverConfig.address.trim();
    // Remove trailing slash if present
    const cleanBase = baseUrl.replace(/\/$/, '');
    // Construct full URL - for MCP REST, the method goes in the JSON-RPC body,
    // but we'll display it as if it were a path for clarity
    return `${cleanBase}/${endpointName}`;
  } else {
    // For stdio, show the command and method
    return `stdio://${serverConfig.address} [${endpointName}]`;
  }
}

function showRequestModal(endpoint, payload) {
  const modal = document.getElementById('request-modal');
  const endpointNameEl = document.getElementById('request-endpoint-name');
  const endpointUrlEl = document.getElementById('request-endpoint-url');
  const endpointDescEl = document.getElementById('request-endpoint-desc');
  const payloadTextarea = document.getElementById('request-payload');
  const responseContainer = document.getElementById('request-response');
  
  // Clear previous response
  responseContainer.innerHTML = '';
  
  const displayName = endpoint.toolName ? `${endpoint.name} (${endpoint.toolName})` : endpoint.name;
  endpointNameEl.textContent = displayName;
  endpointDescEl.textContent = getFullEndpointUrl(currentServer, endpoint.name);
  endpointDescEl.textContent = endpoint.description || 'No description';
  
  // Format payload as JSON
  try {
    payloadTextarea.value = JSON.stringify(payload, null, 2);
  } catch (e) {
    payloadTextarea.value = '{}';
  }
  
  modal.dataset.endpointIndex = currentEndpoints.indexOf(endpoint);
  modal.classList.add('show');
  payloadTextarea.focus();
}

function hideRequestModal() {
  const modal = document.getElementById('request-modal');
  modal.classList.remove('show');
}

async function sendRequest() {
  const modal = document.getElementById('request-modal');
  const endpointIndex = parseInt(modal.dataset.endpointIndex);
  const payloadTextarea = document.getElementById('request-payload');
  const responseContainer = document.getElementById('request-response');
  
  if (endpointIndex === undefined || !currentEndpoints[endpointIndex]) {
    return;
  }
  
  const endpoint = currentEndpoints[endpointIndex];
  
  // Parse payload
  let params = {};
  try {
    const payloadText = payloadTextarea.value.trim();
    if (payloadText) {
      params = JSON.parse(payloadText);
    }
  } catch (e) {
    responseContainer.innerHTML = `
      <div class="tool-result error">
        <h4>Invalid JSON</h4>
        <pre>${escapeHtml(e.message)}</pre>
      </div>
    `;
    return;
  }
  
  // Save payload for next time
  savePayload(currentServer.name, endpoint.name, params, endpoint.toolName);
  
  // Show loading
  responseContainer.innerHTML = '<div class="loading">Sending request...</div>';
  
  try {
    const serverConfig = {
      name: currentServer.name,
      address: currentServer.address,
      transport: currentServer.transport || 'stdio',
      apiKey: currentServer.apiKey || null
    };
    
    // Handle tools/call specially if it has a toolName
    let method = endpoint.name;
    let methodParams = params;
    
    if (endpoint.name === 'tools/call' && endpoint.toolName) {
      // For tool calls, ensure the tool name is in the params
      if (!params.name) {
        methodParams = { 
          name: endpoint.toolName,
          arguments: params.arguments || params
        };
      } else {
        methodParams = params;
      }
    }
    
    const response = await window.electronAPI.callMethod(serverConfig, method, methodParams);
    
    if (response.success) {
      // If testing tools/list endpoint and it succeeds, load tools to discover endpoints
      if (endpoint.name === 'tools/list') {
        // Extract tools from the response
        const toolsResult = response.result;
        if (toolsResult && toolsResult.tools) {
          currentTools = toolsResult.tools;
          
          // Build endpoints list: standard endpoints + tool endpoints
          currentEndpoints = [...STANDARD_ENDPOINTS];
          
          // Add tool-specific endpoints
          currentTools.forEach(tool => {
            currentEndpoints.push({
              name: `tools/call`,
              description: `Call tool: ${tool.name}`,
              toolName: tool.name,
              samplePayload: generateToolPayload(tool)
            });
          });
          
          // Re-render endpoints list to include discovered tools
          renderEndpoints();
        }
      }
      
      let html = `
        <div class="tool-result success">
          <h4>Response:</h4>
          <pre>${escapeHtml(JSON.stringify(response.result, null, 2))}</pre>
        </div>
      `;
      if (response.debug) {
        html += `<div class="tool-result"><h4>Request Details</h4>${renderRequestDebug(response.debug)}</div>`;
      }
      responseContainer.innerHTML = html;
    } else {
      let html = `
        <div class="tool-result error">
          <h4>Error</h4>
          <pre>${escapeHtml(response.error)}</pre>
        </div>
      `;
      if (response.debug) {
        html += `<div class="tool-result error">${renderRequestDebug(response.debug)}</div>`;
      }
      responseContainer.innerHTML = html;
    }
  } catch (error) {
    responseContainer.innerHTML = `
      <div class="tool-result error">
        <h4>Error</h4>
        <pre>${escapeHtml(error.message)}</pre>
      </div>
    `;
  }
}

// Panel resize functionality
function setupResizeHandle() {
  const resizeHandle = document.getElementById('resize-handle');
  const serverPanel = document.getElementById('server-panel');
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = serverPanel.offsetWidth;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const diff = e.clientX - startX;
    const newWidth = startWidth + diff;
    const minWidth = 250;
    const maxWidth = 800;
    
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      serverPanel.style.width = `${newWidth}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      savePanelWidth();
    }
  });
}

function loadPanelWidth() {
  const savedWidth = localStorage.getItem('serverPanelWidth');
  if (savedWidth) {
    const width = parseInt(savedWidth, 10);
    if (width >= 250 && width <= 800) {
      document.getElementById('server-panel').style.width = `${width}px`;
    }
  }
}

function savePanelWidth() {
  const serverPanel = document.getElementById('server-panel');
  const width = serverPanel.offsetWidth;
  localStorage.setItem('serverPanelWidth', width.toString());
}

