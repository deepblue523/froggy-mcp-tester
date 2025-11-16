const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Server management
  getServers: () => ipcRenderer.invoke('get-servers'),
  saveServers: (servers) => ipcRenderer.invoke('save-servers', servers),
  
  // MCP operations
  listTools: (serverConfig) => ipcRenderer.invoke('mcp-list-tools', serverConfig),
  callTool: (serverConfig, toolName, args) => ipcRenderer.invoke('mcp-call-tool', serverConfig, toolName, args)
});

