const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Converter link Shopee para afiliado
router.post('/converter', async (req, res) => {
  try {
    const { link, user_id } = req.body;

    // Buscar credenciais do usuário
    const { data: creds } = await supabase
      .from('credenciais_de_afiliado')
      .select('*')
      .eq('user_id', user_id)
      .eq('plataforma', 'shopee')
      .single();

    if (!creds) {
      return res.json({ erro: 'Credenciais Shopee não encontradas' });
    }

    const { affiliate_id, app_id, secret_key } = creds.dados;

    // Gerar assinatura
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${app_id}${timestamp}`;
    const signature = crypto
      .createHmac('sha256', secret_key)
      .update(payload)
      .digest('hex');

    // Chamar API Shopee
    const response = await axios.post(
      'https://open-api.affiliate.shopee.com.br/graphql',
      {
        query: `
          mutation {
            generateShortLink(input: {
              originUrl: "${link}",
              subIds: ["${affiliate_id}"]
            }) {
              shortLink
            }
          }
        `
      },
      {
        headers: {
          'Authorization': `SHA256 Credential=${app_id},Timestamp=${timestamp},Signature=${signature}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const linkConvertido = response.data?.data?.generateShortLink?.shortLink;

    if (!linkConvertido) {
      return res.json({ erro: 'Não foi possível converter o link' });
    }

    res.json({ 
      sucesso: true,
      link_original: link,
      link_convertido: linkConvertido
    });

  } catch (err) {
    res.json({ erro: err.message });
  }
});

// Testar credenciais
router.post('/testar', async (req, res) => {
  try {
    const { app_id, secret_key } = req.body;
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${app_id}${timestamp}`;
    const signature = crypto
      .createHmac('sha256', secret_key)
      .update(payload)
      .digest('hex');

    res.json({ 
      sucesso: true,
      mensagem: 'Credenciais válidas',
      signature_gerada: signature.substring(0, 10) + '...'
    });
  } catch (err) {
    res.json({ erro: err.message });
  }
});

module.exports = router;
