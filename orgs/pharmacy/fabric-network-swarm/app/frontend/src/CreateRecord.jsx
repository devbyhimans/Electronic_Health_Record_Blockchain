import React, { useState } from 'react';
import { Save, X, Clipboard, UserCircle, Droplets, Calendar, FileText, Pill } from 'lucide-react';
import { API_BASE_URL } from './config';

function ageFromDateOfBirth(dateOfBirth) {
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  const birthDate = new Date(year, month - 1, day);
  const invalidDate = !year || !month || !day || birthDate.getFullYear() !== year || birthDate.getMonth() !== month - 1 || birthDate.getDate() !== day;
  const today = new Date();
  let age = today.getFullYear() - year;
  const birthdayNotReached = today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  if (birthdayNotReached) age -= 1;
  if (invalidDate || age < 0) throw new Error('Enter a valid date of birth that is not in the future.');
  return age;
}

const CreateRecord = ({ onCancel, onSave, currentUser }) => {
  const [formData, setFormData] = useState({
    patientId: '',
    name: '',
    dob: '',
    bloodGroup: 'A+',
    diagnosis: '',
    prescription: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    try {
      const age = ageFromDateOfBirth(formData.dob);
      const response = await fetch(`${API_BASE_URL}/api/create-patient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          patientId: formData.patientId || `PAT-${Date.now().toString().slice(-4)}`,
          name: formData.name,
          age,
          ...formData, 
          user: currentUser 
        })
      });
      if (!response.ok) {
        const details = await response.json().catch(() => null);
        throw new Error(details?.error || details?.message || `Request failed (${response.status})`);
      }
      onSave();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to save the record. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h2>Issue New Medical Record</h2>
          <p style={{ color: '#64748b', fontSize: '0.8rem' }}>Issuing as: <span style={{ color: '#10b981' }}>{currentUser}</span></p>
        </div>
        <X style={{ cursor: 'pointer' }} onClick={onCancel} />
      </div>

      <form onSubmit={handleSubmit}>
        {submitError && <p role="alert" className="connection-note">{submitError}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
               <Clipboard size={14} /> Patient ID
            </label>
            <input required value={formData.patientId} onChange={e => setFormData({...formData, patientId: e.target.value})} placeholder="P-ID" />
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
               <UserCircle size={14} /> Patient Name
            </label>
            <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Full Name" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
               <Calendar size={14} /> Date of Birth
            </label>
            <input type="date" required value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} />
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
               <Droplets size={14} /> Blood Group
            </label>
            <select style={{ width: '100%', padding: '0.75rem', background: 'rgba(15,23,42,0.8)', color: 'white', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.1)' }} value={formData.bloodGroup} onChange={e => setFormData({...formData, bloodGroup: e.target.value})}>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
            </select>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#94a3b8', marginTop: '1rem' }}>
           <FileText size={14} /> Diagnosis Summary
        </label>
        <textarea required rows="2" value={formData.diagnosis} onChange={e => setFormData({...formData, diagnosis: e.target.value})}></textarea>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
           <Pill size={14} /> Prescribed Medication
        </label>
        <textarea required rows="2" value={formData.prescription} onChange={e => setFormData({...formData, prescription: e.target.value})}></textarea>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ flex: 1 }}>
            {submitting ? 'Encrypting & Uploading...' : <><Save size={18} /> Issue Record</>}
          </button>
          <button type="button" className="btn" style={{ background: 'rgba(255,255,255,0.05)' }} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateRecord;
