const express = require('express');
const router = express.Router();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const EVOLUTION_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE_NAME = 'zapofertas';

const evoHeaders = {
  apikey: EVOLUTION_KEY,
  'Content-Type': 'application/json'
};

// Criar instância e gerar QR Code
router.post('/conectar', async (req, res) => {
  try {
    // Cria instância na Evolution API
    const { data } = await axios.post(
      `${EVOLUTION_URL}/instance/create`,
      {
        instanceName: INSTANCE_NAME,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS'
      },
      { headers: evoHeaders }
    );

    // Salva sessão no Supabase
    await supabase.from('sessoes_do_whatsapp').upsert({
      id: INSTANCE_NAME,
      status: 'aguardando_qrcode',
      numero: null,
      nome_perfil: null,
      atualizado_em: new Date().toISOString()
    });

    res.json({
      qrcode: data?.qrcode?.base64 || null,
      status: data?.instance?.state || 'aguardando'
    });
  } catch (err) {
    const msg = err.response?.data || err.message;
    res.status(500).json({ erro: msg });
  }
});

// Buscar QR Code atual
router.get('/qrcode', async (req, res) => {
  try {
    const { data } = await axios.get(
      `${EVOLUTION_URL}/instance/connect/${INSTANCE_NAME}`,
      { headers: evoHeaders }
    );

    res.json({
      qrcode: data?.base64 || null,
      status: data?.state || 'desconhecido'
    });
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

    // Atualiza Supabase
    await supabase.from('sessoes_do_whatsapp').upsert({
      id: INSTANCE_NAME,
      status: conectado ? 'conectado' : 'desconectado',
      atualizado_em: new Date().toISOString()
    });

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

    const grupos = data.map(g => ({
      id: g.id,
      nome: g.subject,
      participantes: g.size,
      foto: g.pictureUrl || null
    }));

    // Salva grupos no Supabase
    for (const g of grupos) {
      await supabase.from('grupos_do_whatsapp').upsert({
        id: g.id,
        nome: g.nome,
        participantes: g.participantes,
        foto: g.foto,
        atualizado_em: new Date().toISOString()
      });
    }

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

    await supabase.from('sessoes_do_whatsapp').upsert({
      id: INSTANCE_NAME,
      status: 'desconectado',
      numero: null,
      atualizado_em: new Date().toISOString()
    });

    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ erro: err.response?.data || err.message });
  }
});

module.exports = router;
