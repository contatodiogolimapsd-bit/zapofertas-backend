const express = require('express');
const router = express.Router();
const whatsapp = require('./service');

// Buscar QR Code (polling — frontend chama a cada 2s)
router.get('/qrcode', (req, res) => {
  const s = whatsapp.getStatus();

  if (s.status === 'connected') {
    return res.json({ qrcode: null, status: 'connected', conectado: true });
  }

  if (!s.qrCode) {
    return res.json({ qrcode: null, status: s.status, conectado: false });
  }

  res.json({ qrcode: s.qrCode, status: 'qr_ready', conectado: false });
});

// Iniciar conexão e retornar QR Code
router.post('/conectar', async (req, res) => {
  try {
    const s = whatsapp.getStatus();

    // Já conectado
    if (s.status === 'connected') {
      return res.json({ qrcode: null, status: 'connected', conectado: true });
    }

    // Já tem QR gerado — retorna ele
    if (s.status === 'qr_ready' && s.qrCode) {
      return res.json({ qrcode: s.qrCode, status: 'qr_ready', conectado: false });
    }

    // Inicia conexão (assíncrono — não bloqueia)
    whatsapp.connect().catch(console.error);

    // Aguarda até 8 segundos pelo QR Code
    const qrCode = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 8000);

      whatsapp.once('qr', ({ qrCode }) => {
        clearTimeout(timeout);
        resolve(qrCode);
      });

      // Se já estava gerando e emitiu antes de chegarmos aqui
      if (whatsapp.qrCode) {
        clearTimeout(timeout);
        resolve(whatsapp.qrCode);
      }
    });

    res.json({
      qrcode: qrCode,
      status: qrCode ? 'qr_ready' : 'connecting',
      conectado: false,
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Status da conexão
router.get('/status', (req, res) => {
  const s = whatsapp.getStatus();
  res.json({
    conectado: s.conectado,
    estado: s.status,
    totalGrupos: s.totalGrupos,
  });
});

// Listar grupos
router.get('/grupos', async (req, res) => {
  try {
    const s = whatsapp.getStatus();

    if (!s.conectado) {
      return res.status(400).json({ erro: 'WhatsApp não está conectado' });
    }

    // Força refresh
    const grupos = await whatsapp.loadGroups();
    res.json({ grupos });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Desconectar
router.delete('/desconectar', async (req, res) => {
  try {
    await whatsapp.disconnect();
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
