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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ZapOfertas backend rodando na porta ${PORT}`);
});
