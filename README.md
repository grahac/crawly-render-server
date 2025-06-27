
# Crawly Render Server
The Crawly Render Server is a simple Node.js application built using Express and Puppeteer. It provides an HTTP endpoint to render a web page using Puppeteer and return the rendered HTML content along with response headers. This server is particularly useful for situations where you need to obtain the fully rendered content of a web page, including JavaScript-generated content.

## Installation

1. Clone the repository:

``` sh
git clone https://github.com/yourusername/crawly-render-server.git
```

2. Open folder:
``` sh
cd crawly-render-server
```

3.
Install the dependencies:

``` sh
npm install
```

## Starting a render server

To start the Crawly Render Server, use the following command:

``` sh
node cluster.js
```

The server will listen on port 3000 by default. You can access the rendering endpoint at http://localhost:3000/render.


## Rendering a Web Page
To render a web page, send a POST request to the /render endpoint with the necessary parameters in the request body. The required parameter is url, which specifies the URL of the web page to render. You can also provide optional headers and options in the request body.

Example request using curl:

``` sh
curl -X POST \
  http://localhost:3000/render \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://example.com",
    "headers": {"User-Agent": "Custom User Agent"},
    "options": {"timeout": 5000}
  }'
```

### Form Submission
The render endpoint also supports form submission. You can provide form data and selectors to fill and submit forms on the target page.

Example request for form submission:

``` sh
curl -X POST \
  http://localhost:3000/render \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://example.com/contact",
    "formData": {
      "name": "John Doe",
      "email": "john.doe@example.com",
      "message": "Hello, this is a test message."
    },
    "formSelector": "form#contact-form",
    "submitSelector": "button[type=submit]"
  }'
```

Parameters:
- `formData`: Object containing field names and their values.
- `formSelector`: CSS selector for the form element.
- `submitSelector`: (Optional) CSS selector for the submit button. If not provided, the form will be submitted programmatically.

The response will include the resulting page after form submission.

### Tracking Supabase API Calls
The render server automatically tracks any Supabase API calls made by the rendered page. This includes API keys and authorization headers, which can be useful for security audits.

The response includes a `supabaseCalls` array with details about each call:

``` json
{
  "page": "...",
  "status": 200,
  "headers": { ... },
  "finalUrl": "https://example.com",
  "supabaseCalls": [
    {
      "url": "https://your-project.supabase.co/rest/v1/table",
      "method": "GET",
      "headers": {
        "apikey": "your-api-key",
        "authorization": "Bearer token"
      },
      "postData": "..."
    }
  ]
}
```

## Providing Chore Executable Path
If you need to provide a custom executable path for Chromium or Chrome, you can set the CHROME_EXECUTABLE_PATH environment variable before starting the server:

``` sh
CHROME_EXECUTABLE_PATH=/path/to/chromium npm start
```

## Running with Docker
To run the Crawly Render Server in a Docker container, follow these steps:

Build the Docker image:

``` sh
docker build -t crawly-render-server .
```

Run the Docker container:

``` sh
docker run -p 3000:3000 crawly-render-server
```

The server will be accessible at http://localhost:3000.

## Configuration
You can customize the Crawly Render Server by modifying the code in `cluster.js` For example, you can adjust the server port or Puppeteer launch options.

## License
This project is licensed under the MIT License - see the LICENSE file for details.