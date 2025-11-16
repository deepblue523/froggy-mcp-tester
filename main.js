const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;
const serversFile = path.join(app.getPath('userData'), 'mcp-servers.json');
const windowBoundsFile = path.join(app.getPath('userData'), 'window-bounds.json');

// Ensure userData directory exists
app.whenReady().then(async () => {
  try {
    await fs.access(path.dirname(serversFile));
  } catch {
    await fs.mkdir(path.dirname(serversFile), { recursive: true });
  }
});

// Load saved window bounds
async function loadWindowBounds() {
  try {
    const data = await fs.readFile(windowBoundsFile, 'utf-8');
    const bounds = JSON.parse(data);
    
    // Validate bounds are within screen
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    
    // Ensure window is within screen bounds
    const width = Math.min(bounds.width || 1200, screenWidth);
    const height = Math.min(bounds.height || 800, screenHeight);
    const x = Math.max(0, Math.min(bounds.x || 0, screenWidth - width));
    const y = Math.max(0, Math.min(bounds.y || 0, screenHeight - height));
    
    return { width, height, x, y };
  } catch {
    // Default bounds if file doesn't exist
    return { width: 1200, height: 800 };
  }
}

// Save window bounds
async function saveWindowBounds() {
  if (!mainWindow) return;
  
  const bounds = mainWindow.getBounds();
  try {
    await fs.writeFile(windowBoundsFile, JSON.stringify(bounds, null, 2));
  } catch (error) {
    console.error('Failed to save window bounds:', error);
  }
}

async function createWindow() {
  const bounds = await loadWindowBounds();
  
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  
  // Save bounds when window is resized or moved
  let saveBoundsTimeout;
  const debouncedSaveBounds = () => {
    clearTimeout(saveBoundsTimeout);
    saveBoundsTimeout = setTimeout(saveWindowBounds, 500);
  };
  
  mainWindow.on('resized', debouncedSaveBounds);
  mainWindow.on('moved', debouncedSaveBounds);
  
  // Save bounds when window is closed
  mainWindow.on('close', () => {
    saveWindowBounds();
  });
}

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers for server management
ipcMain.handle('get-servers', async () => {
  try {
    const data = await fs.readFile(serversFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
});

ipcMain.handle('save-servers', async (event, servers) => {
  await fs.writeFile(serversFile, JSON.stringify(servers, null, 2));
  return true;
});

// IPC Handlers for MCP operations
ipcMain.handle('mcp-list-tools', async (event, serverConfig) => {
  const { MCPClient } = require('./mcp-client.js');
  const client = new MCPClient(serverConfig);
  try {
    await client.connect();
    const tools = await client.listTools();
    await client.disconnect();
    return { success: true, tools };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mcp-call-tool', async (event, serverConfig, toolName, args) => {
  const { MCPClient } = require('./mcp-client.js');
  const client = new MCPClient(serverConfig);
  try {
    await client.connect();
    const result = await client.callTool(toolName, args);
    await client.disconnect();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

