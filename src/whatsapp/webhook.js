const QRCode = require('qrcode');

let evolutionInstance = null;

const setEvolutionClient = (evolution) => {
  evolutionInstance = evolution;
};

const handleWebhook = (req, res) => {
  const event = req.body;

  console.log('[Evolution Webhook]', event.event || event.type, JSON.stringify(event).slice(0, 200));

  if (event.event === 'status' || event.type === 'status') {
    handleStatusUpdate(event);
  } else if (event.event === 'qr' || event.type === 'qrcode') {
    handleQRCode(event);
  } else if (event.event === 'message' || event.type === 'messages') {
    handleMessage(event);
  }

  res.json({ status: 'received' });
};

const handleStatusUpdate = (event) => {
  if (!evolutionInstance) return;

  const status = event.status || event.statusConnection;
  console.log(`[Evolution Webhook] Status atualizado: ${status}`);

  if (status === 'open' || status === 'connected') {
    evolutionInstance.status = 'connected';
    evolutionInstance.emit('status', { status: 'connected' });
  }
};

const handleQRCode = (event) => {
  if (!evolutionInstance) return;

  const qrCode = event.qrcode || event.code;
  if (qrCode) {
    console.log('[Evolution Webhook] 📲 QR Code recebido');
    QRCode.toDataURL(qrCode)
      .then((dataUrl) => {
        evolutionInstance.qrCode = dataUrl;
        evolutionInstance.status = 'qr_ready';
        evolutionInstance.emit('qr', { qrCode: dataUrl });
        console.log('[Evolution Webhook] ✅ QR Code armazenado');
      })
      .catch((err) => {
        console.error('[Evolution Webhook] Erro ao gerar QR:', err.message);
      });
  }
};

const handleMessage = (event) => {
  console.log('[Evolution Webhook] 💬 Mensagem recebida');
};

module.exports = handleWebhook;
module.exports.setEvolutionClient = setEvolutionClient;
