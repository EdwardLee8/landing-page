"""Encrypt IRM survey pipeline data for landing-page static hosting.

Usage:
  py -3.12 encrypt_irm.py <unified_password>
"""
import base64, json, os, sys
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

if len(sys.argv) < 2:
    print("Usage: py -3.12 encrypt_irm.py <unified_password>")
    sys.exit(1)
PASSWORD = sys.argv[1]
IRM_PIPELINE_DIR = os.path.join(os.path.dirname(__file__), "..", "irm-survey-pipeline")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE_DIR, "cn_irm_data")


def encrypt_bytes(plaintext: bytes, password: str) -> str:
    salt = os.urandom(16)
    nonce = os.urandom(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100_000)
    key = kdf.derive(password.encode())
    ct = AESGCM(key).encrypt(nonce, plaintext, None)
    return base64.b64encode(salt + nonce + ct).decode()


def encrypt_file(src: str, dst: str):
    with open(src, "rb") as f:
        enc = encrypt_bytes(f.read(), PASSWORD)
    with open(dst, "w") as f:
        f.write(enc)


# 1. Encrypt index
src_index = os.path.join(IRM_PIPELINE_DIR, "irm-index.json")
dst_index = os.path.join(BASE_DIR, "cn_irm_index.enc")
print("Encrypting index...")
encrypt_file(src_index, dst_index)
idx_kb = os.path.getsize(dst_index) / 1024
print(f"  irm-index.json → cn_irm_index.enc ({idx_kb:.0f}KB)")

# 2. Encrypt each stock file
os.makedirs(OUT_DIR, exist_ok=True)
src_data_dir = os.path.join(IRM_PIPELINE_DIR, "irm-data")
files = [f for f in os.listdir(src_data_dir) if f.endswith(".json")]
print(f"Encrypting {len(files)} stock files...")

for i, fname in enumerate(files):
    code = fname.replace(".json", "")
    src = os.path.join(src_data_dir, fname)
    dst = os.path.join(OUT_DIR, code + ".enc")
    encrypt_file(src, dst)
    if (i + 1) % 100 == 0:
        print(f"  {i+1}/{len(files)}")

print(f"Done. {len(files)} files written to cn_irm_data/")
