require('dotenv').config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidGroup,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const fs = require('fs');
const EventEmitter = require('events');

class WhatsAppService extends EventEmitter {
  constructor() {
    super();
    this.sock = null;
    this.qrCode = null;
    this.status = 'disconnected';
    this.groups = [];
    this.authDir = process.env.WA_AUTH_DIR || './wa_auth';
    this.retryCount = 0;
    this.maxRetries = 5;
  }

  async connect() {
    if (this.status === 'connecting' || this.status === 'qr_ready') return;

    try {
      this.status = 'connecting';
      this.emit('status', { status: 'connecting' });

      if (!fs.existsSync(this.authDir)) {
        fs.mkdirSync(this.authDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['ZapOfertas', 'Chrome', '120.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCode = await QRCode.toDataURL(qr);
            this.status = 'qr_ready';
            this.emit('qr', { qrCode: this.qrCode });
            console.log('[WhatsApp] QR Code gerado');
          } catch (err) {
            console.error('[WhatsApp] Erro ao gerar QR:', err);
          }
        }

        if (connection === 'open') {
          this.status = 'connected';
          this.qrCode = null;
          this.retryCount = 0;
          this.emit('status', { status: 'connected' });
          console.log('[WhatsApp] Conectado!');
          setTimeout(() => this.loadGroups(), 3000);
        }

        if (connection === 'close') {
          const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
          const shouldReconnect = code !== DisconnectReason.loggedOut;

          this.status = 'disconnected';
          this.emit('status', { status: 'disconnected', code });

          if (shouldReconnect && this.retryCount < this.maxRetries) {
            this.retryCount++;
            const delay = Math.min(1000 * 2 ** this.retryCount, 30000);
            console.log(`[WhatsApp] Reconectando em ${delay}ms (tentativa ${this.retryCount})`);
            setTimeout(() => this.connect(), delay);
          } else if (code === DisconnectReason.loggedOut) {
            this.clearAuth();
            this.emit('logout');
          }
        }
      });

      this.sock.ev.on('messages.upsert', ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
          if (!isJidGroup(msg.key.remoteJid)) continue;
          if (msg.key.fromMe) continue;
          this.emit('group_message', msg);
        }
      });

    } catch (err) {
      console.error('[WhatsApp] Erro ao conectar:', err);
      this.status = 'error';
    }
  }

  async loadGroups() {
    try {
      if (!this.sock) return [];

      const groupData = await this.sock.groupFetchAllParticipating();
      const rawId = this.sock.user?.id || '';
        const myId = rawId.split(':')[0] + '@s.whatsapp.net';
        console.log('[WhatsApp] Meu ID:', myId);

        this.groups = Object.values(groupData).map((g) => {
          const participants = g.participants || [];
          const me = participants.find((p) => {
            const pid = p.id?.split(':')[0] + '@s.whatsapp.net';
            return pid === myId;
          });
        const isAdmin = me?.admin === 'admin' || me?.admin === 'superadmin';

        return {
          id: g.id,
          nome: g.subject,
          participantes: participants.length,
          descricao: g.desc || '',
          isAdmin,
        };
      });

      console.log(`[WhatsApp] ${this.groups.length} grupos carregados`);
      return this.groups;
    } catch (err) {
      console.error('[WhatsApp] Erro ao carregar grupos:', err);
      return [];
    }
  }

  async sendText(groupId, text) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp não está conectado');
    }
    await this.sock.sendMessage(groupId, { text });
    return { sucesso: true };
  }

  async sendImage(groupId, imageBuffer, caption = '') {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp não está conectado');
    }
    await this.sock.sendMessage(groupId, { image: imageBuffer, caption });
    return { sucesso: true };
  }

  async disconnect() {
    if (this.sock) {
      await this.sock.logout().catch(() => {});
      this.sock = null;
    }
    this.status = 'disconnected';
    this.qrCode = null;
    this.clearAuth();
    this.emit('status', { status: 'disconnected' });
  }

  clearAuth() {
    try {
      if (fs.existsSync(this.authDir)) {
        fs.rmSync(this.authDir, { recursive: true, force: true });
        fs.mkdirSync(this.authDir, { recursive: true });
      }
    } catch (err) {
      console.error('[WhatsApp] Erro ao limpar auth:', err);
    }
  }

  getStatus() {
    return {
      status: this.status,
      conectado: this.status === 'connected',
      qrCode: this.qrCode,
      grupos: this.groups,
      totalGrupos: this.groups.length,
    };
  }
}

const whatsappService = new WhatsAppService();
module.exports = whatsappService;
