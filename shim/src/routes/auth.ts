import { Router, Request, Response } from 'express';
import { AuthenticationService, AuthConfig } from '../services/authentication-service';
import { certificateStore } from './certificates';
import { logger } from '../services/logger';

const router = Router();

/**
 * Authenticate using a stored certificate
 * POST /api/auth/authenticate
 */
router.post('/authenticate', async (req: Request, res: Response) => {
  try {
    const { certificateId, idpUrl, clientId, redirectUri, scope } = req.body;
    
    // Validate required fields
    if (!certificateId || !idpUrl || !clientId || !redirectUri) {
      return res.status(400).json({ 
        error: 'Missing required fields: certificateId, idpUrl, clientId, redirectUri' 
      });
    }
    
    // Get certificate from store
    const cert = certificateStore.get(certificateId);
    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    
    logger.info(`Initiating authentication with certificate: ${certificateId}`);
    
    // Create authentication service
    const authService = new AuthenticationService();
    authService.setCertificate(cert.info);
    
    // Configure authentication
    const config: AuthConfig = {
      idpUrl,
      clientId,
      redirectUri,
      scope: scope || 'openid'
    };
    
    // Perform authentication
    const tokens = await authService.authenticate(config);
    
    logger.info('Authentication completed successfully');
    
    res.json({
      success: true,
      tokens: {
        access_token: tokens.access_token,
        id_token: tokens.id_token,
        token_type: tokens.token_type,
        expires_in: tokens.expires_in,
        refresh_token: tokens.refresh_token
      }
    });
  } catch (error) {
    logger.error('Authentication failed:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      details: error.message 
    });
  }
});

/**
 * Get challenge from IDP
 * POST /api/auth/challenge
 */
router.post('/challenge', async (req: Request, res: Response) => {
  try {
    const { idpUrl, clientId, redirectUri, scope } = req.body;
    
    if (!idpUrl || !clientId || !redirectUri) {
      return res.status(400).json({ 
        error: 'Missing required fields: idpUrl, clientId, redirectUri' 
      });
    }
    
    const authService = new AuthenticationService();
    const config: AuthConfig = {
      idpUrl,
      clientId,
      redirectUri,
      scope: scope || 'openid'
    };
    
    const challenge = await authService.getChallenge(config);
    
    res.json({ challenge });
  } catch (error) {
    logger.error('Failed to get challenge:', error);
    res.status(500).json({ 
      error: 'Failed to get challenge',
      details: error.message 
    });
  }
});

/**
 * Sign a challenge with a certificate
 * POST /api/auth/sign
 */
router.post('/sign', async (req: Request, res: Response) => {
  try {
    const { certificateId, challenge } = req.body;
    
    if (!certificateId || !challenge) {
      return res.status(400).json({ 
        error: 'Missing required fields: certificateId, challenge' 
      });
    }
    
    const cert = certificateStore.get(certificateId);
    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    
    const authService = new AuthenticationService();
    authService.setCertificate(cert.info);
    
    const signedChallenge = authService.createSignedChallenge(challenge);
    
    res.json({ signedChallenge });
  } catch (error) {
    logger.error('Failed to sign challenge:', error);
    res.status(500).json({ 
      error: 'Failed to sign challenge',
      details: error.message 
    });
  }
});

export default router;
