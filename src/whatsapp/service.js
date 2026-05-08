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
        shouldIgnoreJid: () => false,
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 1,
        connectTimeoutMs: 20000,
        keepAliveIntervalMs: 10000,
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

      // Pega o JID completo do usuário (ex: "554484010436:12@s.whatsapp.net")
      const myJid = this.sock.user?.id || '';
      // Extrai só a parte antes do @ para comparar (ex: "554484010436:12")
      const myJidLocal = myJid.split('@')[0];
      // Sem o device (:XX) para comparar com participantes sem device
      const myJidBase = myJidLocal.split(':')[0];
      // Número puro sem não-dígitos
      const myNumber = myJidBase.replace(/\D/g, '');

      // Variantes de número (com e sem dígito 9 do Brasil)
      const myVariants = new Set([myNumber]);
      if (myNumber.startsWith('55') && myNumber.length === 12) {
        myVariants.add(myNumber.slice(0, 4) + '9' + myNumber.slice(4));
      } else if (myNumber.startsWith('55') && myNumber.length === 13) {
        myVariants.add(myNumber.slice(0, 4) + myNumber.slice(5));
      }
      const mySuffix = myNumber.slice(-8);

      console.log('[WhatsApp] myJid:', myJid, '| myJidBase:', myJidBase);

      const groups = [];

      for (const g of Object.values(groupData)) {
        let isAdmin = false;

        const participants = g.participants || [];
        const me = participants.find((p) => {
          const pid = p.id || '';
          const pidLocal = pid.split('@')[0];
          const pidBase = pidLocal.split(':')[0];
          const pidNumber = pidBase.replace(/\D/g, '');

          // 1. Comparação direta do JID base (funciona para @s.whatsapp.net)
          if (pidBase === myJidBase) return true;

          // 2. Comparação por número (com variantes de dígito 9)
          if (myVariants.has(pidNumber)) return true;

          // 3. Comparação por sufixo dos últimos 8 dígitos
          if (pidNumber.length >= 8 && pidNumber.endsWith(mySuffix)) return true;

          return false;
        });

        isAdmin = me?.admin === 'admin' || me?.admin === 'superadmin';

        groups.push({
          id: g.id,
          nome: g.subject,
          participantes: participants.length,
          descricao: g.desc || '',
          isAdmin,
        });
      }

      this.groups = groups;
      const adminCount = groups.filter((g) => g.isAdmin).length;
      console.log(`[WhatsApp] ${groups.length} grupos carregados (${adminCount} como admin)`);
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
