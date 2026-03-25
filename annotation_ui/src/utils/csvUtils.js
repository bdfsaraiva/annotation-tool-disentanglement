/**
 * @fileoverview Client-side CSV utility helpers using PapaParse.
 *
 * This module is largely a legacy utility from an earlier development phase
 * when chat data was loaded directly from local CSV files.  The primary
 * application workflow now uses the FastAPI backend for CSV parsing.
 *
 * The `loadCsv` function is still used for client-side CSV validation.
 * `saveChangesToCsv`, `copyToFiles`, and `loadWorkspaceFile` depend on a
 * `/api/*` proxy that is not present in the current backend and are therefore
 * effectively no-ops in the production deployment.
 */
import Papa from 'papaparse';

/**
 * @namespace csvUtils
 * @description Collection of CSV read/write helpers.
 */
const csvUtils = {
    /**
     * Parse a browser `File` object as a CSV using PapaParse.
     *
     * Validates that the parsed header contains the required columns
     * (`user_id`, `turn_id`, `turn_text`), case-insensitively.  Adds a
     * default empty `thread` field to every row so downstream disentanglement
     * logic can assume the field exists.
     *
     * @param {File} file - A `File` object (from an `<input type="file">`).
     * @returns {Promise<{
     *   data: Object[],
     *   metadata: Object,
     *   uniqueTags: string[],
     *   fileName: string
     * }>} Resolves with parsed data and metadata; rejects with a descriptive
     *   `Error` when required columns are missing or PapaParse reports an error.
     */
    loadCsv: (file) => {
        console.log('Loading CSV file:', file.name);
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                dynamicTyping: true,
                complete: (results) => {
                    console.log('Papa Parse results:', results);
                    // Check for basic required columns except thread
                    const basicColumns = ['user_id', 'turn_id', 'turn_text'];
                    const missingBasicColumns = basicColumns.filter(col =>
                        !results.meta.fields.some(field =>
                            field.toLowerCase() === col.toLowerCase()
                        )
                    );

                    if (missingBasicColumns.length > 0) {
                        const errorMessage = `CSV file is missing required columns: ${missingBasicColumns.join(', ')}. \n\nRequired columns are: ${basicColumns.join(', ')}`;
                        console.error(errorMessage);
                        reject(new Error(errorMessage));
                        return;
                    }

                    const validatedData = results.data.map((row) => ({
                        ...row,
                        thread: '' // Default empty thread value
                    }));

                    const uniqueTags = []; // No tags since we don't have thread data

                    console.log('Validated data:', validatedData);
                    resolve({
                        data: validatedData,
                        metadata: results.meta,
                        uniqueTags: uniqueTags,
                        fileName: file.name,
                    });
                },
                error: (error) => {
                    console.error('Papa Parse error:', error);
                    reject(error);
                },
            });
        });
    },

    /**
     * Persist annotation changes back to a CSV file via the backend proxy.
     *
     * Note: this endpoint (`/api/save-csv`) is not implemented in the current
     * FastAPI backend; calls will fail silently (error is logged only).
     *
     * @param {Object[]} messages - Annotated message objects.
     * @param {string[]} tags - Thread labels.
     * @param {string} fileName - Target filename on the server.
     */
    saveChangesToCsv: async (messages, tags, fileName) => {
        try {
            const response = await fetch('/api/save-csv', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messages, tags, fileName }),
            });

            if (!response.ok) {
                throw new Error('Failed to save CSV file');
            }

            const result = await response.json();
            console.log('Changes saved to CSV file:', result.message);
        } catch (error) {
            console.error('Error saving CSV file:', error);
        }
    },

    /**
     * Upload a file to the server workspace via the backend proxy.
     *
     * Note: this endpoint (`/api/copy-to-files`) is not implemented in the
     * current FastAPI backend.
     *
     * @param {File} file - File to upload.
     * @param {string} destinationFileName - Target filename on the server.
     * @returns {Promise<Object>} Server response JSON.
     * @throws {Error} When the server returns a non-OK status.
     */
    copyToFiles: async (file, destinationFileName) => {
        const response = await fetch('/api/copy-to-files', {
            method: 'POST',
            body: (() => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('destinationFileName', destinationFileName);
                return formData;
            })(),
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message);
        }
    
        return result;
    },

    /**
     * Download a file from the server workspace and parse it as CSV.
     *
     * Fetches the file from `/api/workspace-file/:fileName`, converts the
     * response to a `File` object, then delegates to `loadCsv` for consistent
     * column validation and row normalisation.
     *
     * Note: the `/api/workspace-file` endpoint is not implemented in the
     * current FastAPI backend.
     *
     * @param {string} fileName - Filename to load from the server workspace.
     * @returns {Promise<Object>} Same shape as `loadCsv` resolve value.
     * @throws {Error} When the fetch fails or column validation fails.
     */
    loadWorkspaceFile: async (fileName) => {
        try {
            const response = await fetch(`/api/workspace-file/${fileName}`);
            if (!response.ok) {
                throw new Error('Failed to load workspace file');
            }
            const blob = await response.blob();
            const file = new File([blob], fileName, { type: 'text/csv' });
            
            // Use the same loadCsv function to ensure consistent parsing
            return csvUtils.loadCsv(file);
        } catch (error) {
            throw new Error(`Error loading workspace file: ${error.message}`);
        }
    }

};

export default csvUtils;