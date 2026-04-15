const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Server management
  getServers: () => ipcRenderer.invoke('get-servers'),
  saveServers: (servers) => ipcRenderer.invoke('save-servers', servers),
  
  // MCP operations
  listTools: (serverConfig) => ipcRenderer.invoke('mcp-list-tools', serverConfig),
  callTool: (serverConfig, toolName, args) => ipcRenderer.invoke('mcp-call-tool', serverConfig, toolName, args),
  callMethod: (serverConfig, method, params) => ipcRenderer.invoke('mcp-call-method', serverConfig, method, params),
  detectMcpEndpoint: (serverConfig) => ipcRenderer.invoke('mcp-detect-endpoint', serverConfig),
  sendRawJsonRpc: (serverConfig, bodyObject) => ipcRenderer.invoke('mcp-jsonrpc-raw', serverConfig, bodyObject),

  // Help operations
  openHelp: () => ipcRenderer.invoke('open-help'),
  readUsageMd: () => ipcRenderer.invoke('read-usage-md'),

  // Updates (packaged app only; no-ops in dev if handlers missing)
  onUpdateChannel: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('update-channel', listener);
    return () => ipcRenderer.removeListener('update-channel', listener);
  },
  quitAndInstallUpdate: () => ipcRenderer.invoke('quit-and-install-update'),
  checkForUpdatesNow: () => ipcRenderer.invoke('check-for-updates-now')
});

