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

// Webhook handler for Evolution API
const webhookModule = require('./whatsapp/webhook');
const { setEvolutionClient } = webhookModule;
app.post('/webhook/evolution', webhookModule);

const PORT = parseInt(process.env.PORT) || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`ZapOfertas rodando na porta ${PORT}`);

    // Evolution API auto-connects via whatsapp/routes.js
    // Inject evolution client into webhook handler
    const whatsappRoutes = require('./whatsapp/routes');
    setEvolutionClient(whatsappRoutes.evolution);

    // Inicializa o handler de automacoes (listener de mensagens)
    const handler = require('./automacao-handler');
    handler.inicializar();
});
