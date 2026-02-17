# Quick Start Guide - Gematik Authenticator Shim

This guide will help you get the Gematik Authenticator Shim up and running quickly.

## Prerequisites

- Docker and Docker Compose installed
- A valid P12/PKCS#12 certificate file
- Certificate password
- Access to a Gematik-compatible Identity Provider (IDP)

## Step 1: Start the Service

```bash
cd shim
docker-compose up -d
```

Check if the service is running:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

## Step 2: Upload a Certificate

```bash
curl -X POST http://localhost:3000/api/certificates/upload \
  -F "certificate=@/path/to/your/certificate.p12" \
  -F "password=your-certificate-password" \
  -F "certId=my-cert"
```

Expected response:
```json
{
  "id": "my-cert",
  "subject": "CN=Dr. Example, O=Hospital, C=DE",
  "issuer": "CN=Gematik CA, O=Gematik, C=DE",
  "validFrom": "2024-01-01T00:00:00.000Z",
  "validTo": "2025-01-01T00:00:00.000Z",
  "fingerprint": "a1b2c3d4e5f6..."
}
```

## Step 3: Authenticate

```bash
curl -X POST http://localhost:3000/api/auth/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "certificateId": "my-cert",
    "idpUrl": "https://your-idp-url.com",
    "clientId": "your-client-id",
    "redirectUri": "http://localhost:3000/callback",
    "scope": "openid"
  }'
```

Expected response:
```json
{
  "success": true,
  "tokens": {
    "access_token": "eyJhbGciOiJSUzI1NiIs...",
    "id_token": "eyJhbGciOiJSUzI1NiIs...",
    "token_type": "Bearer",
    "expires_in": 3600
  }
}
```

## Step 4: Use the Tokens

Use the `access_token` or `id_token` to authenticate API requests to your target application:

```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  https://your-api.com/protected-endpoint
```

## Complete Example with Python

```python
import requests
import json

BASE_URL = "http://localhost:3000"

# 1. Upload certificate
with open('certificate.p12', 'rb') as f:
    response = requests.post(
        f"{BASE_URL}/api/certificates/upload",
        files={'certificate': f},
        data={
            'password': 'your-password',
            'certId': 'my-cert'
        }
    )
    print("Certificate uploaded:", response.json()['id'])

# 2. Authenticate
auth_data = {
    'certificateId': 'my-cert',
    'idpUrl': 'https://your-idp-url.com',
    'clientId': 'your-client-id',
    'redirectUri': f"{BASE_URL}/callback",
    'scope': 'openid'
}

response = requests.post(
    f"{BASE_URL}/api/auth/authenticate",
    json=auth_data
)

tokens = response.json()
print("Access Token:", tokens['tokens']['access_token'])

# 3. Use the token
headers = {
    'Authorization': f"Bearer {tokens['tokens']['access_token']}"
}

# Make authenticated request to your API
api_response = requests.get(
    'https://your-api.com/protected-endpoint',
    headers=headers
)
print("API Response:", api_response.json())
```

## Complete Example with Node.js

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

async function main() {
  // 1. Upload certificate
  const form = new FormData();
  form.append('certificate', fs.createReadStream('certificate.p12'));
  form.append('password', 'your-password');
  form.append('certId', 'my-cert');

  const uploadResponse = await axios.post(
    `${BASE_URL}/api/certificates/upload`,
    form,
    { headers: form.getHeaders() }
  );
  console.log('Certificate uploaded:', uploadResponse.data.id);

  // 2. Authenticate
  const authResponse = await axios.post(
    `${BASE_URL}/api/auth/authenticate`,
    {
      certificateId: 'my-cert',
      idpUrl: 'https://your-idp-url.com',
      clientId: 'your-client-id',
      redirectUri: `${BASE_URL}/callback`,
      scope: 'openid'
    }
  );

  const tokens = authResponse.data.tokens;
  console.log('Access Token:', tokens.access_token);

  // 3. Use the token
  const apiResponse = await axios.get(
    'https://your-api.com/protected-endpoint',
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    }
  );
  console.log('API Response:', apiResponse.data);
}

main().catch(console.error);
```

## Troubleshooting

### Service won't start
```bash
# Check logs
docker-compose logs -f

# Check if port 3000 is in use
lsof -i :3000

# Try a different port
docker-compose down
PORT=3001 docker-compose up -d
```

### Certificate upload fails
- Verify the file is a valid P12/PKCS#12 file
- Double-check the password
- Ensure the certificate is not expired

### Authentication fails
- Verify the IDP URL is correct and accessible
- Check that the client ID is valid
- Ensure the redirect URI matches the IDP configuration
- Check the logs: `docker-compose logs -f`

## Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Review the [ARCHITECTURE.md](../ARCHITECTURE.md) for technical details
- Set up proper security measures for production deployment
- Implement rate limiting
- Use HTTPS in production
- Configure CORS properly for your domains

## Stopping the Service

```bash
docker-compose down
```

## Viewing Logs

```bash
# All logs
docker-compose logs -f

# Last 100 lines
docker-compose logs --tail=100

# Specific service logs
docker logs gematik-authenticator-shim
```

## Production Deployment Checklist

- [ ] Use HTTPS/TLS certificates
- [ ] Implement rate limiting
- [ ] Configure CORS for specific origins
- [ ] Set up proper logging and monitoring
- [ ] Use environment variables for sensitive configuration
- [ ] Deploy behind a reverse proxy (nginx/traefik)
- [ ] Implement authentication for the shim API itself
- [ ] Regular certificate rotation
- [ ] Set up automated backups (if persisting certificates)
- [ ] Configure resource limits in docker-compose
- [ ] Enable Docker health checks
- [ ] Set up alerts for service failures
