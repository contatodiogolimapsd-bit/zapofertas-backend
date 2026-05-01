const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Listar fila
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fila de despacho')
      .select('*, ofertas(*)')
      .eq('status', 'aguardando')
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ fila: data, total: data.length });
  } catch (err) {
    res.json({ erro: err.message });
  }
});

// Adicionar oferta na fila
router.post('/adicionar', async (req, res) => {
  try {
    const { offer_id, grupo_destino_id, agendado_para } = req.body;

    const { data, error } = await supabase
      .from('fila de despacho')
      .insert({
        offer_id,
        grupo_destino_id,
        status: 'aguardando',
        agendado_para
      });

    if (error) throw error;
    res.json({ sucesso: true, data });
  } catch (err) {
    res.json({ erro: err.message });
  }
});

// Remover item da fila
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('fila de despacho')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ sucesso: true });
  } catch (err) {
    res.json({ erro: err.message });
  }
});

// Pausar fila
router.post('/pausar', async (req, res) => {
  try {
    const { error } = await supabase
      .from('fila de despacho')
      .update({ status: 'pausado' })
      .eq('status', 'aguardando');

    if (error) throw error;
    res.json({ sucesso: true, mensagem: 'Fila pausada' });
  } catch (err) {
    res.json({ erro: err.message });
  }
});

// Retomar fila
router.post('/retomar', async (req, res) => {
  try {
    const { error } = await supabase
      .from('fila de despacho')
      .update({ status: 'aguardando' })
      .eq('status', 'pausado');

    if (error) throw error;
    res.json({ sucesso: true, mensagem: 'Fila retomada' });
  } catch (err) {
    res.json({ erro: err.message });
  }
});

module.exports = router;
