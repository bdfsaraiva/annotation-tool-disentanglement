"""
Utility for producing safe filesystem filenames from arbitrary strings.

Used when constructing temporary upload paths and download attachment names so
that user-supplied filenames cannot contain path traversal sequences, shell
special characters, or other unsafe bytes.
"""
import re


def sanitize_filename(name: str, replacement: str = "_") -> str:
    """
    Remove unsafe characters from a filename string.

    Keeps only ASCII letters, digits, dots (``.``), hyphens (``-``), and
    underscores (``_``).  All other character runs are replaced with
    ``replacement``, consecutive replacements are collapsed to one, and leading/
    trailing replacements are stripped.  An empty result falls back to
    ``"file"`` so the caller always receives a non-empty string.

    Args:
        name: The raw filename to sanitise (may include extension, e.g.
            ``"My Chat Room (2024).csv"``).
        replacement: Character to substitute for unsafe sequences (default
            ``"_"``).

    Returns:
        A sanitised filename string safe to use as a filesystem path component.

    Examples:
        >>> sanitize_filename("My File (v2).csv")
        'My_File_v2_.csv'
        >>> sanitize_filename("../../etc/passwd")
        'etc_passwd'
    """
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", replacement, name.strip())
    # Collapse multiple consecutive replacement characters (e.g. "___" → "_").
    cleaned = re.sub(rf"{re.escape(replacement)}+", replacement, cleaned)
    cleaned = cleaned.strip(replacement)
    return cleaned or "file"
