# Gematik Authenticator Shim

A lightweight, non-interactive authentication service that provides programmatic access to SMB-C (Secure Medical Broadband - Cards) authentication using X.509 certificates. This shim allows applications to authenticate without user interaction.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Docker Deployment](#docker-deployment)
- [Configuration](#configuration)
- [Security Considerations](#security-considerations)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Overview

The Gematik Authenticator Shim extracts the core authentication functionality from the main Gematik Authenticator desktop application and provides it as a RESTful API service. It eliminates the need for user interaction during the authentication process, making it ideal for:

- Automated testing environments
- Backend service authentication
- CI/CD pipelines
- Development and testing environments
- Headless authentication workflows

## Features

- ✅ **Certificate Management**: Upload and manage P12/PKCS#12 certificates
- ✅ **Non-Interactive Authentication**: Fully automated OAuth/OIDC authentication flow
- ✅ **RESTful API**: Simple HTTP API for all operations
- ✅ **Slim Container**: Lightweight Docker image (~50MB)
- ✅ **Health Monitoring**: Built-in health check endpoint
- ✅ **Comprehensive Logging**: Structured logging with Winston
- ✅ **Security**: Non-root container user, input validation, CORS support
- ✅ **Production Ready**: Graceful shutdown, error handling, health checks

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Client Application                     │
└────────────┬────────────────────────────────────────────┘
             │ HTTP/REST API
             ▼
┌─────────────────────────────────────────────────────────┐
│              Gematik Authenticator Shim                 │
│                                                          │
│  ┌────────────────┐  ┌──────────────────────────────┐  │
│  │  API Endpoints │  │  Core Services               │  │
│  │  - /certificates│  │  - Certificate Service      │  │
│  │  - /auth       │  │  - Authentication Service    │  │
│  │  - /health     │  │  - Logger                    │  │
│  └────────────────┘  └──────────────────────────────┘  │
│                                                          │
└────────┬───────────────────────────────────────┬────────┘
         │                                       │
         │ OAuth/OIDC Flow                       │ Certificate Operations
         ▼                                       ▼
┌──────────────────┐                    ┌────────────────┐
│  Identity        │                    │  P12/PKCS#12   │
│  Provider (IDP)  │                    │  Certificates  │
└──────────────────┘                    └────────────────┘
```

## Installation

### Prerequisites

- Node.js 20+ or Docker
- P12/PKCS#12 certificate file with password
- Access to a Gematik-compatible Identity Provider (IDP)

### Option 1: Local Installation

```bash
cd shim
npm install
npm run build
npm start
```

### Option 2: Docker (Recommended)

```bash
cd shim
docker build -t gematik-shim:latest .
docker run -p 3000:3000 gematik-shim:latest
```

### Option 3: Docker Compose

```bash
cd shim
docker-compose up -d
```

## Usage

### Quick Start

1. **Start the shim service:**
   ```bash
   docker-compose up -d
   ```

2. **Upload a certificate:**
   ```bash
   curl -X POST http://localhost:3000/api/certificates/upload \
     -F "certificate=@/path/to/cert.p12" \
     -F "password=your-password" \
     -F "certId=my-cert"
   ```

3. **Authenticate:**
   ```bash
   curl -X POST http://localhost:3000/api/auth/authenticate \
     -H "Content-Type: application/json" \
     -d '{
       "certificateId": "my-cert",
       "idpUrl": "https://idp.example.com",
       "clientId": "your-client-id",
       "redirectUri": "http://localhost:3000/callback"
     }'
   ```

4. **Receive tokens:**
   ```json
   {
     "success": true,
     "tokens": {
       "access_token": "eyJ...",
       "id_token": "eyJ...",
       "token_type": "Bearer",
       "expires_in": 3600
     }
   }
   ```

## API Reference

### Health Check

**GET /health**

Check if the service is running.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

### Certificate Management

#### Upload Certificate

**POST /api/certificates/upload**

Upload and parse a P12/PKCS#12 certificate.

**Request:**
- Content-Type: `multipart/form-data`
- Fields:
  - `certificate`: P12 file (binary)
  - `password`: Certificate password (string)
  - `certId`: Optional certificate ID (string)

**Example:**
```bash
curl -X POST http://localhost:3000/api/certificates/upload \
  -F "certificate=@certificate.p12" \
  -F "password=mypassword" \
  -F "certId=cert-001"
```

**Response:**
```json
{
  "id": "cert-001",
  "subject": "CN=Dr. Smith, O=Hospital, C=DE",
  "issuer": "CN=Gematik CA, O=Gematik, C=DE",
  "validFrom": "2024-01-01T00:00:00.000Z",
  "validTo": "2025-01-01T00:00:00.000Z",
  "fingerprint": "a1b2c3..."
}
```

#### List Certificates

**GET /api/certificates**

List all uploaded certificates.

**Response:**
```json
{
  "certificates": [
    {
      "id": "cert-001",
      "subject": "CN=Dr. Smith, O=Hospital, C=DE",
      "validFrom": "2024-01-01T00:00:00.000Z",
      "validTo": "2025-01-01T00:00:00.000Z",
      "uploadedAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

#### Get Certificate

**GET /api/certificates/:id**

Get details of a specific certificate.

**Response:**
```json
{
  "id": "cert-001",
  "subject": "CN=Dr. Smith, O=Hospital, C=DE",
  "issuer": "CN=Gematik CA, O=Gematik, C=DE",
  "validFrom": "2024-01-01T00:00:00.000Z",
  "validTo": "2025-01-01T00:00:00.000Z",
  "fingerprint": "a1b2c3...",
  "uploadedAt": "2024-01-15T10:00:00.000Z"
}
```

#### Delete Certificate

**DELETE /api/certificates/:id**

Delete a certificate from the store.

**Response:**
```json
{
  "message": "Certificate deleted successfully"
}
```

### Authentication

#### Full Authentication Flow

**POST /api/auth/authenticate**

Perform complete authentication flow and receive tokens.

**Request:**
```json
{
  "certificateId": "cert-001",
  "idpUrl": "https://idp.example.com",
  "clientId": "your-client-id",
  "redirectUri": "http://localhost:3000/callback",
  "scope": "openid"
}
```

**Response:**
```json
{
  "success": true,
  "tokens": {
    "access_token": "eyJhbGciOiJSUzI1NiIs...",
    "id_token": "eyJhbGciOiJSUzI1NiIs...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_token": "eyJhbGciOiJSUzI1NiIs..."
  }
}
```

#### Get Challenge

**POST /api/auth/challenge**

Get an authentication challenge from the IDP.

**Request:**
```json
{
  "idpUrl": "https://idp.example.com",
  "clientId": "your-client-id",
  "redirectUri": "http://localhost:3000/callback",
  "scope": "openid"
}
```

**Response:**
```json
{
  "challenge": {
    "challenge": "base64-encoded-challenge",
    "state": "random-state",
    "nonce": "random-nonce"
  }
}
```

#### Sign Challenge

**POST /api/auth/sign**

Sign a challenge with a certificate.

**Request:**
```json
{
  "certificateId": "cert-001",
  "challenge": "base64-encoded-challenge"
}
```

**Response:**
```json
{
  "signedChallenge": "eyJhbGciOiJCUDI1NlIxIi..."
}
```

### OAuth Callback

**GET /callback**

OAuth redirect endpoint for receiving authorization codes.

**Query Parameters:**
- `code`: Authorization code
- `state`: State parameter
- `error`: Error message (if authentication failed)

## Docker Deployment

### Build Image

```bash
docker build -t gematik-shim:latest .
```

### Run Container

```bash
docker run -d \
  --name gematik-shim \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  -v $(pwd)/logs:/app/logs \
  gematik-shim:latest
```

### Using Docker Compose

```bash
# Start service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop service
docker-compose down
```

### Environment Variables

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Edit the `.env` file:

```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info
LOG_DIR=/app/logs
CERT_STORAGE_DIR=/app/uploads
ALLOWED_ORIGINS=http://localhost:3000,https://your-app.com
MAX_UPLOAD_SIZE=5mb
DEFAULT_IDP_URL=https://idp.example.com
DEFAULT_CLIENT_ID=your-client-id
DEFAULT_REDIRECT_URI=http://localhost:3000/callback
```

## Configuration

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `NODE_ENV` | `development` | Environment (development/production) |

### Logging Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Logging level (debug/info/warn/error) |
| `LOG_DIR` | `./logs` | Log file directory |

### Security Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_ORIGINS` | `*` | CORS allowed origins (comma-separated) |
| `MAX_UPLOAD_SIZE` | `5mb` | Maximum file upload size |

### IDP Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_IDP_URL` | - | Default IDP URL (optional) |
| `DEFAULT_CLIENT_ID` | - | Default client ID (optional) |
| `DEFAULT_REDIRECT_URI` | `http://localhost:3000/callback` | Default redirect URI |

## Security Considerations

### Production Deployment

1. **Use HTTPS**: Always use HTTPS in production
2. **Secure Origins**: Configure `ALLOWED_ORIGINS` to specific domains
3. **Certificate Storage**: Certificates are stored in memory only by default
4. **File Cleanup**: Uploaded P12 files are deleted after parsing
5. **Non-Root User**: Container runs as non-root user
6. **Input Validation**: All inputs are validated
7. **Secret Management**: Use environment variables for sensitive data

### Best Practices

- ✅ Rotate certificates regularly
- ✅ Use strong passwords for P12 files
- ✅ Monitor logs for suspicious activity
- ✅ Implement rate limiting in production
- ✅ Use secure network communication
- ✅ Keep the service behind a reverse proxy (nginx/traefik)

## Examples

### Python Client

```python
import requests

# Upload certificate
with open('certificate.p12', 'rb') as cert_file:
    response = requests.post(
        'http://localhost:3000/api/certificates/upload',
        files={'certificate': cert_file},
        data={'password': 'mypassword', 'certId': 'my-cert'}
    )
    cert_data = response.json()
    print(f"Uploaded certificate: {cert_data['id']}")

# Authenticate
auth_response = requests.post(
    'http://localhost:3000/api/auth/authenticate',
    json={
        'certificateId': 'my-cert',
        'idpUrl': 'https://idp.example.com',
        'clientId': 'your-client-id',
        'redirectUri': 'http://localhost:3000/callback'
    }
)
tokens = auth_response.json()
print(f"Access token: {tokens['tokens']['access_token']}")
```

### JavaScript/Node.js Client

```javascript
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

// Upload certificate
const form = new FormData();
form.append('certificate', fs.createReadStream('certificate.p12'));
form.append('password', 'mypassword');
form.append('certId', 'my-cert');

const certResponse = await axios.post(
  'http://localhost:3000/api/certificates/upload',
  form,
  { headers: form.getHeaders() }
);
console.log('Certificate uploaded:', certResponse.data.id);

// Authenticate
const authResponse = await axios.post(
  'http://localhost:3000/api/auth/authenticate',
  {
    certificateId: 'my-cert',
    idpUrl: 'https://idp.example.com',
    clientId: 'your-client-id',
    redirectUri: 'http://localhost:3000/callback'
  }
);
console.log('Tokens:', authResponse.data.tokens);
```

### cURL Examples

```bash
# Upload certificate
curl -X POST http://localhost:3000/api/certificates/upload \
  -F "certificate=@certificate.p12" \
  -F "password=mypassword" \
  -F "certId=my-cert"

# List certificates
curl http://localhost:3000/api/certificates

# Authenticate
curl -X POST http://localhost:3000/api/auth/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "certificateId": "my-cert",
    "idpUrl": "https://idp.example.com",
    "clientId": "your-client-id",
    "redirectUri": "http://localhost:3000/callback"
  }'

# Delete certificate
curl -X DELETE http://localhost:3000/api/certificates/my-cert
```

## Troubleshooting

### Common Issues

#### Certificate Upload Fails

**Problem:** "Failed to parse P12 certificate"
**Solution:** 
- Verify the password is correct
- Ensure the file is a valid P12/PKCS#12 file
- Check file is not corrupted

#### Authentication Fails

**Problem:** "Certificate not found"
**Solution:** Upload the certificate first using `/api/certificates/upload`

**Problem:** "Certificate is not valid or expired"
**Solution:** Check certificate validity dates

#### Connection Issues

**Problem:** Cannot connect to shim service
**Solution:** 
- Check if service is running: `docker-compose ps`
- Verify port 3000 is not in use: `lsof -i :3000`
- Check firewall settings

### Logs

View logs:
```bash
# Docker Compose
docker-compose logs -f

# Docker
docker logs -f gematik-shim

# Local
tail -f logs/combined.log
```

### Debug Mode

Enable debug logging:
```bash
# In .env file
LOG_LEVEL=debug

# Or as environment variable
docker run -e LOG_LEVEL=debug ...
```

## License

Copyright 2024 Gematik GmbH

EUROPEAN UNION PUBLIC LICENCE v. 1.2

See the [LICENSE](../LICENSE) file for details.

## Support

For issues and questions:
- Check the [main repository](../) documentation
- Review the [ARCHITECTURE.md](../ARCHITECTURE.md) file
- Check existing GitHub issues

## Contributing

This is a component of the main Gematik Authenticator project. Please refer to the main repository's contribution guidelines.
