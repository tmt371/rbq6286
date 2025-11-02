// /04-core-code/services/file-service.js

import { dataToCsv, csvToData } from '../utils/csv-parser.js';
import { initialState } from '../config/initial-state.js';

/**
 * @fileoverview Service for handling all file-related operations
 * like saving, loading, and exporting.
 */
export class FileService {
    constructor({ productFactory }) {
        this.productFactory = productFactory;
        console.log("FileService Initialized.");
    }

    _triggerDownload(content, fileName, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    _generateFileName(quoteData, extension) {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const timestamp = `${yyyy}${mm}${dd}${hh}${min}`;

        // [MODIFIED] 實作新的檔名產生邏輯
        const customerName = quoteData?.customer?.name || 'customer';
        const customerPhone = quoteData?.customer?.phone || '';

        // 簡易的檔名清理，移除不安全的字元並替換空格
        const safeName = customerName.replace(/[\s/\\?%*:|"<>]/g, '_') || 'customer';
        const safePhone = customerPhone.replace(/[\s/\\?%*:|"<>]/g, '_');

        let parts = ['quote', safeName];
        if (safePhone) {
            parts.push(safePhone);
        }
        parts.push(timestamp);

        return `${parts.join('-')}.${extension}`;
    }

    saveToJson(quoteData) {
        try {
            const jsonString = JSON.stringify(quoteData, null, 2);
            // [MODIFIED] 傳遞 quoteData 以產生新檔名
            const fileName = this._generateFileName(quoteData, 'json');
            this._triggerDownload(jsonString, fileName, 'application/json');
            return { success: true, message: 'Quote file is being downloaded...' };
        } catch (error) {
            console.error("Failed to save JSON file:", error);
            return { success: false, message: 'Error creating quote file.' };
        }
    }

    exportToCsv(quoteData) {
        try {
            const csvString = dataToCsv(quoteData);
            // [MODIFIED] 傳遞 quoteData 以產生新檔名
            const fileName = this._generateFileName(quoteData, 'csv');
            this._triggerDownload(csvString, fileName, 'text/csv;charset=utf-8;');
            return { success: true, message: 'CSV file is being downloaded...' };
        } catch (error) {
            console.error("Failed to export CSV file:", error);
            return { success: false, message: 'Error creating CSV file.' };
        }
    }

    parseFileContent(fileName, content) {
        try {
            let loadedData = null;

            if (fileName.toLowerCase().endsWith('.json')) {
                loadedData = JSON.parse(content);
            } else if (fileName.toLowerCase().endsWith('.csv')) {
                const parsedResult = csvToData(content);
                if (parsedResult === null) {
                    throw new Error("CSV parser returned null.");
                }

                // [MODIFIED v6285 Phase 5] Destructure all returned parts from csvToData
                const { items, lfIndexes, f1Snapshot, f3Data } = parsedResult;

                const productStrategy = this.productFactory.getProductStrategy('rollerBlind');
                const newItem = productStrategy.getInitialItemData();
                items.push(newItem);

                const newQuoteData = JSON.parse(JSON.stringify(initialState.quoteData));
                newQuoteData.products.rollerBlind.items = items;
                newQuoteData.uiMetadata.lfModifiedRowIndexes = lfIndexes;

                // [MODIFIED v6285 Phase 5] Assign the parsed f1Snapshot and f3Data
                if (f1Snapshot) {
                    Object.assign(newQuoteData.f1Snapshot, f1Snapshot);
                }
                if (f3Data) {
                    Object.assign(newQuoteData, f3Data); // Assign f3Data (quoteId, issueDate, customer...)
                }

                loadedData = newQuoteData;

            } else {
                return { success: false, message: `Unsupported file type: ${fileName}` };
            }

            if (loadedData && !loadedData.uiMetadata) {
                loadedData.uiMetadata = {
                    lfModifiedRowIndexes: []
                };
            }

            // [MODIFIED v6285 Phase 5] Also ensure f1Snapshot exists on loaded JSON data
            if (loadedData && !loadedData.f1Snapshot) {
                console.warn("Patching loaded JSON file with missing f1Snapshot.");
                loadedData.f1Snapshot = JSON.parse(JSON.stringify(initialState.quoteData.f1Snapshot));
            }

            // [NEW v6285 Phase 5] Ensure customer object exists on loaded JSON data
            if (loadedData && !loadedData.customer) {
                console.warn("Patching loaded JSON file with missing customer object.");
                loadedData.customer = JSON.parse(JSON.stringify(initialState.quoteData.customer));
            }

            const currentProduct = loadedData?.currentProduct;
            const productData = loadedData?.products?.[currentProduct];

            if (productData && Array.isArray(productData.items)) {
                return { success: true, data: loadedData, message: `Successfully loaded data from ${fileName}` };
            } else {
                if (loadedData && loadedData.rollerBlindItems && Array.isArray(loadedData.rollerBlindItems)) {
                    return { success: true, data: loadedData, message: `Successfully loaded legacy data from ${fileName}` };
                }
                throw new Error("File content is not in a valid quote format.");
            }
        } catch (error) {
            console.error("Failed to parse file content:", error);
            return { success: false, message: `Error loading file: ${error.message}` };
        }
    }
}