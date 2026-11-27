/*
 * Самоподписанный сертификат для локальной сети.
 *
 * Зачем: браузеры дают доступ к камере и микрофону только в «безопасном
 * контексте» — https:// или http://localhost. Поэтому по адресу вида
 * http://192.168.1.10:3000 видеокружок и видеозвонок на телефоне/другом ПК
 * молча не работают. Свой сертификат решает это без покупки домена.
 *
 * Генерация сделана на встроенном crypto: тянуть node-forge или требовать
 * установленный openssl нельзя — у части пользователей его нет. DER-кодирование
 * X.509 здесь минимальное: ровно те поля, которые нужны браузеру (SAN с IP
 * локальной сети, basicConstraints, keyUsage, extendedKeyUsage).
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

/* ---------- ASN.1 DER ---------- */

function derLen(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  let v = n;
  while (v > 0) { bytes.unshift(v & 0xff); v >>= 8; }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

const tlv = (tag, content) => Buffer.concat([Buffer.from([tag]), derLen(content.length), content]);
const seq = (...items) => tlv(0x30, Buffer.concat(items));
const set = (...items) => tlv(0x31, Buffer.concat(items));
const explicit = (n, content) => tlv(0xa0 + n, content);
const utf8 = (s) => tlv(0x0c, Buffer.from(String(s), 'utf8'));
const octet = (buf) => tlv(0x04, buf);
const bitString = (buf, unused = 0) => tlv(0x03, Buffer.concat([Buffer.from([unused]), buf]));
const nullTag = () => Buffer.from([0x05, 0x00]);

function int(buf) {
  let b = Buffer.from(buf);
  while (b.length > 1 && b[0] === 0 && !(b[1] & 0x80)) b = b.slice(1);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return tlv(0x02, b);
}

function oid(str) {
  const parts = String(str).split('.').map(Number);
  const out = [parts[0] * 40 + parts[1]];
  for (const p of parts.slice(2)) {
    const stack = [p & 0x7f];
    let v = p >> 7;
    while (v > 0) { stack.unshift((v & 0x7f) | 0x80); v >>= 7; }
    out.push(...stack);
  }
  return tlv(0x06, Buffer.from(out));
}

function utcTime(date) {
  const p = (n) => String(n).padStart(2, '0');
  const s = p(date.getUTCFullYear() % 100) + p(date.getUTCMonth() + 1) + p(date.getUTCDate()) +
    p(date.getUTCHours()) + p(date.getUTCMinutes()) + p(date.getUTCSeconds()) + 'Z';
  return tlv(0x17, Buffer.from(s, 'latin1'));
}

const SHA256_RSA = seq(oid('1.2.840.113549.1.1.11'), nullTag());
const CN = '2.5.4.3';

function name(cn) {
  return seq(set(seq(oid(CN), utf8(cn))));
}

function extension(id, critical, value) {
  const parts = [oid(id)];
  if (critical) parts.push(tlv(0x01, Buffer.from([0xff])));
  parts.push(octet(value));
  return seq(...parts);
}

/* ---------- Адреса локальной сети ---------- */

// Только IPv4 частных диапазонов: 10/8, 172.16/12, 192.168/16. Публичный адрес
// в сертификат не кладём — он меняется и не нужен для доступа из дома.
function lanAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const net of list || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(net.address)) continue;
      if (!out.includes(net.address)) out.push(net.address);
    }
  }
  return out;
}

/* ---------- Сертификат ---------- */

// IPv6-адрес в SAN — это ровно 16 байт. «::1» и прочие сокращения нужно
// развернуть, иначе декодер видит «invalid length».
function ipv6Bytes(ip) {
  const [head, tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left;
  return Buffer.from(groups.flatMap((g) => {
    const pad = (g || '0').padStart(4, '0');
    return [parseInt(pad.slice(0, 2), 16), parseInt(pad.slice(2, 4), 16)];
  }));
}

function buildCert({ keyBits = 2048, days = 825, hosts = [] } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: keyBits,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const now = new Date();
  const notBefore = new Date(now.getTime() - 24 * 3600 * 1000);
  const notAfter = new Date(now.getTime() + days * 24 * 3600 * 1000);

  const dns = ['localhost'];
  const ips = ['127.0.0.1', '::1', ...hosts];
  const generalNames = [
    ...dns.map((d) => tlv(0x82, Buffer.from(d, 'latin1'))),
    ...ips.map((ip) => tlv(0x87, ip.includes(':') ? ipv6Bytes(ip) : Buffer.from(ip.split('.').map(Number)))),
  ];

  // SKI/AKI связывают сертификат с самим собой: без них часть клиентов считает
  // подпись «непонятно чьей», хотя verify() проходит.
  const keyId = crypto.createHash('sha1').update(publicKey).digest();
  const extensions = seq(
    extension('2.5.29.19', true, seq()),                       // basicConstraints: не CA
    extension('2.5.29.15', true, bitString(Buffer.from([0xa0]), 5)), // digitalSignature + keyEncipherment
    extension('2.5.29.37', false, seq(oid('1.3.6.1.5.5.7.3.1'))),     // serverAuth
    extension('2.5.29.17', false, seq(...generalNames)),        // subjectAltName
    extension('2.5.29.14', false, octet(keyId)),                // subjectKeyIdentifier
    extension('2.5.29.35', false, seq(tlv(0x80, keyId))),       // authorityKeyIdentifier
  );

  const serial = crypto.randomBytes(16);
  serial[0] &= 0x7f; // положительное число

  const tbs = seq(
    explicit(0, int(Buffer.from([2]))),
    int(serial),
    SHA256_RSA,
    name('MAXgram local'),
    seq(utcTime(notBefore), utcTime(notAfter)),
    name('MAXgram local'),
    publicKey,
    explicit(3, extensions),
  );

  const signature = crypto.sign('sha256', tbs, privateKey);
  const cert = seq(tbs, SHA256_RSA, bitString(signature));

  return {
    key: privateKey,
    cert: '-----BEGIN CERTIFICATE-----\n' + cert.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END CERTIFICATE-----\n',
    notAfter,
  };
}

/*
 * Возвращает { key, cert, created } из папки кэша. Сертификат переиспользуется:
 * иначе браузер просил бы подтвердить исключение при каждом запуске сервера.
 * Пересоздаём, если файла нет, он битый или истекает в ближайшую неделю.
 */
function ensureCert(dir, { hosts = [], days = 825 } = {}) {
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  try {
    const key = fs.readFileSync(keyFile, 'utf8');
    const cert = fs.readFileSync(certFile, 'utf8');
    const x509 = new crypto.X509Certificate(cert);
    const validTo = new Date(x509.validTo);
    const coversHosts = hosts.every((h) => {
      const san = x509.subjectAltName || '';
      return san.includes(h);
    });
    if (validTo.getTime() - Date.now() > 7 * 86400000 && coversHosts) {
      return { key, cert, created: false, notAfter: validTo };
    }
  } catch { /* нет файлов или мусор — генерируем заново */ }

  const made = buildCert({ days, hosts });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keyFile, made.key, { mode: 0o600 });
  fs.writeFileSync(certFile, made.cert);
  return { key: made.key, cert: made.cert, created: true, notAfter: made.notAfter };
}

module.exports = { ensureCert, lanAddresses, buildCert };
