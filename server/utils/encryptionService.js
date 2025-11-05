const crypto = require('crypto');
const { logger } = require('./logger');

const algorithm = 'aes-256-gcm';
const masterKey = Buffer.from(process.env.ENCRYPTION_MASTER_KEY, 'hex');

exports.encrypt = (text, key) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
};

exports.decrypt = (encryptedText, key) => {
  try {
    const [ivHex, encryptedHex, authTagHex] = encryptedText.split(':');
    if (!ivHex || !encryptedHex || !authTagHex) {
        logger.warn('[EncryptionService] Invalid encrypted text format for decryption.');
        return null;
    }
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    logger.error('[EncryptionService] Decryption failed', { error: error.message });
    return null;
  }
};

exports.generateDEK = () => crypto.randomBytes(32);

exports.encryptDEK = (dek) => exports.encrypt(dek.toString('hex'), masterKey);

exports.decryptDEK = (encryptedDek) => {
  if (!encryptedDek) return null;
  const decryptedHex = exports.decrypt(encryptedDek, masterKey);
  return decryptedHex ? Buffer.from(decryptedHex, 'hex') : null;
};