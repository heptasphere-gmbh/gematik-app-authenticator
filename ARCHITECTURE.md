# Gematik Authenticator - Architectural Overview

## Overview

The Gematik Authenticator is an Electron-based desktop application that provides secure SMB-C (Secure Medical Broadband - Cards) authentication using X.509 certificates. It enables healthcare professionals to authenticate to digital health applications using smartcard-based credentials.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Application                     │
├───────────────────────────┬─────────────────────────────────┤
│    Renderer Process       │       Main Process              │
│    (Vue3 + TypeScript)    │       (Node.js)                 │
│                           │                                 │
│  ┌─────────────────────┐ │  ┌──────────────────────────┐  │
│  │  UI Components      │ │  │  IPC Event Handlers      │  │
│  │  - Home Screen      │ │  │  - Certificate Mgmt      │  │
│  │  - Settings         │ │  │  - Credentials Storage   │  │
│  │  - Auth Flow        │ │  │  - File Operations       │  │
│  └─────────────────────┘ │  └──────────────────────────┘  │
│            │              │              │                  │
│  ┌─────────────────────┐ │  ┌──────────────────────────┐  │
│  │  Vuex Store         │ │  │  Core Services           │  │
│  │  - IDP Module       │ │  │  - HTTP Client           │  │
│  │  - Connector Module │ │  │  - P12 Cert Service      │  │
│  │  - Settings Module  │ │  │  - Logging Service       │  │
│  └─────────────────────┘ │  │  - Credentials Manager   │  │
│            │              │  └──────────────────────────┘  │
│  ┌─────────────────────┐ │              │                  │
│  │  Preload API Bridge │◄┼──────────────┘                  │
│  │  - window.api.*     │ │                                 │
│  └─────────────────────┘ │                                 │
└───────────────────────────┴─────────────────────────────────┘
            │                           │
            │                           │
            ▼                           ▼
┌────────────────────────┐  ┌────────────────────────────┐
│  Identity Provider     │  │  Konnektor (Connector)     │
│  (IDP)                 │  │  - Smartcard Operations    │
│  - OAuth/OIDC          │  │  - PIN Verification        │
│  - Challenge/Response  │  │  - Certificate Reading     │
│  - Token Endpoint      │  │  - Signing Operations      │
└────────────────────────┘  └────────────────────────────┘
```

## Core Components

### 1. Main Process (`src/main/`)

The main process handles system-level operations and provides secure APIs to the renderer process.

#### Key Files:
- **main.ts**: Application lifecycle, window creation, protocol handling
- **preload-api.ts**: Exposes secure APIs to renderer via context bridge
- **event-listeners.ts**: IPC handlers for cross-process communication

#### Core Services (`src/main/services/`):

| Service | Purpose |
|---------|---------|
| `p12-certificate-service.ts` | P12/PKCS#12 certificate parsing, validation, and private key extraction |
| `http-client.ts` | HTTP/HTTPS client with proxy support, mTLS, and cookie management |
| `credentials-manager.ts` | Secure credential storage using OS keychain (Windows Credential Manager/macOS Keychain) |
| `logging.ts` | Winston-based logging with daily rotation |
| `url-service.ts` | Deep link handling for authentication flow initiation |
| `proxyResolver.ts` | OS-level proxy configuration resolution |
| `read-root-certs.ts` | TLS certificate chain management |

### 2. Renderer Process (`src/renderer/`)

Vue3-based UI that manages user interactions and authentication workflows.

#### Key Modules:

**gem-idp** (Identity Provider Integration):
- Challenge/response authentication flow
- JWT/JWS creation and signing
- JWE encryption using IDP public keys
- Token management

**connector** (Smartcard/Konnektor Interface):
- SOAP-based communication with Konnektor
- Card enumeration and certificate reading
- PIN verification
- Digital signature creation
- Mock mode for testing without physical hardware

**settings**:
- Configuration management
- Certificate validation
- Proxy settings

## Authentication Flow

```
┌─────────────┐
│   User      │
│  Initiates  │
│    Auth     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  1. Get Challenge from IDP                              │
│     GET {idp_url}/challenge                             │
│     Response: { challenge, state, redirect_uri, ... }   │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  2. Create Unsigned JWS                                 │
│     - Extract certificate from smartcard/P12           │
│     - Build JWS header: { alg, x5c: [cert], typ }      │
│     - Build payload: { njwt: challenge }               │
│     - Hash payload with SHA-256                        │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  3. Sign Challenge via Konnektor                        │
│     - Send hash to Konnektor SOAP API                  │
│     - Smartcard signs using private key                │
│     - Convert DER signature to concatenated format     │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  4. Create JWE (Encrypted Challenge)                    │
│     - Encrypt signed JWS with IDP public key           │
│     - Use node-jose for JWE creation                   │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  5. Send Authorization Request                          │
│     POST {idp_url}/auth                                 │
│     Body: signed_challenge=<JWE>                        │
│     Response: authorization_code                        │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  6. Exchange Code for Tokens                            │
│     POST {idp_url}/token                                │
│     Response: { id_token, access_token, ... }          │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│ Authenticated│
│     User     │
└─────────────┘
```

## Certificate Handling

### P12 Certificate Processing

```
P12 File (PKCS#12)
    │
    ▼
node-forge.pkcs12.pkcs12FromAsn1()
    │
    ├─► SafeContents
    │   └─► SafeBags
    │       ├─► certBag → X.509 Certificates
    │       └─► pkcs8ShroudedKeyBag → Private Keys
    │
    ├─► Match certificate to private key (via localKeyId)
    │
    ├─► Validate certificate expiration
    │
    └─► Extract PEM-encoded certificate and key
```

### Certificate Types Supported:
- **RSA**: Full support for parsing and operations
- **ECC (Elliptic Curve)**: Supported for authentication
- **SMC-B**: Medical institution cards
- **HBA**: Healthcare professional cards

### TLS Configuration:
```typescript
{
  hostname: '127.0.0.1',
  port: 443,
  pfxFile: '/path/to/certificate.p12',
  pfxPassword: 'password',
  keyFile: '/path/to/key.pem',    // Alternative to PFX
  certFile: '/path/to/cert.pem',   // Alternative to PFX
  rejectUnauthorized: false
}
```

## IPC Communication

### Main ↔ Renderer Communication Channels:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `IPC_READ_CREDENTIALS` | R→M | Retrieve stored credentials from keytar |
| `IPC_SAVE_CREDENTIALS` | R→M | Store credentials in OS keychain |
| `IPC_READ_CERTIFICATES` | R→M | Read system trust store certificates |
| `IPC_GET_PROXY` | R→M | Resolve OS proxy configuration |
| `IPC_SELECT_FOLDER` | R→M | Open file/folder picker dialog |
| `IPC_GET_PATH` | R→M | Get application paths |
| `IPC_READ_MAIN_PROCESS_ENVS` | R→M | Read environment variables |
| `IPC_WARN_USER` | M→R | Display error/warning dialogs |

### Preload API Exposure:

```typescript
window.api = {
  httpGet(url, config),
  httpPost(url, envelope, config),
  readCredentials(service, account),
  saveCredentials(service, account, password),
  selectFolder(defaultPath, properties),
  getPath(name),
  // ... more APIs
}
```

## HTTP Client Architecture

The custom HTTP client (`http-client.ts`) provides:

- **Mutual TLS (mTLS)**: Certificate-based authentication
- **Proxy Support**: Automatic OS proxy detection
- **Cookie Management**: Session persistence
- **Custom Headers**: Per-request configuration
- **Certificate Chains**: Full chain validation
- **Error Handling**: Comprehensive error responses

```typescript
httpClient(
  method: 'GET' | 'POST',
  url: string,
  config: {
    headers?: Record<string, string>,
    cookies?: Cookie[],
    proxy?: ProxyConfig,
    tlsEntryOptions?: TLSOptions,
    timeout?: number
  },
  envelope?: any  // Request body for POST
)
```

## Security Features

### Credential Storage:
- **Windows**: Windows Credential Manager
- **macOS**: Keychain
- **Linux**: libsecret
- **Library**: keytar (native binding)

### Stored Credentials:
```
Service: "smcb_pin" → Account: "user" → Password: "123456"
Service: "hba_pin" → Account: "user" → Password: "654321"
Service: "idp_config" → Account: "config" → Password: JSON config
Service: "connector_config" → Account: "config" → Password: JSON config
```

### Certificate Validation:
- Expiration date checking
- Certificate chain validation
- Private key matching
- PIN protection (via Konnektor)

## Technology Stack

### Frontend:
- **Framework**: Vue 3 (Composition API)
- **State Management**: Vuex 4
- **Routing**: Vue Router 4
- **Styling**: TailwindCSS 4
- **Internationalization**: vue-i18n

### Backend/Main Process:
- **Runtime**: Electron 35, Node.js
- **HTTP Client**: got
- **Crypto**: node-forge, node-jose, @peculiar/x509
- **Logging**: winston, winston-daily-rotate-file

### Build Tools:
- **Bundler**: Webpack 5
- **Compiler**: Babel, TypeScript 5
- **Testing**: Jest 29
- **Linting**: ESLint 9, Prettier 3
- **Packaging**: Electron Builder 24

### Key Libraries:
```json
{
  "crypto": ["node-forge", "node-jose", "@peculiar/x509"],
  "http": ["got", "hpagent"],
  "jwt": ["jsonwebtoken"],
  "storage": ["keytar"],
  "xml": ["xml2js", "sax"]
}
```

## Mock Mode

The application includes a mock mode (`MOCK_MODE=ENABLED`) that simulates Konnektor operations without physical hardware:

- **Mock Connector**: Simulates SOAP responses
- **Mock Cards**: Pre-configured test certificates
- **Mock Signing**: Generates signatures without smartcards
- **Development**: Enables functional testing

Build with mock mode:
```bash
npm run mock:build
```

## User Interaction Points

These are the primary user interactions that need automation for the shim:

1. **P12 File Selection**: User browses for certificate file
2. **P12 Password Entry**: User enters certificate password
3. **PIN Entry**: User enters smartcard PIN
4. **Certificate Selection**: User chooses from available certificates
5. **IDP Configuration**: User enters IDP endpoints
6. **Authorization Grant**: OAuth consent (usually automatic)

## Integration Points for Shim

To create a non-interactive authentication shim, the following components can be reused:

### Core Services (from `src/main/services/`):
- `p12-certificate-service.ts` → Certificate parsing
- `http-client.ts` → HTTP operations
- `logging.ts` → Logging

### Renderer Modules (from `src/renderer/modules/`):
- `gem-idp/signing-service.ts` → JWS/JWT creation
- `gem-idp/create-jwe.ts` → JWE encryption
- `gem-idp/services/` → IDP communication

### Required Dependencies:
```
node-forge, node-jose, got, winston, @peculiar/x509
```

### API Requirements:
1. Certificate upload endpoint
2. Authentication initiation endpoint
3. Callback/redirect handler
4. Health check endpoint

## Environment Configuration

Key environment variables:
```
NODE_ENV=development|production
MOCK_MODE=ENABLED|DISABLED
LOG_LEVEL=debug|info|warn|error
```

Configuration files:
- `app-config.js` → Application settings
- `.env` → Environment variables (not committed)

## Logging

Winston logging configuration:
- **Daily Rotation**: Logs rotate daily
- **Levels**: error, warn, info, debug
- **Location**: Platform-specific (e.g., `~/Library/Logs/authenticator/`)
- **Format**: JSON with timestamps

## Directory Structure

```
gematik-app-authenticator/
├── src/
│   ├── main/              # Electron main process
│   │   ├── services/      # Core services (HTTP, certs, logging)
│   │   ├── main.ts        # Entry point
│   │   └── preload-api.ts # API bridge
│   └── renderer/          # Vue3 application
│       ├── modules/       # Feature modules
│       │   ├── gem-idp/   # IDP authentication
│       │   ├── connector/ # Smartcard interface
│       │   ├── settings/  # Configuration
│       │   └── home/      # Main UI
│       ├── components/    # Shared Vue components
│       ├── store.ts       # Vuex store
│       └── router.ts      # Vue Router
├── tests/
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
├── build/                 # Build scripts
├── docs/                  # Documentation
└── credential-management/ # Windows Credential Manager
```

## Summary

The Gematik Authenticator is a sophisticated Electron application that provides secure, certificate-based authentication for healthcare applications. It integrates with:

1. **Identity Providers** via OAuth/OIDC
2. **Konnektors** via SOAP for smartcard operations
3. **OS Credential Stores** for secure credential management
4. **System Certificate Stores** for TLS validation

The architecture is modular and allows extraction of core authentication logic for use in headless/automated scenarios, making it ideal for creating a non-interactive "shim" component.
