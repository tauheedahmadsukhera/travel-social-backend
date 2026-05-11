import React, { useState, useEffect, useRef } from 'react';
import { adminAPI } from '../services/adminService';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineGlobeAlt, HiOutlineTag, HiOutlineUpload, HiOutlineOfficeBuilding } from 'react-icons/hi';

const Management = () => {
  const [categories, setCategories] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('categories'); // 'categories' or 'regions'
  const [subFilter, setSubFilter] = useState('all'); // 'all', 'country', 'region', 'city'
  
  // Form states
  const [name, setName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [type, setType] = useState('country');
  const [code, setCode] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catRes, regRes] = await Promise.all([
        adminAPI.getCategories(),
        adminAPI.getRegions()
      ]);
      if (catRes.success) setCategories(catRes.data);
      if (regRes.success) setRegions(regRes.data);
    } catch (err) {
      toast.error('Failed to load management data');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!name) return toast.error('Name is required');
    if (!selectedFile && !previewUrl) return toast.error('Please upload an image or provide asset name');

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('name', name);
      
      if (selectedFile) {
        formData.append('image', selectedFile);
      } else {
        formData.append('image', previewUrl); // Send the manual name/URL
      }

      const res = await adminAPI.addCategory(formData);
      if (res.success) {
        toast.success('Category added successfully');
        resetForm();
        fetchData();
      }
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddRegion = async (e) => {
    e.preventDefault();
    if (!name) return toast.error('Name is required');
    if (!selectedFile && !previewUrl) return toast.error('Please upload an image or provide asset name');

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('name', name);
      formData.append('type', type);
      formData.append('countryCode', code);

      if (selectedFile) {
        formData.append('image', selectedFile);
      } else {
        formData.append('image', previewUrl); // Send the manual name/URL
      }

      const res = await adminAPI.addRegion(formData);
      if (res.success) {
        toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} added`);
        resetForm();
        fetchData();
      }
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setSelectedFile(null);
    setPreviewUrl('');
    setCode('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (id, variant) => {
    if (!window.confirm('Are you sure you want to delete this?')) return;
    try {
      if (variant === 'category') await adminAPI.deleteCategory(id);
      else await adminAPI.deleteRegion(id);
      toast.success('Deleted successfully');
      fetchData();
    } catch (err) {
      toast.error('Delete failed');
    }
  };

  const filteredRegions = regions.filter(r => subFilter === 'all' || r.type === subFilter);

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-white">App Management</h2>
          <p className="text-slate-400">Configure global categories, countries, and cities.</p>
        </div>
      </header>

      {/* Main Tabs */}
      <div className="flex gap-8 border-b border-white/5">
        <button 
          onClick={() => setActiveTab('categories')}
          className={`pb-4 px-2 font-black uppercase tracking-widest text-xs transition-all ${activeTab === 'categories' ? 'text-indigo-500 border-b-2 border-indigo-500' : 'text-slate-500'}`}
        >
          Categories
        </button>
        <button 
          onClick={() => setActiveTab('regions')}
          className={`pb-4 px-2 font-black uppercase tracking-widest text-xs transition-all ${activeTab === 'regions' ? 'text-indigo-500 border-b-2 border-indigo-500' : 'text-slate-500'}`}
        >
          Geo Locations
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Column */}
        <div className="glass p-8 h-fit sticky top-8">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            {activeTab === 'categories' ? <HiOutlineTag className="text-indigo-500" /> : <HiOutlineGlobeAlt className="text-emerald-500" />}
            Add New {activeTab === 'categories' ? 'Category' : type}
          </h3>
          
          <form onSubmit={activeTab === 'categories' ? handleAddCategory : handleAddRegion} className="space-y-6">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Display Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-indigo-500 outline-none transition-all text-white font-bold"
                placeholder={activeTab === 'categories' ? "e.g. Adventure" : "e.g. Paris"}
              />
            </div>

            {/* Image Upload Area */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cover Image</label>
                <span className="text-[9px] font-bold text-indigo-500 uppercase">OR</span>
              </div>
              
              <div className="space-y-3">
                <div 
                  onClick={() => fileInputRef.current.click()}
                  className="w-full h-32 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500/50 hover:bg-white/5 transition-all overflow-hidden relative"
                >
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <HiOutlineUpload className="text-2xl text-slate-600 mb-1" />
                      <p className="text-[9px] font-bold text-slate-500 uppercase">Upload to Cloudinary</p>
                    </>
                  )}
                  <input 
                    type="file" 
                    hidden 
                    ref={fileInputRef} 
                    onChange={handleFileChange}
                    accept="image/*"
                  />
                </div>

                <div className="relative">
                  <input 
                    type="text"
                    value={!selectedFile ? previewUrl : ''}
                    onChange={(e) => {
                      setSelectedFile(null);
                      setPreviewUrl(e.target.value);
                    }}
                    placeholder="...or type Local Asset Name (e.g. Dubai)"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 focus:border-indigo-500 outline-none transition-all text-white text-[11px] font-bold"
                  />
                </div>
              </div>
            </div>

            {activeTab === 'regions' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Geo Type</label>
                  <select 
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-indigo-500 outline-none transition-all text-white font-bold text-sm"
                  >
                    <option value="country">Country</option>
                    <option value="region">Region</option>
                    <option value="city">City</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Code (ISO)</label>
                  <input 
                    type="text" 
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-indigo-500 outline-none transition-all text-white font-bold"
                    placeholder="PK / US"
                  />
                </div>
              </div>
            )}

            <button 
              type="submit" 
              disabled={isUploading}
              className={`w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isUploading ? 'Uploading to Cloudinary...' : <><HiOutlinePlus /> Save {activeTab === 'categories' ? 'Category' : type}</>}
            </button>
          </form>
        </div>

        {/* List Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sub Filters for Geo Locations */}
          {activeTab === 'regions' && (
            <div className="flex gap-2">
              {['all', 'country', 'region', 'city'].map(f => (
                <button 
                  key={f}
                  onClick={() => setSubFilter(f)}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${subFilter === f ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-white/10 text-slate-500 hover:border-white/20'}`}
                >
                  {f}s
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              [1,2,3,4].map(i => <div key={i} className="glass h-24 animate-pulse rounded-2xl" />)
            ) : (
              (activeTab === 'categories' ? categories : filteredRegions).map((item) => (
                <div key={item._id} className="glass p-4 flex items-center gap-4 group hover:border-indigo-500/30 transition-all">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800 overflow-hidden border border-white/10 relative flex items-center justify-center">
                    {item.image && item.image.startsWith('http') ? (
                      <img 
                        src={item.image} 
                        alt={item.name} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-all duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-indigo-500/10 text-[8px] font-black text-indigo-400 text-center p-1 uppercase leading-tight">
                        <HiOutlineGlobeAlt className="text-lg mb-0.5" />
                        Local Asset
                      </div>
                    )}
                    {item.type === 'country' && (
                      <div className="absolute top-1 right-1 bg-black/50 text-[8px] px-1 rounded font-bold text-white uppercase">
                        {item.countryCode}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-white text-lg">{item.name}</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest flex items-center gap-1">
                        {item.type === 'city' ? <HiOutlineOfficeBuilding /> : item.type === 'country' ? <HiOutlineGlobeAlt /> : <HiOutlineTag />}
                        {item.type || 'Category'}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDelete(item._id, activeTab === 'categories' ? 'category' : 'region')}
                    className="p-3 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                  >
                    <HiOutlineTrash size={20} />
                  </button>
                </div>
              ))
            )}
          </div>
          
          {!loading && (activeTab === 'categories' ? categories : filteredRegions).length === 0 && (
            <div className="glass p-20 text-center text-slate-500 italic rounded-2xl">
              No {subFilter !== 'all' ? subFilter : 'items'} found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Management;
