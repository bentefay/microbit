// Loaded before PXT serve. Browser egress is separate from Docker networking.
// Keep editor assets and requests local; remote docs/sign-in/extensions are disabled.
const http = require('node:http');
const original = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (...args) {
  this.setHeader('Content-Security-Policy', [
    "default-src 'self' data: blob:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' ws://localhost:3233 ws://127.0.0.1:3233",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; '));
  return original.apply(this, args);
};
