require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const crypto = require('crypto');

const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

// ─── Regex de detecção de links ──────────────────────────────────────────────
const SHOPEE_RE = /https?:\/\/(?:s\.shopee\.com\.br|shopee\.com\.br|shope\.ee)\/\S+/gi;
const ML_RE = /https?:\/\/(?:mercadolivre\.com\.br|mercadolibre\.com|ml\.com\.br|meli\.com\.br|produto\.mercadolivre\.com\.br)\/\S+/gi;

function extrairLinks(texto) {
      if (!texto) return { shopee: [], ml: [] };
      const shopee = [...(texto.match(SHOPEE_RE) || [])].map(l => l.replace(/[,.)]+$/, ''));
      const ml = [...(texto.match(ML_RE) || [])].map(l => l.replace(/[,.)]+$/, ''));
      return { shopee, ml };
}

// ─── Conversão Shopee ────────────────────────────────────────────────────────
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

// ─── Conversão Mercado Livre (tag de rastreamento na URL) ────────────────────
async function converterLinkML(link, tag) {
      try {
              const url = new URL(link);
              if (tag) url.searchParams.set('deal_print_id', tag);
              return url.toString();
      } catch {
              return link;
      }
}

// ─── Anti-duplicata em memória (24h) ─────────────────────────────────────────
const enviados = new Map();

function jaEnviado(userId, link) {
      const chave = `${userId}|${link}`;
      const ts = enviados.get(chave);
      if (!ts) return false;
      if (Date.now() - ts < 24 * 60 * 60 * 1000) return true;
      enviados.delete(chave);
      return false;
}

function marcarEnviado(userId, link) {
      enviados.set(`${userId}|${link}`, Date.now());
}

// ─── Verificação de horário ───────────────────────────────────────────────────
function dentroDoHorario(inicio, fim) {
      if (!inicio || !fim) return true;
      const agora = new Date();
      const [hI, mI] = inicio.split(':').map(Number);
      const [hF, mF] = fim.split(':').map(Number);
      const minAgora = agora.getHours() * 60 + agora.getMinutes();
      return minAgora >= (hI * 60 + mI) && minAgora <= (hF * 60 + mF);
}

// ─── Núcleo: processar mensagem recebida ──────────────────────────────────────
async function processarMensagem(msg) {
      try {
              const grupoId = msg.key?.remoteJid;
              if (!grupoId) return;

        // Extrair texto da mensagem
        const m = msg.message;
              const texto =
                        m?.conversation ||
                        m?.extendedTextMessage?.text ||
                        m?.imageMessage?.caption ||
                        m?.videoMessage?.caption ||
                        m?.documentMessage?.caption ||
                        '';

        if (!texto) return;

        const { shopee: linksShopee, ml: linksML } = extrairLinks(texto);
              if (linksShopee.length === 0 && linksML.length === 0) return;

        console.log(`[Handler] Links detectados no grupo ${grupoId} — Shopee: ${linksShopee.length}, ML: ${linksML.length}`);

        // Buscar automações ativas que têm este grupo como SOURCE
        const { data: gruposSource, error: gErr } = await supabase
                .from('automation_groups')
                .select('automation_id')
                .eq('group_id', grupoId)
                .eq('role', 'source');

        if (gErr) { console.error('[Handler] Erro ao buscar grupos:', gErr.message); return; }
              if (!gruposSource || gruposSource.length === 0) return;

        const automationIds = gruposSource.map(g => g.automation_id);

        const { data: automacoes } = await supabase
                .from('automations')
                .select('*')
                .in('id', automationIds)
                .eq('status', 'active');

        if (!automacoes || automacoes.length === 0) return;

        for (const automacao of automacoes) {
                  // Verificar horário
                if (!dentroDoHorario(automacao.horario_inicio, automacao.horario_fim)) {
                            console.log(`[Handler] Fora do horário para automação "${automacao.nome}"`);
                            continue;
                }

                const userId = automacao.user_id;
                  const plataformas = automacao.plataformas || [];

                // Buscar credenciais do usuário
                const { data: creds } = await supabase
                    .from('affiliate_credentials')
                    .select('*')
                    .eq('user_id', userId);

                // Credenciais Shopee: dados = { affiliate_id, api_id, secret_key, sub_id }
                const credShopee = creds?.find(c => c.plataforma === 'shopee');
                  // Credenciais ML: dados = { tag, cookie }
                const credML = creds?.find(c => c.plataforma === 'mercadolivre');

                // Buscar grupos de destino desta automação
                const { data: destinos } = await supabase
                    .from('automation_groups')
                    .select('group_id')
                    .eq('automation_id', automacao.id)
                    .eq('role', 'destination');

                if (!destinos || destinos.length === 0) {
                            console.log(`[Handler] Automação "${automacao.nome}" sem grupos de destino`);
                            continue;
                }

                // Converter links
                const mapaLinks = {};
                  let algumConvertido = false;

                // Converter links Shopee
                if (plataformas.includes('shopee') && credShopee && linksShopee.length > 0) {
                            const apiId = credShopee.dados?.api_id;
                            const secretKey = credShopee.dados?.secret_key;
                            if (apiId && secretKey) {
                                          for (const link of linksShopee) {
                                                          if (jaEnviado(userId, link)) { console.log('[Handler] Link Shopee já enviado:', link); continue; }
                                                          try {
                                                                            const convertido = await converterLinkShopee(link, apiId, secretKey);
                                                                            mapaLinks[link] = convertido;
                                                                            marcarEnviado(userId, link);
                                                                            algumConvertido = true;
                                                                            console.log(`[Handler] ✅ Shopee convertido: ${link} → ${convertido}`);
                                                          } catch (e) {
                                                                            console.error('[Handler] Erro ao converter Shopee:', e.message);
                                                                            mapaLinks[link] = link; // usa link original se falhar
                                                          }
                                          }
                            } else {
                                          console.warn('[Handler] Credenciais Shopee incompletas (api_id ou secret_key)');
                            }
                }

                // Converter links Mercado Livre
                if (plataformas.includes('mercadolivre') && credML && linksML.length > 0) {
                            const tag = credML.dados?.tag || '';
                            for (const link of linksML) {
                                          if (jaEnviado(userId, link)) { console.log('[Handler] Link ML já enviado:', link); continue; }
                                          try {
                                                          const convertido = await converterLinkML(link, tag);
                                                          mapaLinks[link] = convertido;
                                                          marcarEnviado(userId, link);
                                                          algumConvertido = true;
                                                          console.log(`[Handler] ✅ ML convertido: ${link} → ${convertido}`);
                                          } catch (e) {
                                                          console.error('[Handler] Erro ao converter ML:', e.message);
                                                          mapaLinks[link] = link;
                                          }
                            }
                }

                if (Object.keys(mapaLinks).length === 0) continue;

                // Montar texto final substituindo os links originais pelos convertidos
                let textoFinal = texto;
                  for (const [original, convertido] of Object.entries(mapaLinks)) {
                              textoFinal = textoFinal.split(original).join(convertido);
                  }

                // Enviar para todos os grupos de destino
                const whatsapp = require('./whatsapp/service');

                for (const dest of destinos) {
                            try {
                                          await whatsapp.sendText(dest.group_id, textoFinal);
                                          console.log(`[Handler] ✅ Mensagem enviada para ${dest.group_id}`);

                              // Registrar no histórico (tabela pode não existir ainda — não bloqueia)
                              await supabase.from('historico_envios').insert({
                                              user_id: userId,
                                              automation_id: automacao.id,
                                              grupo_origem_id: grupoId,
                                              grupo_destino_id: dest.group_id,
                                              mensagem_original: texto.substring(0, 500),
                                              mensagem_enviada: textoFinal.substring(0, 500),
                                              links_convertidos: Object.keys(mapaLinks).length,
                                              status: 'enviado',
                              }).catch(() => {});

                            } catch (e) {
                                          console.error(`[Handler] ❌ Erro ao enviar para ${dest.group_id}:`, e.message);

                              await supabase.from('falhas').insert({
                                              user_id: userId,
                                              automation_id: automacao.id,
                                              grupo_id: dest.group_id,
                                              mensagem: `Erro ao enviar: ${e.message}`,
                                              created_at: new Date().toISOString(),
                              }).catch(() => {});
                            }
                }
        }
      } catch (err) {
              console.error('[Handler] Erro inesperado ao processar mensagem:', err);
      }
}

// ─── Inicializar: escutar eventos do WhatsApp ─────────────────────────────────
function inicializar() {
      const whatsapp = require('./whatsapp/service');
      whatsapp.on('group_message', (msg) => {
              processarMensagem(msg).catch(console.error);
      });
      console.log('[Handler] ✅ Automacao handler inicializado — escutando mensagens de grupos');
}

module.exports = { inicializar, processarMensagem };
