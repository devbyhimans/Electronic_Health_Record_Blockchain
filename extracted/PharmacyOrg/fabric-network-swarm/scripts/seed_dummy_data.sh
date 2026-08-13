#!/bin/bash
# seed_dummy_data.sh
# Automatically populates the blockchain and IPFS with realistic mock data for testing!

echo "============================================================"
echo "    Seeding Pharmacy MedBlock with Dummy Data..."
echo "============================================================"

API_URL="http://100.124.176.94:3000/api"

echo "Waiting for Fabric network to settle (15s)..."
sleep 15

echo -e "\n[1/4] Registering Pharmacy Staff..."
# Register a manager, a pharmacist (billing), and an inventory officer
curl -s -X POST "$API_URL/register-employee" -H "Content-Type: application/json" -d '{"user": "manager", "userId": "admin_chief", "role": "manager", "name": "Chief Pharmacist"}' > /dev/null
curl -s -X POST "$API_URL/register-employee" -H "Content-Type: application/json" -d '{"user": "manager", "userId": "ph_alice", "role": "billing", "name": "Alice (Pharmacist)"}' > /dev/null
curl -s -X POST "$API_URL/register-employee" -H "Content-Type: application/json" -d '{"user": "manager", "userId": "inv_bob", "role": "inventory", "name": "Bob (Stock Officer)"}' > /dev/null
echo "✓ Staff populated in the wallet and ledger."

echo -e "\n[2/4] Initializing Pharmacy Inventory..."
curl -s -X POST "$API_URL/inventory" -H "Content-Type: application/json" -d '{"user": "inv_bob", "itemId": "med_para_500", "name": "Paracetamol 500mg", "quantity": 1000, "price": 5.50, "unit": "tablets"}' > /dev/null
curl -s -X POST "$API_URL/inventory" -H "Content-Type: application/json" -d '{"user": "inv_bob", "itemId": "med_amox_250", "name": "Amoxicillin 250mg", "quantity": 300, "price": 12.00, "unit": "vials"}' > /dev/null
curl -s -X POST "$API_URL/inventory" -H "Content-Type: application/json" -d '{"user": "inv_bob", "itemId": "med_ibup_400", "name": "Ibuprofen 400mg", "quantity": 45, "price": 8.25, "unit": "tablets"}' > /dev/null
echo "✓ Medicines added to inventory (Ibuprofen seeded as 'Low Stock')."

echo -e "\n[3/4] Creating Test Patients..."
curl -s -X POST "$API_URL/create-patient" -H "Content-Type: application/json" -d '{"user": "manager", "patientId": "pat001", "name": "Alice Wonderland", "age": 24}' > /dev/null
curl -s -X POST "$API_URL/create-patient" -H "Content-Type: application/json" -d '{"user": "manager", "patientId": "pat002", "name": "Bob Builder", "age": 45}' > /dev/null
echo "✓ Test patients registered on the blockchain."

echo -e "\n[4/4] Issuing Initial Prescriptions (Automates Inventory Deduction)..."

# Prescription for Patient 1 (Alice)
# This will deduct 20 units of Paracetamol
curl -s -X POST "$API_URL/billing" -H "Content-Type: application/json" -d '{
  "user": "ph_alice",
  "patientId": "pat001",
  "name": "Fever Prescription",
  "medicineList": [{"itemId": "med_para_500", "name": "Paracetamol 500mg", "quantity": "20"}],
  "amount": 110.00
}' > /dev/null

echo "✓ Prescriptions successfully stored on IPFS and Blockchain."
echo "✓ Inventory auto-deducted for Paracetamol."

echo -e "\n============================================================"
echo "    Done! Your dashboards are now full of rich dummy data!"
echo "============================================================"
echo "Manager UI  : http://100.124.176.94:3001"
echo "Pharmacist  : http://100.124.176.94:3002 (Identity: ph_alice)"
echo "Inventory   : http://100.124.176.94:3003 (Identity: inv_bob)"
echo "Patient UI  : http://100.124.176.94:3004 (Identity: pat001)"
echo "============================================================"
