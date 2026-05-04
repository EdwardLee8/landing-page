"""Encrypt US transcript BI data for static hosting.

Usage:
  py -3.12 encrypt_us_transcript.py <unified_password>
"""
import base64, json, os, sys
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

if len(sys.argv) < 2:
    print("Usage: py -3.12 encrypt_us_transcript.py <unified_password>")
    sys.exit(1)
PASSWORD = sys.argv[1]

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
SOURCE_DIR  = os.path.join(os.path.dirname(BASE_DIR), "earnings-transcript", "data", "website_output")
SRC_INDEX   = os.path.join(SOURCE_DIR, "us_transcript_index.json")
SRC_RAW_DIR = os.path.join(SOURCE_DIR, "us_transcript_raw")
DST_INDEX   = os.path.join(BASE_DIR, "us_transcript_index.enc")
DST_DATA    = os.path.join(BASE_DIR, "us_transcript_data")


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


os.makedirs(DST_DATA, exist_ok=True)

print("Encrypting index...")
encrypt_file(SRC_INDEX, DST_INDEX)
print(f"  us_transcript_index.json → us_transcript_index.enc ({os.path.getsize(DST_INDEX)/1024:.0f}KB)")

files = [f for f in os.listdir(SRC_RAW_DIR) if f.endswith(".json")]
print(f"Encrypting {len(files)} ticker files...")
for i, fname in enumerate(files):
    sym = fname.replace(".json", "")
    encrypt_file(os.path.join(SRC_RAW_DIR, fname), os.path.join(DST_DATA, sym + ".enc"))
    if (i + 1) % 100 == 0:
        print(f"  {i+1}/{len(files)}")

print(f"Done. {len(files)} files written to us_transcript_data/")
