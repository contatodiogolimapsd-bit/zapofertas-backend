const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CREDS_PATH = path.join(__dirname, '../../wa_creds_encrypted.json');
const SECRET_KEY = 'zapofertas-secret-key-v1'; // Em produção, usar process.env.SECRET_KEY

class CredsManager {
  static encrypt(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(SECRET_KEY.padEnd(32, '0')), iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  static decrypt(encryptedData) {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(SECRET_KEY.padEnd(32, '0')), iv);
    let decrypted = decipher.update(parts[1], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  static saveCreds(creds) {
    try {
      const encrypted = this.encrypt(creds);
      fs.writeFileSync(CREDS_PATH, JSON.stringify({ creds: encrypted, timestamp: new Date().toISOString() }));
      console.log('[CredsManager] ✅ Credenciais salvas com criptografia');
      return true;
    } catch (err) {
      console.error('[CredsManager] ❌ Erro ao salvar credenciais:', err.message);
      return false;
    }
  }

  static loadCreds() {
    try {
      if (!fs.existsSync(CREDS_PATH)) {
        console.log('[CredsManager] ℹ️  Nenhuma credencial salva ainda');
        return null;
      }

      const data = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
      const creds = this.decrypt(data.creds);
      console.log('[CredsManager] ✅ Credenciais carregadas (salvas em:', data.timestamp, ')');
      return creds;
    } catch (err) {
      console.error('[CredsManager] ❌ Erro ao carregar credenciais:', err.message);
      return null;
    }
  }

  static deleteCreds() {
    try {
      if (fs.existsSync(CREDS_PATH)) {
        fs.unlinkSync(CREDS_PATH);
        console.log('[CredsManager] ✅ Credenciais deletadas');
      }
    } catch (err) {
      console.error('[CredsManager] ❌ Erro ao deletar credenciais:', err.message);
    }
  }
}

module.exports = CredsManager;
