# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Run/Test Commands
- Run server: `node cluster.js`
- Run single-file server: `node render.js`
- Run tests: `npx mocha test.js`
- Run single test: `npx mocha test.js -g "test name pattern"`
- Run with custom Chrome path: `CHROME_EXECUTABLE_PATH=/path/to/chrome node cluster.js`
- Run with custom concurrency: `MAX_CONCURRENCY=4 node cluster.js`

## Architecture Overview
This is a web scraping service that renders JavaScript-heavy pages using Puppeteer. The codebase consists of:

- `cluster.js` - Main production server using puppeteer-cluster for concurrent processing
- `render.js` - Single-instance server for development/testing
- `test.js` - Comprehensive test suite covering all rendering scenarios

The server provides a `/render` POST endpoint that accepts URLs and returns fully rendered HTML content, response headers, final URL after redirects, and tracks Supabase API calls made by the rendered page.

### Key Features
- Form submission automation with field filling and submission
- Network request interception to track Supabase API calls
- Custom header support for requests
- Concurrent processing via worker cluster
- Docker containerization support

## Code Style Guidelines
- Keep functions small and focused on a single responsibility
- Use async/await for asynchronous operations
- Log errors with descriptive messages
- Use consistent error handling patterns (try/catch blocks)
- Use camelCase for variable and function names
- Use consistent indentation (2 spaces)
- Include timeouts for network operations
- Properly close browser instances to prevent memory leaks
- Handle edge cases in user inputs and external services
- Use environment variables for configuration
- Include appropriate debug logging for operations