global.crypto = require('crypto');

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const qrcode = require('qrcode');
const { Boom } = require('@hapi/boom');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

const app = express();
const port = 3001;

let sock;
let qrCodeImage = null;
let clientState = 'disconnected';
let stateMessage = 'Initializing...';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./session');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    getMessage: async (key) => ({
      conversation: 'Fallback message'
    })
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrCodeImage = await qrcode.toDataURL(qr);
      clientState = 'qr_ready';
      stateMessage = 'QR Code ready, please scan with WhatsApp';
      console.log('QR updated');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error = new Boom(lastDisconnect?.error))?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('connection closed due to', lastDisconnect.error, ', reconnecting', shouldReconnect);

      if (shouldReconnect) {
        startBot();
      } else {
        clientState = 'disconnected';
        stateMessage = 'Disconnected from WhatsApp';
      }
    }

    if (connection === 'open') {
      clientState = 'connected';
      stateMessage = 'WhatsApp connected and ready!';
      console.log('Client is ready!');
      const { user } = sock;
      await sock.sendMessage(user.id, { text: 'Bot berhasil aktif dan siap digunakan ✅' });
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text;

    // Tambahkan logika untuk mendapatkan ID grup
    if (messageContent === '/dapatkanidgrup') {
      // Periksa apakah pesan berasal dari grup
      if (sender.endsWith('@g.us')) {
        const groupID = sender;
        await sock.sendMessage(groupID, { text: `ID grup ini adalah: ${groupID}` });
      } else {
        // Jika pesan tidak dari grup, balas dengan pesan informatif
        await sock.sendMessage(sender, { text: 'Perintah ini hanya bisa digunakan di dalam grup.' });
      }
    }
  });
}

startBot();

// ===== ROUTES =====

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/api/qrcode', (req, res) => {
  res.json({
    qrcode: qrCodeImage,
    status: clientState,
    message: stateMessage
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    status: clientState,
    message: stateMessage
  });
});

app.get('/status', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/send-message', async (req, res) => {
  if (!sock) {
    return res.status(500).json({ status: false, message: 'Client belum siap' });
  }

  let number = req.body.number.toString();
  const message = req.body.message;
  const formattedNumber = number.includes('@s.whatsapp.net') ? number : number + '@s.whatsapp.net';

  try {
    const sent = await sock.sendMessage(formattedNumber, { text: message });
    res.status(200).json({
      status: true,
      message: 'Pesan berhasil dikirim',
      data: sent
    });
  } catch (error) {
    console.error('Gagal kirim pesan:', error);
    res.status(500).json({
      status: false,
      message: 'Gagal mengirim pesan',
      error: error.toString()
    });
  }
});



app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
  console.log(`Akses QR Code login di http://localhost:${port}/login`);
});


