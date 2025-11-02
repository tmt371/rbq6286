// File: 04-core-code/services/workflow-service.js

import { initialState } from '../config/initial-state.js';
import { 
EVENTS, DOM_IDS } from '../config/constants.js';
import * as uiActions from '../actions/ui-actions.js';
import * as quoteActions from '../actions/quote-actions.js';
import { paths } from '../config/paths.js';

/**
 * @fileoverview A dedicated service for coordinating complex, multi-step user workflows.
 * This service takes complex procedural logic out of the AppController.
 */
export class WorkflowService {
    constructor({ eventAggregator, stateService, fileService, calculationService, productFactory, detailConfigView, quoteGeneratorService }) {
        this.eventAggregator = eventAggregator;
        this.stateService = stateService;
        this.fileService = fileService;
this.calculationService = calculationService;
        this.productFactory = productFactory;
        this.detailConfigView = detailConfigView;
        this.quoteGeneratorService = quoteGeneratorService; // [NEW] Store the injected service
        this.quotePreviewComponent = null; // Will be set by AppContext

        console.log("WorkflowService Initialized.");
    }

    setQuotePreviewComponent(component) {
        this.quotePreviewComponent = component;
    }

    async handlePrintableQuoteRequest() {
        try {
     
       const { quoteData, ui } = this.stateService.getState();
            const f3Data = this._getF3OverrideData();

            // [REFACTORED] Delegate the entire HTML generation process to the new service.
            const finalHtml = this.quoteGeneratorService.generateQuoteHtml(quoteData, ui, f3Data);

            if (finalHtml) {
                // [MODIFIED] Phase 2: Replace the old iframe event with the new window.open mechanism.
                // this.eventAggregator.publish(EVENTS.SHOW_QUOTE_PREVIEW, finalHtml);

                const blob = new Blob([finalHtml], { type: 'text/html' 
});
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');

            } else {
                throw new Error("QuoteGeneratorService did not return HTML. Templates might not be loaded.");
            }

        } catch (error) {
            console.error("Error generating printable quote:", error);
            this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, {
             
   message: "Failed to generate quote preview. See console for details.",
                type: 'error',
            });
        }
    }

    _getF3OverrideData() {
        const getValue = (id) => document.getElementById(id)?.value || '';
        return {
           
 quoteId: getValue('f3-quote-id'),
            issueDate: getValue('f3-issue-date'),
            dueDate: getValue('f3-due-date'),
            customerName: getValue('f3-customer-name'),
            customerAddress: getValue('f3-customer-address'),
            customerPhone: getValue('f3-customer-phone'),
            
customerEmail: getValue('f3-customer-email'),
            finalOfferPrice: getValue('f3-final-offer-price'),
            // [MODIFIED] Add the missing generalNotes field to be collected
            generalNotes: getValue('f3-general-notes'),
            termsConditions: getValue('f3-terms-conditions'),
        };
    }

    // [REMOVED] Methods handleRemoteDistribution and handleDualDistribution have been moved to F1CostView.

    handleF1TabActivation() {
        const { quoteData } = this.stateService.getState();
        const productStrategy = this.productFactory.getProductStrategy(quoteData.currentProduct);
        const { updatedQuoteData } = this.calculationService.calculateAndSum(quoteData, productStrategy);

        this.stateService.dispatch(quoteActions.setQuoteData(updatedQuoteData));
    }

    // [REMOVED] All F2-related methods have been moved to F2SummaryView.

    handleNavigationToDetailView() {
        const { ui } = this.stateService.getState();
        if (ui.currentView === 'QUICK_QUOTE') {
            this.stateService.dispatch(uiActions.setCurrentView('DETAIL_CONFIG'));
this.detailConfigView.activateTab('k1-tab');
        } else {
            this.stateService.dispatch(uiActions.setCurrentView('QUICK_QUOTE'));
            this.stateService.dispatch(uiActions.setVisibleColumns(initialState.ui.visibleColumns));
        }
    }

    handleNavigationToQuickQuoteView() {
        this.stateService.dispatch(uiActions.setCurrentView('QUICK_QUOTE'));
        this.stateService.dispatch(uiActions.setVisibleColumns(initialState.ui.visibleColumns));
    }

    handleTabSwitch({ tabId }) {
        this.detailConfigView.activateTab(tabId);
    }

    // [MODIFIED v6285 Phase 5] Helper function now captures ALL F1 and F3 state.
    _getQuoteDataWithSnapshots() {
        const { quoteData, ui } = this.stateService.getState();
        // Create a deep copy to avoid mutating the original state
        let dataWithSnapshot = JSON.parse(JSON.stringify(quoteData));

        // --- 1. Capture F1 Snapshot (from Phase 4) ---
        if (dataWithSnapshot.f1Snapshot) {
            const items = quoteData.products[quoteData.currentProduct].items;

            dataWithSnapshot.f1Snapshot.winder_qty = items.filter(item => item.winder === 'HD').length;
            dataWithSnapshot.f1Snapshot.motor_qty = items.filter(item => !!item.motor).length;
            dataWithSnapshot.f1Snapshot.charger_qty = ui.driveChargerCount || 0;
            dataWithSnapshot.f1Snapshot.cord_qty = ui.driveCordCount || 0;
            
            const totalRemoteQty = ui.driveRemoteCount || 0;
            const remote1chQty = ui.f1.remote_1ch_qty; 
            const remote16chQty = (ui.f1.remote_16ch_qty === null) ? totalRemoteQty - remote1chQty : ui.f1.remote_16ch_qty;

            const totalDualPairs = Math.floor(items.filter(item => item.dual === 'D').length / 2);
            const comboQty = (ui.f1.dual_combo_qty === null) ? totalDualPairs : ui.f1.dual_combo_qty;
            const slimQty = (ui.f1.dual_slim_qty === null) ? 0 : ui.f1.dual_slim_qty;

            dataWithSnapshot.f1Snapshot.remote_1ch_qty = remote1chQty;
            dataWithSnapshot.f1Snapshot.remote_16ch_qty = remote16chQty;
            dataWithSnapshot.f1Snapshot.dual_combo_qty = comboQty;
            dataWithSnapshot.f1Snapshot.dual_slim_qty = slimQty;
            dataWithSnapshot.f1Snapshot.discountPercentage = ui.f1.discountPercentage;
        } else {
            console.error("f1Snapshot object is missing from quoteData. Cannot save F1 state.");
        }

        // --- 2. Capture F3 Snapshot (NEW Phase 5) ---
        // Use the same getValue logic as _getF3OverrideData
        const getValue = (id) => document.getElementById(id)?.value || '';
        
        dataWithSnapshot.quoteId = getValue('f3-quote-id');
        dataWithSnapshot.issueDate = getValue('f3-issue-date');
        dataWithSnapshot.dueDate = getValue('f3-due-date');
        
        if (!dataWithSnapshot.customer) {
            dataWithSnapshot.customer = {};
        }
        dataWithSnapshot.customer.name = getValue('f3-customer-name');
        dataWithSnapshot.customer.address = getValue('f3-customer-address');
        dataWithSnapshot.customer.phone = getValue('f3-customer-phone');
        dataWithSnapshot.customer.email = getValue('f3-customer-email');

        // Note: We don't save generalNotes or termsConditions as they are not part of quoteData

        return dataWithSnapshot;
    }

    // [MODIFIED v6285 Phase 5] Logic migrated from quick-quote-view.js and updated.
    handleSaveToFile() {
        const dataToSave = this._getQuoteDataWithSnapshots();
        const result = this.fileService.saveToJson(dataToSave);
        const notificationType = result.success ? 'info' : 'error';
        this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, { message: result.message, type: notificationType });
    }

    // [MODIFIED v6285 Phase 5] Logic migrated from quick-quote-view.js and updated.
    handleExportCSV() {
        const dataToExport = this._getQuoteDataWithSnapshots();
        const result = this.fileService.exportToCsv(dataToExport);
        const notificationType = result.success ? 'info' : 'error';
        this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, { message: result.message, type: notificationType });
    }

    // [NEW & MOVED] Logic migrated from quick-quote-view.js.
    handleReset() {
        if (window.confirm("This will clear all data. Are you sure?")) {
            this.stateService.dispatch(quoteActions.resetQuoteData());
            this.stateService.dispatch(uiActions.resetUi());
            this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, { message: 'Quote has been reset.' });
        }
    }

    handleUserRequestedLoad() {
        const { quoteData } = this.stateService.getState();
        const productKey = quoteData.currentProduct;
        const items = quoteData.products[productKey] 
? quoteData.products[productKey].items : [];
        const hasData = items.length > 1 || (items.length === 1 && (items[0].width || items[0].height));

        if (hasData) {
            this.eventAggregator.publish(EVENTS.SHOW_LOAD_CONFIRMATION_DIALOG);
        } else {
            this.eventAggregator.publish(EVENTS.TRIGGER_FILE_LOAD);
        }
    }

    handleLoadDirectly() {
        this.eventAggregator.publish(EVENTS.TRIGGER_FILE_LOAD);
    }

    handleFileLoad({ fileName, content }) {
     
   const result = this.fileService.parseFileContent(fileName, content);
        if (result.success) {
            // 1. Set the new quote data
            this.stateService.dispatch(quoteActions.setQuoteData(result.data));
            
            // 2. Reset the UI state to match the new data
            this.stateService.dispatch(uiActions.resetUi());

            // 3. [MODIFIED v6285 Phase 4] Check for an f1Snapshot in the loaded data and restore it
            if (result.data.f1Snapshot) {
                this.stateService.dispatch(uiActions.restoreF1Snapshot(result.data.f1Snapshot));
            }

            // 4. Mark sum as outdated and notify user
            this.stateService.dispatch(uiActions.setSumOutdated(true));
            this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, { message: result.message });
        } else {
            this.eventAggregator.publish(EVENTS.SHOW_NOTIFICATION, { message: result.message, type: 'error' });
        }
    }

    handleF1DiscountChange({ percentage }) {
        this.stateService.dispatch(uiActions.setF1DiscountPercentage(percentage));
    }
}