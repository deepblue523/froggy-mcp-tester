let servers = [];
let currentServer = null;
let currentTools = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadServers();
  setupEventListeners();
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
  loadTools();
}

async function loadTools() {
  const toolsContent = document.getElementById('tools-content');
  const panelTitle = document.getElementById('tools-panel-title');
  
  panelTitle.textContent = `Tools - ${currentServer.name}`;
  toolsContent.innerHTML = '<div class="loading">Loading tools...</div>';

  try {
    // Pass full server config
    const serverConfig = {
      name: currentServer.name,
      address: currentServer.address,
      transport: currentServer.transport || 'stdio',
      apiKey: currentServer.apiKey || null
    };
    const response = await window.electronAPI.listTools(serverConfig);
    
    if (response.success) {
      currentTools = response.tools;
      renderTools();
    } else {
      toolsContent.innerHTML = `
        <div class="tool-result error">
          <h4>Error loading tools</h4>
          <pre>${escapeHtml(response.error)}</pre>
        </div>
      `;
    }
  } catch (error) {
    toolsContent.innerHTML = `
      <div class="tool-result error">
        <h4>Error</h4>
        <pre>${escapeHtml(error.message)}</pre>
      </div>
    `;
  }
}

function renderTools() {
  const toolsContent = document.getElementById('tools-content');
  
  if (currentTools.length === 0) {
    toolsContent.innerHTML = '<div class="empty-state"><p>No tools available on this server.</p></div>';
    return;
  }

  const toolList = document.createElement('div');
  toolList.className = 'tool-list';

  currentTools.forEach(tool => {
    const toolItem = document.createElement('div');
    toolItem.className = 'tool-item';
    toolItem.innerHTML = `
      <div class="tool-header">
        <div class="tool-name">${escapeHtml(tool.name)}</div>
      </div>
      <div class="tool-description">${escapeHtml(tool.description || 'No description available')}</div>
      ${renderToolParameters(tool)}
      ${renderToolExecute(tool)}
      <div class="tool-result-container" id="result-${tool.name}"></div>
    `;
    toolList.appendChild(toolItem);
  });

  toolsContent.innerHTML = '';
  toolsContent.appendChild(toolList);

  // Attach event listeners for execute buttons
  currentTools.forEach(tool => {
    const form = document.getElementById(`form-${tool.name}`);
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        executeTool(tool);
      });
    }
  });
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
      `;
    } else {
      resultContainer.innerHTML = `
        <div class="tool-result error">
          <h4>Error</h4>
          <pre>${escapeHtml(response.error)}</pre>
        </div>
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
      document.getElementById('tools-panel-title').textContent = 'Select a server to view tools';
      document.getElementById('tools-content').innerHTML = `
        <div class="empty-state">
          <p>Select an MCP server from the list to view and test its tools.</p>
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

