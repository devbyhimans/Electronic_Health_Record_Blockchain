'use strict';

const { Contract } = require('fabric-contract-api');

class PharmacyContract extends Contract {

    async initLedger(ctx) {
        console.log('MedBlock-v2 Ledger Initialized');
        return 'MedBlock-v2 Ledger initialized';
    }

    // --- User & Employee Management ---

    async registerEmployee(ctx, empId, role, name, metadata) {
        const actingRole = await this._getRole(ctx);
        if (actingRole !== 'manager') {
            throw new Error('Restricted: Only managers can register employees');
        }

        const employee = {
            docType: 'employee',
            empId,
            role, // 'manager', 'billing', 'doctor', 'insurance'
            name,
            isActive: true,
            org: ctx.clientIdentity.getMSPID(),
            metadata: JSON.parse(metadata),
            registeredAt: new Date().toISOString()
        };

        await ctx.stub.putState(`EMP_${empId}`, Buffer.from(JSON.stringify(employee)));
        return JSON.stringify(employee);
    }

    async deactivateEmployee(ctx, empId) {
        const actingRole = await this._getRole(ctx);
        if (actingRole !== 'manager') {
            throw new Error('Restricted: Only managers can deactivate employees');
        }

        const data = await ctx.stub.getState(`EMP_${empId}`);
        if (!data || data.length === 0) throw new Error(`Employee ${empId} not found`);

        const employee = JSON.parse(data.toString());
        employee.isActive = false;
        employee.deactivatedAt = new Date().toISOString();

        await ctx.stub.putState(`EMP_${empId}`, Buffer.from(JSON.stringify(employee)));
        return JSON.stringify(employee);
    }

    // --- NEW: List All Employees (Manager Only) ---
    async getAllEmployees(ctx) {
        const role = await this._getRole(ctx);
        if (role !== 'manager') throw new Error('Restricted: Only managers can list all employees');

        const iterator = await ctx.stub.getStateByRange('', '');
        const results = [];
        while (true) {
            const result = await iterator.next();
            if (result.value && result.value.value) {
                try {
                    const record = JSON.parse(result.value.value.toString('utf8'));
                    if (record.docType === 'employee') results.push(record);
                } catch (e) {}
            }
            if (result.done) { await iterator.close(); break; }
        }
        return JSON.stringify(results);
    }

    // --- Patient Management ---

    async createPatient(ctx, patientId, name, age, patientCertAlias) {
        // Patients can be registered by any active employee or managers
        await this._checkActiveEmployee(ctx);

        // Store the calling alias so patients registered with role 'patient' can self-access
        const callerAlias = await this._getAlias(ctx);
        // If the patient has their own cert identity, store that alias for self-access
        const ownerAlias = (patientCertAlias && patientCertAlias.trim()) ? patientCertAlias.trim() : callerAlias;

        const patient = {
            docType: 'patient',
            patientId,
            name,
            age: parseInt(age),
            prescriptions: [],
            accessControl: [],
            ownerAlias,
            registeredAt: new Date().toISOString()
        };

        await ctx.stub.putState(`PATIENT_${patientId}`, Buffer.from(JSON.stringify(patient)));
        // Store reverse lookup: ownerAlias -> patientId, so _getRole can identify this cert as 'patient'
        await ctx.stub.putState(`ALIAS_${ownerAlias}_PATIENT`, Buffer.from(patientId));
        return JSON.stringify(patient);
    }

    async checkPatientExists(ctx, patientId) {
        const data = await ctx.stub.getState(`PATIENT_${patientId}`);
        return (data && data.length > 0);
    }

    // --- NEW: Get Patient Profile ---
    async getPatientProfile(ctx, patientId) {
        const role = await this._getRole(ctx);
        const alias = await this._getAlias(ctx);

        // Privileged roles: managers, billing staff, pharmacists can always read
        const isPrivileged = (role === 'manager' || role === 'billing' || role === 'pharmacist');
        // Patient role can always read any patient record they were issued access to
        const isPatientRole = (role === 'patient');

        if (!isPrivileged && !isPatientRole) {
            // Check access control list
            const authorized = await this._checkAccess(ctx, patientId, alias);
            if (!authorized) throw new Error(`Access Denied for alias: ${alias}`);
        }

        const data = await ctx.stub.getState(`PATIENT_${patientId}`);
        if (!data || data.length === 0) throw new Error(`Patient ${patientId} not found`);
        return data.toString();
    }

    // --- NEW: Get Access Control List for a Patient ---
    async getAccessList(ctx, patientId) {
        const role = await this._getRole(ctx);
        const alias = await this._getAlias(ctx);
        const patientLookup = await ctx.stub.getState(`ALIAS_${alias}_PATIENT`);
        const isOwner = (patientLookup && patientLookup.toString() === patientId);

        // Only the patient themselves or a manager can view access list
        if (role !== 'manager' && !isOwner) {
            throw new Error('Access Denied: Only the patient or manager can view the access list');
        }

        const data = await ctx.stub.getState(`PATIENT_${patientId}`);
        if (!data || data.length === 0) return JSON.stringify([]);

        const patient = JSON.parse(data.toString());
        return JSON.stringify(patient.accessControl || []);
    }

    // --- Billing & Prescriptions ---

    async createBill(ctx, billId, patientId, empId, amount, medicineList, ipfsHash) {
        // 1. Ensure employee is active
        const actingEmployee = await this._checkActiveEmployee(ctx);
        
        // 2. Ensure patient exists
        const patientExists = await this.checkPatientExists(ctx, patientId);
        if (!patientExists) throw new Error(`Patient ${patientId} is not registered in the system`);

        const bill = {
            docType: 'bill',
            billId,
            patientId,
            empId: actingEmployee.empId,
            amount: parseFloat(amount),
            medicines: JSON.parse(medicineList),
            ipfsHash,
            timestamp: new Date().toISOString(),
            signature: ctx.clientIdentity.getID() // Digital identity stamp
        };

        await ctx.stub.putState(`BILL_${billId}`, Buffer.from(JSON.stringify(bill)));
        
        // Also update patient's prescription list
        const patientData = await ctx.stub.getState(`PATIENT_${patientId}`);
        const patient = JSON.parse(patientData.toString());
        patient.prescriptions.push(billId);
        await ctx.stub.putState(`PATIENT_${patientId}`, Buffer.from(JSON.stringify(patient)));

        return JSON.stringify(bill);
    }

    async getPatientBills(ctx, patientId) {
        const role = await this._getRole(ctx);
        const alias = await this._getAlias(ctx);
        const patientLookup = await ctx.stub.getState(`ALIAS_${alias}_PATIENT`);
        const isOwner = (patientLookup && patientLookup.toString() === patientId);

        // Access Control
        if (role !== 'manager' && role !== 'billing' && !isOwner) {
            // Check manual access control (matching full ID)
            const actingId = ctx.clientIdentity.getID();
            const authorized = await this._checkAccess(ctx, patientId, actingId);
            if (!authorized) throw new Error('Access Denied: You are not authorized to view these records');
        }

        const iterator = await ctx.stub.getStateByRange('', '');
        const results = [];
        while (true) {
            const result = await iterator.next();
            if (result.value && result.value.value) {
                try {
                    const record = JSON.parse(result.value.value.toString('utf8'));
                    if (record.docType === 'bill' && record.patientId === patientId) {
                        results.push(record);
                    }
                } catch (e) {}
            }
            if (result.done) { await iterator.close(); break; }
        }
        return JSON.stringify(results);
    }

    // --- Access Control (Managed by Patient) ---

    async grantAccess(ctx, requesterId) {
        const alias = await this._getAlias(ctx);
        const patientLookup = await ctx.stub.getState(`ALIAS_${alias}_PATIENT`);
        if (!patientLookup || patientLookup.length === 0) {
            throw new Error('Registration required: You must be a registered patient to manage access');
        }
        const patientId = patientLookup.toString();

        const data = await ctx.stub.getState(`PATIENT_${patientId}`);
        const patient = JSON.parse(data.toString());
        if (!patient.accessControl.includes(requesterId)) {
            patient.accessControl.push(requesterId);
        }

        await ctx.stub.putState(`PATIENT_${patientId}`, Buffer.from(JSON.stringify(patient)));
        return `Access granted to ${requesterId}`;
    }

    async revokeAccess(ctx, requesterId) {
        const alias = await this._getAlias(ctx);
        const patientLookup = await ctx.stub.getState(`ALIAS_${alias}_PATIENT`);
        if (!patientLookup || patientLookup.length === 0) return 'No profile found';
        const patientId = patientLookup.toString();

        const data = await ctx.stub.getState(`PATIENT_${patientId}`);
        if (!data || data.length === 0) return 'No profile found';

        const patient = JSON.parse(data.toString());
        patient.accessControl = patient.accessControl.filter(id => id !== requesterId);

        await ctx.stub.putState(`PATIENT_${patientId}`, Buffer.from(JSON.stringify(patient)));
        return `Access revoked from ${requesterId}`;
    }

    // --- Inventory Management ---

    /**
     * Add or restock a medicine item in pharmacy inventory.
     * Only stock officers (role=inventory) or managers may call this.
     */
    async addInventoryItem(ctx, itemId, name, quantity, price, unit) {
        const role = await this._getRole(ctx);
        if (role !== 'manager' && role !== 'inventory') {
            throw new Error('Restricted: Only inventory officers or managers can add stock');
        }

        const existingData = await ctx.stub.getState(`INV_${itemId}`);
        let item;
        if (existingData && existingData.length > 0) {
            // Restock: add to existing quantity
            item = JSON.parse(existingData.toString());
            item.quantity += parseInt(quantity);
            item.lastRestocked = new Date().toISOString();
            item.price = parseFloat(price) || item.price;
        } else {
            // New item
            item = {
                docType: 'inventory',
                itemId,
                name,
                quantity: parseInt(quantity),
                price: parseFloat(price) || 0,
                unit: unit || 'tablets',
                lowStockThreshold: 50,
                addedBy: ctx.clientIdentity.getID(),
                createdAt: new Date().toISOString(),
                lastRestocked: new Date().toISOString()
            };
        }

        await ctx.stub.putState(`INV_${itemId}`, Buffer.from(JSON.stringify(item)));
        return JSON.stringify(item);
    }

    /**
     * Deduct quantity from inventory (called internally during bill creation).
     * Pharmacist or manager may call this.
     */
    async deductInventoryItem(ctx, itemId, quantityToDeduct) {
        const role = await this._getRole(ctx);
        if (role !== 'manager' && role !== 'billing' && role !== 'inventory') {
            throw new Error('Restricted: Not authorised to deduct inventory');
        }

        const data = await ctx.stub.getState(`INV_${itemId}`);
        if (!data || data.length === 0) throw new Error(`Inventory item ${itemId} not found`);

        const item = JSON.parse(data.toString());
        const deduct = parseInt(quantityToDeduct);
        if (item.quantity < deduct) {
            throw new Error(`Insufficient stock: ${item.name} has only ${item.quantity} ${item.unit}`);
        }
        item.quantity -= deduct;
        item.lastDeducted = new Date().toISOString();

        await ctx.stub.putState(`INV_${itemId}`, Buffer.from(JSON.stringify(item)));
        return JSON.stringify(item);
    }

    /**
     * Get all inventory items. Any authenticated staff member can view.
     */
    async getAllInventory(ctx) {
        const iterator = await ctx.stub.getStateByRange('', '');
        const results = [];
        while (true) {
            const result = await iterator.next();
            if (result.value && result.value.value) {
                try {
                    const record = JSON.parse(result.value.value.toString('utf8'));
                    if (record.docType === 'inventory') results.push(record);
                } catch (e) {}
            }
            if (result.done) { await iterator.close(); break; }
        }
        return JSON.stringify(results);
    }

    /**
     * Get a single inventory item by ID.
     */
    async getInventoryItem(ctx, itemId) {
        const data = await ctx.stub.getState(`INV_${itemId}`);
        if (!data || data.length === 0) throw new Error(`Item ${itemId} not found in inventory`);
        return data.toString();
    }

    // --- Global Audit ---

    async getAllBills(ctx) {
        const role = await this._getRole(ctx);
        if (role !== 'manager') throw new Error('Restricted: Global audit is for Managers only');

        const iterator = await ctx.stub.getStateByRange('', '');
        const results = [];
        while (true) {
            const result = await iterator.next();
            if (result.value && result.value.value) {
                try {
                    const record = JSON.parse(result.value.value.toString('utf8'));
                    if (record.docType === 'bill') results.push(record);
                } catch (e) {}
            }
            if (result.done) { await iterator.close(); break; }
        }
        return JSON.stringify(results);
    }

    // --- Helpers ---

    async _getRole(ctx) {
        // 1. Check for explicit CA attribute
        let role = ctx.clientIdentity.getAttributeValue('role');
        if (role) return role;

        // 2. Check for ID-based heuristics (bootstrap identities)
        const id = ctx.clientIdentity.getID();
        if (!id) return 'guest';
        const lowerId = id.toLowerCase();
        if (lowerId.includes('manager') || lowerId.includes('admin')) return 'manager';

        // 3. Extract Stable Alias (e.g., 'user1' from any DN format)
        const alias = await this._getAlias(ctx);

        // 4. Check Ledger-based Registry (Primary source for workforce)
        const empData = await ctx.stub.getState(`EMP_${alias}`);
        if (empData && empData.length > 0) {
            const emp = JSON.parse(empData.toString());
            if (emp.isActive) return emp.role;
        }

        // 5. Check if this cert belongs to a registered patient (via reverse ALIAS lookup)
        const patientLookup = await ctx.stub.getState(`ALIAS_${alias}_PATIENT`);
        if (patientLookup && patientLookup.length > 0) return 'patient';

        // 6. Pattern fallback (Case Invariant)
        if (lowerId.includes('billing')) return 'billing';
        if (lowerId.includes('doctor')) return 'doctor';
        if (lowerId.includes('inventory')) return 'inventory';
        if (lowerId.includes('patient')) return 'patient';
        
        return 'guest';
    }

    async _getAlias(ctx) {
        const id = ctx.clientIdentity.getID();
        // Extract CN (Common Name) part from DN or X509 ID
        const parts = id.split('CN=');
        if (parts.length < 2) return id.toLowerCase().split('@')[0].split(/[ :\/]/)[0];
        
        // Take everything before common delimiters: space, comma, colon, slash, at-sign
        const cnPart = parts[1].split(/[ ,:;\/@]/)[0];
        return cnPart.toLowerCase();
    }

    async _checkActiveEmployee(ctx) {
        const role = await this._getRole(ctx);
        if (role === 'manager') return { empId: 'manager', role: 'manager' };

        // Use alias (e.g., 'user23') to look up the employee in the ledger
        const alias = await this._getAlias(ctx);
        const data = await ctx.stub.getState(`EMP_${alias}`);
        if (data && data.length > 0) {
            const emp = JSON.parse(data.toString());
            if (!emp.isActive) throw new Error('Access Denied: Your account is deactivated');
            return emp;
        }
        
        // Fallback for bootstrap phase (billing tag in cert)
        if (role === 'billing') return { empId: alias, role: 'billing' };
        
        throw new Error(`Access Denied: Not an active employee (alias: ${alias})`);
    }

    async _checkAccess(ctx, patientId, requesterId) {
        const data = await ctx.stub.getState(`PATIENT_${patientId}`);
        if (!data || data.length === 0) return false;
        const patient = JSON.parse(data.toString());
        return patient.accessControl.includes(requesterId);
    }
}

module.exports = PharmacyContract;
module.exports.contracts = [PharmacyContract];
