"""
CSV parsing utilities for chat-message and annotation import/preview.

All public functions operate on file paths rather than in-memory buffers so
that callers can hand off large files without loading them entirely into memory
upfront (Pandas reads the file lazily via ``nrows``).

Chat-message CSV format (required columns, case-insensitive):
- ``turn_id``      — unique identifier for the turn
- ``user_id``      — participant identifier
- ``turn_text``    — the message content
- ``reply_to_turn`` *(optional)* — ``turn_id`` of the turn this replies to

Annotation CSV format (required columns, case-insensitive):
- ``turn_id``
- ``thread_id`` / ``thread_column`` / ``thread``  *(accepted names for the
  thread assignment column)*
"""
import csv
import pandas as pd
from typing import List, Dict, Any, Tuple, Optional


def _read_chat_messages_df(file_path: str, limit: Optional[int] = None) -> pd.DataFrame:
    """
    Parse a chat-messages CSV file into a cleaned ``DataFrame``.

    Column names are normalised to lowercase.  The ``user_id`` column is
    coerced through ``float → int → str`` to handle values that Pandas may read
    as floats (e.g. ``"1.0"`` → ``"1"``).  Rows missing any required field are
    dropped silently.

    Args:
        file_path: Absolute path to the CSV file to read.
        limit: If provided, only the first ``limit`` data rows are read (used
            for preview endpoints to avoid loading the full file).

    Returns:
        A ``DataFrame`` containing ``turn_id``, ``user_id``, ``turn_text``, and
        optionally ``reply_to_turn`` columns.

    Raises:
        ValueError: If any required columns are absent.
        pd.errors.ParserError: If the file cannot be parsed as CSV.
    """
    df = pd.read_csv(
        file_path,
        quoting=csv.QUOTE_MINIMAL,
        escapechar='\\',
        encoding='utf-8',
        on_bad_lines='error',
        nrows=limit
    )
    df.columns = df.columns.str.lower()

    required_columns = ['turn_id', 'user_id', 'turn_text']
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")

    # Keep only the columns we need; include reply_to_turn if present.
    columns_to_use = required_columns + (['reply_to_turn'] if 'reply_to_turn' in df.columns else [])
    df = df[columns_to_use]

    # user_id may arrive as "1.0" when the CSV stores integers without quotes;
    # convert via float first to handle these cases.
    df['user_id'] = df['user_id'].apply(lambda x: str(int(float(x))) if pd.notna(x) else None)
    for col in ['turn_id', 'turn_text']:
        df[col] = df[col].apply(lambda x: str(x).strip() if pd.notna(x) else None)

    if 'reply_to_turn' in df.columns:
        # Treat sentinel strings ("nan", "None", "") as null so they are
        # stored as NULL in the database rather than as literal text.
        df['reply_to_turn'] = df['reply_to_turn'].apply(
            lambda x: str(x).strip() if pd.notna(x) and str(x).strip() not in ['nan', 'None', ''] else None
        )

    df = df.dropna(subset=required_columns)
    return df


def preview_chat_messages(
    file_path: str,
    limit: int
) -> Tuple[int, List[Dict[str, Any]], List[str]]:
    """
    Return a preview of a chat-messages CSV file without committing any data.

    The total row count is computed independently of the limit so the caller
    knows how many rows will be imported if they proceed.

    Args:
        file_path: Absolute path to the CSV file.
        limit: Maximum number of rows to include in the preview.

    Returns:
        A 3-tuple ``(total_rows, preview_rows, warnings)`` where:
        - ``total_rows`` — total data rows in the file (excluding the header).
        - ``preview_rows`` — list of row dicts (up to ``limit``).
        - ``warnings`` — list of human-readable warning strings (e.g. dangling
          ``reply_to_turn`` references).
    """
    total_rows = count_csv_data_rows(file_path)
    df = _read_chat_messages_df(file_path, limit=limit)
    preview_rows = df.to_dict('records')

    warnings: List[str] = []
    if 'reply_to_turn' in df.columns:
        missing_count = count_missing_reply_to_turn(file_path)
        if missing_count:
            warnings.append(f"{missing_count} rows reference a reply_to_turn not present in the file")

    return total_rows, preview_rows, warnings


def import_chat_messages(file_path: str) -> List[Dict[str, Any]]:
    """
    Parse a chat-messages CSV file and return all rows as a list of dicts.

    Required columns (case-insensitive): ``turn_id``, ``user_id``, ``turn_text``.
    Optional column: ``reply_to_turn``.

    Args:
        file_path: Absolute path to the CSV file.

    Returns:
        A list of row dicts with keys ``turn_id``, ``user_id``, ``turn_text``,
        and (if present) ``reply_to_turn``.

    Raises:
        Exception: Wraps any parsing or validation error with a descriptive
            message.
    """
    try:
        df = _read_chat_messages_df(file_path)
        messages = df.to_dict('records')
        return messages
    except Exception as e:
        raise Exception(f"Error importing CSV: {str(e)}")

def validate_csv_format(file_path: str) -> bool:
    """
    Validate that a file is a properly-formatted chat-messages CSV.

    Only the first 5 rows are read to keep validation fast.  Column names are
    normalised to lowercase before checking.

    Args:
        file_path: Absolute path to the file to validate.

    Returns:
        ``True`` if the file has the required columns and is parseable.

    Raises:
        ValueError: With a descriptive message if the file is empty, not valid
            CSV, or missing required columns.
    """
    try:
        df = pd.read_csv(
            file_path,
            nrows=5,
            quoting=csv.QUOTE_MINIMAL,
            escapechar='\\',
            encoding='utf-8',
            on_bad_lines='error'
        )
        df.columns = df.columns.str.lower()
        required_columns = ['turn_id', 'user_id', 'turn_text']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise ValueError(f"CSV is missing required columns: {', '.join(missing_columns)}")
        return True
    except pd.errors.EmptyDataError:
        raise ValueError("CSV file is empty")
    except pd.errors.ParserError:
        raise ValueError("File is not a valid CSV format")
    except Exception as e:
        raise ValueError(f"Error validating CSV: {str(e)}")

def _read_annotations_df(file_path: str, limit: Optional[int] = None) -> pd.DataFrame:
    """
    Parse an annotation CSV file into a cleaned ``DataFrame``.

    The thread assignment column may be named ``thread_id``, ``thread_column``,
    or ``thread`` (in that priority order).  Regardless of the source name, the
    output column is always called ``thread_id``.

    Args:
        file_path: Absolute path to the annotation CSV file.
        limit: If provided, only the first ``limit`` rows are read.

    Returns:
        A two-column ``DataFrame`` with ``turn_id`` and ``thread_id``.
        Rows with null or empty values in either column are dropped.

    Raises:
        ValueError: If neither ``turn_id`` nor any accepted thread column name
            is present.
    """
    df = pd.read_csv(
        file_path,
        quoting=csv.QUOTE_MINIMAL,
        escapechar='\\',
        encoding='utf-8',
        on_bad_lines='error',
        nrows=limit
    )

    df.columns = df.columns.str.lower()

    # Accept multiple common column names for the thread assignment.
    thread_column = None
    if 'thread_id' in df.columns:
        thread_column = 'thread_id'
    elif 'thread_column' in df.columns:
        thread_column = 'thread_column'
    elif 'thread' in df.columns:
        thread_column = 'thread'

    if not thread_column:
        raise ValueError("CSV must contain a thread column (thread_id, thread_column, or thread)")
    if 'turn_id' not in df.columns:
        raise ValueError("CSV must contain a turn_id column")

    df = df[['turn_id', thread_column]]
    df['turn_id'] = df['turn_id'].apply(lambda x: str(x).strip() if pd.notna(x) else None)
    # Normalise the column to a consistent name regardless of what it was called.
    df['thread_id'] = df[thread_column].apply(lambda x: str(x).strip() if pd.notna(x) else None)
    df = df.dropna(subset=['turn_id', 'thread_id'])
    df = df[df['thread_id'] != '']
    return df


def preview_annotations_from_csv(
    file_path: str,
    limit: int
) -> Tuple[int, List[Dict[str, Any]]]:
    """
    Return a preview of an annotation CSV file without committing data.

    Args:
        file_path: Absolute path to the annotation CSV.
        limit: Maximum number of rows to include in the preview.

    Returns:
        A 2-tuple ``(total_rows, preview_rows)`` where ``preview_rows`` is a
        list of ``{turn_id, thread_id}`` dicts.
    """
    total_rows = count_csv_data_rows(file_path)
    df = _read_annotations_df(file_path, limit=limit)
    preview_rows = df.to_dict('records')
    return total_rows, preview_rows


def import_annotations_from_csv(file_path: str) -> List[Dict[str, Any]]:
    """
    Parse an annotation CSV file and return all rows as a list of dicts.

    Accepted thread column names (case-insensitive): ``thread_id``,
    ``thread_column``, ``thread``.

    Args:
        file_path: Absolute path to the annotation CSV file.

    Returns:
        A list of ``{turn_id, thread_id}`` dicts for every non-empty row.

    Raises:
        Exception: Wraps any parsing or validation error with a descriptive
            message.
    """
    try:
        df = _read_annotations_df(file_path)
        annotations = []
        for _, row in df.iterrows():
            annotations.append({
                'turn_id': row['turn_id'],
                'thread_id': row['thread_id']
            })
        return annotations
    except Exception as e:
        raise Exception(f"Error importing annotations from CSV: {str(e)}")


def count_csv_data_rows(file_path: str) -> int:
    """
    Count the number of non-empty data rows in a CSV file (excluding the header).

    Blank lines (rows where every cell is whitespace-only) are not counted.
    This gives an accurate total to report in preview responses before the file
    is imported.

    Args:
        file_path: Absolute path to the CSV file.

    Returns:
        The number of non-empty data rows.

    Raises:
        Exception: Wraps any I/O error with a descriptive message.
    """
    try:
        with open(file_path, newline='', encoding='utf-8') as handle:
            reader = csv.reader(handle)
            header = next(reader, None)
            if header is None:
                return 0
            count = 0
            for row in reader:
                if row and any(cell.strip() for cell in row):
                    count += 1
            return count
    except Exception as e:
        raise Exception(f"Error counting CSV rows: {str(e)}")


def count_missing_reply_to_turn(file_path: str) -> int:
    """
    Count rows whose ``reply_to_turn`` value references a non-existent ``turn_id``.

    The file is read twice: first to collect all ``turn_id`` values, then to
    check each ``reply_to_turn`` against that set.  This is done row-by-row
    with the stdlib ``csv`` module rather than Pandas to avoid loading the full
    file into memory twice.

    Args:
        file_path: Absolute path to the CSV file.

    Returns:
        The number of rows with dangling ``reply_to_turn`` references.
        Returns ``0`` if the file has no ``reply_to_turn`` column or if
        ``turn_id`` is absent.

    Raises:
        Exception: Wraps any I/O error with a descriptive message.
    """
    try:
        # Pass 1: collect all turn_ids present in the file.
        with open(file_path, newline='', encoding='utf-8') as handle:
            reader = csv.reader(handle)
            header = next(reader, None)
            if not header:
                return 0
            columns = [c.strip().lower() for c in header]
            try:
                turn_idx = columns.index('turn_id')
            except ValueError:
                return 0
            reply_idx = columns.index('reply_to_turn') if 'reply_to_turn' in columns else None
            if reply_idx is None:
                return 0

            turn_ids = set()
            for row in reader:
                if not row:
                    continue
                if len(row) <= turn_idx:
                    continue
                value = row[turn_idx].strip()
                if value:
                    turn_ids.add(value)

        # Pass 2: count reply_to_turn values that have no matching turn_id.
        missing = 0
        with open(file_path, newline='', encoding='utf-8') as handle:
            reader = csv.reader(handle)
            header = next(reader, None)
            if not header:
                return 0
            columns = [c.strip().lower() for c in header]
            reply_idx = columns.index('reply_to_turn') if 'reply_to_turn' in columns else None
            if reply_idx is None:
                return 0

            for row in reader:
                if not row or len(row) <= reply_idx:
                    continue
                reply_value = row[reply_idx].strip()
                if reply_value and reply_value not in turn_ids:
                    missing += 1

        return missing
    except Exception as e:
        raise Exception(f"Error counting reply_to_turn references: {str(e)}")

def validate_annotations_csv_format(file_path: str) -> bool:
    """
    Validate that a file is a properly-formatted annotations CSV.

    Accepted thread column names: ``thread_id``, ``thread_column``, ``thread``.
    Only the first 5 rows are read to keep validation fast.

    Args:
        file_path: Absolute path to the file to validate.

    Returns:
        ``True`` if the file has the required columns and is parseable.

    Raises:
        ValueError: With a descriptive message if the file is empty, not valid
            CSV, or missing ``turn_id`` or any accepted thread column.
    """
    try:
        df = pd.read_csv(
            file_path,
            nrows=5,
            quoting=csv.QUOTE_MINIMAL,
            escapechar='\\',
            encoding='utf-8',
            on_bad_lines='error'
        )
        df.columns = df.columns.str.lower()

        if 'turn_id' not in df.columns:
            raise ValueError("CSV is missing required column: turn_id")

        thread_columns = ['thread_id', 'thread_column', 'thread']
        has_thread_column = any(col in df.columns for col in thread_columns)
        if not has_thread_column:
            raise ValueError(f"CSV is missing a thread column. Expected one of: {', '.join(thread_columns)}")

        return True
    except pd.errors.EmptyDataError:
        raise ValueError("CSV file is empty")
    except pd.errors.ParserError:
        raise ValueError("File is not a valid CSV format")
    except Exception as e:
        raise ValueError(f"Error validating annotations CSV: {str(e)}")
