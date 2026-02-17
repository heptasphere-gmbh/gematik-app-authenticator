import { Router, Request, Response } from 'express';
import { CertificateService, CertificateInfo } from '../services/certificate-service';
import { logger } from '../services/logger';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// Define interface for stored certificates
interface StoredCertificate {
  id: string;
  info: CertificateInfo;
  uploadedAt: Date;
}

// In-memory store for certificates (in production, use a database)
const certificateStore = new Map<string, StoredCertificate>();

/**
 * Upload and parse P12 certificate
 * POST /api/certificates/upload
 */
router.post('/upload', async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { password, certId } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    
    const id = certId || `cert_${Date.now()}`;
    
    logger.info(`Processing certificate upload: ${id}`);
    
    // Parse P12 file
    const result = CertificateService.parseP12Certificate(req.file.path, password);
    
    if (!result.validCertificate) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: 'No valid certificate found in P12 file',
        certificates: result.certificates.map(c => ({
          subject: c.subject,
          validFrom: c.validFrom,
          validTo: c.validTo
        }))
      });
    }
    
    // Store certificate info
    certificateStore.set(id, {
      id,
      info: result.validCertificate,
      uploadedAt: new Date()
    });
    
    // Clean up uploaded file for security
    fs.unlinkSync(req.file.path);
    
    logger.info(`Certificate uploaded successfully: ${id}`);
    
    res.json({
      id,
      subject: result.validCertificate.subject,
      issuer: result.validCertificate.issuer,
      validFrom: result.validCertificate.validFrom,
      validTo: result.validCertificate.validTo,
      fingerprint: result.validCertificate.fingerprint
    });
  } catch (error) {
    logger.error('Failed to upload certificate:', error);
    
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

/**
 * List all uploaded certificates
 * GET /api/certificates
 */
router.get('/', (req: Request, res: Response) => {
  const certificates = Array.from(certificateStore.values()).map(cert => ({
    id: cert.id,
    subject: cert.info.subject,
    issuer: cert.info.issuer,
    validFrom: cert.info.validFrom,
    validTo: cert.info.validTo,
    fingerprint: cert.info.fingerprint,
    uploadedAt: cert.uploadedAt
  }));
  
  res.json({ certificates });
});

/**
 * Get certificate by ID
 * GET /api/certificates/:id
 */
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const cert = certificateStore.get(id);
  
  if (!cert) {
    return res.status(404).json({ error: 'Certificate not found' });
  }
  
  res.json({
    id: cert.id,
    subject: cert.info.subject,
    issuer: cert.info.issuer,
    validFrom: cert.info.validFrom,
    validTo: cert.info.validTo,
    fingerprint: cert.info.fingerprint,
    uploadedAt: cert.uploadedAt
  });
});

/**
 * Delete certificate by ID
 * DELETE /api/certificates/:id
 */
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  
  if (!certificateStore.has(id)) {
    return res.status(404).json({ error: 'Certificate not found' });
  }
  
  certificateStore.delete(id);
  logger.info(`Certificate deleted: ${id}`);
  
  res.json({ message: 'Certificate deleted successfully' });
});

// Export certificate store for use in other routes
export { certificateStore };
export default router;
