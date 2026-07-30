import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagementLayout from '../../components/management/ManagementLayout';
import SearchableSelect from '../../components/common/SearchableSelect';
import { getOffices, getDivisions, getReports, createReport, updateReport, deleteReport } from '../../services/api';
import { Plus, Layout, FileText, ExternalLink, Trash2, Edit3, AlertCircle, Building2, ChevronDown, FileBarChart } from 'lucide-react';

function StaffDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [offices, setOffices] = useState([]);
  const [selectedOffice, setSelectedOffice] = useState('');
  const [divisions, setDivisions] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState('');
  const [reports, setReports] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: '', message: '', action: null });
  const [reportForm, setReportForm] = useState({ title: '', url: '', description: '' });
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState(null);
  const [viewingReport, setViewingReport] = useState(null);

  // Helper to extract Power BI Report ID from URL correctly
  const extractReportId = (input) => {
    if (!input) return '';
    // If it's already an ID (not a URL), return as is
    if (!input.includes('http')) return input;
    
    try {
      const url = new URL(input);
      return url.searchParams.get('r') || '';
    } catch (e) {
      return '';
    }
  };

  const getFullPowerBiUrl = (id) => {
    if (!id) return '';
    return `https://app.powerbi.com/view?r=${id}`;
  };

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem('user'));
    setUser(storedUser);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) {
      if (user.role === 'Admin') {
        getOffices().then(res => {
          setOffices(res.data);
          setSelectedOffice(user.officeId);
        });
      } else {
        setSelectedOffice(user.officeId);
        setSelectedDivision(user.divisionId);
      }
    }
  }, [user]);

  useEffect(() => {
    if (selectedOffice) {
      getDivisions(selectedOffice).then(res => {
        setDivisions(res.data);
        // Default to "All" divisions if switching offices
        if (selectedOffice !== user?.officeId) {
          setSelectedDivision('');
        } else if (!selectedDivision) {
          setSelectedDivision(''); // Explicitly set to empty for "All"
        }
      });
    }
  }, [selectedOffice, user]);

  useEffect(() => {
    if (selectedOffice) {
      const params = { officeId: selectedOffice };
      if (selectedDivision) params.divisionId = selectedDivision;
      getReports(params).then(res => setReports(res.data));
    }
  }, [selectedOffice, selectedDivision]);

  const handleSaveReport = async (e) => {
    if (e) e.preventDefault();
    
    // If not already confirmed, show modal
    if (!showConfirmModal) {
      setConfirmConfig({
        title: editingReport ? 'Update Report?' : 'Add New Report?',
        message: editingReport 
          ? 'Are you sure you want to save the changes to this report?' 
          : 'Are you sure you want to publish this new report to the dashboard?',
        action: () => executeSave()
      });
      setShowConfirmModal(true);
      return;
    }
  };

  const executeSave = async () => {
    try {
      setFormError('');
      const reportId = extractReportId(reportForm.url);
      
      if (!reportId) {
        setFormError('Invalid Power BI URL. Please provide a valid "Publish to Web" link.');
        setShowConfirmModal(false);
        // Scroll to error if needed or focus input
        return;
      }

      const reportData = { 
        title: reportForm.title, 
        reportId: reportId, 
        description: reportForm.description,
        divisionId: selectedDivision || user?.divisionId
      };

      if (!reportData.divisionId) {
        setFormError('Please select a division.');
        setShowConfirmModal(false);
        return;
      }

      if (editingReport) {
        await updateReport(editingReport.id, reportData);
      } else {
        await createReport(reportData);
      }
      setIsModalOpen(false);
      setShowConfirmModal(false);
      setEditingReport(null);
      setReportForm({ title: '', url: '', description: '' });
      // Refresh reports
      const res = await getReports({ divisionId: selectedDivision });
      setReports(res.data);
    } catch (err) {
      alert('Error saving report: ' + err.message);
      setShowConfirmModal(false);
    }
  };

  const handleDeleteReport = (id) => {
    setConfirmConfig({
      title: 'Delete Report?',
      message: 'This action cannot be undone. Are you sure you want to permanently remove this report?',
      action: () => executeDelete(id)
    });
    setShowConfirmModal(true);
  };

  const executeDelete = async (id) => {
    try {
      await deleteReport(id);
      setReports(reports.filter(r => r.id !== id));
      setShowConfirmModal(false);
    } catch (err) {
      alert('Error deleting report: ' + err.message);
      setShowConfirmModal(false);
    }
  };

  const openEditModal = (report) => {
    setEditingReport(report);
    setReportForm({ 
      title: report.title, 
      url: getFullPowerBiUrl(report.reportId), 
      description: report.description 
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingReport(null);
    setReportForm({ title: '', url: '', description: '' });
    setFormError('');
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-pulse text-slate-400 font-bold">Verifying Session...</div>
      </div>
    );
  }

  return (
    <ManagementLayout title={user?.role === 'Admin' ? 'Management: Admin' : `Management: ${user.office?.acronym || 'My Office'}`}>
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Header Stats / Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-6 relative group">
            <div className="w-16 h-16 bg-moss-100/50 rounded-2xl flex items-center justify-center flex-shrink-0 relative z-10">
              <Building2 className="text-moss-600 w-8 h-8" />
            </div>
            <div className="flex-grow relative z-10">
              {user.role === 'Admin' ? (
                <div className="space-y-4">
                  <SearchableSelect 
                    label="Office"
                    variant="ghost"
                    options={offices}
                    value={selectedOffice}
                    onChange={setSelectedOffice}
                    placeholder="Search Office..."
                  />
                  <SearchableSelect 
                    variant="ghost"
                    options={[{ id: '', name: 'All Sections' }, ...divisions]}
                    value={selectedDivision}
                    onChange={setSelectedDivision}
                    placeholder="All Sections"
                  />
                </div>
              ) : (
                <>
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2 leading-none">Office</p>
                  <h3 className="text-lg font-black text-slate-900 leading-tight mb-1">
                    {user.office?.name} <span className="text-moss-600 ml-1">({user.office?.acronym})</span>
                  </h3>
                  <p className="text-sm font-bold text-slate-500 flex items-center gap-2">
                    {user.division?.name}
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 bg-moss-50 rounded-2xl flex items-center justify-center">
              <FileText className="text-moss-600 w-6 h-6" />
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Reports</p>
              <p className="text-slate-900 font-extrabold">{reports.length} Published</p>
            </div>
          </div>
        </div>

        {/* Reports Table/Grid */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/20">
            <div>
              <h3 className="font-black text-slate-900 text-xl tracking-tight leading-tight flex items-center gap-3">
                <Layout size={24} className="text-moss-600" />
                Reports Management
              </h3>
            </div>
            <div className="flex items-center gap-4">
              {user.role === 'Admin' && !selectedDivision && (
                <div className="text-[10px] font-bold text-amber-500 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 flex items-center gap-2">
                  <AlertCircle size={12} />
                  Select a specific section to add reports
                </div>
              )}
              <button 
                onClick={() => setIsModalOpen(true)}
                disabled={user.role === 'Admin' && !selectedDivision}
                className={`flex items-center gap-2 transition-all shadow-lg active:scale-95 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest ${
                  user.role === 'Admin' && !selectedDivision
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                    : 'bg-moss-600 hover:bg-moss-700 text-white shadow-moss-600/20'
                }`}
              >
                <Plus size={18} />
                Add New Report
              </button>
              <button 
                onClick={() => setIsModalOpen(true)}
                disabled={user.role === 'Admin' && !selectedDivision}
                className={`flex items-center gap-2 transition-all shadow-lg active:scale-95 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest ${
                  user.role === 'Admin' && !selectedDivision
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                    : 'bg-moss-600 hover:bg-moss-700 text-white shadow-moss-600/20'
                }`}
              >
                <Plus size={18} />
                Add New Worksheet
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Report Title</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Power BI URL</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Date Added</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-8 py-12 text-center text-slate-400 font-medium">No reports found for this division.</td>
                  </tr>
                ) : (
                  reports.map(report => (
                    <tr key={report.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-8 py-4">
                        <div className="font-bold text-slate-800 text-[13px] leading-relaxed">{report.title}</div>
                        <div className="max-w-xs truncate flex items-center">
                           <span className="text-slate-400 text-[10px] font-bold uppercase tracking-tight opacity-70 truncate max-w-[150px]">
                             {report.description || 'No description provided'}
                           </span>
                           {report.description && report.description.length > 30 && (
                             <button 
                               onClick={() => setViewingReport(report)}
                               className="ml-2 text-moss-600 hover:text-moss-700 font-black text-[9px] uppercase tracking-widest focus:outline-none bg-moss-50 px-2 py-0.5 rounded-md hover:bg-moss-100 transition-colors whitespace-nowrap"
                             >
                               Read More
                             </button>
                           )}
                        </div>
                      </td>
                      <td className="px-8 py-4 text-center">
                        <button 
                          onClick={() => setPreviewId(report.reportId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-moss-50 text-moss-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-moss-100 transition-all border border-moss-100/50"
                        >
                          <ExternalLink size={12} />
                          Preview
                        </button>
                      </td>
                      <td className="px-8 py-4 text-center">
                         <span className="text-[11px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                            {new Date(report.createdAt).toLocaleDateString()}
                         </span>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button 
                            onClick={() => openEditModal(report)}
                            className="p-2 text-slate-300 hover:text-moss-600 hover:bg-moss-50 rounded-xl transition-all" 
                            title="Edit"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteReport(report.id)}
                            className="p-2 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all" 
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Improved Add/Edit Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={closeModal}></div>
            <div className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-10 animate-in zoom-in-95 duration-200 border border-white/20">
              <h3 className="text-xl font-black text-slate-900 mb-8 tracking-tight">
                {editingReport ? 'Edit Power BI Report' : 'Add New Power BI Report'}
              </h3>
              <form onSubmit={handleSaveReport} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                    <FileText size={12} className="text-moss-600" />
                    Report Title
                  </label>
                  <input 
                    type="text" 
                    required
                    value={reportForm.title}
                    onChange={(e) => setReportForm({...reportForm, title: e.target.value})}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-moss-600/10 focus:border-moss-600 transition-all outline-none text-[13px] font-bold"
                    placeholder="e.g. 2024 Production Forecast"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ExternalLink size={12} className="text-moss-600" />
                      Power BI Embed URL
                    </div>
                    {extractReportId(reportForm.url) && (
                      <button 
                        type="button"
                        onClick={() => setPreviewId(extractReportId(reportForm.url))}
                        className="text-moss-600 hover:bg-moss-50 px-2 py-0.5 rounded-lg transition-all flex items-center gap-1.5 lowercase font-black text-[9px]"
                      >
                        <ExternalLink size={10} /> Preview
                      </button>
                    )}
                  </label>
                  <input 
                    type="text" 
                    required
                    value={reportForm.url}
                    onChange={(e) => {
                      setReportForm({...reportForm, url: e.target.value});
                      if (formError) setFormError('');
                    }}
                    className={`w-full px-5 py-3.5 bg-slate-50 border ${formError ? 'border-red-400 ring-4 ring-red-500/10' : 'border-slate-100 focus:ring-4 focus:ring-moss-600/10 focus:border-moss-600'} rounded-2xl transition-all outline-none text-[13px] font-bold`}
                    placeholder="https://app.powerbi.com/view?r=..."
                  />
                  {formError && (
                    <p className="mt-2 text-[10px] text-red-500 font-bold flex items-center gap-1.5 animate-in slide-in-from-top-1 duration-200">
                      <AlertCircle size={14} /> {formError}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                    <Edit3 size={12} className="text-moss-600" />
                    Description (Optional)
                  </label>
                  <textarea 
                    value={reportForm.description}
                    onChange={(e) => setReportForm({...reportForm, description: e.target.value})}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-moss-600/10 focus:border-moss-600 transition-all outline-none resize-none text-[13px] font-bold"
                    rows="2"
                    placeholder="Briefly describe what this report covers..."
                  ></textarea>
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={closeModal}
                    className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-400 font-black py-4 rounded-2xl transition-all text-[11px] uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-moss-600 hover:bg-moss-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-moss-600/20 transition-all text-[11px] uppercase tracking-widest"
                  >
                    Save Report
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Updated Confirmation Modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowConfirmModal(false)}></div>
            <div className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200 text-center border border-white/20">
              <div className="w-16 h-16 bg-moss-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <FileText className="text-moss-600 w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">{confirmConfig.title}</h3>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed px-2">
                {confirmConfig.message}
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3.5 rounded-xl transition-all text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmConfig.action}
                  className="flex-1 bg-moss-600 hover:bg-moss-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-moss-600/20 transition-all active:scale-95 text-sm"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Small Overlay Preview Modal */}
        {previewId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-8">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setPreviewId(null)}></div>
            <div className="relative w-full h-full max-w-5xl max-h-[85vh] bg-white rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col border border-white/20">
              <div className="px-8 py-4 bg-white border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-moss-50 rounded-xl flex items-center justify-center">
                    <FileBarChart className="text-moss-600 w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Live Preview</p>
                    <p className="text-sm font-black text-slate-900 leading-none">Power BI Dashboard</p>
                  </div>
                </div>
                <button 
                  onClick={() => setPreviewId(null)}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-400 font-black px-6 py-2.5 rounded-xl transition-all text-[11px] uppercase tracking-widest border border-slate-100 shadow-sm"
                >
                  Close Preview
                </button>
              </div>
              <div className="flex-grow bg-slate-100 relative">
                <iframe 
                  title="Power BI Preview"
                  className="w-full h-full"
                  src={getFullPowerBiUrl(previewId)}
                  frameBorder="0" 
                  allowFullScreen={true}
                ></iframe>
              </div>
            </div>
          </div>
        )}

        {/* Report Detail Modal */}
        {viewingReport && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setViewingReport(null)}></div>
            <div className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-300 border border-white/20">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-moss-50 rounded-2xl flex items-center justify-center">
                    <FileText className="text-moss-600 w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 leading-tight mb-1">{viewingReport.title}</h3>
                    <div className="flex items-center gap-2">
                       <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded border border-slate-100 shadow-sm">
                          {new Date(viewingReport.createdAt).toLocaleDateString()}
                       </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 mb-8">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Layout size={12} className="text-moss-600" />
                  Full Description
                </p>
                <div className="text-[12px] font-bold text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {viewingReport.description || "No description provided."}
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setViewingReport(null)}
                  className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-400 font-black py-4 rounded-2xl transition-all text-[11px] uppercase tracking-widest"
                >
                  Close Details
                </button>
                <button 
                  onClick={() => {
                    setPreviewId(viewingReport.reportId);
                    setViewingReport(null);
                  }}
                  className="flex-1 bg-moss-600 hover:bg-moss-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-moss-600/20 transition-all text-[11px] uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  <ExternalLink size={14} />
                  Launch Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ManagementLayout>
  );
}

export default StaffDashboard;
