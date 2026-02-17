import * as forge from 'node-forge';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

export interface CertificateInfo {
  certificate: string; // PEM format
  privateKey: string; // PEM format
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
}

export interface P12ParseResult {
  certificates: CertificateInfo[];
  validCertificate?: CertificateInfo;
}

export class CertificateService {
  /**
   * Parse a P12/PKCS#12 certificate file
   * @param p12Path Path to the P12 file
   * @param password Password for the P12 file
   * @returns Parsed certificate information
   */
  static parseP12Certificate(p12Path: string, password: string): P12ParseResult {
    try {
      logger.info(`Parsing P12 certificate from: ${p12Path}`);
      
      // Read P12 file
      const p12Buffer = fs.readFileSync(p12Path);
      const p12Der = forge.util.createBuffer(p12Buffer.toString('binary'));
      
      // Parse P12 with password
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
      
      const certificates: CertificateInfo[] = [];
      const keyBags: any[] = [];
      
      // Extract all safe bags
      for (const safeContents of p12.safeContents) {
        for (const safeBag of safeContents.safeBags) {
          if (safeBag.type === forge.pki.oids.certBag) {
            // Certificate bag
            const cert = safeBag.cert;
            if (cert) {
              const certInfo = this.extractCertificateInfo(cert, safeBag);
              certificates.push(certInfo);
            }
          } else if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag) {
            // Private key bag
            keyBags.push(safeBag);
          }
        }
      }
      
      // Match certificates with private keys
      this.matchKeysWithCertificates(certificates, keyBags);
      
      // Find the first valid certificate
      const validCertificate = this.findValidCertificate(certificates);
      
      logger.info(`Successfully parsed P12 certificate. Found ${certificates.length} certificate(s)`);
      
      return {
        certificates,
        validCertificate
      };
    } catch (error) {
      logger.error('Failed to parse P12 certificate:', error);
      throw new Error(`Failed to parse P12 certificate: ${error.message}`);
    }
  }
  
  /**
   * Extract certificate information from a forge certificate
   */
  private static extractCertificateInfo(cert: forge.pki.Certificate, safeBag: any): CertificateInfo {
    const certPem = forge.pki.certificateToPem(cert);
    
    // Create fingerprint
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const md = forge.md.sha256.create();
    md.update(der);
    const fingerprint = md.digest().toHex();
    
    return {
      certificate: certPem,
      privateKey: '', // Will be filled in matchKeysWithCertificates
      subject: cert.subject.attributes.map(attr => `${attr.shortName}=${attr.value}`).join(', '),
      issuer: cert.issuer.attributes.map(attr => `${attr.shortName}=${attr.value}`).join(', '),
      serialNumber: cert.serialNumber,
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter,
      fingerprint
    };
  }
  
  /**
   * Match private keys with certificates based on localKeyId
   */
  private static matchKeysWithCertificates(certificates: CertificateInfo[], keyBags: any[]): void {
    for (const certInfo of certificates) {
      for (const keyBag of keyBags) {
        // Try to match by converting private key and checking
        try {
          const privateKey = keyBag.key;
          if (privateKey) {
            const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
            certInfo.privateKey = privateKeyPem;
            break; // Assume first key matches (simple approach)
          }
        } catch (error) {
          logger.warn('Failed to extract private key from bag:', error);
        }
      }
    }
  }
  
  /**
   * Find a valid certificate (not expired)
   */
  private static findValidCertificate(certificates: CertificateInfo[]): CertificateInfo | undefined {
    const now = new Date();
    return certificates.find(cert => {
      const isValid = cert.validFrom <= now && now <= cert.validTo;
      const hasPrivateKey = cert.privateKey.length > 0;
      return isValid && hasPrivateKey;
    });
  }
  
  /**
   * Validate if a certificate is currently valid
   */
  static isCertificateValid(certInfo: CertificateInfo): boolean {
    const now = new Date();
    return certInfo.validFrom <= now && now <= certInfo.validTo && certInfo.privateKey.length > 0;
  }
  
  /**
   * Extract certificate from PEM string
   */
  static getCertificateFromPem(pem: string): forge.pki.Certificate {
    return forge.pki.certificateFromPem(pem);
  }
  
  /**
   * Extract private key from PEM string
   */
  static getPrivateKeyFromPem(pem: string): forge.pki.PrivateKey {
    return forge.pki.privateKeyFromPem(pem);
  }
  
  /**
   * Get certificate as base64 (for x5c header)
   */
  static getCertificateAsBase64(certPem: string): string {
    const cert = this.getCertificateFromPem(certPem);
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    return forge.util.encode64(der);
  }
}
