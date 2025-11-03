// File: 04-core-code/ui/views/k2-fabric-view.js

import { EVENTS } from '../../config/constants.js';
import * as uiActions from '../../actions/ui-actions.js';
import * as quoteActions from '../../actions/quote-actions.js';

/**
 * @fileoverview A dedicated sub-view for handling all logic related to the K2 (Fabric) tab.
 */
export class K2FabricView {
    constructor({ stateService, eventAggregator, publishStateChangeCallback }) {
        this.stateService = stateService;
        this.eventAggregator = eventAggregator;
        this.publish = publishStateChangeCallback;
        
        this.indexesToExcludeFromBatchUpdate = new Set();
        // [NEW] Track the last enabled input for the SSet Enter key logic
        this.lastSSetInput = null;

        console.log("K2FabricView Initialized.");
    }

    _getState() {
        return this.stateService.getState();
    }

    _getItems() {
        const { quoteData } = this._getState();
        return quoteData.products[quoteData.currentProduct].items;
    }

    handleFocusModeRequest() {
        const { ui } = this._getState();
        const currentMode = ui.activeEditMode;
        const newMode = currentMode === 'K2' ? null : 'K2';

        if (newMode) {
            const items = this._getItems();
            const { lfModifiedRowIndexes } = this._getState().quoteData.uiMetadata;
            const eligibleTypes = ['B2', 'B3', 'B4'];
            
            const hasConflict = items.some((item, index) => 
                eligibleTypes.includes(item.fabricType) && lfModifiedRowIndexes.includes(index)
            );

            if (hasConflict) {
                this.eventAggregator.publish(EVENTS.SHOW_CONFIRMATION_DIALOG, {
                    message: 'Data Conflict: Some items (B2, B3, B4) already have Light-Filter settings. Continuing with a batch edit will overwrite this data. How would you like to proceed?',
                    closeOnOverlayClick: false,
                    layout: [
                        [
                            { 
                                type: 'button', text: 'Overwrite (L-Filter)', 
                                callback: () => {
                                    this.indexesToExcludeFromBatchUpdate.clear();
                                    this._enterFCMode(true);
                                } 
                            },
                            { 
                                type: 'button', text: 'Keep Existing (Skip L-Filter)', 
                                callback: () => {
                                    this.indexesToExcludeFromBatchUpdate = new Set(this._getState().quoteData.uiMetadata.lfModifiedRowIndexes);
                                    this._enterFCMode(false);
                                }
                            },
                            { type: 'button', text: 'Cancel', className: 'secondary', callback: () => {} }
                        ]
                    ]
                });
            } else {
                this._enterFCMode(false);
            }
        } else {
            // [FIX] 如果是從 N&C 模式退出，手動觸發 blur
            if (currentMode === 'K2' && document.activeElement.matches('.panel-input')) {
                document.activeElement.blur();
            }
            this._exitAllK2Modes();
        }
    }

    _enterFCMode(isOverwriting) {
        if (isOverwriting) {
            const items = this._getItems();
            const { lfModifiedRowIndexes } = this._getState().quoteData.uiMetadata;
            const indexesToClear = [];
            const eligibleTypes = ['B2', 'B3', 'B4'];
            items.forEach((item, index) => {
                if (eligibleTypes.includes(item.fabricType) && lfModifiedRowIndexes.includes(index)) {
                    indexesToClear.push(index);
                }
            });
            if (indexesToClear.length > 0) {
                this.stateService.dispatch(quoteActions.removeLFModifiedRows(indexesToClear));
            }
        }
        // [MODIFIED] Clear other K2 mode selections when entering this one
        this.stateService.dispatch(uiActions.clearLFSelection());
        this.stateService.dispatch(uiActions.clearSSetSelection());
        this.stateService.dispatch(uiActions.setActiveEditMode('K2'));
        this._updatePanelInputsState(); 
        this.stateService.dispatch(uiActions.setActiveCell(null, null));
    }

    handlePanelInputBlur({ type, field, value }) {
        const currentMode = this._getState().ui.activeEditMode;
        
        if (type === 'LF') {
            // No action on blur for LF, only on Apply/Exit
        } else if (currentMode === 'K2') {
            // [FIX] 只有在 K2 (N&C) 模式下，blur 才觸發儲存
            this.stateService.dispatch(quoteActions.batchUpdatePropertyByType(type, field, value, this.indexesToExcludeFromBatchUpdate));
        }
        // SSet mode also only applies on exit/enter
    }

    handlePanelInputEnter() {
        const { activeEditMode } = this._getState().ui;
        const activeElement = document.activeElement;

        if (activeEditMode === 'K2') {
            // [FIX] 將 querySelector 範圍限定在 #fabric-batch-table 內
            const inputs = Array.from(document.querySelectorAll('#fabric-batch-table .panel-input:not([disabled])'));
            const currentIndex = inputs.indexOf(activeElement);
            const nextInput = inputs[currentIndex + 1];

            if (nextInput) {
                nextInput.focus();
                nextInput.select();
            } else {
                // [FIX] 修正 N&C 模式的 Enter 鍵邏輯
                // 1. 同步地呼叫 handlePanelInputBlur (儲存最後一筆資料)
                if (activeElement && activeElement.matches('.panel-input')) {
                    this.handlePanelInputBlur({
                        type: activeElement.dataset.type,
                        field: activeElement.dataset.field,
                        value: activeElement.value
                    });
                }
                // 2. 正常退出模式。
                this._exitAllK2Modes();
            }
        } else if (activeEditMode === 'K2_LF_SELECT') {
            // [FIX] Implement correct Enter key logic for LF mode
            const lfFnameInput = document.querySelector('input[data-type="LF"][data-field="fabric"]');
            const lfFcolorInput = document.querySelector('input[data-type="LF"][data-field="color"]');

            if (activeElement === lfFnameInput && lfFcolorInput) {
                // User pressed Enter on F-Name, move to F-Color
                lfFcolorInput.focus();
                lfFcolorInput.select();
            } else if (activeElement === lfFcolorInput) {
                // User pressed Enter on F-Color (last input), apply changes and exit
                this._applyLFChanges();
                this._exitAllK2Modes();
            }
        } else if (activeEditMode === 'K2_SSET_SELECT') {
            if (activeElement === this.lastSSetInput) {
                // If user presses Enter on the last input, apply changes
                this._applySSetChanges();
                this._exitAllK2Modes();
            } else {
                // Move to the next enabled input
                const inputs = Array.from(document.querySelectorAll('#fabric-batch-table .panel-input:not([disabled])'));
                const currentIndex = inputs.indexOf(activeElement);
                const nextInput = inputs[currentIndex + 1];
                if (nextInput) {
                    nextInput.focus();
                    nextInput.select();
                }
            }
        }
    }

    handleSequenceCellClick({ rowIndex }) {
        const { activeEditMode } = this._getState().ui;
        const item = this._getItems()[rowIndex];
        if (!item || (item.width === null && item.height === null)) return; // Ignore empty rows

        if (activeEditMode === 'K2_LF_SELECT') {
            const eligibleTypes = ['B2', 'B3', 'B4'];
            if (!eligibleTypes.includes(item.fabricType)) {
                this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, { message: 'Only items with TYPE "B2", "B3", or "B4" can be selected for Light-Filter.', type: 'error' });
                return;
            }
            this.stateService.dispatch(uiActions.toggleLFSelection(rowIndex));
            this._updatePanelInputsState(); // Update to enable/disable LF inputs
            
        } else if (activeEditMode === 'K2_LF_DELETE_SELECT') {
            const { lfModifiedRowIndexes } = this._getState().quoteData.uiMetadata;
            if (!lfModifiedRowIndexes.includes(rowIndex)) {
                this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, { message: 'Only items with a Light-Filter setting (pink background) can be selected for deletion.', type: 'error' });
                return;
            }
            this.stateService.dispatch(uiActions.toggleLFSelection(rowIndex));

        } else if (activeEditMode === 'K2_SSET_SELECT') {
            // [NEW] Logic for SSet selection
            this.stateService.dispatch(uiActions.toggleSSetSelection(rowIndex));
            this._updatePanelInputsState(); // Update to enable/disable inputs based on selection
        }
    }

    handleLFEditRequest() {
        const { activeEditMode } = this._getState().ui;
        
        if (activeEditMode === 'K2_LF_SELECT') {
            this._applyLFChanges();
            this._exitAllK2Modes();
        } else {
            // Clear other K2 mode selections
            this.stateService.dispatch(uiActions.clearLFSelection());
            this.stateService.dispatch(uiActions.clearSSetSelection());
            this.stateService.dispatch(uiActions.setActiveEditMode('K2_LF_SELECT'));
            this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, { message: 'Please select items with TYPE \'B2\', \'B3\', or \'B4\' to edit.' });
        }
    }

    handleLFDeleteRequest() {
        const { activeEditMode } = this._getState().ui;
        
        if (activeEditMode === 'K2_LF_DELETE_SELECT') {
            const { lfSelectedRowIndexes } = this._getState().ui;
            if (lfSelectedRowIndexes.length > 0) {
                this.stateService.dispatch(quoteActions.removeLFProperties(lfSelectedRowIndexes));
                this.stateService.dispatch(quoteActions.removeLFModifiedRows(lfSelectedRowIndexes));
                this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, { message: 'Light-Filter settings have been cleared.' });
            }
            this._exitAllK2Modes();
        } else {
            // Clear other K2 mode selections
            this.stateService.dispatch(uiActions.clearLFSelection());
            this.stateService.dispatch(uiActions.clearSSetSelection());
            this.stateService.dispatch(uiActions.setActiveEditMode('K2_LF_DELETE_SELECT'));
            this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, { message: 'Please select the roller blinds for which you want to cancel the Light-Filter fabric setting. After selection, click the LF-Del button again.' });
        }
    }

    // [NEW] Handler for the SSet button
    handleSSetRequest() {
        const { activeEditMode } = this._getState().ui;

        if (activeEditMode === 'K2_SSET_SELECT') {
            // If already in SSet mode, clicking again applies the changes
            this._applySSetChanges();
            this._exitAllK2Modes();
        } else {
            // Clear other K2 mode selections
            this.stateService.dispatch(uiActions.clearLFSelection());
            this.stateService.dispatch(uiActions.clearSSetSelection());
            this.stateService.dispatch(uiActions.setActiveEditMode('K2_SSET_SELECT'));
            this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, { message: 'SSet Mode: Select items from the table to set their Fabric & Color.' });
            this._updatePanelInputsState(); // Disable all inputs initially
        }
    }


    _exitAllK2Modes() {
        this.stateService.dispatch(uiActions.setActiveEditMode(null));
        this.stateService.dispatch(uiActions.clearMultiSelectSelection());
        this.stateService.dispatch(uiActions.clearLFSelection());
        this.stateService.dispatch(uiActions.clearSSetSelection()); // [NEW] Clear SSet selection
        
        this.indexesToExcludeFromBatchUpdate.clear();
        this.lastSSetInput = null; // [NEW] Clear last input tracker

        this._updatePanelInputsState();
    }

    _applyLFChanges() {
        const { lfSelectedRowIndexes } = this._getState().ui;
        if (lfSelectedRowIndexes.length === 0) return;

        const fNameInput = document.querySelector('input[data-type="LF"][data-field="fabric"]');
        const fColorInput = document.querySelector('input[data-type="LF"][data-field="color"]');
        
        if (fNameInput && fColorInput && fNameInput.value && fColorInput.value) {
            const fabricNameWithPrefix = `Light-filter ${fNameInput.value}`;
            this.stateService.dispatch(quoteActions.batchUpdateLFProperties(lfSelectedRowIndexes, fabricNameWithPrefix, fColorInput.value));
            this.stateService.dispatch(quoteActions.addLFModifiedRows(lfSelectedRowIndexes));
        }
    }

    // [NEW] Logic to apply SSet changes
    _applySSetChanges() {
        const { sSetSelectedRowIndexes } = this._getState().ui;
        if (sSetSelectedRowIndexes.length === 0) {
            this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, { message: 'No items were selected.' });
            return;
        }

        const typeMap = {};
        const allPanelInputs = document.querySelectorAll('#fabric-batch-table .panel-input');
        
        allPanelInputs.forEach(input => {
            if (!input.disabled && input.dataset.type !== 'LF') {
                const type = input.dataset.type;
                const field = input.dataset.field;
                if (!typeMap[type]) {
                    typeMap[type] = {};
                }
                typeMap[type][field] = input.value;
            }
        });

        // Filter map to only include entries where both fabric and color are set
        const finalTypeMap = {};
        let typesApplied = 0;
        for (const type in typeMap) {
            if (typeMap[type].fabric && typeMap[type].color) {
                finalTypeMap[type] = typeMap[type];
                typesApplied++;
            }
        }

        if (typesApplied > 0) {
            // [FIX] Identify which selected rows will actually be modified
            const items = this._getItems();
            const modifiedIndexes = sSetSelectedRowIndexes.filter(index => {
                const itemType = items[index]?.fabricType;
                return itemType && finalTypeMap[itemType];
            });

            if (modifiedIndexes.length > 0) {
                this.stateService.dispatch(quoteActions.batchUpdatePropertiesForIndexes(modifiedIndexes, finalTypeMap));
                
                // [FIX] 移除多餘的 dispatch。
                // `batchUpdatePropertiesForIndexes` 的 reducer 
                // 已經會自動處理 `lfModifiedRowIndexes` 的清除。
                // this.stateService.dispatch(quoteActions.removeLFModifiedRows(modifiedIndexes));

                this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, { message: `Fabric details applied to ${modifiedIndexes.length} items.` });
            } else {
                 this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, { message: 'No selected items matched the types you edited.' });
            }
        } else {
            this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, { message: 'No changes applied. Please fill in both F-Name and F-Color for a type.' });
        }
    }


    _updatePanelInputsState() {
        const { ui, quoteData } = this._getState();
        const { activeEditMode, lfSelectedRowIndexes, sSetSelectedRowIndexes } = ui;
        const items = this._getItems();
        const { lfModifiedRowIndexes } = quoteData.uiMetadata;
        const presentTypes = new Set(items.map(item => item.fabricType).filter(Boolean));
        
        const allPanelInputs = document.querySelectorAll('#fabric-batch-table .panel-input');
        let firstEnabledInput = null;
        this.lastSSetInput = null; // Reset last input tracker
        
        if (activeEditMode === 'K2') {
            allPanelInputs.forEach(input => {
                const type = input.dataset.type;
                const field = input.dataset.field;

                if (type !== 'LF') {
                    const isEnabled = presentTypes.has(type);
                    input.disabled = !isEnabled;

                    if (isEnabled) {
                        if (!firstEnabledInput) {
                            firstEnabledInput = input;
                        }
                        const itemWithData = items.find((item, index) => 
                            item.fabricType === type && !this.indexesToExcludeFromBatchUpdate.has(index)
                        );
                        input.value = itemWithData ? itemWithData[field] : '';
                    } else {
                        input.value = '';
                    }
                } else {
                    input.disabled = true;
                }
            });

            if (firstEnabledInput) {
                setTimeout(() => {
                    firstEnabledInput.focus();
                    firstEnabledInput.select();
                }, 50);
            }
        } else if (activeEditMode === 'K2_LF_SELECT') {
            allPanelInputs.forEach(input => {
                const isLFRow = input.dataset.type === 'LF';
                const hasSelection = lfSelectedRowIndexes.length > 0;
                input.disabled = !(isLFRow && hasSelection);
                
                // [FIX] Auto-fill LF inputs from first selected item
                if (isLFRow && hasSelection) {
                    const firstItem = items[lfSelectedRowIndexes[0]];
                    if (firstItem && lfModifiedRowIndexes.includes(lfSelectedRowIndexes[0])) {
                        // [FIX] Remove "Light-filter " prefix when populating input
                        input.value = (firstItem[input.dataset.field] || '').replace('Light-filter ', '');
                    }
                }
            });
        } else if (activeEditMode === 'K2_SSET_SELECT') {
            // [NEW] Logic for SSet mode
            const selectedTypes = new Set(
                sSetSelectedRowIndexes.map(index => items[index].fabricType).filter(Boolean)
            );

            allPanelInputs.forEach(input => {
                const type = input.dataset.type;
                const isEnabled = type !== 'LF' && selectedTypes.has(type);
                input.disabled = !isEnabled;

                if (isEnabled) {
                    // Find the first selected item of this type to pre-fill data
                    const firstMatchingIndex = sSetSelectedRowIndexes.find(index => items[index].fabricType === type);
                    const firstItem = items[firstMatchingIndex];
                    input.value = firstItem[input.dataset.field] || '';

                    if (!firstEnabledInput) {
                        firstEnabledInput = input;
                    }
                    // Track the last enabled input
                    this.lastSSetInput = input;
                } else {
                    input.value = '';
                }
            });

            if (firstEnabledInput) {
                setTimeout(() => {
                    firstEnabledInput.focus();
                    firstEnabledInput.select();
                }, 50);
            }
        } else {
             allPanelInputs.forEach(input => {
                input.disabled = true;
                input.value = '';
            });
        }
    }
    
    activate() {
        this.stateService.dispatch(uiActions.setVisibleColumns(['sequence', 'fabricTypeDisplay', 'fabric', 'color']));
        // [MODIFIED] When tab activates, ensure all K2 modes are exited
        this._exitAllK2Modes();
    }
}