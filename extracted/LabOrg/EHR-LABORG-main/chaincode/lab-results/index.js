'use strict';

const { Contract } = require('fabric-contract-api');

class LabResultsContract extends Contract {
  async ResultExists(ctx, resultId) {
    const data = await ctx.stub.getState(resultId);
    return data && data.length > 0;
  }

  async InitLedger(ctx) {
    const existing = await this.ResultExists(ctx, 'labresult1');
    if (existing) {
      return JSON.stringify({
        message: 'Ledger already initialized',
        initialized: false,
      });
    }

    const seedRecords = [
      {
        resultId: 'labresult1',
        patientId: 'patient-1001',
        testCode: 'CBC',
        collectedAt: '2026-04-19T08:00:00Z',
        status: 'REPORTED',
        resultData: {
          hemoglobin: '13.8',
          wbc: '6200',
          platelets: '250000',
        },
      },
      {
        resultId: 'labresult2',
        patientId: 'patient-1002',
        testCode: 'LFT',
        collectedAt: '2026-04-19T09:30:00Z',
        status: 'IN_REVIEW',
        resultData: {
          alt: '42',
          ast: '37',
          bilirubin: '0.8',
        },
      },
    ];

    for (const record of seedRecords) {
      const payload = this._buildRecord(record);
      await ctx.stub.putState(record.resultId, Buffer.from(JSON.stringify(payload)));
    }

    return JSON.stringify({
      message: 'Ledger initialized',
      initialized: true,
      count: seedRecords.length,
    });
  }

  async CreateLabResult(ctx, resultId, patientId, testCode, collectedAt, status, resultDataJson) {
    const exists = await this.ResultExists(ctx, resultId);
    if (exists) {
      throw new Error(`Lab result ${resultId} already exists`);
    }

    const record = this._buildRecord({
      resultId,
      patientId,
      testCode,
      collectedAt,
      status,
      resultData: this._parseJson(resultDataJson),
    });

    await ctx.stub.putState(resultId, Buffer.from(JSON.stringify(record)));
    return JSON.stringify(record);
  }

  async ReadLabResult(ctx, resultId) {
    const data = await ctx.stub.getState(resultId);
    if (!data || data.length === 0) {
      throw new Error(`Lab result ${resultId} does not exist`);
    }
    return data.toString();
  }

  async UpdateLabResult(ctx, resultId, patientId, testCode, collectedAt, status, resultDataJson) {
    const exists = await this.ResultExists(ctx, resultId);
    if (!exists) {
      throw new Error(`Lab result ${resultId} does not exist`);
    }

    const record = this._buildRecord({
      resultId,
      patientId,
      testCode,
      collectedAt,
      status,
      resultData: this._parseJson(resultDataJson),
    });

    await ctx.stub.putState(resultId, Buffer.from(JSON.stringify(record)));
    return JSON.stringify(record);
  }

  async UpdateLabStatus(ctx, resultId, status) {
    const current = JSON.parse(await this.ReadLabResult(ctx, resultId));
    current.status = status;
    current.updatedByTx = ctx.stub.getTxID();
    await ctx.stub.putState(resultId, Buffer.from(JSON.stringify(current)));
    return JSON.stringify(current);
  }

  async DeleteLabResult(ctx, resultId) {
    const exists = await this.ResultExists(ctx, resultId);
    if (!exists) {
      throw new Error(`Lab result ${resultId} does not exist`);
    }

    await ctx.stub.deleteState(resultId);
    return JSON.stringify({
      deleted: true,
      resultId,
    });
  }

  async GetLabResultsByPatient(ctx, patientId) {
    const query = {
      selector: {
        docType: 'labResult',
        patientId,
      },
    };

    const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
    const results = await this._collectIterator(iterator);
    return JSON.stringify(results);
  }

  async GetAllLabResults(ctx) {
    const iterator = await ctx.stub.getStateByRange('', '');
    const results = await this._collectIterator(iterator);
    const filtered = results.filter((record) => record.docType === 'labResult');
    return JSON.stringify(filtered);
  }

  _buildRecord({ resultId, patientId, testCode, collectedAt, status, resultData }) {
    return {
      docType: 'labResult',
      resultId,
      patientId,
      testCode,
      collectedAt,
      status,
      resultData,
      ownerOrg: 'LabMSP',
      updatedByTx: null,
    };
  }

  _parseJson(jsonText) {
    try {
      return JSON.parse(jsonText);
    } catch (error) {
      throw new Error(`Invalid JSON payload: ${error.message}`);
    }
  }

  async _collectIterator(iterator) {
    const results = [];

    while (true) {
      const item = await iterator.next();
      if (item.value && item.value.value) {
        const rawValue = item.value.value.toString('utf8');
        try {
          results.push(JSON.parse(rawValue));
        } catch (_error) {
          results.push(rawValue);
        }
      }

      if (item.done) {
        await iterator.close();
        return results;
      }
    }
  }
}

module.exports = LabResultsContract;
module.exports.contracts = [LabResultsContract];
