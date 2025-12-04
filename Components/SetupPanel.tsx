import React, { useState, useRef } from 'react';
import { BusinessConfig } from '../types';
import { Save, Bot, X, Upload, FileText, Globe, Trash2 } from 'lucide-react';

interface SetupPanelProps {
  config: BusinessConfig;
  onSave: (newConfig: BusinessConfig) => void;
  onClose: () => void;
}

const SetupPanel: React.FC<SetupPanelProps> = ({ config, onSave, onClose }) => {
  const [formData, setFormData] = useState<BusinessConfig>(config);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "text/plain") {
      alert("Please upload a .txt file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setFormData(prev => ({ ...prev, knowledgeBaseText: text }));
    };
    reader.readAsText(file);
  };

  const clearKnowledgeBase = () => {
    setFormData(prev => ({ ...prev, knowledgeBaseText: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <Bot className="text-blue-400" />
            <h2 className="text-xl font-bold">Bot Training Center</h2>
          </div>
          <button onClick={onClose} className="hover:bg-slate-700 p-2 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 overflow-y-auto space-y-8">
          <p className="text-slate-600 bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm">
            <strong>How it works:</strong> The information you enter below creates the "Brain" of your chatbot. 
            Be specific! This allows the bot to answer questions while you are on the job.
          </p>

          {/* Basic Info Section */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-800 border-b pb-2">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Business Name</label>
                <input
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleChange}
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Dave's Electrical"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Contact Name</label>
                <input
                  name="contactName"
                  value={formData.contactName}
                  onChange={handleChange}
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Simon"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Trade Type</label>
              <input
                name="tradeType"
                value={formData.tradeType}
                onChange={handleChange}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="e.g. Residential Electrician, Plumber, roofer"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Services Offered</label>
              <textarea
                name="services"
                value={formData.services}
                onChange={handleChange}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24"
                placeholder="e.g. Panel upgrades, rewiring, lighting installation, emergency repairs..."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">General Pricing / Rates</label>
              <textarea
                name="pricing"
                value={formData.pricing}
                onChange={handleChange}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24"
                placeholder="e.g. £100 call-out fee. Quotes provided after inspection. Hourly rate £80."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Availability / Hours</label>
              <input
                name="availability"
                value={formData.availability}
                onChange={handleChange}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="e.g. Mon-Fri 8am-6pm. Emergency calls 24/7."
                required
              />
            </div>
          </div>

          {/* Advanced Training Section */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-800 border-b pb-2 flex items-center gap-2">
              Advanced Training <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Optional</span>
            </h3>
            
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-6">
              {/* File Upload */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <FileText size={16} />
                  Upload Knowledge Base (.txt)
                </label>
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".txt"
                      onChange={handleFileChange}
                      className="hidden"
                      id="kb-upload"
                    />
                    <label 
                      htmlFor="kb-upload"
                      className="cursor-pointer flex items-center justify-center gap-2 w-full p-4 border-2 border-dashed border-slate-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-slate-500 font-medium"
                    >
                      <Upload size={18} />
                      {formData.knowledgeBaseText ? "Update Knowledge Base File" : "Click to upload .txt file"}
                    </label>
                    <p className="text-xs text-slate-400 mt-2">
                      Upload a text document with FAQs, detailed service descriptions, or policies.
                    </p>
                  </div>
                </div>

                {formData.knowledgeBaseText && (
                  <div className="mt-3 flex items-center justify-between bg-green-50 text-green-700 px-4 py-2 rounded-lg border border-green-200 text-sm">
                    <span className="flex items-center gap-2">
                      <FileText size={16} />
                      Knowledge base loaded ({formData.knowledgeBaseText.length} chars)
                    </span>
                    <button 
                      type="button" 
                      onClick={clearKnowledgeBase}
                      className="text-green-700 hover:text-green-900 hover:bg-green-100 p-1 rounded"
                      title="Remove file"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Sitemap URL */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <Globe size={16} />
                  Sitemap / Website URL
                </label>
                <input
                  name="sitemapUrl"
                  value={formData.sitemapUrl || ''}
                  onChange={handleChange}
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="https://www.example.com"
                />
                <p className="text-xs text-slate-400 mt-2">
                  The AI will access this website to learn about your business and answer customer questions intelligently.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
             <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
            >
              <Save size={20} />
              Update Bot Training
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SetupPanel;