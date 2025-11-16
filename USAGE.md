# Froggy MCP Tester - User Guide

Welcome to **Froggy MCP Tester**, an Electron application for testing Model Context Protocol (MCP) servers. This guide will help you get started and make the most of the application.

## Table of Contents

- [Getting Started](#getting-started)
- [Starting the Application](#starting-the-application)
- [Adding MCP Servers](#adding-mcp-servers)
- [Using Tools](#using-tools)
- [Managing Servers](#managing-servers)
- [Understanding Transport Types](#understanding-transport-types)
- [Working with Parameters](#working-with-parameters)
- [Troubleshooting](#troubleshooting)
- [Keyboard Shortcuts & Tips](#keyboard-shortcuts--tips)

---

## Getting Started

### Prerequisites

Before using Froggy MCP Tester, ensure you have:
- **Node.js** (version 14 or higher) installed on your system
- **npm** (comes with Node.js)
- Access to the MCP server you want to test (local or remote)

### Installation

1. Clone or download this repository
2. Install dependencies by running:
   ```bash
   npm install
   ```

---

## Starting the Application

### Production Mode

To start the application in production mode:
```bash
npm start
```

### Development Mode

To start the application in development mode (with additional debugging):
```bash
npm run dev
```

The application window will open and display the main interface.

---

## Adding MCP Servers

To test an MCP server, you first need to add it to the application.

### Steps to Add a Server

1. Click the **"+ Add Server"** button in the top-left corner of the application
2. Fill in the server configuration form:
   - **Server Name**: Enter a descriptive name for your server (e.g., "My Local Server" or "Production API")
   - **Transport Type**: Choose between:
     - **Stdio (Command)**: For local processes
     - **REST (HTTP/HTTPS)**: For remote HTTP/HTTPS endpoints
   - **Server Address**: Enter the command or URL based on your transport type
   - **API Key** (REST only): Optionally provide an API key for authentication
3. Click **Save** to add the server

The server will now appear in the left panel's server list.

### Server Address Examples

**For Stdio Transport:**
- `node server.js`
- `python mcp_server.py`
- `node /path/to/mcp-server.js --config config.json`
- `python -m mcp_server --port 8080`

**For REST Transport:**
- `https://api.example.com/mcp`
- `http://localhost:8080/mcp`
- `https://mcp.example.com/v1`

---

## Using Tools

Once you've added a server, you can view and execute its available tools.

### Viewing Available Tools

1. Click on a server name in the left panel to select it
2. The right panel will display all available tools from that server
3. Each tool shows:
   - **Tool Name**: The identifier of the tool
   - **Description**: What the tool does
   - **Parameters**: Required and optional parameters needed to execute the tool

### Executing a Tool

1. Find the tool you want to execute in the tools panel
2. Review the parameters section to understand what inputs are needed
   - Parameters marked with an asterisk (*) are **required**
   - Parameters without an asterisk are **optional**
3. Fill in the parameter values in the form fields:
   - **Text/Number**: Enter values directly in the input field
   - **Boolean**: Check or uncheck the checkbox
   - **Objects/Complex JSON**: Enter JSON in the textarea field (see [Working with Parameters](#working-with-parameters))
   - **Arrays**: Enter comma-separated values or JSON array format
4. Click the **"Execute Tool"** button
5. View the results below the tool form:
   - **Success**: Results will be displayed in a formatted JSON view
   - **Error**: Error messages will be shown with details

### Refreshing Tools

If the server's available tools change, click the **"Refresh"** button in the tools panel header to reload the tool list.

---

## Managing Servers

### Editing a Server

1. Click the **"Edit"** button next to the server you want to modify
2. Update the configuration fields as needed
3. Click **"Save"** to apply changes

### Deleting a Server

1. Click the **"Delete"** button next to the server you want to remove
2. Confirm the deletion when prompted
3. The server configuration will be permanently removed

**Note**: Deleting a server does not affect the actual MCP server - it only removes the configuration from this application.

---

## Understanding Transport Types

Froggy MCP Tester supports two transport types for connecting to MCP servers:

### Stdio Transport

The **Stdio** transport runs MCP servers as local processes on your machine. This is ideal for:
- Testing local development servers
- Servers that run as command-line applications
- Development and debugging scenarios

**How it works:**
- The application spawns a process using the command you provide
- Communication happens via standard input/output (stdio)
- The process must be available in your system's PATH or you must provide the full path

**Example Commands:**
```
node server.js
python mcp_server.py
/usr/local/bin/my-mcp-server --config config.json
```

### REST Transport

The **REST** transport connects to MCP servers over HTTP/HTTPS. This is ideal for:
- Remote servers accessible via network
- Production deployments
- Servers hosted on cloud platforms

**How it works:**
- The application makes HTTP POST requests to the specified URL
- Communication uses JSON-RPC 2.0 protocol
- Supports HTTPS for secure connections

**Authentication:**
- Optionally provide an API key when configuring a REST server
- The API key is sent in two headers:
  - `Authorization: Bearer <api-key>`
  - `X-API-Key: <api-key>`

**Example URLs:**
```
https://api.example.com/mcp
http://localhost:8080/mcp
https://mcp.example.com/v1
```

---

## Working with Parameters

Tools may require various types of parameters. Here's how to input them correctly:

### Text Parameters

Enter text directly in the input field:
```
Example: "Hello World"
```

### Number Parameters

Enter numeric values:
```
Example: 42
Example: 3.14
```

### Boolean Parameters

Use the checkbox:
- ✅ Checked = `true`
- ☐ Unchecked = `false`

### Object Parameters

Enter JSON in the textarea field:
```json
{
  "key1": "value1",
  "key2": 123,
  "key3": {
    "nested": "value"
  }
}
```

### Array Parameters

**For simple arrays**, use comma-separated values:
```
item1, item2, item3
```

**For complex arrays**, use JSON format:
```json
[
  {"name": "Item 1", "value": 10},
  {"name": "Item 2", "value": 20}
]
```

### Common JSON Input Errors

❌ **Incorrect:**
```json
{
  "key": "value"  // Missing comma, invalid syntax
}
```

✅ **Correct:**
```json
{
  "key": "value"
}
```

❌ **Incorrect:**
```json
{
  key: "value"  // Keys must be quoted
}
```

✅ **Correct:**
```json
{
  "key": "value"
}
```

---

## Troubleshooting

### Server Connection Issues

**Problem**: Cannot connect to stdio server
- **Solution**: 
  - Verify the command is correct and the executable exists
  - Check that the command is in your system PATH
  - Try using the full path to the executable
  - Ensure the server script has proper permissions to execute

**Problem**: Cannot connect to REST server
- **Solution**:
  - Verify the URL is correct and accessible
  - Check your internet connection (for remote servers)
  - Ensure the server is running and accepting connections
  - Verify firewall settings aren't blocking the connection
  - Check if authentication is required and API key is correct

**Problem**: "Server returned HTML instead of JSON" error
- **Solution**:
  - The endpoint may not exist or may have returned an error page
  - Verify the URL points to the correct MCP REST endpoint
  - Check the server logs for errors
  - Review the debug information shown in the result panel

### Tool Execution Issues

**Problem**: Tool execution fails with parameter error
- **Solution**:
  - Review the tool's parameter requirements
  - Ensure all required parameters (marked with *) are filled
  - Verify parameter types match what's expected
  - For JSON parameters, validate the JSON syntax is correct
  - Check that number inputs are valid numbers

**Problem**: Tool returns unexpected results
- **Solution**:
  - Review the tool description to understand expected behavior
  - Check the debug information in the result panel
  - Verify parameter values are correct
  - Consult the MCP server documentation

### UI Issues

**Problem**: Window layout is not saved
- **Solution**:
  - The application should automatically save window size and position
  - Check that you have write permissions in the application data directory
  - Restart the application to reset window bounds

**Problem**: Panel sizes reset
- **Solution**:
  - The server panel width is saved automatically
  - Drag the resize handle between panels to adjust
  - The width should persist between sessions

---

## Keyboard Shortcuts & Tips

### General Tips

- **Panel Resizing**: Drag the resize handle between the server list and tools panel to adjust widths
- **Modal Closing**: Click outside the modal or press Escape to close server configuration dialogs
- **Parameter Validation**: Required fields are marked with an asterisk (*)
- **Auto-refresh**: Tools are loaded when you select a server - use the Refresh button to reload

### Best Practices

1. **Name Servers Clearly**: Use descriptive names that help you identify servers quickly (e.g., "Local Dev Server", "Production API")

2. **Test Connections First**: After adding a server, select it to verify tools load correctly before executing complex operations

3. **Review Tool Descriptions**: Always read the tool description and parameter details before execution

4. **Save Important Configurations**: Server configurations are automatically saved, but keep backups of important setups

5. **Use Debug Information**: When errors occur, review the debug information in the result panel to understand what was sent and received

---

## Data Storage

Your server configurations are automatically saved to your system's application data directory:

- **Windows**: `%APPDATA%/froggy-mcp-tester/mcp-servers.json`
- **macOS**: `~/Library/Application Support/froggy-mcp-tester/mcp-servers.json`
- **Linux**: `~/.config/froggy-mcp-tester/mcp-servers.json`

Window size, position, and panel widths are also saved to preserve your preferred layout.

**Note**: API keys are stored in plain text in the configuration file. Keep this file secure, especially in shared environments.

---

## Additional Resources

For more information about:
- **Model Context Protocol**: Visit the official MCP documentation
- **This Application**: Check the README.md file for technical details
- **Issues or Bugs**: Report them on the project's issue tracker

---

## Quick Reference

| Action | Steps |
|--------|-------|
| Add Server | Click "+ Add Server" → Fill form → Click "Save" |
| View Tools | Click server name in left panel |
| Execute Tool | Fill parameters → Click "Execute Tool" |
| Edit Server | Click "Edit" button → Modify → Click "Save" |
| Delete Server | Click "Delete" → Confirm |
| Refresh Tools | Click "Refresh" button in tools panel |

---

**Happy Testing!** 🐸

If you encounter any issues or have questions, please refer to the troubleshooting section or consult the project documentation.

