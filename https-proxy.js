const https = require("https");
const fs = require("fs");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const HTTP_PORT = 3000;
const HTTPS_PORT = 3001;

// Proxy middleware options
const options = {
  target: `http://localhost:${HTTP_PORT}`, // Target the running Next.js HTTP server
  changeOrigin: true, // Needed for virtual hosted sites
  ws: true, // Proxy websockets
  logLevel: "debug",
};

const apiProxy = createProxyMiddleware(options);

// Use the proxy middleware for all requests
app.use("/", apiProxy);

// HTTPS server options using your mkcert files
const httpsOptions = {
  key: fs.readFileSync("jwpai.uk+4-key.pem"), // Verify your key filename here
  cert: fs.readFileSync("jwpai.uk+4.pem"), // Verify your cert filename here
};

// Create the HTTPS server
https.createServer(httpsOptions, app).listen(HTTPS_PORT, () => {
  console.log(
    `HTTPS Proxy listening on https://localhost:${HTTPS_PORT} -> forwarding to http://localhost:${HTTP_PORT}`
  );
});
