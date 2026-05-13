const axios = require('axios');
const EventEmitter = require('events');
const QRCode = require('qrcode');

const EVOLUTION_API_URL = 'https://evolution-api-production-f160.up.railway.app';
const API_KEY = 'zapofertas123';
const INSTANCE_NAME = 'zapofertas';

class EvolutionClient extends EventEmitter {
  constructor() {
    super();
    this.instanceName = INSTANCE_NAME;
    this.baseURL = EVOLUTION_API_URL;
    this.status = 'disconnected';
    this.qrCode = null;
    this.groups = [];
    this.pollInterval = null;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY
      }
    });
  }

  async connect() {
    try {
      console.log('[Evolution] 🔄 Conectando...');
      this.status = 'connecting';

      // Criar instância
      await this.createInstance();

      // Iniciar polling de status
      this.startPolling();
    } catch (err) {
      console.error('[Evolution] ❌ Erro ao conectar:', err.message);
      this.status = 'error';
    }
  }

  async createInstance() {
    try {
      console.log('[Evolution] 📱 Criando/verificando instância...');
      const response = await this.client.post('/instance/create', {
        instanceName: this.instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true
      });

      console.log('[Evolution] ✅ Instância pronta');
      return response.data;
    } catch (err) {
      if (err.response?.status === 400 || err.response?.status === 403) {
        console.log('[Evolution] ℹ️  Instância já existe');
        return;
      }
      throw err;
    }
  }

  async getQRCode() {
    try {
      const response = await this.client.get(`/instance/connect/${this.instanceName}`);

      if (response.data?.code || response.data?.pairingCode) {
        // Gerar imagem QR a partir do código
        const qrContent = response.data.code || response.data.pairingCode;
        this.qrCode = await QRCode.toDataURL(qrContent);
        this.status = 'qr_ready';
        this.emit('qr', { qrCode: this.qrCode });
        console.log('[Evolution] 📲 QR Code gerado');
      }

      return response.data;
    } catch (err) {
      console.error('[Evolution] Erro ao obter QR:', err.message);
      return null;
    }
  }

  async getInstanceStatus() {
    try {
      const response = await this.client.get(`/instance/connectionState/${this.instanceName}`);

      const isConnected = response.data?.instance?.state === 'open';

      if (isConnected && this.status !== 'connected') {
        this.status = 'connected';
        this.qrCode = null;
        this.emit('status', { status: 'connected' });
        console.log('[Evolution] ✅ Conectado com sucesso!');
        this.loadGroups();
      } else if (!isConnected && this.status === 'connected') {
        this.status = 'disconnected';
        this.emit('status', { status: 'disconnected' });
        console.log('[Evolution] 🔌 Desconectado');
      } else if (!isConnected && this.status === 'qr_ready') {
        // Ainda em QR ready, tudo bem
      }

      return response.data;
    } catch (err) {
      if (err.response?.status === 404) {
        await this.getQRCode();
      }
      return null;
    }
  }

  startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);

    this.pollInterval = setInterval(async () => {
      await this.getInstanceStatus();
    }, 5000); // A cada 5 segundos
  }

  async loadGroups() {
    try {
      const response = await this.client.get(`/group/fetchAllGroups/${this.instanceName}?getParticipants=false`);

      const groups = response.data?.groups
        ?.map(chat => ({
          id: chat.id,
          nome: chat.subject || chat.name,
          participantes: chat.participants?.length || 0
        })) || [];

      this.groups = groups;
      console.log(`[Evolution] 📋 ${groups.length} grupos carregados`);
      return groups;
    } catch (err) {
      console.error('[Evolution] Erro ao carregar grupos:', err.message);
      return [];
    }
  }

  async sendMessage(groupId, text) {
    try {
      if (this.status !== 'connected') {
        throw new Error('WhatsApp não está conectado');
      }

      const response = await this.client.post(`/message/sendText/${this.instanceName}`, {
        number: groupId,
        text: text
      });

      console.log('[Evolution] ✅ Mensagem enviada');
      return { sucesso: true };
    } catch (err) {
      console.error('[Evolution] ❌ Erro ao enviar mensagem:', err.message);
      throw err;
    }
  }

  async disconnect() {
    try {
      if (this.pollInterval) clearInterval(this.pollInterval);

      this.status = 'disconnected';
      this.qrCode = null;
      this.emit('status', { status: 'disconnected' });
      console.log('[Evolution] ✅ Desconectado');
    } catch (err) {
      console.error('[Evolution] Erro ao desconectar:', err.message);
    }
  }

  getStatus() {
    return {
      status: this.status,
      conectado: this.status === 'connected',
      qrCode: this.qrCode,
      grupos: this.groups,
      totalGrupos: this.groups.length
    };
  }
}

module.exports = EvolutionClient;
