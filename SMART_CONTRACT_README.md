# Smart contract notes

This file is a short guide to the current source, not a deployment manifest or a claim that the channel has a particular committed definition. The live implementation is under [`orgs/hospital/EHR_hospitalOrg-main/ehr-chaincode-v3/`](orgs/hospital/EHR_hospitalOrg-main/ehr-chaincode-v3/); its README lists the eight exported contracts and current privacy limitations.

The chaincode source includes patient and clinical values in ledger state. Use synthetic data only. It currently has no `stub.setEvent()` calls; the dashboard observes committed-block metadata instead. A shared `emitEvent` helper remains a draft proposal until the Blockchain/Security owners review, implement, and deploy it.

FHIR R4, ABDM/ABHA, DPDP Act 2023, HIPAA-style safeguards, and GDPR are design targets/reference points, not certifications supplied by this code.
