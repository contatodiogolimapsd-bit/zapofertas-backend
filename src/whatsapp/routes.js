const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Status do WhatsApp
router.get('/status', async (req, res) => {
  try {
    const { data } = await supabase
      .from('sessoes_do_whatsapp')
      .select('*')
      .single();
    
    res.json({ conectado: data?.status === 'conectado', sessao: data });
  } catch (err) {
    res.json({ conectado: false, erro: err.message });
  }
});

// Gerar QR Code
router.get('/qrcode', async (req, res) => {
  try {
    res.json({ 
      qrcode: null, 
      mensagem: 'Iniciando conexão WhatsApp...' 
    });
  } catch (err) {
    res.json({ erro: err.message });
  }
});

// Listar grupos
router.get('/grupos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('grupos_do_whatsapp')
      .select('*');
    
    if (error) throw error;
    res.json({ grupos: data });
  } catch (err) {
    res.json({ erro: err.message });
  }
});

module.exports = router;
