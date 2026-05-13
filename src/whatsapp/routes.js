const express = require('express');
const router = express.Router();
const EvolutionClient = require('./evolution-client');
const handleWebhook = require('./webhook');

// Instância global do Evolution API
const evolution = new EvolutionClient();

// Iniciar conexão automaticamente ao carregar
evolution.connect().catch(console.error);

// GET /whatsapp/status - Status atual
router.get('/status', (req, res) => {
  const status = evolution.getStatus();
  res.json({
    conectado: status.conectado,
    estado: status.status,
    totalGrupos: status.totalGrupos
  });
});

// GET /whatsapp/qrcode - Obter QR Code para escanear
router.get('/qrcode', async (req, res) => {
  try {
    const status = evolution.getStatus();

    if (status.conectado) {
      return res.json({ qrcode: null, status: 'connected', conectado: true });
    }

    if (status.qrCode) {
      return res.json({ qrcode: status.qrCode, status: 'qr_ready', conectado: false });
    }

    // Tentar obter novo QR code
    await evolution.getQRCode();
    const newStatus = evolution.getStatus();

    res.json({
      qrcode: newStatus.qrCode,
      status: newStatus.status,
      conectado: newStatus.conectado
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /whatsapp/conectar - Iniciar conexão
router.post('/conectar', async (req, res) => {
  try {
    const status = evolution.getStatus();

    if (status.conectado) {
      return res.json({ conectado: true, status: 'connected' });
    }

    await evolution.connect();

    const newStatus = evolution.getStatus();
    res.json({
      conectado: newStatus.conectado,
      status: newStatus.status,
      qrcode: newStatus.qrCode
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /whatsapp/grupos - Listar grupos
router.get('/grupos', async (req, res) => {
  try {
    if (!evolution.getStatus().conectado) {
      return res.status(400).json({ erro: 'WhatsApp não está conectado' });
    }

    const grupos = await evolution.loadGroups();
    res.json({ grupos });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /whatsapp/enviar - Enviar mensagem
router.post('/enviar', async (req, res) => {
  try {
    const { groupId, mensagem } = req.body;

    if (!evolution.getStatus().conectado) {
      return res.status(400).json({ erro: 'WhatsApp não está conectado' });
    }

    await evolution.sendMessage(groupId, mensagem);
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// DELETE /whatsapp/desconectar - Desconectar
router.delete('/desconectar', async (req, res) => {
  try {
    await evolution.disconnect();
    res.json({ sucesso: true, status: 'disconnected' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /whatsapp/webhook - Receber webhooks da Evolution API
router.post('/webhook', handleWebhook);

module.exports = router;
module.exports.evolution = evolution;
