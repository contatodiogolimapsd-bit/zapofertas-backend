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

const queueRoutes = require('./queue/routes');
app.use('/queue', queueRoutes);

const PORT = parseInt(process.env.PORT) || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`ZapOfertas rodando na porta ${PORT}`);

             // Conecta WhatsApp automaticamente ao iniciar
             const whatsapp = require('./whatsapp/service');
    whatsapp.connect().catch(console.error);

             // Inicializa o handler de automacoes (listener de mensagens)
             const handler = require('./automacao-handler');
    handler.inicializar();
});
