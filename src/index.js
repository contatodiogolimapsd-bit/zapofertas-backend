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

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ZapOfertas rodando na porta ${PORT}`);
});
