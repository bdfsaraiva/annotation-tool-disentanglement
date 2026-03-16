import re


def sanitize_filename(name: str, replacement: str = "_") -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", replacement, name.strip())
    cleaned = re.sub(rf"{re.escape(replacement)}+", replacement, cleaned)
    cleaned = cleaned.strip(replacement)
    return cleaned or "file"
