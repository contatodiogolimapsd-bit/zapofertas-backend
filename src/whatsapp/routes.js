const express = require('express');
const router = express.Router();
const axios = require('axios');

const EVOLUTION_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE_NAME = 'zapofertas';

const evoHeaders = {
  apikey: EVOLUTION_KEY,
  'Content-Type': 'application/json'
};

// Buscar QR Code
router.get('/qrcode', async (req, res) => {
  try {
    const { data } = await axios.get(
      `${EVOLUTION_URL}/instance/qrcode/${INSTANCE_NAME}?image=true`,
      { headers: evoHeaders }
    );
    const qrcode = data?.base64 || data?.qrcode?.base64 || data?.code || null;
    res.json({ qrcode, status: 'aguardando' });
  } catch (err) {
    res.status(500).json({ erro: err.response?.data || err.message });
  }
});

// Criar instância e conectar
router.post('/conectar', async (req, res) => {
  try {
    // Verifica se já existe
    let qrcode = null;
    try {
      const { data } = await axios.get(
        `${EVOLUTION_URL}/instance/qrcode/${INSTANCE_NAME}?image=true`,
        { headers: evoHeaders }
      );
      qrcode = data?.base64 || data?.qrcode?.base64 || data?.code || null;
      return res.json({ qrcode, status: 'aguardando' });
    } catch (e) {}

    // Se não existe, cria
    const { data } = await axios.post(
      `${EVOLUTION_URL}/instance/create`,
      { instanceName: INSTANCE_NAME, qrcode: true, integration: 'WHATSAPP-BAILEYS' },
      { headers: evoHeaders }
    );
    qrcode = data?.qrcode?.base64 || null;
    res.json({ qrcode, status: data?.instance?.state || 'criando' });
  } catch (err) {
    res.status(500).json({ erro: err.response?.data || err.message });
  }
});

// Status da conexão
router.get('/status', async (req, res) => {
  try {
    const { data } = await axios.get(
      `${EVOLUTION_URL}/instance/connectionState/${INSTANCE_NAME}`,
      { headers: evoHeaders }
    );
    const conectado = data?.instance?.state === 'open';
    res.json({ conectado, estado: data?.instance?.state });
  } catch (err) {
    res.json({ conectado: false, erro: err.response?.data || err.message });
  }
});

// Listar grupos
router.get('/grupos', async (req, res) => {
  try {
    const { data } = await axios.get(
      `${EVOLUTION_URL}/group/fetchAllGroups/${INSTANCE_NAME}?getParticipants=false`,
      { headers: evoHeaders }
    );
    const grupos = (data || []).map(g => ({
      id: g.id,
      nome: g.subject,
      participantes: g.size,
      foto: g.pictureUrl || null
    }));
    res.json({ grupos });
  } catch (err) {
    res.status(500).json({ erro: err.response?.data || err.message });
  }
});

// Desconectar
router.delete('/desconectar', async (req, res) => {
  try {
    await axios.delete(
      `${EVOLUTION_URL}/instance/delete/${INSTANCE_NAME}`,
      { headers: evoHeaders }
    );
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ erro: err.response?.data || err.message });
  }
});

module.exports = router;
