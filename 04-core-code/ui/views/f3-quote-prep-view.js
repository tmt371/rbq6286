// File: 04-core-code/ui/views/f3-quote-prep-view.js

import { EVENTS, DOM_IDS } from '../../config/constants.js';

/**
 * @fileoverview A dedicated sub-view for handling all logic related to the F3 (Quote Prep) tab.
 */
export class F3QuotePrepView {
    constructor({ panelElement, eventAggregator, stateService }) { // [MODIFIED] Added stateService
        this.panelElement = panelElement;
        this.eventAggregator = eventAggregator;
        this.stateService = stateService; // [NEW] Store stateService

        this._cacheF3Elements();
        this._initializeF3Listeners();
        console.log("F3QuotePrepView Initialized.");
    }

    _cacheF3Elements() {
        const query = (id) => this.panelElement.querySelector(id);
        this.f3 = {
            inputs: {
                quoteId: query('#f3-quote-id'), // [FIXED] Corrected selector from '##' to '#'
                issueDate: query('#f3-issue-date'),
                dueDate: query('#f3-due-date'),
                customerName: query('#f3-customer-name'),
                customerAddress: query('#f3-customer-address'),
                customerPhone: query('#f3-customer-phone'),
                customerEmail: query('#f3-customer-email'),
                finalOfferPrice: query('#f3-final-offer-price'),
                generalNotes: query('#f3-general-notes'),
                termsConditions: query('#f3-terms-conditions'),
            },
            buttons: {
                addQuote: query(`#${DOM_IDS.BTN_ADD_QUOTE}`),
            }
        };
    }

    _initializeF3Listeners() {
        if (!this.f3.inputs.issueDate) return;

        // --- Date Chaining Logic ---
        this.f3.inputs.issueDate.addEventListener('input', (event) => {
            const issueDateValue = event.target.value;
            if (issueDateValue && !this.f3.inputs.dueDate.value) { // Only auto-fill if due date is empty
                const issueDate = new Date(issueDateValue);
                // Adjust for timezone offset to prevent day-before issues
                issueDate.setMinutes(issueDate.getMinutes() + issueDate.getTimezoneOffset());

                const dueDate = new Date(issueDate);
                dueDate.setDate(dueDate.getDate() + 14);

                const year = dueDate.getFullYear();
                const month = String(dueDate.getMonth() + 1).padStart(2, '0');
                const day = String(dueDate.getDate()).padStart(2, '0');

                this.f3.inputs.dueDate.value = `${year}-${month}-${day}`;
            }
        });

        // --- Add Quote Button Listener ---
        if (this.f3.buttons.addQuote) {
            this.f3.buttons.addQuote.addEventListener('click', () => {
                this.eventAggregator.publish(EVENTS.USER_REQUESTED_PRINTABLE_QUOTE);
            });
        }

        // --- Focus Jumping Logic ---
        const focusOrder = [
            'quoteId', 'issueDate', 'dueDate', 'customerName', 'customerAddress',
            'customerPhone', 'customerEmail', 'finalOfferPrice', 'generalNotes', 'termsConditions'
        ];

        focusOrder.forEach((key, index) => {
            const currentElement = this.f3.inputs[key];
            if (currentElement) {
                currentElement.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
                        // Allow default Tab behavior in textareas
                        if (event.key === 'Tab' && currentElement.tagName === 'TEXTAREA') {
                            return;
                        }
                        
                        event.preventDefault();
                        event.stopPropagation(); // Stop the event from bubbling up
                        const nextIndex = index + 1;
                        if (nextIndex < focusOrder.length) {
                            const nextKey = focusOrder[nextIndex];
                            this.f3.inputs[nextKey]?.focus();
                        } else {
                            this.f3.buttons.addQuote?.focus();
                        }
                    }
                });
            }
        });
    }

    // [MODIFIED v6285 Phase 5] Render now fully syncs from state.
    render(state) {
        if (!this.f3.inputs.quoteId || !state) return;

        const { quoteData } = state;
        const { customer } = quoteData;

        // Helper to format date strings (YYYY-MM-DD)
        const formatDate = (dateString) => {
            if (!dateString) return '';
            try {
                const date = new Date(dateString);
                // Adjust for timezone offset
                date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
                return date.toISOString().split('T')[0];
            } catch (e) {
                return dateString; // Fallback to whatever was saved
            }
        };
        
        // Helper to update value only if it differs
        const updateInput = (input, newValue) => {
            const value = newValue || '';
            if (input && input.value !== value) {
                input.value = value;
            }
        };

        // --- 1. Populate Defaults (if state is empty) ---
        let quoteId = quoteData.quoteId;
        let issueDate = quoteData.issueDate;
        let dueDate = quoteData.dueDate;

        if (!quoteId) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            quoteId = `RB${year}${month}${day}${hours}`;
        }
        if (!issueDate) {
            issueDate = formatDate(new Date());
        }
        if (!dueDate) {
            const issueDateObj = new Date(issueDate);
            issueDateObj.setMinutes(issueDateObj.getMinutes() + issueDateObj.getTimezoneOffset());
            issueDateObj.setDate(issueDateObj.getDate() + 14);
            dueDate = formatDate(issueDateObj);
        }

        // --- 2. Sync all inputs with state ---
        updateInput(this.f3.inputs.quoteId, quoteId);
        updateInput(this.f3.inputs.issueDate, formatDate(issueDate));
        updateInput(this.f3.inputs.dueDate, formatDate(dueDate));
        
        updateInput(this.f3.inputs.customerName, customer.name);
        updateInput(this.f3.inputs.customerAddress, customer.address);
        updateInput(this.f3.inputs.customerPhone, customer.phone);
        updateInput(this.f3.inputs.customerEmail, customer.email);
        
        // Note: finalOfferPrice, generalNotes, termsConditions are not part of state
        // and retain their manually entered values.
    }

    activate() {
        // [MODIFIED v6285 Phase 5]
        // This method is called when the tab becomes active.
        // We now fetch the latest state and call render to populate/restore data.
        const state = this.stateService.getState();
        this.render(state);
    }
}