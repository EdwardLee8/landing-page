"""
Encrypt JSON data files with AES-256-GCM (PBKDF2, 100k iterations).
Output: same filename with .enc extension.
"""
import base64, json, os, sys
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def encrypt_file(path, password):
    with open(path, "rb") as f:
        plaintext = f.read()
    salt = os.urandom(16)
    nonce = os.urandom(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100_000)
    key = kdf.derive(password.encode())
    ct = AESGCM(key).encrypt(nonce, plaintext, None)
    enc = base64.b64encode(salt + nonce + ct).decode()
    out = path.replace(".json", ".enc")
    with open(out, "w") as f:
        f.write(enc)
    orig_kb = len(plaintext) / 1024
    enc_kb = len(enc) / 1024
    print(f"  {os.path.basename(path)} ({orig_kb:.0f}KB) → {os.path.basename(out)} ({enc_kb:.0f}KB)")

FILES = [
    ("hk_keywords_export.json",  "HK_stock_Key_worD"),
    ("hk_corr_clusters.json",    "HK_stock_Key_worD"),
    ("us_keywords_export.json",  "US_stock_Key_worD"),
    ("us_corr_clusters_v2.json", "US_stock_Key_worD"),
    ("cn_keywords_export.json",  "CN_stock_Key_worD"),
    ("cn_corr_clusters.json",    "CN_stock_Key_worD"),
]

base = os.path.dirname(os.path.abspath(__file__))
print("Encrypting assets...")
for fname, pw in FILES:
    encrypt_file(os.path.join(base, fname), pw)
print("Done.")
