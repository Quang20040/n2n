/**
 * Crypto Utils – RSA + AES
 * Full stable version
 */

const cryptoUtils = {
    myPrivateKey: null,
    myPublicKey: null,
    publicKeys: {},
    fingerprints: {},
    myFingerprint: null,
    readyPromise: null,

    initialize() {
        if (!this.readyPromise) {
            this.readyPromise = (async () => {
                try {
                    // Thử tải khóa từ localStorage trước
                    const savedKeys = this.loadKeysFromStorage();
                    if (savedKeys && savedKeys.privateKey && savedKeys.publicKey) {
                        try {
                            this.myPrivateKey = await crypto.subtle.importKey(
                                "jwk",
                                savedKeys.privateKey,
                                { name: "RSA-OAEP", hash: "SHA-256" },
                                true,
                                ["decrypt"]
                            );
                            this.myPublicKey = await crypto.subtle.importKey(
                                "jwk",
                                savedKeys.publicKey,
                                { name: "RSA-OAEP", hash: "SHA-256" },
                                true,
                                ["encrypt"]
                            );
                            this.myFingerprint = await this.computeFingerprintFromKey(this.myPublicKey);
                            // Đã tải thành công, không cần tạo mới
                            return;
                        } catch (error) {
                            console.warn("Không thể tải khóa đã lưu, tạo khóa mới:", error);
                            // Xóa khóa lỗi
                            localStorage.removeItem("vaultchat-crypto-keys");
                        }
                    }
                } catch (error) {
                    console.warn("Lỗi khi tải khóa từ storage:", error);
                }

                // Tạo khóa mới nếu không có hoặc tải thất bại
                const keyPair = await window.crypto.subtle.generateKey(
                    {
                        name: "RSA-OAEP",
                        modulusLength: 2048,
                        publicExponent: new Uint8Array([1, 0, 1]),
                        hash: "SHA-256"
                    },
                    true,
                    ["encrypt", "decrypt"]
                );

                this.myPrivateKey = keyPair.privateKey;
                this.myPublicKey = keyPair.publicKey;
                this.myFingerprint = await this.computeFingerprintFromKey(this.myPublicKey);
                
                // Lưu khóa mới (không await để không block)
                this.saveKeysToStorage().catch(err => {
                    console.warn("Không thể lưu khóa:", err);
                });
            })();
        }

        return this.readyPromise;
    },

    async ensureReady() {
        await this.initialize();
    },

    async getPublicKeyJWK() {
        await this.ensureReady();
        return await crypto.subtle.exportKey("jwk", this.myPublicKey);
    },

    async syncPublicKeys(list, currentUser) {
        await this.ensureReady();

        const changes = { added: [], changed: [] };
        const updated = {};

        for (const entry of list) {
            const { username, publicKey } = entry;
            if (!username || username === currentUser || !publicKey) continue;

            const fingerprint = await this.computeFingerprintFromJwk(publicKey);
            const previousFingerprint = this.fingerprints[username];

            if (!previousFingerprint) {
                changes.added.push(username);
            } else if (previousFingerprint !== fingerprint) {
                changes.changed.push(username);
            }

            updated[username] = await crypto.subtle.importKey(
                "jwk",
                publicKey,
                { name: "RSA-OAEP", hash: "SHA-256" },
                true,
                ["encrypt"]
            );

            this.fingerprints[username] = fingerprint;
        }

        this.publicKeys = {
            ...this.publicKeys,
            ...updated
        };

        return changes;
    },

    hasPublicKey(username) {
        return Boolean(this.publicKeys[username]);
    },

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },

    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i += 1) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    },

    async encryptMessage(message, toUser) {
        if (!this.hasPublicKey(toUser)) {
            throw new Error("Không tìm thấy khóa công khai của người dùng.");
        }

        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        const aesKey = await crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            aesKey,
            data
        );

        const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
        const wrappedKey = await crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            this.publicKeys[toUser],
            rawAesKey
        );

        return {
            ciphertext: this.arrayBufferToBase64(ciphertext),
            wrappedKey: this.arrayBufferToBase64(wrappedKey),
            iv: this.arrayBufferToBase64(iv.buffer)
        };
    },

    async decryptMessage(payload) {
        await this.ensureReady();

        const { ciphertext, wrappedKey, iv } = payload;
        if (!ciphertext || !wrappedKey || !iv) {
            throw new Error("Dữ liệu mã hóa không hợp lệ.");
        }

        const decryptedKey = await crypto.subtle.decrypt(
            { name: "RSA-OAEP" },
            this.myPrivateKey,
            this.base64ToArrayBuffer(wrappedKey)
        );

        const aesKey = await crypto.subtle.importKey(
            "raw",
            decryptedKey,
            { name: "AES-GCM" },
            false,
            ["decrypt"]
        );

        const plainBuffer = await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: new Uint8Array(this.base64ToArrayBuffer(iv))
            },
            aesKey,
            this.base64ToArrayBuffer(ciphertext)
        );

        return new TextDecoder().decode(plainBuffer);
    }

};

cryptoUtils.arrayBufferToHex = function arrayBufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
};

cryptoUtils.normalizeJwk = function normalizeJwk(jwk) {
    const ordered = {};
    Object.keys(jwk)
        .sort()
        .forEach(key => {
            ordered[key] = jwk[key];
        });
    return JSON.stringify(ordered);
};

cryptoUtils.computeFingerprintFromJwk = async function computeFingerprintFromJwk(jwk) {
    const payload = new TextEncoder().encode(cryptoUtils.normalizeJwk(jwk));
    const hash = await crypto.subtle.digest("SHA-256", payload);
    const hex = cryptoUtils.arrayBufferToHex(hash).slice(0, 40);
    return hex.match(/.{1,4}/g).join(" ");
};

cryptoUtils.computeFingerprintFromKey = async function computeFingerprintFromKey(key) {
    const jwk = await crypto.subtle.exportKey("jwk", key);
    return cryptoUtils.computeFingerprintFromJwk(jwk);
};

cryptoUtils.getMyFingerprint = async function getMyFingerprint() {
    await this.ensureReady();
    if (!this.myFingerprint) {
        this.myFingerprint = await this.computeFingerprintFromKey(this.myPublicKey);
    }
    return this.myFingerprint;
};

cryptoUtils.getFingerprintFor = async function getFingerprintFor(username) {
    const key = this.publicKeys[username];
    if (!key) return null;
    const jwk = await crypto.subtle.exportKey("jwk", key);
    return this.computeFingerprintFromJwk(jwk);
};

// Lưu và tải khóa từ localStorage
cryptoUtils.saveKeysToStorage = async function saveKeysToStorage() {
    try {
        await this.ensureReady();
        const privateKeyJwk = await crypto.subtle.exportKey("jwk", this.myPrivateKey);
        const publicKeyJwk = await crypto.subtle.exportKey("jwk", this.myPublicKey);
        
        const keysData = {
            privateKey: privateKeyJwk,
            publicKey: publicKeyJwk,
            fingerprint: this.myFingerprint
        };
        
        localStorage.setItem("vaultchat-crypto-keys", JSON.stringify(keysData));
    } catch (error) {
        console.error("Lỗi lưu khóa:", error);
    }
};

cryptoUtils.loadKeysFromStorage = function loadKeysFromStorage() {
    try {
        const stored = localStorage.getItem("vaultchat-crypto-keys");
        if (!stored) return null;
        return JSON.parse(stored);
    } catch (error) {
        console.error("Lỗi tải khóa:", error);
        return null;
    }
};
