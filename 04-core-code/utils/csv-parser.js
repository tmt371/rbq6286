// /04-core-code/utils/csv-parser.js

/**
 * @fileoverview Utility functions for parsing and stringifying CSV data.
 */

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
 * including all detailed item properties and 
LF status.
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
        const strValue = String(value).replace(/\n/g, ' '); // Replace newlines in addresses
        if (strValue.includes(',')) return `"${strValue}"`;
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
                item.location || 
'',
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
                const strValue = String(value);
         
       if (strValue.includes(',')) {
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
 * Converts a CSV formatted string into an object containing item objects and LF indexes.
 * This function is "pure" and has no external dependencies.
 * @param {string} csvString 
The string containing CSV data.
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

        const projectHeaders = projectHeaderLine.split(',');
        const projectValues = projectDataLine.split(','); // Simplified parse, assumes no commas in F3 data for now

        // --- 1. Parse Project Data (F1 + F3) ---
        const f1Snapshot = {};
        const f3Data = { customer: {} };

        projectHeaders.forEach((header, index) => {
            const value = projectValues[index] || null;
            if (!value) return; // Skip empty values

            const numValue = parseFloat(value);
            const finalValue = isNaN(numValue) ? value : numValue;

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
        const itemHeaders = itemHeaderLine.split(',');
        const isLfIndex = itemHeaders.indexOf('IsLF');

        itemDataLines.forEach((line) => {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.toLowerCase().startsWith('total')) {
                return;
            }
            
            const values = trimmedLine.split(',');

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
    const headers = headerLine.split(',');
    
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
        
        const values = trimmedLine.split(',');

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