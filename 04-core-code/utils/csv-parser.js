// /04-core-code/utils/csv-parser.js

/**
 * @fileoverview Utility functions for parsing and stringifying CSV data.
 */

// [FIX] 匯入遺漏的 initialState 模組，以修復 csvToData_OldFormat 的 ReferenceError
import { initialState } from '../config/initial-state.js';

// [MODIFIED v6285 Phase 5] Define the exact keys and order for all snapshot data
const f3SnapshotKeys = [
    'quoteId', 'issueDate', 'dueDate',
    'customer.name', 'customer.address', 'customer.phone', 'customer.email'
];
const f1SnapshotKeys = [
    'winder_qty', 'motor_qty', 'charger_qty', 'cord_qty',
    'remote_1ch_qty', 'remote_16ch_qty', 'dual_combo_qty', 'dual_slim_qty',
    'discountPercentage'
];

// Helper to safely get nested properties
const getNestedValue = (obj, path) => {
    try {
        return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined) ? acc[key] : '', obj);
    } catch (e) {
        return '';
    }
};

/**
 * Converts the application's quote data object into a comprehensive CSV formatted string,
 * including all detailed item properties and LF status.
 * @param {object} quoteData The application's quote data.
 * @returns {string} A string in CSV format.
 */
export function dataToCsv(quoteData) {
    const currentProductKey = quoteData?.currentProduct;
    const productData = quoteData?.products?.[currentProductKey];
    const lfModifiedRowIndexes = quoteData?.uiMetadata?.lfModifiedRowIndexes || [];

    if (!productData || !productData.items) return "";

    // --- [MODIFIED v6285 Phase 5] Create Project Summary Header and Row ---
    const projectHeaders = [...f3SnapshotKeys, ...f1SnapshotKeys];

    const f1Snapshot = quoteData.f1Snapshot || {};

    const projectValues = [
        // F3 Values
        quoteData.quoteId || '',
        quoteData.issueDate || '',
        quoteData.dueDate || '',
        getNestedValue(quoteData, 'customer.name'),
        getNestedValue(quoteData, 'customer.address'),
        getNestedValue(quoteData, 'customer.phone'),
        getNestedValue(quoteData, 'customer.email'),
        // F1 Values
        ...f1SnapshotKeys.map(key => {
            const value = f1Snapshot[key];
            return (value !== null && value !== undefined) ? value : '';
        })
    ].map(value => {
        // [MODIFIED] 強化 CSV 儲存邏輯
        let strValue = (value === null || value === undefined) ? '' : String(value);
        strValue = strValue.replace(/"/g, '""'); // 1. 轉義欄位內部的引號
        strValue = strValue.replace(/\n/g, ' '); // 2. 替換換行符
        
        // 3. [FIX] 如果包含逗號、空格或引號，則使用引號包覆
        if (strValue.includes(',') || strValue.includes(' ') || strValue.includes('"')) {
            return `"${strValue}"`;
        }
        return strValue;
    });

    // --- Create Item Header and Rows ---
    const itemHeaders = [
        '#', 'Width', 'Height', 'Type', 'Price',
        'Location', 'F-Name', 'F-Color', 'Over', 'O/I', 'L/R',
        'Dual', 'Chain', 'Winder', 'Motor', 'IsLF'
    ];

    const itemRows = productData.items.map((item, index) => {
        if (item.width || item.height) {
            const rowData = [
                index + 1,
                item.width || '',
                item.height || '',
                item.fabricType || '',
                item.linePrice !== null ? item.linePrice.toFixed(2) : '',
                item.location || '',
                item.fabric || '',
                item.color || '',
                item.over || '',
                item.oi || '',
                item.lr || '',
                item.dual || '',
                item.chain || '',
                item.winder || '',
                item.motor || '',
                lfModifiedRowIndexes.includes(index) ? 1 : 0
            ];

            return rowData.map(value => {
                // [MODIFIED] 強化 CSV 儲存邏輯 (同樣應用於項目行)
                let strValue = (value === null || value === undefined) ? '' : String(value);
                strValue = strValue.replace(/"/g, '""');
                strValue = strValue.replace(/\n/g, ' ');
                
                if (strValue.includes(',') || strValue.includes(' ') || strValue.includes('"')) {
                    return `"${strValue}"`;
                }
                return strValue;
            }).join(',');
        }
        return null;
    }).filter(row => row !== null);


    // [MODIFIED v6285 Phase 5] Combine all parts in the new format
    return [
        projectHeaders.join(','),
        projectValues.join(','),
        '', // Add a blank line for readability
        itemHeaders.join(','),
        ...itemRows
    ].join('\n');
}


/**
 * [PRIVATE] 輔助函式，使用正規表示式來安全地解析 CSV 列，能處理引號內的逗號。
 * @param {string} line - 單行 CSV 字串。
 * @returns {Array<string>} - 解析後的欄位陣列。
 */
function _parseCsvLine(line) {
    const values = [];
    
    // [FIX] 修正 Regex：
    // 1. 移除第一個群組 (?:^|,) 最後多餘的 |，這會導致無限迴圈
    // 2. 將第二個群組改為捕獲群組 ((...))，確保 match[1] 始終是我們想要的欄位內容
    const regex = /(?:^|,)((?:"(?:[^"]|"")*"|[^,]*))/g;
    let match;
    while (match = regex.exec(line)) {
        if (match[1] === undefined || match[1] === null) continue;

        let value = match[1];

        // [FIX] 移除這個錯誤的邏輯。match[1] (捕獲群組) 不會包含開頭的逗號。
        // if (value.startsWith(',')) {
        //     value = value.substring(1);
        // }

        // 移除引號並反轉義
        if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1).replace(/""/g, '"');
        }
        values.push(value.trim());
    }

    // 處理行尾有空值的情況
    if (line.endsWith(',')) {
        values.push('');
    }

    return values;
}


/**
 * Converts a CSV formatted string into an object containing item objects and LF indexes.
 * This function is "pure" and has no external dependencies.
 * @param {string} csvString The string containing CSV data.
 * @returns {{items: Array<object>, lfIndexes: Array<number>, f1Snapshot: object, f3Data: object}|null} An object with items, LF status, F1 snapshot, and F3 data, or null if parsing fails.
 */
export function csvToData(csvString) {
    try {
        const lines = csvString.trim().split('\n');

        // [MODIFIED v6285 Phase 5] Parse new 4-part format
        if (lines.length < 4) {
            // Fallback for old format (Phase 3/4)
            return csvToData_OldFormat(csvString);
        }

        const projectHeaderLine = lines[0];
        const projectDataLine = lines[1];
        const itemHeaderLine = lines[3];
        const itemDataLines = lines.slice(4);

        const projectHeaders = _parseCsvLine(projectHeaderLine);
        const projectValues = _parseCsvLine(projectDataLine);

        // --- 1. Parse Project Data (F1 + F3) ---
        const f1Snapshot = {};
        const f3Data = { customer: {} };

        projectHeaders.forEach((header, index) => {
            const value = projectValues[index] || null;
            if (value === null || value === '') return; // [MODIFIED] 檢查空字串

            let finalValue;

            // [FIX] 檢查是否為 F1 數字鍵
            if (f1SnapshotKeys.includes(header)) {
                // 這是 F1 key，嘗試轉為數字
                const numValue = parseFloat(value);
                finalValue = isNaN(numValue) ? null : numValue;
            } else {
                // 這是 F3 key (或其他字串)，保持為字串
                finalValue = value;
            }

            if (finalValue === null) return; // 不儲存無效值

            if (f1SnapshotKeys.includes(header)) {
                f1Snapshot[header] = finalValue;
            } else if (header.startsWith('customer.')) {
                f3Data.customer[header.split('.')[1]] = finalValue;
            } else if (f3SnapshotKeys.includes(header)) {
                f3Data[header] = finalValue;
            }
        });


        // --- 2. Parse Item Data ---
        const items = [];
        const lfIndexes = [];
        const itemHeaders = _parseCsvLine(itemHeaderLine);
        const isLfIndex = itemHeaders.indexOf('IsLF');

        itemDataLines.forEach((line) => {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.toLowerCase().startsWith('total')) {
                return;
            }

            // [FIX] 使用新的 CSV 解析器
            const values = _parseCsvLine(trimmedLine);

            // [FIX] 移除值的引號 (輔助函式已內嵌至 _parseCsvLine)
            const item = {
                itemId: `item-${Date.now()}-${items.length}`,
                width: parseInt(values[1], 10) || null,
                height: parseInt(values[2], 10) || null,
                fabricType: values[3] || null,
                linePrice: parseFloat(values[4]) || null,
                location: values[5] || '',
                fabric: values[6] || '',
                color: values[7] || '',
                over: values[8] || '',
                oi: values[9] || '',
                lr: values[10] || '',
                dual: values[11] || '',
                chain: parseInt(values[12], 10) || null,
                winder: values[13] || '',
                motor: values[14] || ''
            };
            items.push(item);

            if (isLfIndex > -1) {
                const isLf = parseInt(values[isLfIndex], 10) === 1;
                if (isLf) {
                    lfIndexes.push(items.length - 1);
                }
            }
        });

        return { items, lfIndexes, f1Snapshot, f3Data };

    } catch (error) {
        console.error("Failed to parse CSV string (New Format):", error);
        // If new format fails, try the old one
        try {
            return csvToData_OldFormat(csvString);
        } catch (oldError) {
            console.error("Failed to parse CSV string (Old Format):", oldError);
            return null;
        }
    }
}

/**
 * [FALLBACK] Kept the old parser logic to handle files saved in the previous format (Phase 4 / 8th Edit)
 */
function csvToData_OldFormat(csvString) {
    const lines = csvString.trim().split('\n');
    const headerIndex = lines.findIndex(line => line.trim() !== '' && line.startsWith('#,Width'));
    if (headerIndex === -1) return null; // Not a recognized format

    const headerLine = lines[headerIndex];
    const headers = headerLine.split(','); // Old parser OK here

    const f1Snapshot = {};
    const snapshotKeys = Object.keys(initialState.quoteData.f1Snapshot);
    const snapshotIndices = {};
    snapshotKeys.forEach(key => {
        snapshotIndices[key] = headers.indexOf(key);
    });

    const dataLines = lines.slice(headerIndex + 1);
    const items = [];
    const lfIndexes = [];
    const isLfIndex = headers.indexOf('IsLF');

    dataLines.forEach((line, index) => {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.toLowerCase().startsWith('total')) {
            return;
        }

        const values = trimmedLine.split(','); // Old parser OK here

        if (values[0] === 'F1_SNAPSHOT' && values.length >= 3) {
            // This is the Phase 3 format, not Phase 4. Handle it anyway.
            const key = values[1];
            const value = values[2];
            if (f1Snapshot.hasOwnProperty(key)) {
                const numValue = parseFloat(value);
                f1Snapshot[key] = isNaN(numValue) ? value : numValue;
            }
            return; // Skip to the next line
        }

        if (index === 0) {
            snapshotKeys.forEach(key => {
                const colIndex = snapshotIndices[key];
                if (colIndex > -1 && values[colIndex] !== undefined && values[colIndex] !== '') {
                    const value = values[colIndex];
                    const numValue = parseFloat(value);
                    f1Snapshot[key] = isNaN(numValue) ? value : numValue;
                }
            });
        }

        const item = {
            itemId: `item-${Date.now()}-${items.length}`,
            width: parseInt(values[1], 10) || null,
            height: parseInt(values[2], 10) || null,
            fabricType: values[3] || null,
            linePrice: parseFloat(values[4]) || null,
            location: values[5] || '',
            fabric: values[6] || '',
            color: values[7] || '',
            over: values[8] || '',
            oi: values[9] || '',
            lr: values[10] || '',
            dual: values[11] || '',
            chain: parseInt(values[12], 10) || null,
            winder: values[13] || '',
            motor: values[14] || ''
        };
        items.push(item);

        if (isLfIndex > -1) {
            const isLf = parseInt(values[isLfIndex], 10) === 1;
            if (isLf) {
                lfIndexes.push(items.length - 1);
            }
        }
    });

    return { items, lfIndexes, f1Snapshot, f3Data: { customer: {} } }; // Return empty f3Data
}