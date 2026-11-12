const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  version: process.versions.electron,

  // ── MCP (Model Context Protocol) ───────────────────────────────────
  mcpListTools: () => ipcRenderer.invoke('mcp:list-tools'),
  mcpCallTool: (name, args) => ipcRenderer.invoke('mcp:call-tool', { name, arguments: args }),
  mcpListResources: () => ipcRenderer.invoke('mcp:list-resources'),
  mcpReadResource: (uri) => ipcRenderer.invoke('mcp:read-resource', { uri }),
});
