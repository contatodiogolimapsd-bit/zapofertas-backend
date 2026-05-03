const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');

function gerarAssinatura(appId, secretKey, payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const factor = appId + timestamp + payload + secretKey;
  const signature = crypto.createHash('sha256').update(factor).digest('hex');
  return { timestamp, signature };
}

router.post('/testar', async (req, res) => {
  try {
    const { app_id, secret_key } = req.body;
    const payload = '{"query":"{ shopeeOfferV2(sortType: 1, page: 1, limit: 1) { nodes { offerName } } }"}';
    const { timestamp, signature } = gerarAssinatura(app_id, secret_key, payload);

    const response = await axios.post(
      'https://open-api.affiliate.shopee.com.br/graphql',
      payload,
      {
        headers: {
          'Authorization': `SHA256 Credential=${app_id},Timestamp=${timestamp},Signature=${signature}`,
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
    const payload = `{"query":"mutation { generateShortLink(input: { originUrl: \\"${link}\\" }) { shortLink longLink } }"}`;
    const { timestamp, signature } = gerarAssinatura(app_id, secret_key, payload);

    const response = await axios.post(
      'https://open-api.affiliate.shopee.com.br/graphql',
      payload,
      {
        headers: {
          'Authorization': `SHA256 Credential=${app_id},Timestamp=${timestamp},Signature=${signature}`,
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
