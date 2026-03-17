import csv
import pandas as pd
from typing import List, Dict, Any, Tuple, Optional

def _read_chat_messages_df(file_path: str, limit: Optional[int] = None) -> pd.DataFrame:
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

    columns_to_use = required_columns + (['reply_to_turn'] if 'reply_to_turn' in df.columns else [])
    df = df[columns_to_use]

    df['user_id'] = df['user_id'].apply(lambda x: str(int(float(x))) if pd.notna(x) else None)
    for col in ['turn_id', 'turn_text']:
        df[col] = df[col].apply(lambda x: str(x).strip() if pd.notna(x) else None)

    if 'reply_to_turn' in df.columns:
        df['reply_to_turn'] = df['reply_to_turn'].apply(
            lambda x: str(x).strip() if pd.notna(x) and str(x).strip() not in ['nan', 'None', ''] else None
        )

    df = df.dropna(subset=required_columns)
    return df


def preview_chat_messages(file_path: str, limit: int) -> Tuple[int, List[Dict[str, Any]], List[str]]:
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
    Import chat messages from a CSV file, only caring about specific required columns.
    Returns a list of dictionaries with the required fields.
    
    Required columns (case insensitive):
    - turn_id: Unique identifier for the message
    - user_id: ID of the user who sent the message
    - turn_text: The message content
    - reply_to_turn (optional): ID of the message this is replying to
    """
    try:
        df = _read_chat_messages_df(file_path)
        messages = df.to_dict('records')
        return messages
        
    except Exception as e:
        raise Exception(f"Error importing CSV: {str(e)}")

def validate_csv_format(file_path: str) -> bool:
    """
    Validate that a file is a properly formatted CSV with the required columns.
    Returns True if valid, raises ValueError with description if invalid.
    """
    try:
        # Try to read first few rows to validate format
        df = pd.read_csv(
            file_path,
            nrows=5,
            quoting=csv.QUOTE_MINIMAL,
            escapechar='\\',
            encoding='utf-8',
            on_bad_lines='error'
        )
        
        # Convert column names to lowercase
        df.columns = df.columns.str.lower()
        
        # Check required columns
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

# PHASE 2: ANNOTATION IMPORT UTILITIES

def _read_annotations_df(file_path: str, limit: Optional[int] = None) -> pd.DataFrame:
    df = pd.read_csv(
        file_path,
        quoting=csv.QUOTE_MINIMAL,
        escapechar='\\',
        encoding='utf-8',
        on_bad_lines='error',
        nrows=limit
    )

    df.columns = df.columns.str.lower()
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
    df['thread_id'] = df[thread_column].apply(lambda x: str(x).strip() if pd.notna(x) else None)
    df = df.dropna(subset=['turn_id', 'thread_id'])
    df = df[df['thread_id'] != '']
    return df


def preview_annotations_from_csv(file_path: str, limit: int) -> Tuple[int, List[Dict[str, Any]]]:
    total_rows = count_csv_data_rows(file_path)
    df = _read_annotations_df(file_path, limit=limit)
    preview_rows = df.to_dict('records')
    return total_rows, preview_rows


def import_annotations_from_csv(file_path: str) -> List[Dict[str, Any]]:
    """
    Import annotations from a CSV file containing turn_id and thread_id columns.
    This is used for importing pre-existing annotation data.
    
    Required columns (case insensitive):
    - turn_id: Unique identifier for the message
    - thread_id (or thread_column): The thread assignment for the message
    
    Returns a list of dictionaries with 'turn_id' and 'thread_id'.
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
    try:
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
    Validate that a file is a properly formatted CSV with the required columns for annotations.
    Returns True if valid, raises ValueError with description if invalid.
    """
    try:
        # Try to read first few rows to validate format
        df = pd.read_csv(
            file_path,
            nrows=5,
            quoting=csv.QUOTE_MINIMAL,
            escapechar='\\',
            encoding='utf-8',
            on_bad_lines='error'
        )
        
        # Convert column names to lowercase
        df.columns = df.columns.str.lower()
        
        # Check for required columns
        if 'turn_id' not in df.columns:
            raise ValueError("CSV is missing required column: turn_id")
        
        # Check for thread column (flexible naming)
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
