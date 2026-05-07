require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

const shopeeRoutes = require('./shopee/routes');
app.use('/shopee', shopeeRoutes);

const whatsappRoutes = require('./whatsapp/routes');
app.use('/whatsapp', whatsappRoutes);

const PORT = parseInt(process.env.PORT) || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ZapOfertas rodando na porta ${PORT}`);

  // Conecta WhatsApp automaticamente ao iniciar
  const whatsapp = require('./whatsapp/service');
  whatsapp.connect().catch(console.error);
});
