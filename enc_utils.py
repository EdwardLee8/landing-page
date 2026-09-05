"""會員資料加解密的共用工具。

全站 .enc 檔一律使用同一格式,瀏覽器端 (js/member-auth.js 的 decryptEnc)
與 Python 端必須保持一致:

    base64( salt[16] || nonce[12] || AES-256-GCM(ciphertext) )
    key = PBKDF2-HMAC-SHA256(password, salt, 100_000 iterations, 32 bytes)

密碼一律由環境變數 MEMBER_DATA_PASSWORD 提供,不得硬編碼在任何檔案中
(本 repo 為 public,硬編碼等同公開發佈)。
"""
from __future__ import annotations

import base64
import hashlib
import os
import sys

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ENV_VAR = "MEMBER_DATA_PASSWORD"
SALT_LEN = 16
NONCE_LEN = 12
ITERATIONS = 100_000


def _derive(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt,
                     iterations=ITERATIONS)
    return kdf.derive(password.encode())


def encrypt_bytes(plaintext: bytes, password: str) -> str:
    """加密為 base64 字串(與瀏覽器端 decryptEnc 相容)。"""
    salt = os.urandom(SALT_LEN)
    nonce = os.urandom(NONCE_LEN)
    ct = AESGCM(_derive(password, salt)).encrypt(nonce, plaintext, None)
    return base64.b64encode(salt + nonce + ct).decode()


def decrypt_bytes(b64: str, password: str) -> bytes:
    """解密 encrypt_bytes 的輸出;密碼錯誤時拋出 InvalidTag。"""
    raw = base64.b64decode(b64)
    salt, nonce, ct = raw[:SALT_LEN], raw[SALT_LEN:SALT_LEN + NONCE_LEN], raw[SALT_LEN + NONCE_LEN:]
    return AESGCM(_derive(password, salt)).decrypt(nonce, ct, None)


def encrypt_file(src, dst, password: str) -> None:
    with open(src, "rb") as f:
        enc = encrypt_bytes(f.read(), password)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(enc)


def decrypt_file(src, password: str) -> bytes:
    with open(src, encoding="utf-8") as f:
        return decrypt_bytes(f.read(), password)


def password_hash(password: str) -> str:
    """login.html 等頁面內 _PW_HASH 使用的 SHA-256 十六進位字串。"""
    return hashlib.sha256(password.encode()).hexdigest()


def get_password(argv_index: int | None = None) -> str:
    """取得會員資料密碼。

    優先讀環境變數 MEMBER_DATA_PASSWORD;若指定 argv_index 且該位置有值,
    則允許以命令列參數覆寫(方便輪換時同時處理新舊密碼)。
    兩者皆無則直接結束,絕不回退到任何內建預設值。
    """
    if argv_index is not None and len(sys.argv) > argv_index:
        return sys.argv[argv_index]
    pw = os.environ.get(ENV_VAR)
    if not pw:
        sys.exit(
            f"錯誤:未設定環境變數 {ENV_VAR}。\n"
            f"請先設定會員資料密碼,例如:\n"
            f"  export {ENV_VAR}='...'\n"
            f"或在專案根目錄建立 .env(已被 .gitignore 排除),參考 .env.example。"
        )
    return pw
