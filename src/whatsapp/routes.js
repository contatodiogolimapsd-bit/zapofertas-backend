const express = require('express');
const router = express.Router();
const whatsapp = require('./service');

// Buscar QR Code (polling — frontend chama a cada 2s)
router.get('/qrcode', (req, res) => {
  const s = whatsapp.getStatus();

  if (s.status === 'connected') {
    return res.json({ qrcode: null, status: 'connected', conectado: true });
  }

  if (!s.qrCode) {
    return res.json({ qrcode: null, status: s.status, conectado: false });
  }

  res.json({ qrcode: s.qrCode, status: 'qr_ready', conectado: false });
});

// Iniciar conexão e retornar QR Code
router.post('/conectar', async (req, res) => {
  try {
    const s = whatsapp.getStatus();

    if (s.status === 'connected') {
      return res.json({ qrcode: null, status: 'connected', conectado: true });
    }

    if (s.status === 'qr_ready' && s.qrCode) {
      return res.json({ qrcode: s.qrCode, status: 'qr_ready', conectado: false });
    }

    whatsapp.connect().catch(console.error);

    const qrCode = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 8000);

      whatsapp.once('qr', ({ qrCode }) => {
        clearTimeout(timeout);
        resolve(qrCode);
      });

      if (whatsapp.qrCode) {
        clearTimeout(timeout);
        resolve(whatsapp.qrCode);
      }
    });

    res.json({
      qrcode: qrCode,
      status: qrCode ? 'qr_ready' : 'connecting',
      conectado: false,
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Status da conexão
router.get('/status', (req, res) => {
  const s = whatsapp.getStatus();
  res.json({
    conectado: s.conectado,
    estado: s.status,
    totalGrupos: s.totalGrupos,
  });
});

// Listar grupos
router.get('/grupos', async (req, res) => {
    try {
          const s = whatsapp.getStatus();
          if (!s.conectado) {
                  return res.status(400).json({ erro: 'WhatsApp não está conectado' });
          }

          const grupos = await whatsapp.loadGroups();

          // Fetch complete metadata for each group to get participant role information
          const gruposComRole = await Promise.all(
                  grupos.map(async (grupo) => {
                            try {
                                        const metadata = await whatsapp.sock.groupMetadata(grupo.id);
                                        return {
                                                      ...grupo,
                                                      participants: (metadata.participants || []).map(p => ({
                                                                      ...p,
                                                                      role: p.role || 'member'
                                                      }))
                                        };
                            } catch (err) {
                                        console.error(`Erro ao buscar metadata do grupo ${grupo.id}:`, err.message);
                                        return {
                                                      ...grupo,
                                                      participants: []
                                        };
                            }
                  })
                );

          res.json(gruposComRole);
    } catch (err) {
          res.status(500).json({ erro: err.message });
    }
});
// Desconectar
router.delete('/desconectar', async (req, res) => {
  try {
    await whatsapp.disconnect();
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Debug: ver meu ID e participantes brutos de um grupo para diagnóstico de isAdmin
router.get('/debug-admin', async (req, res) => {
  try {
    if (!whatsapp.sock) return res.status(400).json({ erro: 'sock não disponível' });

    const rawId = whatsapp.sock.user?.id || '';
    const myNumber = rawId.split('@')[0].split(':')[0].replace(/\D/g, '');

    const groupData = await whatsapp.sock.groupFetchAllParticipating();
    const grupos = Object.values(groupData).slice(0, 5);

    const resultado = await Promise.all(grupos.map(async (g) => {
      try {
        const meta = await whatsapp.sock.groupMetadata(g.id);
        const participantes = (meta.participants || []).slice(0, 10).map(p => ({
          id: p.id,
          admin: p.admin,
        }));
        return { id: g.id, nome: g.subject, participantes };
      } catch (e) {
        return { id: g.id, nome: g.subject, erro: e.message };
      }
    }));

    res.json({ meuIdRaw: rawId, meuNumero: myNumber, grupos: resultado });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Retornar o ID do usuário conectado em ambos os formatos (@s.whatsapp.net e @lid)
router.get('/me', async (req, res) => {
    try {
          const meuId = whatsapp.sock?.user?.id;

          if (!meuId) {
                  return res.status(400).json({ erro: 'WhatsApp não conectado' });
          }

          res.json({
                  id: meuId,
                  lid: meuId.replace('@s.whatsapp.net', '@lid')
          });
    } catch (err) {
          res.status(500).json({ erro: err.message });
    }
});

module.exports = router;
