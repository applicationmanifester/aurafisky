// src/services/McpService.ts
// Client-side wrapper around the Electron↔MCP-server bridge.
// Exposes the aurafisky-mcp-server tools/resources to the renderer via IPC.

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface WindowWithElectron extends Window {
  electronAPI?: {
    mcpListTools?: () => Promise<McpTool[]>;
    mcpCallTool?: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ content: Array<{ type: string; text: string }>; structuredContent?: unknown }>;
    mcpListResources?: () => Promise<McpResource[]>;
    mcpReadResource?: (uri: string) => Promise<{
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    }>;
  };
}

const getApi = (): WindowWithElectron['electronAPI'] => {
  return (window as unknown as WindowWithElectron).electronAPI;
};

export class McpService {
  /** True when the MCP bridge is available (Electron + server running). */
  isAvailable(): boolean {
    return !!getApi()?.mcpListTools;
  }

  /** List all registered MCP tools. */
  async listTools(): Promise<McpTool[]> {
    const api = getApi();
    if (!api?.mcpListTools) {
      throw new Error('MCP bridge not available (not running in Electron or server failed to start)');
    }
    return api.mcpListTools();
  }

  /** Call an MCP tool by name with the given arguments. */
  async callTool(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  }> {
    const api = getApi();
    if (!api?.mcpCallTool) {
      throw new Error('MCP bridge not available (not running in Electron or server failed to start)');
    }
    return api.mcpCallTool(name, args);
  }

  /** List all registered MCP resources. */
  async listResources(): Promise<McpResource[]> {
    const api = getApi();
    if (!api?.mcpListResources) {
      throw new Error('MCP bridge not available (not running in Electron or server failed to start)');
    }
    return api.mcpListResources();
  }

  /** Read an MCP resource by URI (e.g. weather://51.5,-0.12). */
  async readResource(uri: string): Promise<{
    contents: Array<{ uri: string; mimeType: string; text: string }>;
  }> {
    const api = getApi();
    if (!api?.mcpReadResource) {
      throw new Error('MCP bridge not available (not running in Electron or server failed to start)');
    }
    return api.mcpReadResource(uri);
  }
}

export const mcpService = new McpService();
