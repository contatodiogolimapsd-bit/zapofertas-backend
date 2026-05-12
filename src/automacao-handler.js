require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const crypto = require('crypto');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

// ─── Helpers de URL ─────────────────────────────────────────────────────────

const SHOPEE_RE = /https?:\/\/(?:s\.shopee\.com\.br|shopee\.com\.br|shope\.ee)\/\S+/gi;
const ML_RE = /https?:\/\/(?:mercadolivre\.com\.br|mercadolibre\.com|ml\.com\.br|meli\.com\.br|produto\.mercadolivre\.com\.br)\/\S+/gi;
const ANY_LINK_RE = /https?:\/\/\S+/gi;

function extrairLinks(texto) {
    if (!texto) return { shopee: [], ml: [], outros: [] };
    const shopee = [...(texto.match(SHOPEE_RE) || [])];
    const ml = [...(texto.match(ML_RE) || [])];
    // links que nao sao shopee nem ml mas podem ser redirects
  const outros = [...(texto.match(ANY_LINK_RE) || [])].filter(
        l => !shopee.includes(l) && !ml.includes(l)
      );
    return { shopee, ml, outros };
}

function gerarAssinaturaShopee(appId, secretKey, payload) {
    const timestamp = Math.floor(Date.now() / 1000);
    const factor = appId + timestamp + payload + secretKey;
    const signature = crypto.createHash('sha256').update(factor).digest('hex');
    return { timestamp, signature };
}

async function converterLinkShopee(link, appId, secretKey) {
    const payload = `{"query":"mutation { generateShortLink(input: { originUrl: \\"${link}\\" }) { shortLink longLink } }"}`;
    const { timestamp, signature } = gerarAssinaturaShopee(appId, secretKey, payload);
    const resp = await axios.post(
          'https://open-api.affiliate.shopee.com.br/graphql',
          payload,
      {
              headers: {
                        'Authorization': `SHA256 Credential=${appId},Timestamp=${timestamp},Signature=${signature}`,
                        'Content-Type': 'application/json',
              },
              timeout: 10000,
      }
        );
    if (resp.data?.errors) throw new Error(resp.data.errors[0].message);
    const converted = resp.data?.data?.generateShortLink?.shortLink;
    if (!converted) throw new Error('Link convertido vazio');
    return converted;
}

async function converterLinkML(link, tag, cookie) {
    // Mercado Livre: adiciona tag de rastreamento na URL
  try {
        const url = new URL(link);
        if (tag) url.searchParams.set('deal_print_id', tag);
        return url.toString();
  } catch {
        return link;
  }
}

// ─── Formatação da mensagem de saída ────────────────────────────────────────

function formatarMensagem(textoOriginal, mapaLinks, formato) {
    let texto = textoOriginal;
    for (const [original, convertido] of Object.entries(mapaLinks)) {
          texto = texto.replace(original, convertido);
    }
    return texto;
}

// ─── Anti-duplicata em memória ───────────────────────────────────────────────
// Chave: userId + linkOriginal — evita reenviar o mesmo link nas últimas 24h
const enviados = new Map(); // chave -> timestamp

function jaEnviado(userId, link) {
    const chave = `${userId}|${link}`;
    const ts = enviados.get(chave);
    if (!ts) return false;
    const h24 = 24 * 60 * 60 * 1000;
    if (Date.now() - ts < h24) return true;
    enviados.delete(chave);
    return false;
}

function marcarEnviado(userId, link) {
    enviados.set(`${userId}|${link}`, Date.now());
}

// ─── Núcleo: processar mensagem recebida ─────────────────────────────────────

async function processarMensagem(msg) {
    try {
          const grupoId = msg.key?.remoteJid;
          if (!grupoId) return;

      // Extrair texto da mensagem (texto puro, legenda de imagem, etc.)
      const m = msg.message;
          const texto =
                  m?.conversation ||
                  m?.extendedTextMessage?.text ||
                  m?.imageMessage?.caption ||
                  m?.videoMessage?.caption ||
                  m?.documentMessage?.caption ||
                  '';

      if (!texto) return;

      const { shopee, ml } = extrairLinks(texto);
          if (shopee.length === 0 && ml.length === 0) return;

      console.log(`[Handler] Mensagem com links detectada no grupo ${grupoId}`);

      // Buscar todas as automacoes ativas que têm este grupo como SOURCE
      const { data: grupos, error: gErr } = await supabase
            .from('automation_groups')
            .select('automation_id, role, automations(*), automation_groups!automation_id(*)')
            .eq('group_id', grupoId)
            .eq('role', 'source');

      if (gErr) { console.error('[Handler] Erro ao buscar grupos:', gErr.message); return; }
          if (!grupos || grupos.length === 0) return;

      for (const ag of grupos) {
              const automacao = ag.automations;
              if (!automacao || automacao.status !== 'active') continue;

            // Verificar horário
            if (!dentroDoHorario(automacao.horario_inicio, automacao.horario_fim)) {
                      console.log(`[Handler] Fora do horário para automação ${automacao.id}`);
                      continue;
            }

            const userId = automacao.user_id;
              const plataformas = automacao.plataformas || [];

            // Buscar credenciais do usuário
            const { data: creds } = await supabase
                .from('affiliate_credentials')
                .select('*')
                .eq('user_id', userId);

            const credShopee = creds?.find(c => c.plataforma === 'shopee');
              const credML = creds?.find(c => c.plataforma === 'mercadolivre');

            // Buscar grupos de destino desta automacao
            const { data: destinos } = await supabase
                .from('automation_groups')
                .select('group_id')
                .eq('automation_id', automacao.id)
                .eq('role', 'destination');

            if (!destinos || destinos.length === 0) continue;

            // Converter links
            const mapaLinks = {};
              let algumConvertido = false;

            if (plataformas.includes('shopee') && credShopee && shopee.length > 0) {
                      for (const link of shopee) {
                                  if (jaEnviado(userId, link)) { console.log('[Handler] Link já enviado, pulando:', link); continue; }
                                  try {
                                                const convertido = await converterLinkShopee(link, credShopee.dados?.app_id || credShopee.app_id, credShopee.dados?.secret_key || credShopee.secret_key);
                                                mapaLinks[link] = convertido;
                                                marcarEnviado(userId, link);
                                                algumConvertido = true;
                                  } catch (e) {
                                                console.error('[Handler] Erro ao converter link Shopee:', e.message);
                                  }
                      }
            }

            if (plataformas.includes('mercadolivre') && credML && ml.length > 0) {
                      for (const link of ml) {
                                  if (jaEnviado(userId, link)) { console.log('[Handler] Link ML já enviado, pulando:', link); continue; }
                                  try {
                                                const tag = credML.dados?.tag || credML.tag || '';
                                                const convertido = await converterLinkML(link, tag, credML.dados?.cookie || credML.cookie);
                                                mapaLinks[link] = convertido;
                                                marcarEnviado(userId, link);
                                                algumConvertido = true;
                                  } catch (e) {
                                                console.error('[Handler] Erro ao converter link ML:', e.message);
                                  }
                      }
            }

            if (!algumConvertido && Object.keys(mapaLinks).length === 0) continue;

            // Formatar mensagem final
            const textoFinal = formatarMensagem(texto, mapaLinks, automacao.formato_envio);

            // Registrar em ofertas_enviadas no Supabase e enviar para destinos
            const whatsapp = require('./whatsapp/service');

            for (const dest of destinos) {
                      try {
                                  await whatsapp.sendText(dest.group_id, textoFinal);
                                  console.log(`[Handler] ✅ Enviado para ${dest.group_id}`);

                        // Registrar no histórico
                        await supabase.from('historico_envios').insert({
                                      user_id: userId,
                                      automation_id: automacao.id,
                                      grupo_origem_id: grupoId,
                                      grupo_destino_id: dest.group_id,
                                      mensagem_original: texto.substring(0, 500),
                                      mensagem_enviada: textoFinal.substring(0, 500),
                                      links_convertidos: Object.keys(mapaLinks).length,
                                      status: 'enviado',
                        }).catch(() => {}); // não bloquear se tabela não existir ainda

                      } catch (e) {
                                  console.error(`[Handler] ❌ Erro ao enviar para ${dest.group_id}:`, e.message);

                        await supabase.from('falhas').insert({
                                      user_id: userId,
                                      automation_id: automacao.id,
                                      grupo_id: dest.group_id,
                                      erro: e.message,
                        }).catch(() => {});
                      }
            }

            // Atualizar last_triggered da automacao
            await supabase.from('automations').update({ updated_at: new Date().toISOString() }).eq('id', automacao.id).catch(() => {});
      }
    } catch (err) {
          console.error('[Handler] Erro inesperado:', err);
    }
}

// ─── Helper horário ──────────────────────────────────────────────────────────

function dentroDoHorario(inicio, fim) {
    if (!inicio || !fim) return true;
    const agora = new Date();
    const [hI, mI] = inicio.split(':').map(Number);
    const [hF, mF] = fim.split(':').map(Number);
    const minAgora = agora.getHours() * 60 + agora.getMinutes();
    const minInicio = hI * 60 + mI;
    const minFim = hF * 60 + mF;
    return minAgora >= minInicio && minAgora <= minFim;
}

// ─── Inicializar: escutar eventos do WhatsApp ────────────────────────────────

function inicializar() {
    const whatsapp = require('./whatsapp/service');
    whatsapp.on('group_message', (msg) => {
          processarMensagem(msg).catch(console.error);
    });
    console.log('[Handler] Automacao handler inicializado ✅');
}

module.exports = { inicializar, processarMensagem };
