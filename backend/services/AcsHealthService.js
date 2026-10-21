'use strict';

/**
 * Pantau NBI GenieACS. Satu alert saat layanan berhenti, satu lagi saat pulih.
 * State ada di memori proses supaya cron tidak mengirim pesan yang sama tiap siklus.
 */
const logger = require('../utils/logger');

let _down = false;

async function runCheck(cfg) {
  const Telegram = require('./TelegramService');
  const genie = require('./GenieacsService');
  let result;
  try {
    result = await genie.testConnection();
  } catch (e) {
    result = { success: false, error: e.message };
  }

  if (result && result.success) {
    if (_down) {
      _down = false;
      try {
        await Telegram.sendMessage('<b>ACS PULIH</b>\n\nLayanan GenieACS (TR-069) menjawab lagi. Provisioning dan status ONT kembali berjalan.', cfg);
      } catch (e) {
        logger.warn('[AcsHealth] gagal kirim pulih: ' + e.message);
      }
      logger.info('[AcsHealth] ACS pulih');
    }
    return { down: false };
  }

  if (!_down) {
    _down = true;
    const why = String((result && result.error) || 'tidak terjangkau')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .slice(0, 300);
    try {
      await Telegram.sendMessage(
        '<b>ACS BERHENTI</b>\n\nGenieACS tidak menjawab.\nPenyebab: ' + why +
        '\n\nProvisioning WiFi dan pembaruan status ONT tertahan sampai layanan ACS hidup kembali.',
        cfg
      );
    } catch (e) {
      logger.warn('[AcsHealth] gagal kirim down: ' + e.message);
    }
    logger.warn('[AcsHealth] ACS berhenti: ' + why);
  }
  return { down: true, error: result && result.error };
}

module.exports = { runCheck };
