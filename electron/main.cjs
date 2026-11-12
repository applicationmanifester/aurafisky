const { app, BrowserWindow, shell, session, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;

// ── MCP client (stdio transport to mcp-server) ─────────────────────────
let mcpClient = null;
let mcpTransport = null;
let mcpReady = false;

const MCP_SERVER_PATH = path.join(__dirname, '..', 'mcp-server', 'index.mjs');

async function startMcpServer() {
  // @modelcontextprotocol/sdk is ESM; this file is CJS, so use require().
  // The root entry has no index.js and /client/stdio isn't exported via
  // the package "exports" map, so require the built CJS files by path.
  const sdkClient = path.join(__dirname, '..', 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'cjs', 'client', 'index.js');
  const sdkStdio = path.join(__dirname, '..', 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'cjs', 'client', 'stdio.js');
  const { Client } = require(sdkClient);
  const { StdioClientTransport } = require(sdkStdio);

  // The transport spawns the server process itself over stdio.
  mcpTransport = new StdioClientTransport({
    command: process.execPath,
    args: [MCP_SERVER_PATH],
  });

  mcpClient = new Client({
    name: 'aurafisky-app',
    version: '20.4.0',
  });

  await mcpClient.connect(mcpTransport);
  mcpReady = true;
  console.log('[mcp-client] connected to aurafisky-mcp-server');
}

// MCP request handlers exposed to the renderer via IPC
ipcMain.handle('mcp:list-tools', async () => {
  if (!mcpReady || !mcpClient) throw new Error('MCP server not available');
  const result = await mcpClient.listTools();
  return result.tools;
});

ipcMain.handle('mcp:call-tool', async (event, { name, arguments: args }) => {
  if (!mcpReady || !mcpClient) throw new Error('MCP server not available');
  return mcpClient.callTool({ name, arguments: args });
});

ipcMain.handle('mcp:list-resources', async () => {
  if (!mcpReady || !mcpClient) throw new Error('MCP server not available');
  const result = await mcpClient.listResources();
  return result.resources;
});

ipcMain.handle('mcp:read-resource', async (event, { uri }) => {
  if (!mcpReady || !mcpClient) throw new Error('MCP server not available');
  return mcpClient.readResource({ uri });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Aurafisky — Weather & Maps',
    icon: path.join(__dirname, '../icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
    autoHideMenuBar: true,
    show: false,
  });

  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.open-meteo.com https://nominatim.openstreetmap.org https://*.firebaseio.com wss://*.firebaseio.com https://server.arcgisonline.com https://*.arcgisonline.com https://*.tile.opentopomap.org",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
  ].join('; ');

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  // Handle Geolocation permissions in Electron desktop window
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'geolocation') {
      return callback(true);
    }
    callback(false);
  });

  const indexPath = path.join(__dirname, '../dist/index.html');
  mainWindow.loadFile(indexPath);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await startMcpServer().catch((err) => {
    console.error('[mcp-client] failed to start MCP server:', err.message);
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (mcpClient) {
    try { mcpClient.close(); } catch (e) { /* ignore */ }
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (mcpClient) {
    try { mcpClient.close(); } catch (e) { /* ignore */ }
  }
});