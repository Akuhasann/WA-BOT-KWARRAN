const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const express = require('express');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;
let qrCode = null;
let sock = null; // Deklarasikan variabel sock di scope yang lebih luas

// Gunakan middleware untuk memproses body permintaan JSON
app.use(express.json());

async function connectToWhatsApp() {
  const authPath = path.join(__dirname, 'auth_info_baileys');

  if (!fs.existsSync(authPath)) {
    fs.mkdirSync(authPath);
  }

  const { state, saveCreds } = await useMultiFileAuthState(authPath);

  sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Kumbara', 'Chrome', '1.0'],
    auth: state,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('QR code tersedia. Akses di http://localhost:3000/qr');
      qrCode = qr;
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error instanceof Boom) && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
      console.log('Koneksi terputus. Menyambung ulang:', shouldReconnect);
      console.log('Alasan terputus:', lastDisconnect.error.output); // Log ini sangat membantu!
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('Koneksi berhasil! Bot siap.');
      qrCode = null;
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (!messages.length || messages[0].key.remoteJid === 'status@broadcast') {
      return;
    }

    const m = messages[0];
    const jid = m.key.remoteJid;
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text;

    if (m.key.fromMe) {
      return;
    }

    console.log(`Pesan baru dari ${jid}: ${text}`);
    if (text?.toLowerCase().trim() === '/idgrup') {
      try {
        const groups = await sock.groupFetchAllParticipating();
        let groupMessage = "Daftar Grup yang diikuti bot:\n\n";

        Object.values(groups).forEach(group => {
          groupMessage += `*Nama:* ${group.subject}\n`;
          groupMessage += `*ID:* ${group.id}\n`;
          groupMessage += `------------------------------\n`;
        });

        await sock.sendMessage(jid, { text: groupMessage });
      } catch (error) {
        console.error('Gagal memproses perintah /idgrup:', error);
        await sock.sendMessage(jid, { text: 'Maaf, terjadi kesalahan saat mencoba mendapatkan daftar grup.' });
      }
    }

  });
}

// Endpoint untuk menampilkan QR code di browser
app.get('/qr', async (req, res) => {
  if (qrCode) {
    try {
      const qrImage = await qrcode.toBuffer(qrCode, { type: 'png' });
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': qrImage.length
      });
      res.end(qrImage);
    } catch (err) {
      res.status(500).send('Gagal membuat QR code');
    }
  } else {
    res.status(200).send('Koneksi berhasil. QR code tidak diperlukan.');
  }
});

app.get('/get-groups', async (req, res) => {
  if (!sock || !sock.user) {
    return res.status(400).json({ success: false, message: 'Bot belum terhubung.' });
  }

  try {
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups).map(group => {
      return {
        id: group.id,
        name: group.subject,
        size: group.size,
      };
    });
    res.json({ success: true, groups: groupList });
  } catch (error) {
    console.error('Gagal mendapatkan daftar grup:', error);
    res.status(500).json({ success: false, message: 'Gagal mendapatkan daftar grup.', error: error.message });
  }
});

// Endpoint baru untuk mengirim pesan
app.post('/send-message', async (req, res) => {
  const { jid, message } = req.body;

  // Log untuk memastikan permintaan POST diterima
  console.log(`[send-message] Permintaan POST diterima. Jid: ${jid}, Pesan: ${message}`);

  if (!sock || !sock.user) {
    console.log('[send-message] Gagal: Bot belum terhubung.');
    return res.status(400).json({ success: false, message: 'Bot belum terhubung atau QR belum dipindai.' });
  }

  if (!jid || !message) {
    console.log('[send-message] Gagal: JID atau pesan kosong.');
    return res.status(400).json({ success: false, message: 'Harap sediakan jid dan message.' });
  }

  try {
    console.log(`[send-message] Mencoba mengirim pesan ke ${jid}...`);
    await sock.sendMessage(jid, { text: message });
    console.log(`[send-message] Pesan berhasil dikirim ke ${jid}.`);
    res.json({ success: true, message: 'Pesan berhasil dikirim.' });
  } catch (error) {
    console.error('[send-message] Gagal mengirim pesan:', error);
    res.status(500).json({ success: false, message: 'Gagal mengirim pesan.', error: error.message });
  }
});

// Endpoint baru untuk mengirim gambar dari file lokal
app.post('/send-local-image', async (req, res) => {
  const { jid, caption, file_path } = req.body;

  // --- LOG UNTUK DEBUGGING ---
  console.log(`[send-local-image] Permintaan POST diterima.`);
  console.log(`[send-local-image] Data yang diterima: JID: ${jid}, File Path: ${file_path}`);

  if (!sock || !sock.user) {
    console.log('[send-local-image] GAGAL: Bot belum terhubung.');
    return res.status(400).json({ success: false, message: 'Bot belum terhubung atau QR belum dipindai.' });
  }

  if (!jid || !file_path) {
    console.log('[send-local-image] GAGAL: JID atau file_path kosong.');
    return res.status(400).json({ success: false, message: 'Harap sediakan jid dan file_path.' });
  }

  // Gunakan path absolut yang Anda berikan
  const base_path = '/home/kwarranc/kumbara.kwarrancibarusah.my.id/storage/app/public';
  const fullPath = path.join(base_path, file_path);

  console.log(`[send-local-image] Mencari file di path: ${fullPath}`);

  if (!fs.existsSync(fullPath)) {
    console.log('[send-local-image] GAGAL: File tidak ditemukan.');
    return res.status(404).json({ success: false, message: `File tidak ditemukan di path: ${fullPath}` });
  }

  try {
    console.log('[send-local-image] File ditemukan. Membaca file...');
    const fileBuffer = fs.readFileSync(fullPath);
    console.log('[send-local-image] File berhasil dibaca. Mengirim pesan...');

    await sock.sendMessage(jid, {
      image: fileBuffer,
      caption: caption || ''
    });

    console.log(`[send-local-image] Pesan gambar berhasil dikirim ke ${jid}.`);
    res.json({ success: true, message: 'Gambar berhasil dikirim.' });
  } catch (error) {
    console.error('[send-local-image] GAGAL mengirim gambar:', error);
    res.status(500).json({ success: false, message: 'Gagal mengirim gambar.', error: error.message });
  }
});


app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
  connectToWhatsApp();
});