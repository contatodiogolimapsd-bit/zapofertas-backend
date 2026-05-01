require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Rota de teste
app.get('/', (req, res) => {
  res.json({ status: 'ZapOfertas backend rodando!', version: '1.0.0' });
});

// Rota de status
app.get('/status', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sessoes_do_whatsapp')
      .select('*')
      .limit(1);
    
    res.json({
      status: 'ok',
      supabase: error ? 'erro' : 'conectado',
      whatsapp: 'desconectado'
    });
  } catch (err) {
    res.json({ status: 'erro', message: err.message });
  }
});

// Importar rotas
const whatsappRoutes = require('./whatsapp/routes');
const shopeeRoutes = require('./shopee/routes');
const queueRoutes = require('./queue/routes');

app.use('/whatsapp', whatsappRoutes);
app.use('/shopee', shopeeRoutes);
app.use('/queue', queueRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ZapOfertas backend rodando na porta ${PORT}`);
});

module.exports = app;
