const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');

function gerarAssinatura(appId, secretKey) {
  const timestamp = Math.floor(Date.now() / 1000);
  const mensagem = appId + timestamp;
  const assinatura = crypto
    .createHmac('sha256', secretKey)
    .update(mensagem)
    .digest('hex');
  return { timestamp, assinatura };
}

router.post('/testar', async (req, res) => {
  try {
    const { app_id, secret_key } = req.body;
    const { timestamp, assinatura } = gerarAssinatura(app_id, secret_key);

    const response = await axios.post(
      'https://open-api.affiliate.shopee.com.br/graphql',
      { query: `{ shopeeOfferV2(sortType: 2, page: 1, limit: 1) { nodes { productLink } } }` },
      {
        headers: {
          'Authorization': `SHA256 Credential=${app_id},Timestamp=${timestamp},Signature=${assinatura}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      return res.json({ sucesso: false, erro: response.data.errors[0].message });
    }

    res.json({ sucesso: true, mensagem: 'Credenciais válidas!' });
  } catch (err) {
    res.json({ sucesso: false, erro: err.message });
  }
});

router.post('/converter', async (req, res) => {
  try {
    const { link, app_id, secret_key } = req.body;
    const { timestamp, assinatura } = gerarAssinatura(app_id, secret_key);

    const response = await axios.post(
      'https://open-api.affiliate.shopee.com.br/graphql',
      {
        query: `mutation { generateShortLink(input: { originUrl: "${link}" }) { shortLink longLink } }`
      },
      {
        headers: {
          'Authorization': `SHA256 Credential=${app_id},Timestamp=${timestamp},Signature=${assinatura}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      return res.json({ sucesso: false, erro: response.data.errors[0].message });
    }

    const linkConvertido = response.data?.data?.generateShortLink?.shortLink;
    res.json({ sucesso: true, link_original: link, link_convertido: linkConvertido });
  } catch (err) {
    res.json({ sucesso: false, erro: err.message });
  }
});

module.exports = router;
