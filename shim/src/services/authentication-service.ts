import * as forge from 'node-forge';
// @ts-ignore - node-jose doesn't have types
import * as jose from 'node-jose';
import * as crypto from 'crypto';
import { CertificateService, CertificateInfo } from './certificate-service';
import { logger } from './logger';

export interface AuthConfig {
  idpUrl: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
}

export interface ChallengeResponse {
  challenge: string;
  state?: string;
  nonce?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}

export interface TokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export class AuthenticationService {
  private certificate?: CertificateInfo;
  
  /**
   * Set the certificate to use for authentication
   */
  setCertificate(certificate: CertificateInfo): void {
    if (!CertificateService.isCertificateValid(certificate)) {
      throw new Error('Certificate is not valid or expired');
    }
    this.certificate = certificate;
    logger.info('Certificate set for authentication', {
      subject: certificate.subject,
      validTo: certificate.validTo
    });
  }
  
  /**
   * Get challenge from IDP
   */
  async getChallenge(config: AuthConfig): Promise<ChallengeResponse> {
    try {
      logger.info('Requesting challenge from IDP', { idpUrl: config.idpUrl });
      
      const got = (await import('got')).default;
      const challengeUrl = `${config.idpUrl}/challenge`;
      
      const response = await got.get(challengeUrl, {
        searchParams: {
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
          scope: config.scope || 'openid',
          response_type: 'code'
        },
        responseType: 'json'
      });
      
      const challenge = response.body as ChallengeResponse;
      logger.info('Received challenge from IDP');
      
      return challenge;
    } catch (error) {
      logger.error('Failed to get challenge from IDP:', error);
      throw new Error(`Failed to get challenge: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Create signed JWS for challenge
   */
  createSignedChallenge(challenge: string): string {
    if (!this.certificate) {
      throw new Error('Certificate not set. Call setCertificate first.');
    }
    
    try {
      logger.info('Creating signed challenge');
      
      // Get certificate as base64 for x5c header
      const certBase64 = CertificateService.getCertificateAsBase64(this.certificate.certificate);
      
      // Create JWS header
      const header = {
        alg: 'BP256R1', // or 'RS256' depending on certificate type
        typ: 'JWT',
        x5c: [certBase64]
      };
      
      // Create JWS payload
      const payload = {
        njwt: challenge
      };
      
      // Encode header and payload
      const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
      const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
      
      // Create signing input
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      
      // Sign with private key
      const privateKey = CertificateService.getPrivateKeyFromPem(this.certificate.privateKey);
      const md = forge.md.sha256.create();
      md.update(signingInput, 'utf8');
      
      // Type assertion for forge PrivateKey
      const signature = (privateKey as any).sign(md);
      const encodedSignature = this.base64UrlEncode(forge.util.encode64(signature));
      
      // Combine to create JWS
      const jws = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
      
      logger.info('Successfully created signed challenge');
      return jws;
    } catch (error) {
      logger.error('Failed to create signed challenge:', error);
      throw new Error(`Failed to sign challenge: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Create JWE (encrypted challenge) for IDP
   * @param signedChallenge The signed JWS
   * @param idpPublicKeyPem IDP's public key in PEM format
   */
  async createEncryptedChallenge(signedChallenge: string, idpPublicKeyPem?: string): Promise<string> {
    try {
      logger.info('Creating encrypted challenge (JWE)');
      
      if (!idpPublicKeyPem) {
        // If no IDP public key provided, return signed challenge as-is
        logger.warn('No IDP public key provided, returning signed challenge without encryption');
        return signedChallenge;
      }
      
      // Import IDP public key
      const keystore = jose.JWK.createKeyStore();
      const key = await keystore.add(idpPublicKeyPem, 'pem');
      
      // Create JWE
      const jwe = await jose.JWE.createEncrypt({ format: 'compact' }, key)
        .update(signedChallenge)
        .final();
      
      logger.info('Successfully created encrypted challenge');
      return jwe as string;
    } catch (error) {
      logger.error('Failed to create encrypted challenge:', error);
      throw new Error(`Failed to encrypt challenge: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Send authorization request with signed challenge
   */
  async authorize(config: AuthConfig, signedChallenge: string, state?: string): Promise<string> {
    try {
      logger.info('Sending authorization request to IDP');
      
      const got = (await import('got')).default;
      const authUrl = `${config.idpUrl}/auth`;
      
      const response = await got.post(authUrl, {
        form: {
          signed_challenge: signedChallenge,
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
          response_type: 'code',
          state: state || '',
          scope: config.scope || 'openid'
        },
        followRedirect: false
      });
      
      // Extract authorization code from redirect
      const location = response.headers.location;
      if (!location) {
        throw new Error('No redirect location in authorization response');
      }
      
      const url = new URL(location);
      const code = url.searchParams.get('code');
      
      if (!code) {
        throw new Error('No authorization code in redirect');
      }
      
      logger.info('Received authorization code');
      return code;
    } catch (error) {
      logger.error('Failed to authorize:', error);
      throw new Error(`Authorization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(config: AuthConfig, code: string): Promise<TokenResponse> {
    try {
      logger.info('Exchanging authorization code for tokens');
      
      const got = (await import('got')).default;
      const tokenUrl = `${config.idpUrl}/token`;
      
      const response = await got.post(tokenUrl, {
        form: {
          grant_type: 'authorization_code',
          code: code,
          client_id: config.clientId,
          redirect_uri: config.redirectUri
        },
        responseType: 'json'
      });
      
      const tokens = response.body as TokenResponse;
      logger.info('Successfully received tokens');
      
      return tokens;
    } catch (error) {
      logger.error('Failed to exchange code for tokens:', error);
      throw new Error(`Token exchange failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Perform complete authentication flow
   */
  async authenticate(config: AuthConfig): Promise<TokenResponse> {
    if (!this.certificate) {
      throw new Error('Certificate not set. Call setCertificate first.');
    }
    
    try {
      logger.info('Starting authentication flow');
      
      // Step 1: Get challenge
      const challengeResponse = await this.getChallenge(config);
      
      // Step 2: Sign challenge
      const signedChallenge = this.createSignedChallenge(challengeResponse.challenge);
      
      // Step 3: Encrypt challenge (optional, depends on IDP)
      // For now, we'll skip encryption unless IDP public key is provided
      
      // Step 4: Send authorization request
      const authCode = await this.authorize(config, signedChallenge, challengeResponse.state);
      
      // Step 5: Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(config, authCode);
      
      logger.info('Authentication flow completed successfully');
      return tokens;
    } catch (error) {
      logger.error('Authentication flow failed:', error);
      throw error;
    }
  }
  
  /**
   * Base64 URL encode
   */
  private base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}
