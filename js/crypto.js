/**
 * Lokální šifrování souborů (.socioenc) pomocí Web Crypto API (AES-GCM 256 + PBKDF2 SHA-256).
 * Veškeré šifrování probíhá výhradně v prohlížeči uživatele.
 */
(function (root) {
  'use strict';

  const ITERATIONS = 150000;

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function isCryptoAvailable() {
    return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
  }

  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptProject(projectObj, password) {
    if (!isCryptoAvailable()) {
      throw new Error(
        'Web Crypto API není v tomto prostředí dostupné (vyžaduje HTTPS nebo localhost).'
      );
    }
    if (!password || password.length < 4) {
      throw new Error('Zadejte prosím heslo alespoň o délce 4 znaky.');
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);

    const plaintext = new TextEncoder().encode(JSON.stringify(projectObj));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

    return JSON.stringify(
      {
        format: 'tridni-sociometrie-encrypted',
        version: 1,
        kdf: 'PBKDF2-SHA256',
        iterations: ITERATIONS,
        cipher: 'AES-256-GCM',
        salt: arrayBufferToBase64(salt),
        iv: arrayBufferToBase64(iv),
        data: arrayBufferToBase64(ciphertext),
      },
      null,
      2
    );
  }

  async function decryptProject(encryptedJsonString, password) {
    if (!isCryptoAvailable()) {
      throw new Error(
        'Web Crypto API není v tomto prostředí dostupné (vyžaduje HTTPS nebo localhost).'
      );
    }

    let payload;
    try {
      payload = JSON.parse(encryptedJsonString);
    } catch {
      throw new Error('Soubor není platný JSON.');
    }

    if (payload.format !== 'tridni-sociometrie-encrypted') {
      throw new Error('Soubor nemá očekávaný šifrovaný formát (.socioenc).');
    }

    const salt = base64ToUint8Array(payload.salt);
    const iv = base64ToUint8Array(payload.iv);
    const ciphertext = base64ToUint8Array(payload.data);

    const key = await deriveKey(password, salt);

    try {
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      const text = new TextDecoder().decode(decrypted);
      return JSON.parse(text);
    } catch {
      throw new Error('Nepodařilo se dešifrovat soubor. Zkontrolujte prosím zadané heslo.');
    }
  }

  root.SocioCrypto = {
    isCryptoAvailable,
    encryptProject,
    decryptProject,
  };
})(typeof self !== 'undefined' ? self : this);
