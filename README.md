# Froggy MCP Tester

An Electron application for testing Model Context Protocol (MCP) servers. This tool provides a user-friendly interface to connect to MCP servers, browse available tools, and execute them with custom parameters.

## Features

- **Multiple Transport Support**: Connect to MCP servers via:
  - **Stdio**: Run local MCP server processes via command-line
  - **REST**: Connect to remote MCP servers via HTTP/HTTPS endpoints
- **Server Management**: Add, edit, and delete MCP server configurations
- **Tool Discovery**: Automatically discover and list all available tools from connected servers
- **Tool Execution**: Execute tools with custom parameters through an intuitive form interface
- **Persistent Storage**: Server configurations are saved locally and persist between sessions
- **Window State**: Remembers window size and position

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

## Installation

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

## Usage

### Starting the Application

```bash
npm start
```

For development mode:

```bash
npm run dev
```

### Adding an MCP Server

1. Click the **"+ Add Server"** button
2. Enter a name for your server
3. Select the transport type:
   - **Stdio**: Enter the command to run your MCP server (e.g., `node server.js` or `python mcp_server.py`)
   - **REST**: Enter the base URL for your MCP REST API endpoint (e.g., `https://api.example.com/mcp`)
4. For REST servers, optionally provide an API key for authentication
5. Click **Save**

### Using Tools

1. Select a server from the server list
2. The available tools will be displayed in the right panel
3. For each tool:
   - Review the tool description and parameters
   - Fill in the required parameters (marked with *)
   - Optionally fill in optional parameters
   - Click **Execute Tool** to run the tool
4. View the results in the result container below each tool

### Server Management

- **Edit**: Click the "Edit" button next to a server to modify its configuration
- **Delete**: Click the "Delete" button to remove a server configuration
- **Select**: Click on a server name to view its tools

## Transport Types

### Stdio Transport

The stdio transport runs MCP servers as local processes. The server address should be a command that can be executed in your terminal, along with any necessary arguments.

**Example:**
```
node /path/to/mcp-server.js
python -m mcp_server --config config.json
```

### REST Transport

The REST transport connects to MCP servers over HTTP/HTTPS. The server address should be the base URL of your MCP REST API endpoint.

**Example:**
```
https://api.example.com/mcp
http://localhost:8080/mcp
```

For REST servers that require authentication, you can optionally provide an API key. The key will be sent as both:
- `Authorization: Bearer <api-key>` header
- `X-API-Key: <api-key>` header

## Data Storage

Server configurations are stored in:
- **Windows**: `%APPDATA%/froggy-mcp-tester/mcp-servers.json`
- **macOS**: `~/Library/Application Support/froggy-mcp-tester/mcp-servers.json`
- **Linux**: `~/.config/froggy-mcp-tester/mcp-servers.json`

Window bounds (size and position) are also saved to preserve your preferred window layout.

## Project Structure

```
froggy-mcp-tester/
├── main.js           # Electron main process
├── preload.js        # Preload script for secure IPC
├── renderer.js       # Renderer process (UI logic)
├── mcp-client.js     # MCP client implementation
├── index.html        # Application UI
├── styles.css        # Application styles
└── package.json      # Project configuration
```

## Dependencies

- **electron**: ^28.0.0 - Electron framework
- **@modelcontextprotocol/sdk**: ^0.5.0 - MCP SDK for stdio transport

## Development

The application uses Electron's context isolation for security. The main process handles:
- Window management
- File system operations (saving/loading server configs)
- MCP client connections

The renderer process handles:
- UI rendering and user interactions
- Form validation
- Displaying results

Communication between processes uses Electron's IPC (Inter-Process Communication) through the preload script.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

