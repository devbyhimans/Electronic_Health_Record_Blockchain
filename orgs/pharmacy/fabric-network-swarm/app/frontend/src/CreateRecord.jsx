import React, { useState } from 'react';
import { Save, X, Clipboard, UserCircle, Droplets, Calendar, FileText, Pill } from 'lucide-react';
import { motion } from 'framer-motion';
import { API_BASE_URL } from './config';

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, user: currentUser })
      });
      if (resp.ok) {
        onSave();
      } else {
        const err = await resp.json();
        alert(`Error: ${err.message}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to backend');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ y: 20, opacity: 0 }} 
      animate={{ y: 0, opacity: 1 }}
      className="glass-card"
      style={{ maxWidth: '600px', margin: '0 auto' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h2>Issue New Medical Record</h2>
          <p style={{ color: '#64748b', fontSize: '0.8rem' }}>Issuing as: <span style={{ color: '#10b981' }}>{currentUser}</span></p>
        </div>
        <X style={{ cursor: 'pointer' }} onClick={onCancel} />
      </div>

      <form onSubmit={handleSubmit}>
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
    </motion.div>
  );
};

export default CreateRecord;
